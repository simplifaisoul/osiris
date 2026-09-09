import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MAP_STARTUP_TIMEOUT_MS, watchMapStartup } from './map-startup';
import style from '../../public/dark-matter-style.json';

function fixture() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const map = {
    on(name: string, callback: (event: unknown) => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
    },
    off(name: string, callback: (event: unknown) => void) { listeners.get(name)?.delete(callback); },
  };
  const status = vi.fn();
  const stop = watchMapStartup(map as unknown as MapLibreMap, status);
  const emit = (name: string, event: unknown = {}) => listeners.get(name)?.forEach(callback => callback(event));
  const tile = () => emit('sourcedata', { sourceId: 'carto', tile: { state: 'loaded' } });
  return { status, stop, emit, tile, listeners };
}

describe('map startup recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('only reports ready after the map and a real basemap tile have loaded', () => {
    const f = fixture();
    f.emit('load');
    f.emit('sourcedata', { sourceId: 'carto', tile: { state: 'errored' } });
    f.emit('sourcedata', { sourceId: 'flights', tile: { state: 'loaded' } });
    expect(f.status).not.toHaveBeenCalled();
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('ready');
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it('handles tile completion before the load event', () => {
    const f = fixture();
    f.tile();
    expect(f.status).not.toHaveBeenCalled();
    f.emit('load');
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('shows an actionable error for a failed style and permits a late recovery', () => {
    const f = fixture();
    f.emit('error', { error: new Error('Style request failed') });
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.tile();
    f.emit('load');
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('does not mistake a load event with no successful tiles for a usable map', () => {
    const f = fixture();
    f.emit('load');
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('keeps a loaded map available when an entity or terrain request fails', () => {
    const f = fixture();
    f.tile(); f.emit('load');
    f.emit('error', { sourceId: 'osiris-terrain-dem', error: new Error('Tile failed') });
    expect(f.status).toHaveBeenCalledTimes(1);
    f.stop();
  });

  it('exposes graphics context loss and clears the message on restoration', () => {
    const f = fixture();
    f.tile(); f.emit('load');
    f.emit('webglcontextlost');
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.emit('webglcontextrestored');
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('removes every listener and cancels the timeout on unmount', () => {
    const f = fixture();
    f.emit('remove');
    f.stop();
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).not.toHaveBeenCalled();
    expect([...f.listeners.values()].every(set => set.size === 0)).toBe(true);
  });

  /* Production showed the failure banner over a map that then finished
     loading on its own. The budget has to track basemap progress, not wall
     clock, or a cold CDN reads as a dead map. */
  it('keeps waiting while the basemap is still arriving, past the original fixed budget', () => {
    const f = fixture();
    f.emit('load');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
      f.emit('sourcedataloading', { sourceId: 'carto' });
    }
    expect(f.status).not.toHaveBeenCalled();
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('still fails once the basemap goes quiet', () => {
    const f = fixture();
    f.emit('load');
    f.emit('sourcedataloading', { sourceId: 'carto' });
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.stop();
  });

  it('does not let busy entity layers hold the deadline open', () => {
    const f = fixture();
    f.emit('load');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
      f.emit('sourcedata', { sourceId: 'flights', tile: { state: 'loaded' } });
    }
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.stop();
  });

  it('gives the basemap its full budget from style-ready, not from construction', () => {
    const f = fixture();
    // Bootstrap — style, worker and sprite origins — eats most of the budget.
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
    f.emit('styledata');
    f.emit('load');
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
    expect(f.status).not.toHaveBeenCalled();
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
  });

  it('restarts the clock only once for the style, so a busy style cannot hold it open', () => {
    const f = fixture();
    f.emit('styledata');
    f.emit('load');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
      f.emit('styledata');
    }
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.stop();
  });

  /* A background tab gets no animation frames, so MapLibre never draws and
     never requests a tile. That must not read as a broken map. The suite runs
     in node, where the module's typeof guard means no document at all behaves
     exactly as a visible one — so these stub the API the browser provides. */
  function stubDocument(hidden: boolean) {
    const listeners = new Set<() => void>();
    const doc = {
      hidden,
      addEventListener: (n: string, cb: () => void) => { if (n === 'visibilitychange') listeners.add(cb); },
      removeEventListener: (_n: string, cb: () => void) => { listeners.delete(cb); },
    };
    (globalThis as { document?: unknown }).document = doc;
    return {
      show: () => { doc.hidden = false; listeners.forEach(cb => cb()); },
      clear: () => { delete (globalThis as { document?: unknown }).document; },
    };
  }

  it('does not fail a map in a hidden tab, and gives it a full budget on return', () => {
    const tab = stubDocument(true);
    const f = fixture();
    f.emit('load');
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS * 4);
    expect(f.status).not.toHaveBeenCalled();

    tab.show();
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS - 1_000);
    expect(f.status).not.toHaveBeenCalled();
    f.tile();
    expect(f.status).toHaveBeenLastCalledWith('ready');
    f.stop();
    tab.clear();
  });

  it('still fails a visible map that never draws a basemap tile', () => {
    const tab = stubDocument(false);
    const f = fixture();
    f.emit('load');
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.stop();
    tab.clear();
  });

  /* A minimised or fully occluded window still reports visibilityState
     'visible' while receiving no animation frames, and MapLibre 6 resolves an
     inline-TileJSON source inside a frame — so the map cannot even begin.
     Counting frames catches what document.hidden misses. */
  it('does not fail a visible page that is never painting', () => {
    const frame = vi.fn();
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = frame;
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
    const f = fixture();
    f.emit('load');
    // No frame callback ever runs: the page is visible but not drawing.
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS * 4);
    expect(f.status).not.toHaveBeenCalled();
    f.stop();
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
  });

  it('fails a painting page whose basemap never arrives', () => {
    let cb: (() => void) | undefined;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (fn: () => void) => { cb = fn; return 1; };
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
    const f = fixture();
    f.emit('load');
    // The page is drawing — frames advance — but no basemap tile ever lands.
    for (let i = 0; i < 5; i++) { const next = cb; cb = undefined; next?.(); }
    vi.advanceTimersByTime(MAP_STARTUP_TIMEOUT_MS);
    expect(f.status).toHaveBeenLastCalledWith('error');
    f.stop();
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
  });

  it('ships local style metadata without the missing proxy rewrite or remote TileJSON dependency', () => {
    expect(style.version).toBe(8);
    expect(style.sources.carto).not.toHaveProperty('url');
    expect(style.sources.carto.tiles).toHaveLength(4);
    expect(style.sources.carto.maxzoom).toBe(14);
    expect(JSON.stringify(style)).not.toContain('/cartocdn-tiles/');
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.basemaps\.cartocdn\.com\//);
  });
});

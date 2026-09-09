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

  it('ships local style metadata without the missing proxy rewrite or remote TileJSON dependency', () => {
    expect(style.version).toBe(8);
    expect(style.sources.carto).not.toHaveProperty('url');
    expect(style.sources.carto.tiles).toHaveLength(4);
    expect(style.sources.carto.maxzoom).toBe(14);
    expect(JSON.stringify(style)).not.toContain('/cartocdn-tiles/');
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.basemaps\.cartocdn\.com\//);
  });
});

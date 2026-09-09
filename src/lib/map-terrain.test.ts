import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { attachTerrain, TERRAIN_SOURCE, TERRAIN_MIN_ZOOM, TERRAIN_SETTLE_MS } from './map-terrain';

function createMap(initialZoom = 11) {
  const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  const sources = new Set(['flights', 'satellite-tiles']);
  const operations: string[] = [];
  let terrain: { source: string; exaggeration: number } | null = null;
  let zoom = initialZoom;
  let moving = false;
  let pixelRatio = 3;
  let maxPitch = 85;
  const map = {
    getZoom: () => zoom,
    getLayersOrder: () => [],
    setSourceTileLodParams: vi.fn(),
    isMoving: () => moving,
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (value: number) => { pixelRatio = value; },
    getMaxPitch: () => maxPitch,
    setMaxPitch: (value: number) => { maxPitch = value; },
    on: vi.fn((name: string, callback: (event: Record<string, unknown>) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
    }),
    off: vi.fn((name: string, callback: (event: Record<string, unknown>) => void) => listeners.get(name)?.delete(callback)),
    addSource: vi.fn((id: string) => sources.add(id)),
    getSource: vi.fn((id: string) => sources.has(id)),
    removeSource: vi.fn((id: string) => {
      if (terrain?.source === id) throw new Error('Source still in use');
      operations.push('remove source');
      sources.delete(id);
    }),
    getTerrain: vi.fn(() => terrain),
    setTerrain: vi.fn((value: typeof terrain) => {
      terrain = value;
      operations.push(value ? 'enable terrain' : 'disable terrain');
    }),
  };
  return {
    map: map as unknown as MapLibreMap,
    methods: map, sources, operations, listeners,
    moveTo: (value: number, inMotion = false) => { zoom = value; moving = inMotion; },
    emit: (name: string, event: Record<string, unknown> = {}) => listeners.get(name)?.forEach(callback => callback(event)),
  };
}

describe('lightweight terrain', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('makes no elevation requests at globe zoom and waits until the camera settles', () => {
    const fixture = createMap(2);
    const status = vi.fn();
    const dispose = attachTerrain(fixture.map, status);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    expect(fixture.methods.setTerrain).not.toHaveBeenCalled();
    fixture.moveTo(11, true);
    fixture.emit('zoom');
    fixture.emit('moveend');
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    fixture.moveTo(11);
    fixture.emit('moveend');
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith('loading');
    dispose();
  });

  it('caps elevation detail and Retina rendering without adding satellite imagery', () => {
    const fixture = createMap();
    const dispose = attachTerrain(fixture.map, vi.fn());
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    expect(fixture.methods.addSource).toHaveBeenCalledWith(TERRAIN_SOURCE, expect.objectContaining({
      type: 'raster-dem', tileSize: 256, maxzoom: 10, encoding: 'terrarium',
    }));
    expect(fixture.map.getPixelRatio()).toBe(1.5);
    expect(fixture.map.getMaxPitch()).toBe(60);
    expect(fixture.methods.setSourceTileLodParams).toHaveBeenCalledWith(10, 1.25, TERRAIN_SOURCE);
    fixture.emit('moveend');
    fixture.emit('moveend');
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(1);
    dispose();
    expect(fixture.map.getPixelRatio()).toBe(3);
    expect(fixture.map.getMaxPitch()).toBe(85);
  });

  it('unloads during zoom-out and avoids source churn near the zoom threshold', () => {
    const fixture = createMap();
    const status = vi.fn();
    const dispose = attachTerrain(fixture.map, status);
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    fixture.moveTo(9.8);
    fixture.emit('zoom');
    fixture.emit('moveend');
    expect(fixture.sources.has(TERRAIN_SOURCE)).toBe(true);
    fixture.moveTo(9);
    fixture.emit('zoom');
    expect(fixture.sources.has(TERRAIN_SOURCE)).toBe(false);
    expect(fixture.operations).toEqual(['enable terrain', 'disable terrain', 'remove source']);
    expect(status).toHaveBeenLastCalledWith('idle');
    fixture.moveTo(9.8);
    fixture.emit('moveend');
    expect(fixture.sources.has(TERRAIN_SOURCE)).toBe(false);
    fixture.moveTo(TERRAIN_MIN_ZOOM);
    fixture.emit('moveend');
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('only reports elevation ready after terrain data loads', () => {
    const fixture = createMap();
    const status = vi.fn();
    const dispose = attachTerrain(fixture.map, status);
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    fixture.emit('sourcedata', { sourceId: 'flights', sourceDataType: 'content', isSourceLoaded: true });
    fixture.emit('sourcedata', { sourceId: TERRAIN_SOURCE, sourceDataType: 'metadata', isSourceLoaded: true });
    expect(status).toHaveBeenLastCalledWith('loading');
    fixture.emit('sourcedata', { sourceId: TERRAIN_SOURCE, tile: {}, isSourceLoaded: true });
    expect(status).toHaveBeenLastCalledWith('ready');
    dispose();
  });

  it('falls back to the normal map after a tile error, without automatic retry loops', async () => {
    const fixture = createMap();
    const status = vi.fn();
    const dispose = attachTerrain(fixture.map, status);
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    fixture.emit('error', { sourceId: 'flights' });
    expect(status).toHaveBeenLastCalledWith('loading');
    fixture.emit('error', { sourceId: TERRAIN_SOURCE });
    await Promise.resolve();
    fixture.emit('moveend');
    fixture.emit('sourcedata', { sourceId: TERRAIN_SOURCE, sourceDataType: 'content', isSourceLoaded: true });
    expect(status).toHaveBeenLastCalledWith('error');
    expect(fixture.map.getTerrain()).toBeNull();
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(1);
    expect([...fixture.sources]).toEqual(['flights', 'satellite-tiles']);
    dispose();
    const retry = attachTerrain(fixture.map, status);
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(2);
    retry();
  });

  it('removes listeners and ignores late callbacks after switching modes', () => {
    const fixture = createMap();
    const status = vi.fn();
    const dispose = attachTerrain(fixture.map, status);
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    const queuedCallback = [...fixture.listeners.get('sourcedata')!][0];
    dispose();
    dispose();
    expect(fixture.operations).toEqual(['enable terrain', 'disable terrain', 'remove source']);
    expect([...fixture.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
    queuedCallback({ sourceId: TERRAIN_SOURCE, sourceDataType: 'content', isSourceLoaded: true });
    expect(status.mock.calls).toEqual([['idle'], ['waiting'], ['loading']]);
  });

  it.each([2, 7, 8, 9, 9.99])('never creates terrain or requests elevation at zoom %s', zoom => {
    const fixture = createMap(zoom);
    const dispose = attachTerrain(fixture.map, vi.fn());
    fixture.emit('moveend');
    vi.advanceTimersByTime(5000);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    expect(fixture.methods.setTerrain).not.toHaveBeenCalled();
    dispose();
  });

  it('cancels pending activation when movement resumes or the mode is closed', () => {
    const fixture = createMap();
    const dispose = attachTerrain(fixture.map, vi.fn());
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS - 1);
    fixture.moveTo(11, true);
    fixture.emit('movestart');
    vi.advanceTimersByTime(5000);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    fixture.moveTo(11);
    fixture.emit('moveend');
    dispose();
    vi.advanceTimersByTime(5000);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
  });

  it('does not start tile work in a background tab', () => {
    const page = new EventTarget();
    Object.assign(page, { hidden: true });
    vi.stubGlobal('document', page);
    const fixture = createMap();
    const dispose = attachTerrain(fixture.map, vi.fn());
    vi.advanceTimersByTime(5000);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    Object.assign(page, { hidden: false });
    page.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(TERRAIN_SETTLE_MS);
    expect(fixture.methods.addSource).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('cancels deferred tile loading if React removes the map first', () => {
    const fixture = createMap();
    const dispose = attachTerrain(fixture.map, vi.fn());
    fixture.emit('remove');
    vi.advanceTimersByTime(5000);
    expect(fixture.methods.addSource).not.toHaveBeenCalled();
    dispose();
    expect(fixture.methods.removeSource).not.toHaveBeenCalled();
  });
});

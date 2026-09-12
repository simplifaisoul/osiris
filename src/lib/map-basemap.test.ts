import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { BASEMAP_MAX_ATTEMPTS, basemapRetryDelay, isRetryableBasemapError, watchBasemap } from './map-basemap';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const TILEJSON_URL = 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json';

function ajaxError(status: number, url: string) {
  return Object.assign(new Error(`AJAXError: ${status} (${url})`), { status, url });
}

function createMap() {
  const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  const source = { url: TILEJSON_URL, setUrl: vi.fn() };
  let hasSource = false;
  const map = {
    on: vi.fn((name: string, callback: (event: Record<string, unknown>) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
    }),
    off: vi.fn((name: string, callback: (event: Record<string, unknown>) => void) => listeners.get(name)?.delete(callback)),
    setStyle: vi.fn(),
    getSource: vi.fn(() => (hasSource ? source : undefined)),
  };
  return {
    map: map as unknown as MapLibreMap,
    methods: map, source, listeners,
    emit: (name: string, event: Record<string, unknown> = {}) => listeners.get(name)?.forEach(callback => callback(event)),
    styleLoads: () => { hasSource = true; listeners.get('style.load')?.forEach(callback => callback({})); },
    tileLoads: () => listeners.get('sourcedata')?.forEach(callback => callback({ sourceId: 'carto', tile: { state: 'loaded' } })),
  };
}

describe('basemap retry', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('reports loading, then ready on the first basemap tile, without touching a clean load', () => {
    const fixture = createMap();
    const status = vi.fn();
    watchBasemap(fixture.map, STYLE_URL, status);
    expect(status).toHaveBeenLastCalledWith({ state: 'loading' });
    fixture.styleLoads();
    fixture.tileLoads();
    expect(status).toHaveBeenLastCalledWith({ state: 'ready' });
    vi.advanceTimersByTime(60_000);
    expect(fixture.methods.setStyle).not.toHaveBeenCalled();
    expect(fixture.source.setUrl).not.toHaveBeenCalled();
  });

  it('asks for the style again, with backoff, while style.json keeps failing', () => {
    const fixture = createMap();
    const status = vi.fn();
    watchBasemap(fixture.map, STYLE_URL, status);
    fixture.emit('error', { error: ajaxError(500, STYLE_URL) });
    expect(status).toHaveBeenLastCalledWith({ state: 'retrying', attempt: 1 });
    vi.advanceTimersByTime(999);
    expect(fixture.methods.setStyle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fixture.methods.setStyle).toHaveBeenCalledWith(STYLE_URL, { diff: false });

    fixture.emit('error', { error: ajaxError(500, STYLE_URL) });
    expect(status).toHaveBeenLastCalledWith({ state: 'retrying', attempt: 2 });
    vi.advanceTimersByTime(2000);
    expect(fixture.methods.setStyle).toHaveBeenCalledTimes(2);

    fixture.styleLoads();
    fixture.tileLoads();
    expect(status).toHaveBeenLastCalledWith({ state: 'ready' });
  });

  it('reloads the source rather than the style once the style is in', () => {
    const fixture = createMap();
    watchBasemap(fixture.map, STYLE_URL, vi.fn());
    fixture.styleLoads();
    // tiles.json failed: MapLibre treats the source as loaded with no tiles.
    fixture.emit('error', { error: ajaxError(500, TILEJSON_URL), sourceId: 'carto' });
    vi.advanceTimersByTime(1000);
    expect(fixture.source.setUrl).toHaveBeenCalledWith(TILEJSON_URL);
    expect(fixture.methods.setStyle).not.toHaveBeenCalled();
  });

  it('folds a burst of tile failures into one retry', () => {
    const fixture = createMap();
    const status = vi.fn();
    watchBasemap(fixture.map, STYLE_URL, status);
    fixture.styleLoads();
    for (let i = 0; i < 12; i++) fixture.emit('error', { error: ajaxError(500, `${TILEJSON_URL}/${i}`), sourceId: 'carto' });
    expect(status).toHaveBeenLastCalledWith({ state: 'retrying', attempt: 1 });
    vi.advanceTimersByTime(1000);
    expect(fixture.source.setUrl).toHaveBeenCalledTimes(1);
  });

  it('leaves other sources, missing tiles and a working basemap alone', () => {
    const fixture = createMap();
    const status = vi.fn();
    watchBasemap(fixture.map, STYLE_URL, status);
    fixture.styleLoads();
    fixture.emit('error', { error: ajaxError(500, '/api/flights'), sourceId: 'flights' });
    fixture.emit('error', { error: ajaxError(404, `${TILEJSON_URL}/14/1/1`), sourceId: 'carto' });
    fixture.emit('error', { error: ajaxError(403, STYLE_URL) });
    fixture.emit('error', { error: new Error('layers[3]: invalid') });
    // Sprite and glyph ranges arrive after the style; tiles draw without them.
    fixture.emit('error', { error: ajaxError(500, 'https://tiles.basemaps.cartocdn.com/fonts/Open%20Sans/0-255.pbf') });
    fixture.tileLoads();
    fixture.emit('error', { error: ajaxError(500, `${TILEJSON_URL}/3/4/2`), sourceId: 'carto' });
    vi.advanceTimersByTime(60_000);
    expect(fixture.methods.setStyle).not.toHaveBeenCalled();
    expect(fixture.source.setUrl).not.toHaveBeenCalled();
    expect(status.mock.calls.map(([s]) => s.state)).toEqual(['loading', 'ready']);
  });

  it('gives up after the last attempt and starts over on demand', () => {
    const fixture = createMap();
    const status = vi.fn();
    const watch = watchBasemap(fixture.map, STYLE_URL, status);
    for (let i = 1; i <= BASEMAP_MAX_ATTEMPTS; i++) {
      fixture.emit('error', { error: ajaxError(500, STYLE_URL) });
      expect(status).toHaveBeenLastCalledWith({ state: 'retrying', attempt: i });
      vi.advanceTimersByTime(basemapRetryDelay(i));
    }
    expect(fixture.methods.setStyle).toHaveBeenCalledTimes(BASEMAP_MAX_ATTEMPTS);
    fixture.emit('error', { error: ajaxError(500, STYLE_URL) });
    expect(status).toHaveBeenLastCalledWith({ state: 'failed', attempt: BASEMAP_MAX_ATTEMPTS });
    vi.advanceTimersByTime(60_000);
    expect(fixture.methods.setStyle).toHaveBeenCalledTimes(BASEMAP_MAX_ATTEMPTS);

    watch.retry();
    expect(status).toHaveBeenLastCalledWith({ state: 'retrying', attempt: 1 });
    expect(fixture.methods.setStyle).toHaveBeenCalledTimes(BASEMAP_MAX_ATTEMPTS + 1);
  });

  it('stops on dispose', () => {
    const fixture = createMap();
    const status = vi.fn();
    const watch = watchBasemap(fixture.map, STYLE_URL, status);
    fixture.emit('error', { error: ajaxError(500, STYLE_URL) });
    watch.dispose();
    vi.advanceTimersByTime(60_000);
    expect(fixture.methods.setStyle).not.toHaveBeenCalled();
    expect(fixture.listeners.get('error')?.size ?? 0).toBe(0);
  });

  it('caps the delay and classifies failures', () => {
    expect([1, 2, 3, 4, 5, 6].map(basemapRetryDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    expect(isRetryableBasemapError(ajaxError(500, STYLE_URL))).toBe(true);
    expect(isRetryableBasemapError(ajaxError(429, STYLE_URL))).toBe(true);
    expect(isRetryableBasemapError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableBasemapError(ajaxError(404, STYLE_URL))).toBe(false);
    expect(isRetryableBasemapError(ajaxError(403, STYLE_URL))).toBe(false);
    expect(isRetryableBasemapError(new Error('validation'))).toBe(false);
    expect(isRetryableBasemapError(undefined)).toBe(false);
  });
});

import type { ErrorEvent, Map, MapSourceDataEvent } from 'maplibre-gl';

export type MapStartupStatus = 'loading' | 'ready' | 'error';
export const MAP_STARTUP_TIMEOUT_MS = 15_000;

/** MapLibre's load event can fire even when all basemap tiles failed. */
export function watchMapStartup(map: Map, onStatus: (status: MapStartupStatus) => void) {
  let disposed = false;
  let mapLoaded = false;
  let basemapLoaded = false;
  let contextLost = false;
  let status: MapStartupStatus = 'loading';
  const report = (next: MapStartupStatus) => {
    if (disposed || status === next) return;
    status = next;
    onStatus(next);
  };
  const timer = setTimeout(() => report('error'), MAP_STARTUP_TIMEOUT_MS);
  const checkReady = () => {
    if (mapLoaded && basemapLoaded && !contextLost) {
      clearTimeout(timer);
      report('ready');
    }
  };
  const onLoad = () => { mapLoaded = true; checkReady(); };
  const onData = (event: MapSourceDataEvent) => {
    if (event.sourceId === 'carto' && event.tile?.state === 'loaded') {
      basemapLoaded = true;
      checkReady();
    }
  };
  const onError = (event: ErrorEvent & { sourceId?: string }) => {
    // Isolated entity/terrain failures must not replace a working map.
    if (status !== 'ready' && (!event.sourceId || event.sourceId === 'carto')) report('error');
    console.warn('[OSIRIS] Map resource unavailable:', event.error);
  };
  const onContextLost = () => { contextLost = true; report('error'); };
  const onContextRestored = () => { contextLost = false; checkReady(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    map.off('load', onLoad);
    map.off('sourcedata', onData);
    map.off('error', onError);
    map.off('webglcontextlost', onContextLost);
    map.off('webglcontextrestored', onContextRestored);
    map.off('remove', dispose);
  };
  map.on('load', onLoad);
  map.on('sourcedata', onData);
  map.on('error', onError);
  map.on('webglcontextlost', onContextLost);
  map.on('webglcontextrestored', onContextRestored);
  map.on('remove', dispose);
  return dispose;
}

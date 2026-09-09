import type { ErrorEvent, Map, MapSourceDataEvent } from 'maplibre-gl';

export type MapStartupStatus = 'loading' | 'ready' | 'error';
/* A page load also pulls roughly 18MB of feed JSON — cameras, flights,
   satellites — and parsing it saturates the main thread the basemap shares, so
   the first tile lands far later than a direct tile fetch (tens of
   milliseconds) suggests. Against a production build, ready arrived after the
   old 15s budget had already expired: the banner production saw. A ceiling on
   silence, not an expected wait — a healthy map reports ready on its first
   tile. */
export const MAP_STARTUP_TIMEOUT_MS = 30_000;

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
  /* The deadline measures silence, not elapsed time: a map still pulling
     basemap data is loading, not broken, so progress restarts the clock.
     It also only runs while the page is actually painting. MapLibre 6 resolves
     an inline-TileJSON source inside an animation frame, so a page that is not
     drawing never finishes loading its source, never fires its load event, and never
     requests a tile — the map is not broken, it was never given a frame to
     start in. A backgrounded tab is the obvious case, but a minimised or
     fully occluded window can still report visibilityState 'visible' while
     getting no frames at all, so counting frames is the reliable signal and
     document.hidden only supplements it. Blaming the map for either is how
     the banner ends up over a map that works. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const canCountFrames = typeof requestAnimationFrame !== 'undefined';
  let frames = 0;
  let frameRequest: number | undefined;
  const countFrame = () => { frames++; frameRequest = requestAnimationFrame(countFrame); };
  if (canCountFrames) frameRequest = requestAnimationFrame(countFrame);
  const arm = () => {
    clearTimeout(timer);
    const framesAtArm = frames;
    timer = setTimeout(() => {
      const neverPainted = canCountFrames && frames === framesAtArm;
      if (hidden() || neverPainted) arm();
      else report('error');
    }, MAP_STARTUP_TIMEOUT_MS);
  };
  arm();
  const onVisibility = () => { if (!hidden() && status !== 'ready') arm(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  const checkReady = () => {
    if (mapLoaded && basemapLoaded && !contextLost) {
      clearTimeout(timer);
      report('ready');
    }
  };
  const onLoad = () => { mapLoaded = true; checkReady(); };
  /* Restart the clock once, when the style is ready. Until then the map cannot
     have asked for a tile yet: it is still fetching the style, the worker and
     the sprite/glyph origins. Counting that bootstrap against the tile budget
     is what let a healthy map run out of time before its first request. */
  let styleArmed = false;
  const onStyle = () => {
    if (styleArmed || status === 'ready') return;
    styleArmed = true;
    arm();
  };
  const onData = (event: MapSourceDataEvent) => {
    // Basemap progress only: entity layers must not hold the deadline open.
    if (event.sourceId !== 'carto') return;
    if (status !== 'ready') arm();
    if (event.tile?.state === 'loaded') {
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
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    map.off('load', onLoad);
    map.off('styledata', onStyle);
    map.off('sourcedata', onData);
    map.off('sourcedataloading', onData);
    map.off('error', onError);
    map.off('webglcontextlost', onContextLost);
    map.off('webglcontextrestored', onContextRestored);
    map.off('remove', dispose);
  };
  map.on('load', onLoad);
  map.on('styledata', onStyle);
  map.on('sourcedata', onData);
  map.on('sourcedataloading', onData);
  map.on('error', onError);
  map.on('webglcontextlost', onContextLost);
  map.on('webglcontextrestored', onContextRestored);
  map.on('remove', dispose);
  return dispose;
}

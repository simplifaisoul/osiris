import type { Map, MapSourceDataEvent, ErrorEvent } from 'maplibre-gl';
import { batchTerrainLayers } from './terrain-layer-order';

export const TERRAIN_SOURCE = 'osiris-terrain-dem';
export type TerrainStatus = 'idle' | 'waiting' | 'loading' | 'ready' | 'error';

// Hysteresis prevents reloading tiles when hovering around the activation zoom.
export const TERRAIN_MIN_ZOOM = 10;
const DISABLE_ZOOM = 9.5;
export const TERRAIN_SETTLE_MS = 500;
export const TERRAIN_FADE_MS = 600;

// Terrain still easing out after being switched off, finished at once if it is switched back on.
const fadingOut = new WeakMap<Map, () => void>();

/** Lazy, bounded terrain using the existing renderer; no second map or imagery. */
export function attachTerrain(map: Map, onStatus: (status: TerrainStatus) => void) {
  fadingOut.get(map)?.();
  let disposed = false;
  let active = false;
  let failed = false;
  let restoreLayerOrder: (() => void) | undefined;
  let status: TerrainStatus | undefined;
  let activationTimer: ReturnType<typeof setTimeout> | undefined;
  let fadeFrame: number | undefined;
  let raised = false;
  const originalPitchLimit = map.getMaxPitch();
  const originalPixelRatio = map.getPixelRatio();
  const pitchLimit = Math.min(originalPitchLimit, 60);
  // Never flatten the camera to fit the limit: a steeper view keeps its pitch,
  // and the limit applies once the user tilts within it.
  const capPitch = () => {
    if (map.getPitch() > pitchLimit) return;
    map.setMaxPitch(pitchLimit);
    map.off('pitchend', capPitch);
  };
  map.on('pitchend', capPitch);
  capPitch();
  // Retina screens otherwise multiply the terrain framebuffers' pixel count.
  if (originalPixelRatio > 1.5) map.setPixelRatio(1.5);

  const report = (next: TerrainStatus) => {
    if (disposed || next === status) return;
    status = next;
    onStatus(next);
  };
  const cancelFade = () => {
    if (fadeFrame !== undefined) cancelAnimationFrame(fadeFrame);
    fadeFrame = undefined;
  };
  // MapLibre keeps the camera at the same distance from the ground at the
  // centre, so relief appearing in one frame lifts the camera by its full
  // height in that frame. Easing the relief in and out eases the camera too.
  const fade = (to: number, done?: () => void) => {
    cancelFade();
    const terrain = map.terrain;
    const from = terrain?.exaggeration ?? to;
    if (!terrain || from === to) { done?.(); return; }
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / (TERRAIN_FADE_MS * Math.abs(to - from)));
      // Ease in and out: the camera neither starts nor stops with a jolt.
      terrain.exaggeration = from + (to - from) * t * t * (3 - 2 * t);
      map.triggerRepaint();
      if (t < 1) fadeFrame = requestAnimationFrame(step);
      else { fadeFrame = undefined; done?.(); }
    };
    fadeFrame = requestAnimationFrame(step);
  };
  const release = () => {
    active = false;
    raised = false;
    cancelFade();
    if (map.getTerrain()?.source === TERRAIN_SOURCE) map.setTerrain(null);
    if (map.getSource(TERRAIN_SOURCE)) map.removeSource(TERRAIN_SOURCE);
    restoreLayerOrder?.();
    restoreLayerOrder = undefined;
  };
  const cancelActivation = () => {
    clearTimeout(activationTimer);
    activationTimer = undefined;
  };
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const activate = () => {
    activationTimer = undefined;
    if (disposed || active || failed || map.isMoving() || hidden() || map.getZoom() < TERRAIN_MIN_ZOOM) return;
    active = true;
    report('loading');
    try {
      map.addSource(TERRAIN_SOURCE, {
        type: 'raster-dem',
        tiles: ['osiris-dem://{z}/{x}/{y}'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 10,
        attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain data credits</a>',
      });
      // DEM maxzoom only limits downloads, not terrain render-tile density.
      // Bound the latter too, especially the distant tiles in a pitched view.
      map.setSourceTileLodParams(10, 1.25, TERRAIN_SOURCE);
      restoreLayerOrder = batchTerrainLayers(map);
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1 });
      // Flat until the elevation has loaded, then eased in.
      map.terrain.exaggeration = 0;
    } catch (error) {
      failed = true;
      release();
      report('error');
      console.warn('[OSIRIS] Terrain unavailable:', error);
    }
  };
  const update = () => {
    if (disposed || active || failed) return;
    cancelActivation();
    if (map.getZoom() < TERRAIN_MIN_ZOOM) {
      report('idle');
      return;
    }
    report('waiting');
    if (!map.isMoving() && !hidden()) activationTimer = setTimeout(activate, TERRAIN_SETTLE_MS);
  };
  const onZoom = () => {
    if (!active && map.getZoom() < TERRAIN_MIN_ZOOM) {
      cancelActivation();
      if (!failed) report('idle');
    }
    // Stop terrain requests during the zoom-out, before reaching the globe.
    if (active && map.getZoom() < DISABLE_ZOOM) {
      release();
      report('idle');
    }
  };
  const onData = (event: MapSourceDataEvent) => {
    // Individual raster tile completions carry `tile`, not sourceDataType:
    // 'content'. Waiting for 'content' alone leaves the indicator spinning.
    if (active && !failed && event.sourceId === TERRAIN_SOURCE &&
        event.isSourceLoaded && (event.tile || event.sourceDataType === 'idle')) {
      report('ready');
      if (!raised) { raised = true; fade(1); }
    }
  };
  const onError = (event: ErrorEvent & { sourceId?: string }) => {
    if (!active || event.sourceId !== TERRAIN_SOURCE) return;
    failed = true;
    report('error');
    // Let MapLibre finish its source callback before removing its resources.
    queueMicrotask(() => { if (!disposed) release(); });
  };

  map.on('movestart', cancelActivation);
  map.on('zoom', onZoom);
  map.on('moveend', update);
  map.on('sourcedata', onData);
  map.on('error', onError);
  const onVisibility = () => { if (hidden()) cancelActivation(); else update(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  // React removes the map before running this effect's cleanup on a theme
  // change. Cancel deferred work without touching its already-destroyed style.
  const onRemove = () => {
    disposed = true;
    cancelActivation();
    cancelFade();
    fadingOut.delete(map);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  };
  map.on('remove', onRemove);
  report('idle');
  update();

  return () => {
    if (disposed) return;
    disposed = true;
    cancelActivation();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    map.off('movestart', cancelActivation);
    map.off('zoom', onZoom);
    map.off('moveend', update);
    map.off('sourcedata', onData);
    map.off('error', onError);
    map.off('pitchend', capPitch);
    const finish = () => {
      fadingOut.delete(map);
      map.off('remove', onRemove);
      release();
      map.setMaxPitch(originalPitchLimit);
      if (originalPixelRatio > 1.5) map.setPixelRatio(originalPixelRatio);
    };
    // Ease the relief away before removing it, the reverse of its arrival.
    fadingOut.set(map, finish);
    fade(0, finish);
  };
}

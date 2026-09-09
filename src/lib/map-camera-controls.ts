import type { Map as MapLibreMap, MapMovementEvent } from 'maplibre-gl';

export type CameraMove = { kind: 'zoom'; dir: 1 | -1 } | { kind: 'pan'; dx: number; dy: number };
const CONTROL_EVENT = { osirisCameraControl: true };
const STEP_MS = 240;
const HOLD_DELAY_MS = 280;
const LEG_MS = 400;
const TICK_MS = 200;

/** One controller owns button intent; interrupted animations do not lose taps. */
export function createMapCameraControls(
  map: MapLibreMap,
  onInteract: () => void = () => {},
  reducedMotion: () => boolean = () => false,
) {
  let targetZoom: number | null = null;
  let issuing = false;
  let ownsAnimation = false;
  let disposed = false;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  const clampZoom = (zoom: number) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));

  const run = (action: () => void) => {
    issuing = true;
    ownsAnimation = true;
    try { action(); }
    finally { issuing = false; }
    if (!map.isMoving()) { targetZoom = null; ownsAnimation = false; }
  };

  const release = (stop = true) => {
    clearTimeout(delay);
    delay = undefined;
    const wasHolding = repeat !== undefined;
    clearInterval(repeat);
    repeat = undefined;
    if (wasHolding && stop && ownsAnimation && !disposed) map.stop();
    if (wasHolding) targetZoom = null;
  };

  const step = (move: CameraMove) => {
    if (disposed) return;
    onInteract();
    const duration = reducedMotion() ? 0 : STEP_MS;
    if (move.kind === 'zoom') {
      const next = clampZoom((targetZoom ?? map.getZoom()) + move.dir);
      if (next === targetZoom || (targetZoom === null && next === map.getZoom())) return;
      targetZoom = next;
      run(() => map.easeTo({ zoom: next, duration }, CONTROL_EVENT));
    } else {
      targetZoom = null;
      run(() => map.panBy([move.dx * 220, move.dy * 220], { duration }, CONTROL_EVENT));
    }
  };

  const press = (move: CameraMove) => {
    if (disposed) return;
    release();
    step(move);
    const leg = () => {
      if (disposed) return;
      targetZoom = null;
      const duration = reducedMotion() ? 0 : LEG_MS;
      // With reduced motion, step only the distance for this tick (no overlap).
      const seconds = (duration ? LEG_MS : TICK_MS) / 1000;
      if (move.kind === 'zoom') {
        const zoom = clampZoom(map.getZoom() + move.dir * 1.6 * seconds);
        if (zoom === map.getZoom()) { release(); return; }
        run(() => map.easeTo({ zoom, duration, easing: t => t }, CONTROL_EVENT));
      } else {
        run(() => map.panBy([move.dx * 640 * seconds, move.dy * 640 * seconds], { duration, easing: t => t }, CONTROL_EVENT));
      }
    };
    delay = setTimeout(() => {
      delay = undefined;
      repeat = setInterval(leg, TICK_MS);
      leg();
    }, HOLD_DELAY_MS);
  };

  const onStart = (event: MapMovementEvent & { osirisCameraControl?: boolean }) => {
    if (event.osirisCameraControl || issuing) return;
    // A wheel/pinch/search/view change takes ownership. Do not stop its motion.
    release(false);
    targetZoom = null;
    ownsAnimation = false;
  };
  const onEnd = () => {
    // easeTo synchronously ends the animation it replaces before starting anew.
    if (!issuing) { targetZoom = null; ownsAnimation = false; }
  };
  const dispose = () => {
    if (disposed) return;
    release();
    disposed = true;
    map.off('movestart', onStart);
    map.off('moveend', onEnd);
    map.off('remove', onRemove);
  };
  const onRemove = () => {
    // Map removal precedes React child cleanup; do not call stop on a dead map.
    ownsAnimation = false;
    dispose();
  };
  map.on('movestart', onStart);
  map.on('moveend', onEnd);
  map.on('remove', onRemove);
  return { step, press, release: () => release(), dispose };
}

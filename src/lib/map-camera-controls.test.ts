import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { createMapCameraControls } from './map-camera-controls';

function fixture(reducedMotion = false) {
  const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  let zoom = 6.5;
  let moving = false;
  const emit = (type: string, event = {}) => listeners.get(type)?.forEach(fn => fn(event));
  const map = {
    getZoom: () => zoom, getMinZoom: () => 1.5, getMaxZoom: () => 18, isMoving: () => moving,
    on: (type: string, fn: (event: Record<string, unknown>) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    off: (type: string, fn: (event: Record<string, unknown>) => void) => listeners.get(type)?.delete(fn),
    easeTo: vi.fn((options, data) => {
      if (moving) emit('moveend');
      moving = options.duration !== 0;
      if (!moving) zoom = options.zoom;
      emit('movestart', data);
    }),
    panBy: vi.fn(),
    stop: vi.fn(() => { moving = false; emit('moveend'); }),
  };
  const interact = vi.fn();
  const controller = createMapCameraControls(map as unknown as MapLibreMap, interact, () => reducedMotion);
  const settle = (value: number) => { zoom = value; moving = false; emit('moveend'); };
  return { controller, map, interact, emit, settle, setZoom: (value: number) => { zoom = value; }, listeners };
}
const zoomIn = { kind: 'zoom', dir: 1 } as const;
const zoomOut = { kind: 'zoom', dir: -1 } as const;

describe('map camera input', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preserves three rapid taps through synchronous animation interruption', () => {
    const f = fixture();
    f.controller.step(zoomIn); f.setZoom(6.9);
    f.controller.step(zoomIn); f.setZoom(7.2);
    f.controller.step(zoomIn);
    expect(f.map.easeTo.mock.calls.map(([options]) => options.zoom)).toEqual([7.5, 8.5, 9.5]);
    f.controller.dispose();
  });

  it('reverses pending zoom intent and resets to actual zoom when settled', () => {
    const f = fixture();
    f.controller.step(zoomIn); f.controller.step(zoomIn); f.controller.step(zoomOut);
    expect(f.map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 7.5 }), expect.anything());
    f.settle(7.5); f.controller.step(zoomOut);
    expect(f.map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 6.5 }), expect.anything());
    f.controller.dispose();
  });

  it('clamps at both zoom limits without repeatedly restarting a clamped animation', () => {
    const f = fixture(); f.setZoom(17.6);
    f.controller.step(zoomIn); f.controller.step(zoomIn);
    expect(f.map.easeTo).toHaveBeenCalledTimes(1);
    expect(f.map.easeTo.mock.calls[0][0].zoom).toBe(18);
    f.settle(1.7); f.controller.step(zoomOut);
    expect(f.map.easeTo.mock.calls[1][0].zoom).toBe(1.5);
    f.controller.dispose();
  });

  it('lets taps finish, but stops a held camera immediately on release', () => {
    const f = fixture();
    f.controller.press(zoomIn); f.controller.release();
    expect(f.map.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(f.map.easeTo).toHaveBeenCalledTimes(1);
    f.settle(7.5); f.controller.press(zoomIn);
    vi.advanceTimersByTime(300);
    f.controller.release();
    expect(f.map.stop).toHaveBeenCalledTimes(1);
    const calls = f.map.easeTo.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(f.map.easeTo).toHaveBeenCalledTimes(calls);
    f.controller.dispose();
  });

  it('cancels held input when wheel, pinch, search or a view change takes over', () => {
    const f = fixture(); f.controller.press(zoomIn);
    vi.advanceTimersByTime(300);
    f.emit('movestart', { originalEvent: {} });
    const calls = f.map.easeTo.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(f.map.easeTo).toHaveBeenCalledTimes(calls);
    expect(f.map.stop).not.toHaveBeenCalled();
    f.setZoom(4); f.controller.step(zoomIn);
    expect(f.map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 5 }), expect.anything());
    f.controller.dispose();
  });

  it('respects reduced motion without losing multiple zoom steps', () => {
    const f = fixture(true); f.controller.step(zoomIn); f.controller.step(zoomIn);
    expect(f.map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 8.5, duration: 0 }), expect.anything());
    f.controller.dispose();
  });

  it('does not animate a removed map and cleans up listeners and timers', () => {
    const f = fixture(); f.controller.press(zoomIn); f.emit('remove');
    vi.advanceTimersByTime(2000); f.controller.step(zoomIn); f.controller.dispose();
    expect(f.map.easeTo).toHaveBeenCalledTimes(1);
    expect(f.map.stop).not.toHaveBeenCalled();
    expect([...f.listeners.values()].every(set => !set.size)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { balanceOf, colourOf, coloursOf, hasColour, lensOf, paintVehicles } from './colour';

type RGB = [number, number, number];

/** A test picture: a background, with rectangles painted over it. RGB, row by row. */
function picture(w: number, h: number, bg: RGB, rects: { x: number; y: number; w: number; h: number; c: RGB }[] = []) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) px.set(bg, i * 3);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) px.set(r.c, (y * w + x) * 3);
  return px;
}

/** A car seen from above: dark glass across the top half, paint below. */
const car = (x: number, y: number, paint: RGB) => [
  { x, y, w: 40, h: 40, c: paint },
  { x: x + 4, y: y + 4, w: 32, h: 16, c: [25, 28, 32] as RGB },
];

const ROAD: RGB = [110, 110, 112];

describe('colourOf', () => {
  it('reads the paint below the glass, not the dark windows', () => {
    const px = picture(100, 100, ROAD, car(10, 10, [235, 235, 238]));
    expect(colourOf(px, 100, 100, 3, [10, 10, 40, 40])).toBe('white');
  });

  it('calls a vehicle black only when dark is nearly all there is', () => {
    const px = picture(100, 100, ROAD, car(10, 10, [30, 30, 34]));
    expect(colourOf(px, 100, 100, 3, [10, 10, 40, 40])).toBe('black');
  });

  it('keeps a dark red car red, not brown', () => {
    const px = picture(100, 100, ROAD, car(10, 10, [120, 20, 25]));
    expect(colourOf(px, 100, 100, 3, [10, 10, 40, 40])).toBe('red');
  });

  it('names real colours, and greys', () => {
    for (const [paint, want] of [[[30, 70, 170], 'blue'], [[220, 200, 30], 'yellow'], [[150, 150, 152], 'silver'], [[95, 95, 98], 'grey']] as [RGB, string][]) {
      const px = picture(60, 60, ROAD, car(10, 10, paint));
      expect(colourOf(px, 60, 60, 3, [10, 10, 40, 40])).toBe(want);
    }
  });

  it('gives no answer for a box too small to read', () => {
    expect(colourOf(picture(20, 20, ROAD), 20, 20, 3, [2, 2, 3, 3])).toBeNull();
  });
});

describe('white balance', () => {
  it('takes a blue cast out, so a grey car on a grey road stays grey', () => {
    const cast = (c: RGB): RGB => [c[0] * 0.8, c[1] * 0.88, Math.min(255, c[2] * 1.18)];
    const px = picture(100, 100, cast(ROAD), car(10, 10, cast([100, 100, 100])));
    expect(colourOf(px, 100, 100, 3, [10, 10, 40, 40])).toBe('blue'); // uncorrected, the cast wins
    expect(colourOf(px, 100, 100, 3, [10, 10, 40, 40], balanceOf(px, 3))).toBe('grey');
  });

  it('is measured on the greys, so a view full of trees does not turn a red car purple', () => {
    const px = picture(120, 120, [60, 140, 50], [{ x: 0, y: 80, w: 120, h: 40, c: ROAD }, ...car(40, 80, [200, 30, 40])]);
    expect(colourOf(px, 120, 120, 3, [40, 80, 40, 40], balanceOf(px, 3))).toBe('red');
  });
});

describe('paintVehicles', () => {
  const dets = [
    { label: 'car', score: 0.9, box: [10, 10, 40, 40] as [number, number, number, number] },
    { label: 'person', score: 0.8, box: [60, 10, 10, 30] as [number, number, number, number] },
  ];
  const whole = (data: Uint8Array) => ({ data, width: 100, height: 100, channels: 3 as const, scale: 1, x: 0, y: 0 });

  it('colours the vehicles, leaves people alone, and tallies', () => {
    const px = picture(100, 100, ROAD, car(10, 10, [200, 30, 40]));
    const lens = lensOf(px, 3);
    const out = paintVehicles(dets, whole(px), lens, ['car']);
    expect(out[0].colour).toBe('red');
    expect('colour' in out[1]).toBe(false);
    expect(coloursOf(out, lens)).toEqual({ red: 1 });
  });

  it('reads a box in the frame from pixels of one region of it, scaled', () => {
    // The region from (100, 50), read at half size: the car at frame (110, 60) is at (5, 5) in its pixels.
    const px = picture(50, 50, ROAD, [{ x: 5, y: 5, w: 20, h: 20, c: [30, 70, 170] }]);
    const out = paintVehicles([{ label: 'car', score: 0.9, box: [110, 60, 40, 40] as [number, number, number, number] }],
      { data: px, width: 50, height: 50, channels: 3, scale: 0.5, x: 100, y: 50 }, [1, 1, 1], ['car']);
    expect(out[0].colour).toBe('blue');
  });

  it('reads no colours from a picture with none, such as an infrared night camera', () => {
    const px = picture(100, 100, [90, 90, 90], car(10, 10, [200, 200, 200]));
    expect(hasColour(px, 3)).toBe(false);
    expect(lensOf(px, 3)).toBeNull();
    const out = paintVehicles(dets, whole(px), null, ['car']);
    expect('colour' in out[0]).toBe(false);
    expect(coloursOf(out, null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { WindGrid } from './wind-layer';
import {
  bakeWindStreamlines,
  boundsContain,
  cameraHeight,
  createWindBaker,
  padBounds,
  windHeightFade,
  windLevel,
  windSeedCount,
  windSpacing,
  WIND_MAX_LEVEL,
  WIND_STRIDE,
  type WindBounds,
} from './wind-streamlines';

/** A one-degree grid with the same wind everywhere, rows north to south. */
function uniform(u: number, v: number): WindGrid {
  const ni = 360;
  const nj = 181;
  return { ni, nj, la1: 90, lo1: 0, dx: 1, dy: 1, u: new Float32Array(ni * nj).fill(u), v: new Float32Array(ni * nj).fill(v) };
}

/** Westerlies with lows and highs in them, which bend the curves together the way real wind does. `turn` moves the eddies along. */
function eddies(turn = 0): WindGrid {
  const ni = 360;
  const nj = 181;
  const u = new Float32Array(ni * nj);
  const v = new Float32Array(ni * nj);
  for (let j = 0; j < nj; j++) {
    const lat = 90 - j;
    for (let i = 0; i < ni; i++) {
      let uu = 6 * Math.cos((lat * Math.PI) / 90);
      let vv = 0;
      for (let k = 0; k < 8; k++) {
        const lat0 = (k % 2 ? 1 : -1) * (20 + 5 * k);
        const lng0 = (k * 47 + turn) % 360;
        const dx = ((((i - lng0) % 360) + 540) % 360 - 180) * Math.cos((lat * Math.PI) / 180);
        const dy = lat - lat0;
        const g = Math.exp(-(dx * dx + dy * dy) / 128) * (k % 3 ? 2 : -2);
        uu -= dy * g;
        vv += dx * g;
      }
      u[j * ni + i] = uu;
      v[j * ni + i] = vv;
    }
  }
  return { ni, nj, la1: 90, lo1: 0, dx: 1, dy: 1, u, v };
}

const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** Degrees of arc between two points. */
function arc(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / r;
}

/** The closest two vertices of different curves come, in degrees of arc. */
function closestApart(all: number[][][]): number {
  const cell = 1;
  const grid = new Map<string, [number, number, number][]>();
  const points = all.flatMap((curve, c) => curve.map(([x, y]) => [lngOf(x), latOf(y), c] as [number, number, number]));
  for (const p of points) {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
  }
  let best = Infinity;
  for (const [lng, lat, c] of points) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [lng2, lat2, c2] of grid.get(`${Math.floor(lng / cell) + dx},${Math.floor(lat / cell) + dy}`) ?? []) {
        if (c2 !== c) best = Math.min(best, arc(lng, lat, lng2, lat2));
      }
    }
  }
  return best;
}

/** The curves, as lists of [x, y, along, phase]. */
function curves(baked: ReturnType<typeof bakeWindStreamlines>): number[][][] {
  const out: number[][][] = [];
  for (let i = 0; i < baked.count; i++) {
    const o = i * WIND_STRIDE;
    const vertex = Array.from(baked.vertices.subarray(o, o + WIND_STRIDE));
    if (i === 0 || vertex[2] < out.at(-1)!.at(-1)![2]) out.push([]);
    out.at(-1)!.push(vertex);
  }
  return out;
}

describe('bakeWindStreamlines', () => {
  it('draws no curves where the air is still', () => {
    const baked = bakeWindStreamlines(uniform(0, 0), { count: 200 });
    expect(baked.paths).toBe(0);
    expect(baked.count).toBe(0);
  });

  it('makes curves in moving air, each running from 0 to 1 along its length', () => {
    const baked = bakeWindStreamlines(uniform(5, 0), { count: 300 });
    expect(baked.paths).toBeGreaterThan(200);
    expect(baked.seeds).toHaveLength(baked.paths);
    const all = curves(baked);
    expect(all).toHaveLength(baked.paths);
    for (const curve of all) {
      expect(curve.length).toBeGreaterThanOrEqual(5);
      expect(curve[0][2]).toBe(0);
      expect(curve.at(-1)![2]).toBeCloseTo(1, 5);
      // One phase per curve, and `along` only ever grows.
      expect(new Set(curve.map(v => v[3])).size).toBe(1);
      for (let i = 1; i < curve.length; i++) expect(curve[i][2]).toBeGreaterThan(curve[i - 1][2]);
    }
  });

  it('runs with the wind: an eastward wind moves a curve east', () => {
    const baked = bakeWindStreamlines(uniform(8, 0), { count: 100 });
    for (const curve of curves(baked)) {
      // Mercator x grows eastward, except where a curve is cut at the seam, which never wraps.
      for (let i = 1; i < curve.length; i++) expect(curve[i][0]).toBeGreaterThan(curve[i - 1][0]);
    }
  });

  it('runs north in a northerly wind, which is a smaller mercator y', () => {
    const baked = bakeWindStreamlines(uniform(0, 8), { count: 100 });
    for (const curve of curves(baked)) {
      for (let i = 1; i < curve.length; i++) expect(curve[i][1]).toBeLessThan(curve[i - 1][1]);
    }
  });

  it('never wraps a curve across the seam or to a pole', () => {
    const baked = bakeWindStreamlines(uniform(30, 10), { count: 400 });
    for (const curve of curves(baked)) {
      for (let i = 1; i < curve.length; i++) expect(Math.abs(curve[i][0] - curve[i - 1][0])).toBeLessThan(0.5);
      for (const v of curve) {
        expect(v[1]).toBeGreaterThan(0);
        expect(v[1]).toBeLessThan(1);
      }
    }
  });

  it('is the same every time', () => {
    const a = bakeWindStreamlines(uniform(5, 2), { count: 50 });
    const b = bakeWindStreamlines(uniform(5, 2), { count: 50 });
    expect(Array.from(a.vertices.subarray(0, a.count * WIND_STRIDE))).toEqual(Array.from(b.vertices.subarray(0, b.count * WIND_STRIDE)));
  });

  it('keeps curves apart where the wind brings them together, so none is drawn over another', () => {
    const count = 2000;
    const all = curves(bakeWindStreamlines(eddies(), { count }));
    expect(all.length).toBeGreaterThan(500);
    expect(closestApart(all)).toBeGreaterThan(0.3 * windSpacing(count));
  });

  it('keeps a finer level apart at its own, finer spacing', () => {
    const count = 2000;
    const bounds: WindBounds = [-30, 10, 0, 30];
    const all = curves(bakeWindStreamlines(eddies(), { count, level: 3, bounds }));
    expect(all.length).toBeGreaterThan(200);
    expect(closestApart(all)).toBeGreaterThan(0.3 * windSpacing(count, 3));
  });

  it('seeds a finer level only in its box, many more curves to the degree than the globe has', () => {
    const count = 2000;
    const bounds: WindBounds = [-30, 10, 0, 30];
    const globe = curves(bakeWindStreamlines(eddies(), { count }));
    const fine = curves(bakeWindStreamlines(eddies(), { count, level: 2, bounds }));
    const inside = (curve: number[][]) => curve.some(([x, y]) => boundsContain(bounds, [lngOf(x), latOf(y), lngOf(x), latOf(y)]));
    expect(fine.every(inside)).toBe(true);
    expect(fine.length).toBeGreaterThan(4 * globe.filter(inside).length);
  });

  it('seeds a box across the seam on both sides of it', () => {
    const fine = curves(bakeWindStreamlines(uniform(0, 4), { count: 2000, level: 1, bounds: [170, -10, 190, 10] }));
    const lngs = fine.map(curve => lngOf(curve[0][0]));
    expect(lngs.some(lng => lng > 170)).toBe(true);
    expect(lngs.some(lng => lng < -170)).toBe(true);
    expect(lngs.every(lng => lng > 169 || lng < -169)).toBe(true);
  });
});

describe('createWindBaker', () => {
  it('keeps most curves as the wind moves on, by trying their seeds first', () => {
    const request = { kind: 'globe' as const, count: 2000, level: 0 };
    const kept = (a: Float64Array, b: Float64Array) => { const set = new Set(b); return a.filter(id => set.has(id)).length / a.length; };
    const bake = createWindBaker();
    const before = bake(eddies(0), request);
    const after = bake(eddies(1.5), request);
    const fresh = bakeWindStreamlines(eddies(1.5), { count: 2000 });
    expect(kept(before.seeds, after.seeds)).toBeGreaterThan(0.9);
    expect(kept(before.seeds, after.seeds)).toBeGreaterThan(kept(before.seeds, fresh.seeds));
  });

  it('keeps the curves a view had when it pans', () => {
    const bake = createWindBaker();
    const before = bake(eddies(), { kind: 'detail', count: 2000, level: 2, bounds: [-30, 10, 0, 30] });
    const after = bake(eddies(), { kind: 'detail', count: 2000, level: 2, bounds: [-25, 10, 5, 30] });
    // The boxes share five sixths of their area; nearly all the curves there stay.
    const now = new Set(after.seeds);
    expect(before.seeds.filter(id => now.has(id)).length / before.paths).toBeGreaterThan(0.75);
  });
});

describe('detail levels', () => {
  it('halve the spacing with each level, and come in a zoom step at a time from zoom 4.5', () => {
    expect(windSpacing(7200, 1)).toBeCloseTo(windSpacing(7200) / 2, 10);
    expect(windSpacing(1800)).toBeCloseTo(windSpacing(7200) * 2, 10);
    expect(windLevel(1.5)).toBe(0);
    expect(windLevel(4.49)).toBe(0);
    expect(windLevel(4.5)).toBe(1);
    expect(windLevel(7.5)).toBe(4);
    expect(windLevel(18)).toBe(WIND_MAX_LEVEL);
  });

  it('try about as many seeds for a zoomed-in view as for the globe', () => {
    // A 1440 x 900 view at zoom 7.5, near 40 N: about 11 x 5 degrees.
    const view = windSeedCount(padBounds([-45, 38, -34, 43], 0.25), windSpacing(7200, windLevel(7.5)));
    const globe = windSeedCount([-180, -90, 180, 90], windSpacing(7200));
    expect(view).toBeLessThan(2 * globe);
    expect(view).toBeGreaterThan(globe / 8);
  });
});

describe('bounds', () => {
  it('pads on every side and stays on the globe', () => {
    expect(padBounds([0, 0, 10, 10], 0.25)).toEqual([-2.5, -2.5, 12.5, 12.5]);
    expect(padBounds([0, 80, 10, 88], 0.5)).toEqual([-5, 76, 15, 90]);
    expect(padBounds([-170, 0, 170, 10], 0.25)).toEqual([-180, -2.5, 180, 12.5]);
  });

  it('tells a box inside another, across the seam too', () => {
    expect(boundsContain([0, 0, 10, 10], [2, 2, 8, 8])).toBe(true);
    expect(boundsContain([0, 0, 10, 10], [2, 2, 11, 8])).toBe(false);
    expect(boundsContain([0, 0, 10, 10], [2, -1, 8, 8])).toBe(false);
    expect(boundsContain([170, 0, 200, 10], [-175, 2, -165, 8])).toBe(true);
    expect(boundsContain([170, 0, 200, 10], [175, 2, 185, 8])).toBe(true);
    expect(boundsContain([-10, 0, 10, 10], [355, 2, 365, 8])).toBe(true);
    expect(boundsContain([-180, -90, 180, 90], [100, 0, 300, 10])).toBe(true);
  });
});

describe('windHeightFade', () => {
  it('is gone near the ground and full from sixty kilometres', () => {
    expect(windHeightFade(5_000)).toBe(0);
    expect(windHeightFade(15_000)).toBe(0);
    expect(windHeightFade(37_500)).toBeCloseTo(0.5, 5);
    expect(windHeightFade(60_000)).toBe(1);
    expect(windHeightFade(20_000_000)).toBe(1);
  });
});

describe('cameraHeight', () => {
  it('doubles with each zoom out, and shrinks away from the equator', () => {
    expect(cameraHeight(4, 0, 800) / cameraHeight(5, 0, 800)).toBeCloseTo(2, 5);
    expect(cameraHeight(6, 60, 800)).toBeLessThan(cameraHeight(6, 0, 800));
  });
});

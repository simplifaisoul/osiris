import { describe, it, expect } from 'vitest';
import {
  haversine, bearing, destination, polygonArea, ringPerimeter, pathLength,
  circleToRing, rectToRing, formatDistance, formatArea, compassPoint,
  EARTH_RADIUS_KM, type LngLat,
} from './geo';

/** Closed form for a lat/lon cell: R^2 * dLambda * (sin f2 - sin f1). */
const exactCellArea = (w: number, s: number, e: number, n: number) =>
  EARTH_RADIUS_KM ** 2 *
  ((e - w) * Math.PI / 180) *
  (Math.sin((n * Math.PI) / 180) - Math.sin((s * Math.PI) / 180));

const LONDON: LngLat = [-0.1278, 51.5074];
const PARIS: LngLat = [2.3522, 48.8566];
const NEW_YORK: LngLat = [-74.006, 40.7128];

describe('haversine', () => {
  it('matches published great-circle distances', () => {
    // London–Paris is ~344 km, London–New York ~5,570 km.
    expect(haversine(LONDON, PARIS)).toBeGreaterThan(340);
    expect(haversine(LONDON, PARIS)).toBeLessThan(348);
    expect(haversine(LONDON, NEW_YORK)).toBeGreaterThan(5520);
    expect(haversine(LONDON, NEW_YORK)).toBeLessThan(5620);
  });

  it('is zero for identical points and symmetric', () => {
    expect(haversine(LONDON, LONDON)).toBe(0);
    expect(haversine(LONDON, PARIS)).toBeCloseTo(haversine(PARIS, LONDON), 9);
  });

  it('measures a quarter meridian as a quarter circumference', () => {
    const quarter = (2 * Math.PI * EARTH_RADIUS_KM) / 4;
    expect(haversine([0, 0], [0, 90])).toBeCloseTo(quarter, 6);
  });

  it('handles antipodes without NaN from floating point overshoot', () => {
    const half = Math.PI * EARTH_RADIUS_KM;
    expect(haversine([0, 0], [180, 0])).toBeCloseTo(half, 6);
  });
});

describe('bearing', () => {
  it('reads cardinal directions correctly', () => {
    expect(bearing([0, 0], [0, 10])).toBeCloseTo(0, 6);    // north
    expect(bearing([0, 0], [10, 0])).toBeCloseTo(90, 6);   // east
    expect(bearing([0, 0], [0, -10])).toBeCloseTo(180, 6); // south
    expect(bearing([0, 0], [-10, 0])).toBeCloseTo(270, 6); // west
  });

  it('always returns 0..360', () => {
    for (const b of [bearing(PARIS, LONDON), bearing(LONDON, NEW_YORK), bearing(NEW_YORK, LONDON)]) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe('destination', () => {
  it('is the inverse of haversine + bearing', () => {
    const d = haversine(LONDON, PARIS);
    const b = bearing(LONDON, PARIS);
    const p = destination(LONDON, b, d);
    expect(p[0]).toBeCloseTo(PARIS[0], 6);
    expect(p[1]).toBeCloseTo(PARIS[1], 6);
  });

  it('travels the requested distance', () => {
    const p = destination(LONDON, 42, 250);
    expect(haversine(LONDON, p)).toBeCloseTo(250, 6);
  });

  it('normalises longitude across the antimeridian', () => {
    const p = destination([179, 0], 90, 500);
    expect(p[0]).toBeGreaterThanOrEqual(-180);
    expect(p[0]).toBeLessThanOrEqual(180);
  });
});

describe('polygonArea', () => {
  it('matches the closed form for an equatorial cell', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(polygonArea(ring)).toBeCloseTo(exactCellArea(0, 0, 1, 1), 3);
  });

  it('matches the closed form at high latitude, where cells shrink', () => {
    const ring = [[0, 50], [1, 50], [1, 51], [0, 51]];
    const exact = exactCellArea(0, 50, 1, 51);
    expect(polygonArea(ring)).toBeCloseTo(exact, 3);
    // sanity: a 1deg cell at 50N really is smaller than one at the equator
    expect(exact).toBeLessThan(exactCellArea(0, 0, 1, 1));
  });

  it('scales with a large cell', () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(polygonArea(ring)).toBeCloseTo(exactCellArea(0, 0, 10, 10), 0);
  });

  it('ignores winding order and ring closure', () => {
    const open = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const closed = [...open, [0, 0]];
    const reversed = [...open].reverse();
    expect(polygonArea(closed)).toBeCloseTo(polygonArea(open), 6);
    expect(polygonArea(reversed)).toBeCloseTo(polygonArea(open), 6);
  });

  it('is zero for degenerate input', () => {
    expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
    expect(polygonArea([])).toBe(0);
  });
});

describe('ringPerimeter and pathLength', () => {
  it('a ring closes, a path does not', () => {
    const pts = [[0, 0], [1, 0], [1, 1]];
    const path = pathLength(pts);
    const ring = ringPerimeter(pts);
    expect(ring).toBeGreaterThan(path);
    expect(ring - path).toBeCloseTo(haversine([1, 1], [0, 0]), 6);
  });

  it('an equatorial degree of longitude is ~111.19 km', () => {
    expect(pathLength([[0, 0], [1, 0]])).toBeCloseTo(111.19, 1);
  });
});

describe('circleToRing', () => {
  const CENTRE: LngLat = [10, 45];

  it('puts every vertex at the requested radius', () => {
    const ring = circleToRing(CENTRE, 100, 32);
    for (const p of ring) expect(haversine(CENTRE, p as LngLat)).toBeCloseTo(100, 6);
  });

  it('returns a closed ring', () => {
    const ring = circleToRing(CENTRE, 50, 16);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(17);
  });

  it('approaches pi*r^2, slightly under as an inscribed polygon', () => {
    const r = 100;
    const ideal = Math.PI * r * r;
    const area = polygonArea(circleToRing(CENTRE, r, 64));
    expect(area).toBeLessThan(ideal);
    expect(area).toBeGreaterThan(ideal * 0.995);
  });

  it('stays a true circle at high latitude', () => {
    // A naive degree-radius circle degenerates into an ellipse near the pole;
    // every vertex here must still be the same distance from the centre.
    const polar: LngLat = [15, 78];
    const ring = circleToRing(polar, 200, 32);
    const spread = ring.map(p => haversine(polar, p as LngLat));
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(1e-6);
  });
});

describe('rectToRing', () => {
  it('normalises corner order', () => {
    const a = rectToRing([1, 1], [-1, -1]);
    const b = rectToRing([-1, -1], [1, 1]);
    expect(a).toEqual(b);
  });

  it('is closed and matches the equivalent cell area', () => {
    const ring = rectToRing([0, 0], [1, 1]);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(polygonArea(ring)).toBeCloseTo(exactCellArea(0, 0, 1, 1), 3);
  });
});

describe('formatting', () => {
  it('switches units at sensible thresholds', () => {
    expect(formatDistance(0.42)).toBe('420 m');
    expect(formatDistance(4.2)).toBe('4.2 km');
    expect(formatDistance(4200)).toMatch(/4,200 km/);
    expect(formatArea(0.005)).toMatch(/m²/);
    expect(formatArea(12.5)).toBe('12.50 km²');
    expect(formatArea(12345)).toMatch(/12,345 km²/);
  });

  it('maps bearings to compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(359)).toBe('N');
  });
});

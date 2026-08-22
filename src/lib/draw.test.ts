import { describe, it, expect } from 'vitest';
import { buildGeometry, measure, minPoints, toShape, closeRing, queryRing, nextColor } from './draw';
import { haversine, polygonArea, type LngLat } from './geo';

const P = (lng: number, lat: number) => [lng, lat];

describe('minPoints', () => {
  it('states what each mode needs before it can close', () => {
    expect(minPoints('polygon')).toBe(3);
    expect(minPoints('line')).toBe(2);
    expect(minPoints('rectangle')).toBe(2);
    expect(minPoints('circle')).toBe(2);
  });
});

describe('buildGeometry', () => {
  it('builds a rectangle from two opposite corners regardless of order', () => {
    const a = buildGeometry('rectangle', [P(1, 1), P(-1, -1)]);
    const b = buildGeometry('rectangle', [P(-1, -1), P(1, 1)]);
    expect(a).toEqual(b);
    expect(a[0]).toEqual(a[a.length - 1]); // closed
  });

  it('builds a circle whose radius is the centre-to-rim distance', () => {
    const centre: LngLat = [10, 45];
    const rim: LngLat = [10, 46];
    const expected = haversine(centre, rim);
    const ring = buildGeometry('circle', [centre, rim]);
    for (const p of ring) expect(haversine(centre, p as LngLat)).toBeCloseTo(expected, 6);
  });

  it('uses the latest point, so dragging redefines the shape', () => {
    const centre: LngLat = [0, 0];
    const small = buildGeometry('circle', [centre, [0, 0.5] as LngLat]);
    const big = buildGeometry('circle', [centre, [0, 0.5] as LngLat, [0, 2] as LngLat]);
    expect(polygonArea(big)).toBeGreaterThan(polygonArea(small));
  });

  it('passes polygon and line points through untouched', () => {
    const pts = [P(0, 0), P(1, 0), P(1, 1)];
    expect(buildGeometry('polygon', pts)).toEqual(pts);
    expect(buildGeometry('line', pts)).toEqual(pts);
  });
});

describe('measure', () => {
  it('reports a polygon as unclosable until three points', () => {
    expect(measure('polygon', [P(0, 0)]).closable).toBe(false);
    expect(measure('polygon', [P(0, 0), P(1, 0)]).closable).toBe(false);
    expect(measure('polygon', [P(0, 0), P(1, 0), P(1, 1)]).closable).toBe(true);
  });

  it('gives a polygon no area until it can actually enclose one', () => {
    expect(measure('polygon', [P(0, 0), P(1, 0)]).areaKm2).toBe(0);
    expect(measure('polygon', [P(0, 0), P(1, 0), P(1, 1)]).areaKm2).toBeGreaterThan(0);
  });

  it('reports a line length but never an area', () => {
    const m = measure('line', [P(0, 0), P(1, 0), P(2, 0)]);
    expect(m.areaKm2).toBe(0);
    expect(m.lengthKm).toBeCloseTo(222.39, 1); // two equatorial degrees
  });

  it('reports circle radius live', () => {
    const m = measure('circle', [P(0, 0), P(0, 1)]);
    expect(m.radiusKm).toBeCloseTo(111.19, 1);
    expect(m.areaKm2).toBeGreaterThan(0);
  });

  it('measures a rectangle as soon as the second corner exists', () => {
    expect(measure('rectangle', [P(0, 0)]).areaKm2).toBe(0);
    expect(measure('rectangle', [P(0, 0), P(1, 1)]).areaKm2).toBeGreaterThan(0);
  });
});

describe('toShape', () => {
  it('closes a polygon ring for GeoJSON validity', () => {
    const s = toShape({ kind: 'polygon', coords: [P(0, 0), P(1, 0), P(1, 1)] }, [], 0);
    const ring = (s.geojson.geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(s.geojson.geometry.type).toBe('Polygon');
  });

  it('keeps a line as a LineString with no area', () => {
    const s = toShape({ kind: 'line', coords: [P(0, 0), P(1, 0)] }, [], 0);
    expect(s.geojson.geometry.type).toBe('LineString');
    expect(s.areaKm2).toBe(0);
    expect(s.perimeterKm).toBeGreaterThan(0);
  });

  it('names shapes by kind and keeps circle parameters', () => {
    const centre: LngLat = [5, 5];
    const s = toShape({ kind: 'circle', coords: [[5, 5], [5, 6]], meta: { center: centre, radiusKm: 111 } }, [], 2);
    expect(s.name).toBe('Radius 3');
    expect(s.meta?.radiusKm).toBe(111);
  });

  it('gives consecutive shapes distinct colours and ids', () => {
    const a = toShape({ kind: 'polygon', coords: [P(0, 0), P(1, 0), P(1, 1)] }, [], 0);
    const b = toShape({ kind: 'polygon', coords: [P(0, 0), P(1, 0), P(1, 1)] }, [a], 1);
    expect(a.color).not.toBe(b.color);
    expect(a.id).not.toBe(b.id);
  });
});

describe('closeRing and queryRing', () => {
  it('closes only when needed', () => {
    const open = [P(0, 0), P(1, 0), P(1, 1)];
    expect(closeRing(open)).toHaveLength(4);
    expect(closeRing(closeRing(open))).toHaveLength(4);
  });

  it('offers a ring for areas and nothing for a path', () => {
    const area = toShape({ kind: 'polygon', coords: [P(0, 0), P(1, 0), P(1, 1)] }, [], 0);
    const line = toShape({ kind: 'line', coords: [P(0, 0), P(1, 0)] }, [], 0);
    expect(queryRing(area)).not.toBeNull();
    expect(queryRing(line)).toBeNull();
  });
});

describe('nextColor', () => {
  it('cycles rather than running out', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ color: String(i) }));
    expect(typeof nextColor(many)).toBe('string');
    expect(nextColor([])).toBe(nextColor(Array.from({ length: 10 }, (_, i) => ({ color: String(i) }))));
  });
});

import { drawReducer, initialDrawState, type DrawState, type DrawAction } from './draw';

/** Run a whole interaction, collecting whatever it produced. */
function run(mode: Parameters<typeof initialDrawState>[0], actions: DrawAction[]) {
  let state: DrawState = initialDrawState(mode);
  const results = [];
  let cancels = 0;
  for (const a of actions) {
    const t = drawReducer(state, a);
    state = t.state;
    if (t.result) results.push(t.result);
    if (t.cancelled) cancels++;
  }
  return { state, results, cancels };
}

const at = (lng: number, lat: number) => ({ type: 'click' as const, at: [lng, lat] as [number, number] });

describe('drawReducer — the interaction, end to end', () => {
  it('collects polygon vertices across clicks and keeps them', () => {
    // The regression that mattered: each click must accumulate, not reset.
    const { state } = run('polygon', [at(0, 0), at(1, 0), at(1, 1)]);
    expect(state.points).toHaveLength(3);
  });

  it('finishes a polygon on double click, dropping the duplicate point', () => {
    // click,click,click,click(from the dbl),dblclick -> 4 collected, 1 dropped
    const { results, state } = run('polygon', [at(0, 0), at(1, 0), at(1, 1), at(1, 1), { type: 'dblclick' }]);
    expect(results).toHaveLength(1);
    expect(results[0].coords).toHaveLength(3);
    expect(state.points).toEqual([]); // ready for the next shape
  });

  it('does not eat a real vertex when exactly at the minimum', () => {
    const { results } = run('polygon', [at(0, 0), at(1, 0), at(1, 1), { type: 'dblclick' }]);
    expect(results[0].coords).toHaveLength(3);
  });

  it('refuses to finish a polygon below three points', () => {
    const { results, state } = run('polygon', [at(0, 0), at(1, 0), { type: 'finish' }]);
    expect(results).toHaveLength(0);
    expect(state.points).toHaveLength(2); // work is preserved, not discarded
  });

  it('commits a rectangle on the second click without an explicit finish', () => {
    const { results, state } = run('rectangle', [at(0, 0), at(2, 2)]);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('rectangle');
    expect(results[0].coords[0]).toEqual(results[0].coords[results[0].coords.length - 1]);
    expect(state.points).toEqual([]);
  });

  it('commits a circle on the second click and records its radius', () => {
    const { results } = run('circle', [at(0, 0), at(0, 1)]);
    expect(results).toHaveLength(1);
    expect(results[0].meta?.radiusKm).toBeCloseTo(111.19, 1);
    expect(results[0].coords.length).toBeGreaterThan(60); // generated ring
  });

  it('undoes the last vertex only', () => {
    const { state } = run('polygon', [at(0, 0), at(1, 0), at(1, 1), { type: 'undo' }]);
    expect(state.points).toEqual([[0, 0], [1, 0]]);
  });

  it('undo on an empty shape is harmless', () => {
    const { state } = run('polygon', [{ type: 'undo' }, { type: 'undo' }]);
    expect(state.points).toEqual([]);
  });

  it('cancel discards the shape and reports it', () => {
    const { state, results, cancels } = run('polygon', [at(0, 0), at(1, 0), { type: 'cancel' }]);
    expect(state.points).toEqual([]);
    expect(results).toHaveLength(0);
    expect(cancels).toBe(1);
  });

  it('supports drawing several shapes in a row', () => {
    const { results } = run('rectangle', [at(0, 0), at(1, 1), at(5, 5), at(6, 6)]);
    expect(results).toHaveLength(2);
  });

  it('finishes a path on Enter with two points', () => {
    const { results } = run('line', [at(0, 0), at(1, 0), { type: 'finish' }]);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('line');
    expect(results[0].coords).toHaveLength(2);
  });
});

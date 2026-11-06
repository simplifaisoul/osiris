import { describe, expect, it } from 'vitest';
import { decodeBsq, describeFlight, toMerc, fromMerc, usgsErrorText } from './usgs';
import { planGrid, rasterizeRing, fieldStats, robustRange, type DemGrid } from './grid';
import { analyseDrainage, chaikin } from './drainage';
import { designFor, evaluate, fitPlane, labelSections, makeSection, sectionCells, solveBase } from './cutfill';
import { contourSegments } from './contours';
import { createRainSim, rainStats, stableStep, stepRain } from './rain';

function grid(w: number, h: number, f: (c: number, r: number) => number, ground = 1): DemGrid {
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = f(c, r);
  return { w, h, bbox: [0, 0, w, h], dx: 1, ground, z };
}
const full = (g: DemGrid) => new Uint8Array(g.w * g.h).fill(1);

describe('decodeBsq', () => {
  it('reads floats and blanks pixels the mask marks invalid (MSB first)', () => {
    const w = 4, h = 3, n = 12;
    const buf = new ArrayBuffer(n * 4 + 2);
    const f = new Float32Array(buf, 0, n);
    for (let i = 0; i < n; i++) f[i] = 70 + i;
    const mask = new Uint8Array(buf, n * 4, 2);
    mask[0] = 0b10111111; // pixel 1 invalid
    mask[1] = 0b11100000; // pixel 11 invalid
    const z = decodeBsq(buf, w, h);
    expect(z[0]).toBe(70);
    expect(z[1]).toBeNaN();
    expect(z[10]).toBe(80);
    expect(z[11]).toBeNaN();
  });

  it('treats absurd heights as missing even when the mask says valid', () => {
    const buf = new ArrayBuffer(4 * 2 + 1);
    new Float32Array(buf, 0, 2).set([-3.4e38, 12]);
    new Uint8Array(buf, 8, 1)[0] = 0xff;
    const z = decodeBsq(buf, 2, 1);
    expect(z[0]).toBeNaN();
    expect(z[1]).toBe(12);
  });
});

describe('mercator and flights', () => {
  it('round-trips a coordinate', () => {
    const [x, y] = toMerc(-90.16, 35.86);
    const [lng, lat] = fromMerc(x, y);
    expect(lng).toBeCloseTo(-90.16, 9);
    expect(lat).toBeCloseTo(35.86, 9);
  });

  it('describes a flight window', () => {
    expect(describeFlight({ project: 'x', start: Date.UTC(2023, 11, 5), end: Date.UTC(2024, 1, 2), ql: '1', gsdM: 1 }))
      .toBe('Flown Dec 2023 – Feb 2024 · QL 1');
  });
});

describe('planGrid and rasterizeRing', () => {
  it('sizes 1 m ground cells and fills a square field to its area', () => {
    // ~200 m square near 36°N.
    const lat = 36, dLat = 200 / 111_320, dLng = 200 / (111_320 * Math.cos(lat * Math.PI / 180));
    const ring: [number, number][] = [[-90, lat], [-90 + dLng, lat], [-90 + dLng, lat + dLat], [-90, lat + dLat], [-90, lat]];
    const plan = planGrid(ring);
    expect(plan.ground).toBe(1);
    const cells = ring.map(([lng, la]) => { const [x, y] = toMerc(lng, la); return [(x - plan.bbox[0]) / plan.dx, (plan.bbox[3] - y) / plan.dx] as [number, number]; });
    const mask = rasterizeRing(plan.w, plan.h, cells);
    let n = 0; for (const m of mask) n += m;
    expect(n * plan.ground ** 2).toBeGreaterThan(39_000);
    expect(n * plan.ground ** 2).toBeLessThan(41_000);
  });

  it('coarsens cells for a large field', () => {
    const ring: [number, number][] = [[-90, 36], [-89.9, 36], [-89.9, 36.1], [-90, 36.1]];
    const plan = planGrid(ring, 1_000_000);
    expect(plan.ground).toBeGreaterThan(1);
    expect(plan.w * plan.h).toBeLessThan(1_100_000);
  });

  it('drops unsurveyed cells from the field', () => {
    const g = grid(4, 4, () => 10);
    g.z[5] = NaN;
    const mask = full(g);
    const s = fieldStats(g, mask);
    expect(s.cells).toBe(15);
    expect(s.missing).toBe(1);
    expect(mask[5]).toBe(0);
  });

  it('trims outliers from a colour stretch', () => {
    const g = grid(100, 100, (c) => c / 100);
    g.z[0] = 500;
    const [lo, hi] = robustRange(g.z, full(g));
    expect(hi).toBeLessThan(2);
    expect(lo).toBeGreaterThanOrEqual(0);
  });
});

describe('drainage', () => {
  it('sends a south-tilted field out its south edge and finds the pit', () => {
    // Falls 0.1 m per row to the south, with a 0.5 m deep pit in the middle.
    const g = grid(40, 40, (c, r) => 100 - r * 0.1 - (Math.hypot(c - 20, r - 15) < 3 ? 0.5 : 0));
    const d = analyseDrainage(g, full(g), { streamCells: 30 });
    expect(d.pondAreaM2).toBeGreaterThan(10);
    expect(d.pondVolumeM3).toBeGreaterThan(1);
    // The biggest outlet is on the south edge.
    expect(d.outlets[0].r).toBeGreaterThan(38);
    // Every cell drains somewhere: accumulation at the outlets covers the field.
    let exits = 0;
    for (let i = 0; i < g.w * g.h; i++) if (d.dir[i] === -1) exits += d.acc[i];
    expect(exits).toBe(g.w * g.h);
    expect(d.streams.length).toBeGreaterThan(0);
  });

  it('keeps flow inside the field mask', () => {
    const g = grid(20, 20, (c) => c * 0.1);
    const mask = full(g);
    for (let i = 0; i < 20; i++) mask[i * 20 + 19] = 0;
    const d = analyseDrainage(g, mask, { streamCells: 5 });
    for (let i = 0; i < mask.length; i++) if (!mask[i]) expect(d.dir[i]).toBe(-2);
  });

  it('smooths a path without moving its ends', () => {
    const out = chaikin([[0, 0], [1, 0], [1, 1]]);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([1, 1]);
    expect(out.length).toBeGreaterThan(3);
  });
});

describe('cut and fill', () => {
  // A plane falling 0.2% toward the south-east (heading 135°).
  const slope = 0.002, hd = 135 * Math.PI / 180;
  const plane = (c: number, r: number) => 70 - slope * ((c + 0.5) * Math.sin(hd) + -(r + 0.5) * Math.cos(hd));

  it('recovers slope and heading from the lidar', () => {
    const g = grid(60, 50, plane);
    const all = new Int32Array(g.w * g.h).map((_, i) => i);
    const fit = fitPlane(g, makeSection(g, all));
    expect(fit.slopePct).toBeCloseTo(0.2, 4);
    expect(fit.headingDeg).toBeCloseTo(135, 2);
  });

  it('needs no earthwork on a field that is already the design plane', () => {
    const g = grid(60, 50, plane);
    const s = makeSection(g, new Int32Array(g.w * g.h).map((_, i) => i));
    const d = designFor(g, s, 0.2, 135, 1.2);
    const r = evaluate(g, s, d);
    expect(r.cutM3).toBeLessThan(0.5);
    expect(r.fillM3).toBeLessThan(0.5);
  });

  it('solves the design height for the cut:fill ratio', () => {
    const g = grid(50, 50, (c, r) => 70 + Math.sin(c / 4) * 0.3 + Math.cos(r / 5) * 0.2);
    const s = makeSection(g, new Int32Array(g.w * g.h).map((_, i) => i));
    for (const ratio of [1, 1.2, 1.5]) {
      const base = solveBase(g, s, 0.1, 180, ratio);
      const r = evaluate(g, s, { slopePct: 0.1, headingDeg: 180, base });
      expect(r.cutM3 / r.fillM3).toBeCloseTo(ratio, 2);
    }
  });

  it('splits a field into west and east sections along a drawn line', () => {
    const g = grid(40, 20, () => 70);
    const mask = full(g);
    const { labels, count } = labelSections(g, mask, [[[20, -1], [20, 21]]]);
    expect(count).toBe(2);
    expect(labels[5 * 40 + 2]).toBe(1);
    expect(labels[5 * 40 + 37]).toBe(2);
    for (let i = 0; i < mask.length; i++) expect(labels[i]).toBeGreaterThan(0);
    const cells = sectionCells(labels, count);
    expect(cells[0].length + cells[1].length).toBe(800);
  });
});

describe('contours', () => {
  it('draws one line per level across a plane', () => {
    const g = grid(30, 30, (c) => c * 0.1);
    const levels = contourSegments(g.z, g.w, g.h, full(g), 0.5);
    expect(levels.map(l => l.level)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    for (const l of levels) expect(l.segments.length).toBe(29);
  });
});

describe('rain', () => {
  it('conserves water: fallen = on field + run off', () => {
    const g = grid(30, 30, (c, r) => 10 - r * 0.02 + Math.sin(c) * 0.01);
    const inside = new Uint8Array(900);
    for (let r = 2; r < 28; r++) for (let c = 2; c < 28; c++) inside[r * 30 + c] = 1;
    const sim = createRainSim(g.z, inside, 30, 30, 3);
    for (let t = 0; t < 600;) {
      const dt = Math.min(2, stableStep(sim));
      stepRain(sim, dt, t < 300 ? 0.05 / 3600 : 0);
      t += dt;
    }
    const s = rainStats(sim);
    expect(s.fellM).toBeCloseTo(0.05 * 300 / 3600, 6);
    expect(s.onFieldM + s.ranOffM).toBeCloseTo(s.fellM, 6);
    expect(s.ranOffM).toBeGreaterThan(0);
  });

  it('pools water in a closed basin', () => {
    const g = grid(21, 21, (c, r) => Math.hypot(c - 10, r - 10) * 0.05);
    const inside = new Uint8Array(441);
    for (let r = 1; r < 20; r++) for (let c = 1; c < 20; c++) inside[r * 21 + c] = 1;
    const sim = createRainSim(g.z, inside, 21, 21, 2);
    for (let k = 0; k < 2000; k++) stepRain(sim, Math.min(1, stableStep(sim)), k < 600 ? 0.02 / 3600 : 0);
    expect(sim.water[10 * 21 + 10]).toBeGreaterThan(sim.water[10 * 21 + 3]);
  });
});

describe('usgsErrorText', () => {
  it('turns a dropped gateway request into a plain sentence', () => {
    expect(usgsErrorText(new TypeError('Failed to fetch'), 'x')).toMatch(/not answering/);
    expect(usgsErrorText(new Error('USGS elevation HTTP 504'), 'x')).toMatch(/not answering/);
  });
  it('keeps messages that already say what to do', () => {
    expect(usgsErrorText(new Error('Area is too small — draw at least a few corners around a field'), 'x')).toMatch(/too small/);
    expect(usgsErrorText('nope', 'Profile failed')).toBe('Profile failed');
  });
});

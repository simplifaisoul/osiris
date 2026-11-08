import { describe, expect, it } from 'vitest';
import { cutoutRainSim, floodSummary, flowNetwork, formatArea, landRange, rainPace, rainSurface, seaMask } from './cutout-hydro';
import type { CutoutTerrain } from './cutout-terrain';

function terrain(w: number, h: number, f: (c: number, r: number) => number, cellM = 10): CutoutTerrain {
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = f(c, r);
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of z) { minZ = Math.min(minZ, v); maxZ = Math.max(maxZ, v); }
  return { w, h, z, merc: [0, 0, w * cellM, h * cellM], widthM: w * cellM, heightM: h * cellM, minZ, maxZ, source: 'lidar', note: '' };
}

describe('cut-out water', () => {
  it('finds the sea along the edge, not low ground inland', () => {
    const t = terrain(6, 4, (c, r) => (c < 2 ? 0 : c === 4 && r === 2 ? 0 : 5));
    const sea = seaMask(t);
    for (let r = 0; r < 4; r++) { expect(sea[r * 6]).toBe(1); expect(sea[r * 6 + 1]).toBe(1); }
    expect(sea[2 * 6 + 4]).toBe(0);
    expect(landRange(t, sea)).toEqual([0, 5]);
  });

  it('traces a valley down to where it leaves the cut-out, and links each path to the next', () => {
    // A V-shaped valley along column 20, falling to the south edge.
    const t = terrain(41, 40, (c, r) => 10 + Math.abs(c - 20) * 0.5 + (39 - r) * 0.2);
    const net = flowNetwork(t, seaMask(t), 'more');
    expect(net.paths.length).toBeGreaterThan(0);
    const biggest = net.paths.reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a));
    const end = biggest.pts[biggest.pts.length - 1];
    expect(biggest.next).toBe(-1);
    expect(end[1]).toBeGreaterThan(38);
    expect(Math.abs(end[0] - 20.5)).toBeLessThan(2);
    expect(net.drainage.outlets[0].areaM2).toBeGreaterThan(41 * 40 * 100 * 0.5);
    for (const p of net.paths) {
      if (p.next < 0) continue;
      expect(net.paths[p.next].pts[0]).toEqual(p.pts[p.pts.length - 1]);
    }
  });

  it('measures what a water level covers', () => {
    const t = terrain(10, 10, c => c + 1);
    const f = floodSummary(t, seaMask(t), 5.5);
    expect(f.share).toBeCloseTo(0.5);
    expect(f.areaM2).toBeCloseTo(50 * 100);
    expect(f.deepestM).toBeCloseTo(4.5);
    expect(floodSummary(t, seaMask(t), 0.5).areaM2).toBe(0);
  });

  it('rains on the land only, with the edge and the sea taking the run-off', () => {
    const t = terrain(8, 6, c => (c === 0 ? 0 : 3));
    const sim = cutoutRainSim(t, seaMask(t));
    expect(sim.inside[1 * 8 + 0]).toBe(0);
    expect(sim.inside[0 * 8 + 3]).toBe(0);
    expect(sim.inside[2 * 8 + 3]).toBe(1);
  });

  it('fills the false hollows of the 30 m tiles so every cell drains to a side neighbour, and leaves lidar as surveyed', () => {
    // A pit, and a valley running diagonally, which only drains corner to corner.
    const shape = (c: number, r: number) => (c === 4 && r === 4 ? 5 : c === r ? 8 - r * 0.1 : 10 + Math.abs(c - 4) * 0.2 + Math.abs(r - 4) * 0.1);
    const tiles = { ...terrain(9, 9, shape), source: 'tiles' as const };
    const z = rainSurface(tiles, seaMask(tiles));
    expect(z[4 * 9 + 4]).toBeGreaterThan(5);
    for (let r = 1; r < 8; r++) for (let c = 1; c < 8; c++) {
      const i = r * 9 + c;
      expect(Math.min(z[i - 1], z[i + 1], z[i - 9], z[i + 9])).toBeLessThan(z[i]);
    }
    const lidar = terrain(9, 9, shape);
    expect(Array.from(rainSurface(lidar, seaMask(lidar)))).toEqual(Array.from(lidar.z));
  });

  it('claims no standing water from the 30 m tiles', () => {
    const shape = (c: number, r: number) => (c === 10 && r === 10 ? 5 : 10 + Math.abs(c - 10) * 0.2 + Math.abs(r - 10) * 0.1);
    expect(flowNetwork(terrain(21, 21, shape), new Uint8Array(441), 'more').drainage.pondAreaM2).toBeGreaterThan(0);
    const tiles = { ...terrain(21, 21, shape), source: 'tiles' as const };
    expect(flowNetwork(tiles, new Uint8Array(441), 'more').drainage.pondAreaM2).toBe(0);
  });

  it('plays big, coarse cut-outs faster', () => {
    expect(rainPace(4)).toEqual({ speedScale: 1, maxStep: 2 });
    expect(rainPace(400)).toEqual({ speedScale: 10, maxStep: 40 });
  });

  it('writes areas in acres or square miles', () => {
    expect(formatArea(4046.86)).toBe('1.0 ac');
    expect(formatArea(4046.86 * 250)).toBe('250 ac');
    expect(formatArea(2589988 * 3.2)).toBe('3.2 sq mi');
  });
});

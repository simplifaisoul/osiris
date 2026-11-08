import { analyseDrainage, CellHeap, chaikin, type Drainage } from './lidar/drainage';
import { createRainSim, type RainSim } from './lidar/rain';
import type { DemGrid } from './lidar/grid';
import type { CutoutTerrain } from './cutout-terrain';

/**
 * Water on a cut-out, worked out from its heights: where the sea is, the
 * paths rain takes downhill and where it stands, the rain model's grid, and
 * how much ground a water level covers. cutout-water draws them.
 */

/** Ground this low that reaches the box edge through ground as low is sea. */
export const SEA_M = 0.25;

export type FlowDetail = 'main' | 'more' | 'all';
/** Share of the cut-out's land a flow must drain before it is drawn. */
const DETAIL_SHARE: Record<FlowDetail, number> = { main: 0.01, more: 0.0025, all: 0.0006 };

const M2_PER_ACRE = 4046.8564224;
const M2_PER_SQMI = 2589988.110336;

type Heights = Pick<CutoutTerrain, 'w' | 'h' | 'z'>;
type Sized = Pick<CutoutTerrain, 'w' | 'h' | 'widthM' | 'heightM'>;

/** Ground size of one cell side, metres. */
export function cellGroundM(t: Sized): number {
  return Math.sqrt((t.widthM / t.w) * (t.heightM / t.h));
}

/** Sea cells: at or below SEA_M and joined to the box edge through cells as low. */
export function seaMask(t: Heights): Uint8Array {
  const { w, h, z } = t;
  const sea = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (i: number) => { if (!sea[i] && z[i] <= SEA_M) { sea[i] = 1; queue[tail++] = i; } };
  for (let c = 0; c < w; c++) { seed(c); seed((h - 1) * w + c); }
  for (let r = 0; r < h; r++) { seed(r * w); seed(r * w + w - 1); }
  while (head < tail) {
    const i = queue[head++];
    const c = i % w, r = (i - c) / w;
    if (c > 0) seed(i - 1);
    if (c < w - 1) seed(i + 1);
    if (r > 0) seed(i - w);
    if (r < h - 1) seed(i + w);
  }
  return sea;
}

export interface FlowPath {
  /** Smoothed points in cell coordinates (column, row; cell centres at +0.5), upstream first. */
  pts: [number, number][];
  /** Ground draining through the downstream end, m². */
  areaM2: number;
  /** The path this one runs into, or -1 where the water leaves the cut-out. */
  next: number;
}

export interface FlowNetwork {
  drainage: Drainage;
  paths: FlowPath[];
  /** Ground a flow drains before it is drawn, m². */
  minAreaM2: number;
  cellM2: number;
}

/** Flow paths and standing water over the land of a cut-out. */
export function flowNetwork(t: CutoutTerrain, sea: Uint8Array, detail: FlowDetail): FlowNetwork {
  const n = t.w * t.h;
  const ground = cellGroundM(t);
  const grid: DemGrid = { w: t.w, h: t.h, z: t.z, ground, bbox: t.merc, dx: (t.merc[2] - t.merc[0]) / t.w };
  const land = new Uint8Array(n);
  let cells = 0;
  for (let i = 0; i < n; i++) if (!sea[i]) { land[i] = 1; cells++; }
  const streamCells = Math.max(6, Math.round(cells * DETAIL_SHARE[detail]));
  // Lidar resolves a few centimetres of hollow. In the 30 m tiles real hollows cannot be told
  // from noise, so no standing water is claimed from them.
  const drainage = analyseDrainage(grid, land, { streamCells, pondMinM: t.source === 'lidar' ? 0.05 : Infinity });

  const cellM2 = ground * ground;
  const key = ([c, r]: [number, number]) => `${c},${r}`;
  const startAt = new Map<string, number>();
  drainage.streams.forEach((s, k) => startAt.set(key(s.cells[0]), k));
  const paths = drainage.streams.map(s => ({
    // Three rounds: paths across flat water step cell by cell and need the extra smoothing.
    pts: chaikin(s.cells, 3),
    areaM2: s.acc * cellM2,
    next: startAt.get(key(s.cells[s.cells.length - 1])) ?? -1,
  }));
  return { drainage, paths, minAreaM2: streamCells * cellM2, cellM2 };
}

/**
 * The ground rain runs on. Lidar is used as surveyed. The 30 m tiles are full
 * of small false hollows, from their sampling and the radar behind them,
 * which would hold rain in blotches across every hillside; they are filled to
 * their spill level with a fall of 1 in 1,000 toward it, the grade of very
 * flat ground, so water runs off them instead of standing in thin sheets
 * (Priority-Flood +ε; Barnes, Lehman & Mulla 2014).
 */
export function rainSurface(t: Pick<CutoutTerrain, 'w' | 'h' | 'z' | 'source' | 'widthM' | 'heightM'>, sea: Uint8Array): Float32Array {
  const z = Float32Array.from(t.z);
  if (t.source === 'lidar') return z;
  const { w, h } = t;
  const n = w * h;
  const fall = Math.max(1e-3, 0.001 * cellGroundM(t));
  const closed = new Uint8Array(n);
  const heap = new CellHeap(n);
  for (let i = 0; i < n; i++) {
    const c = i % w, r = (i - c) / w;
    if (sea[i] || c === 0 || r === 0 || c === w - 1 || r === h - 1) { closed[i] = 1; heap.push(z[i], i); }
  }
  // Four neighbours, as the rain model moves water: a cell that drained only
  // diagonally would still be a pit to it.
  const DC = [1, -1, 0, 0], DR = [0, 0, 1, -1];
  while (heap.size) {
    const i = heap.pop();
    const c = i % w, r = (i - c) / w;
    for (let k = 0; k < 4; k++) {
      const cc = c + DC[k], rr = r + DR[k];
      if (cc < 0 || rr < 0 || cc >= w || rr >= h) continue;
      const j = rr * w + cc;
      if (closed[j]) continue;
      closed[j] = 1;
      if (z[j] <= z[i] + fall) z[j] = z[i] + fall;
      heap.push(z[j], j);
    }
  }
  return z;
}

/**
 * The rain model's grid for a cut-out: rain falls on the land, and water
 * that reaches the sea or the cut-out's own edge has run off.
 */
export function cutoutRainSim(t: CutoutTerrain, sea: Uint8Array): RainSim {
  const { w, h } = t;
  const inside = new Uint8Array(w * h);
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
    const i = r * w + c;
    inside[i] = sea[i] ? 0 : 1;
  }
  return createRainSim(rainSurface(t, sea), inside, w, h, cellGroundM(t));
}

/**
 * How fast rain plays: simulated seconds per second on screen and the largest
 * step. Coarse cells cover more ground, so water needs longer to cross them.
 */
export function rainPace(cellM: number) {
  return { speedScale: Math.max(1, Math.sqrt(cellM / 4)), maxStep: Math.max(2, cellM / 10) };
}

export interface FloodSummary {
  levelM: number;
  /** Land under the level, m². */
  areaM2: number;
  /** Share of the cut-out's land under the level, 0–1. */
  share: number;
  deepestM: number;
}

/** What a flat water level at `levelM` covers on the cut-out's land. */
export function floodSummary(t: CutoutTerrain, sea: Uint8Array, levelM: number): FloodSummary {
  let land = 0, under = 0, lowest = Infinity;
  for (let i = 0; i < t.z.length; i++) {
    if (sea[i]) continue;
    land++;
    if (t.z[i] < levelM) under++;
    if (t.z[i] < lowest) lowest = t.z[i];
  }
  const cellM2 = cellGroundM(t) ** 2;
  return { levelM, areaM2: under * cellM2, share: land ? under / land : 0, deepestM: under ? levelM - lowest : 0 };
}

/** The lowest and highest land, metres; the sea's surface when there is no land. */
export function landRange(t: CutoutTerrain, sea: Uint8Array): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < t.z.length; i++) {
    if (sea[i]) continue;
    if (t.z[i] < lo) lo = t.z[i];
    if (t.z[i] > hi) hi = t.z[i];
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/** "12.4 ac", "380 ac", "3.2 sq mi". */
export function formatArea(m2: number): string {
  if (m2 >= 0.5 * M2_PER_SQMI) return `${(m2 / M2_PER_SQMI).toFixed(1)} sq mi`;
  const ac = m2 / M2_PER_ACRE;
  return ac < 10 ? `${ac.toFixed(1)} ac` : `${Math.round(ac).toLocaleString('en-US')} ac`;
}

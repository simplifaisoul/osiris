import type { DemGrid } from './grid';

/**
 * Surface drainage over a field, from its lidar heights.
 *
 * Priority-Flood (Barnes, Lehman & Mulla 2014) floods the field inward from its
 * edge, lowest cell first. Every cell is reached from the neighbour water would
 * leave it by, which gives each cell its downhill direction in one pass — and a
 * cell lower than the cell that reached it sits in a depression, so it is
 * raised to that spill level. The difference between the raised and the real
 * surface is where water stands after a rain, and how deep.
 *
 * Cells inside a depression are flooded from a FIFO queue rather than the heap,
 * so their directions fan out from the spill point and converge on it, instead
 * of crossing the flat at random.
 */

export interface Outlet {
  /** Cell coordinates (column, row) of the point where the water leaves. */
  c: number;
  r: number;
  cells: number;
  areaM2: number;
}

export interface Stream {
  /** Cell-centre coordinates (column + 0.5, row + 0.5), upstream first. */
  cells: [number, number][];
  /** Cells draining through the downstream end. */
  acc: number;
}

export interface Drainage {
  filled: Float32Array;
  /** Index of the downstream cell; -1 leaves the field; -2 not in the field. */
  dir: Int32Array;
  /** Cells draining through each cell, itself included. */
  acc: Float32Array;
  /** Standing water once depressions fill, metres. */
  pond: Float32Array;
  pondAreaM2: number;
  pondVolumeM3: number;
  outlets: Outlet[];
  /** Field area that sheds over the edge in a sheet rather than to an outlet. */
  edgeAreaM2: number;
  streams: Stream[];
}

const DC = [1, 1, 0, -1, -1, -1, 0, 1];
const DR = [0, 1, 1, 1, 0, -1, -1, -1];

/** A binary min-heap of cell indices keyed by elevation, on typed arrays. */
export class CellHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  constructor(capacity: number) { this.keys = new Float64Array(capacity); this.vals = new Int32Array(capacity); }
  push(key: number, val: number) {
    let i = this.size++;
    const { keys, vals } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p]; vals[i] = vals[p]; i = p;
    }
    keys[i] = key; vals[i] = val;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const n = --this.size;
    if (n > 0) {
      const key = keys[n], val = vals[n];
      let i = 0;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= n) break;
        if (m + 1 < n && keys[m + 1] < keys[m]) m++;
        if (keys[m] >= key) break;
        keys[i] = keys[m]; vals[i] = vals[m]; i = m;
      }
      keys[i] = key; vals[i] = val;
    }
    return top;
  }
}

export interface DrainageOptions {
  /** Contributing cells needed before a flow path is drawn. */
  streamCells: number;
  /** Shallower ponding than this is lidar noise, not standing water (metres). */
  pondMinM?: number;
  /** Smallest catchment reported as an outlet, in cells. */
  outletMinCells?: number;
}

export function analyseDrainage(g: DemGrid, mask: Uint8Array, opts: DrainageOptions): Drainage {
  const { w, h, z } = g;
  const n = w * h;
  const cellArea = g.ground * g.ground;
  const pondMin = opts.pondMinM ?? 0.03;

  let total = 0;
  for (let i = 0; i < n; i++) if (mask[i]) total++;

  const filled = new Float32Array(n);
  const dir = new Int32Array(n).fill(-2);
  const closed = new Uint8Array(n);
  const order = new Int32Array(total);
  const heap = new CellHeap(total);
  const pit = new Int32Array(total);
  let head = 0, tail = 0, oi = 0;

  // Seeds: field cells on the field's own edge. Water reaching them leaves.
  const seeds: number[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!mask[i]) continue;
    let edge = false;
    for (let k = 0; k < 8 && !edge; k++) {
      const cc = c + DC[k], rr = r + DR[k];
      if (cc < 0 || rr < 0 || cc >= w || rr >= h || !mask[rr * w + cc]) edge = true;
    }
    if (!edge) continue;
    closed[i] = 1; filled[i] = z[i]; dir[i] = -1;
    heap.push(z[i], i);
    seeds.push(i);
  }

  while (head < tail || heap.size) {
    const c = head < tail ? pit[head++] : heap.pop();
    order[oi++] = c;
    const cc = c % w, cr = (c - cc) / w;
    const fc = filled[c];
    for (let k = 0; k < 8; k++) {
      const nc = cc + DC[k], nr = cr + DR[k];
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      const ni = nr * w + nc;
      if (!mask[ni] || closed[ni]) continue;
      closed[ni] = 1;
      dir[ni] = c;
      if (z[ni] <= fc) { filled[ni] = fc; pit[tail++] = ni; }
      else { filled[ni] = z[ni]; heap.push(z[ni], ni); }
    }
  }

  const acc = new Float32Array(n);
  for (let k = 0; k < oi; k++) acc[order[k]] = 1;
  for (let k = oi - 1; k >= 0; k--) {
    const c = order[k];
    const d = dir[c];
    if (d >= 0) acc[d] += acc[c];
  }

  const pond = new Float32Array(n);
  let pondCells = 0, pondVolume = 0;
  for (let k = 0; k < oi; k++) {
    const i = order[k];
    const d = filled[i] - z[i];
    if (d > pondMin) { pond[i] = d; pondCells++; pondVolume += d; }
  }

  // Outlets: edge cells grouped by place, biggest catchment first.
  const outletMin = opts.outletMinCells ?? Math.max(4, Math.round(total * 0.01));
  const radius = Math.max(3, 25 / g.ground);
  const groups: { c: number; r: number; cells: number }[] = [];
  const edgeFlows = seeds.filter(s => acc[s] >= Math.max(2, outletMin * 0.05)).sort((a, b) => acc[b] - acc[a]);
  for (const s of edgeFlows) {
    const c = s % w, r = (s - c) / w;
    const near = groups.find(o => Math.hypot(o.c - c, o.r - r) <= radius);
    if (near) near.cells += acc[s];
    else groups.push({ c, r, cells: acc[s] });
  }
  const outlets: Outlet[] = groups
    .filter(o => o.cells >= outletMin)
    .map(o => ({ c: o.c + 0.5, r: o.r + 0.5, cells: o.cells, areaM2: o.cells * cellArea }))
    .sort((a, b) => b.cells - a.cells);
  const outletCells = outlets.reduce((s, o) => s + o.cells, 0);

  return {
    filled, dir, acc, pond,
    pondAreaM2: pondCells * cellArea,
    pondVolumeM3: pondVolume * cellArea,
    outlets,
    edgeAreaM2: Math.max(0, total - outletCells) * cellArea,
    streams: traceStreams(g, dir, acc, order, oi, opts.streamCells),
  };
}

/** Flow paths as polylines, split at every confluence so each carries one flow. */
export function traceStreams(g: Pick<DemGrid, 'w'>, dir: Int32Array, acc: Float32Array, order: Int32Array, count: number, threshold: number): Stream[] {
  const { w } = g;
  const inDeg = new Map<number, number>();
  const isStream = (i: number) => acc[i] >= threshold;
  for (let k = 0; k < count; k++) {
    const c = order[k];
    if (!isStream(c)) continue;
    const d = dir[c];
    if (d >= 0) inDeg.set(d, (inDeg.get(d) ?? 0) + 1);
  }
  const streams: Stream[] = [];
  const cellOf = (i: number): [number, number] => { const c = i % w; return [c + 0.5, (i - c) / w + 0.5]; };
  for (let k = 0; k < count; k++) {
    const s = order[k];
    if (!isStream(s) || (inDeg.get(s) ?? 0) === 1) continue;
    const cells: [number, number][] = [cellOf(s)];
    let cur = s;
    for (;;) {
      const d = dir[cur];
      if (d < 0) break;
      cells.push(cellOf(d));
      cur = d;
      if ((inDeg.get(d) ?? 0) !== 1) break;
    }
    if (cells.length > 1) streams.push({ cells, acc: acc[cur] });
  }
  return streams;
}

/** Corner-cutting smoothing for stair-stepped raster paths; keeps the ends fixed. */
export function chaikin(points: [number, number][], rounds = 2): [number, number][] {
  let pts = points;
  for (let k = 0; k < rounds && pts.length > 2; k++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

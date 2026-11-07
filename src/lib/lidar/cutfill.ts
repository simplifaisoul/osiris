import type { DemGrid } from './grid';

/**
 * Cut and fill for grading a field to a plane.
 *
 * A design is a plane: a slope, the compass heading water runs on it, and a
 * height. Heading and slope come from a least-squares fit to the lidar (or
 * from the operator); the height is then solved so the earth cut is a set
 * multiple of the earth filled — 1.2 by default, because cut soil compacts
 * when it is placed and a balanced job needs more cut than fill.
 *
 * Coordinates are ground metres from the section's centre, x east and y north.
 */

export interface Design {
  slopePct: number;
  /** Compass direction water runs on the design, degrees from north. */
  headingDeg: number;
  /** Design height at the section centre, metres. */
  base: number;
}

export interface CutFill {
  cutM3: number;
  fillM3: number;
  maxCutM: number;
  maxFillM: number;
}

export interface Section {
  /** Cell indices in this section. */
  cells: Int32Array;
  /** Section centre in cell coordinates. */
  oc: number;
  or: number;
  areaM2: number;
}

export function makeSection(g: Pick<DemGrid, 'w' | 'ground'>, cells: Int32Array): Section {
  let sc = 0, sr = 0;
  for (let k = 0; k < cells.length; k++) { const i = cells[k]; const c = i % g.w; sc += c + 0.5; sr += (i - c) / g.w + 0.5; }
  return { cells, oc: sc / cells.length, or: sr / cells.length, areaM2: cells.length * g.ground * g.ground };
}

/** Distance downhill along `headingDeg` for every cell, ground metres. */
function along(g: Pick<DemGrid, 'w' | 'ground'>, s: Section, headingDeg: number): Float64Array {
  const hr = headingDeg * Math.PI / 180;
  const sx = Math.sin(hr), sy = Math.cos(hr);
  const out = new Float64Array(s.cells.length);
  for (let k = 0; k < s.cells.length; k++) {
    const i = s.cells[k];
    const c = i % g.w, r = (i - c) / g.w;
    const x = (c + 0.5 - s.oc) * g.ground;
    const y = (s.or - (r + 0.5)) * g.ground;
    out[k] = x * sx + y * sy;
  }
  return out;
}

/** Least-squares plane through the lidar: its slope and the way it falls. */
export function fitPlane(g: DemGrid, s: Section): { slopePct: number; headingDeg: number } {
  let n = 0, mx = 0, my = 0, mz = 0;
  for (let k = 0; k < s.cells.length; k++) {
    const i = s.cells[k];
    const c = i % g.w, r = (i - c) / g.w;
    mx += (c + 0.5 - s.oc) * g.ground; my += (s.or - (r + 0.5)) * g.ground; mz += g.z[i]; n++;
  }
  mx /= n; my /= n; mz /= n;
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let k = 0; k < s.cells.length; k++) {
    const i = s.cells[k];
    const c = i % g.w, r = (i - c) / g.w;
    const x = (c + 0.5 - s.oc) * g.ground - mx, y = (s.or - (r + 0.5)) * g.ground - my, z = g.z[i] - mz;
    sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
  }
  const det = sxx * syy - sxy * sxy;
  if (!(Math.abs(det) > 1e-9)) return { slopePct: 0, headingDeg: 0 };
  const a = (sxz * syy - syz * sxy) / det; // dz/dx (east)
  const b = (syz * sxx - sxz * sxy) / det; // dz/dy (north)
  const slopePct = Math.hypot(a, b) * 100;
  let headingDeg = Math.atan2(-a, -b) * 180 / Math.PI;
  if (headingDeg < 0) headingDeg += 360;
  return { slopePct, headingDeg };
}

/**
 * The design height that makes cut = ratio × fill for this slope and heading.
 * Cut and fill are both piecewise-linear in the height, so with the cells'
 * "tilted heights" sorted once, each trial height costs one binary search.
 */
export function solveBase(g: DemGrid, s: Section, slopePct: number, headingDeg: number, ratio: number): number {
  const d = along(g, s, headingDeg);
  const sl = slopePct / 100;
  const n = s.cells.length;
  const t = new Float64Array(n);
  for (let k = 0; k < n; k++) t[k] = g.z[s.cells[k]] + sl * d[k];
  t.sort();
  const prefix = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) prefix[k + 1] = prefix[k] + t[k];
  const balance = (base: number) => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] <= base) lo = m + 1; else hi = m; }
    const fill = lo * base - prefix[lo];
    const cut = (prefix[n] - prefix[lo]) - (n - lo) * base;
    return cut - ratio * fill;
  };
  let lo = t[0], hi = t[n - 1];
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (balance(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function designFor(g: DemGrid, s: Section, slopePct: number, headingDeg: number, ratio: number): Design {
  return { slopePct, headingDeg, base: solveBase(g, s, slopePct, headingDeg, ratio) };
}

export function designHeight(g: Pick<DemGrid, 'w' | 'ground'>, s: Section, d: Design, i: number): number {
  const hr = d.headingDeg * Math.PI / 180;
  const c = i % g.w, r = (i - c) / g.w;
  const x = (c + 0.5 - s.oc) * g.ground;
  const y = (s.or - (r + 0.5)) * g.ground;
  return d.base - (d.slopePct / 100) * (x * Math.sin(hr) + y * Math.cos(hr));
}

export function evaluate(g: DemGrid, s: Section, d: Design): CutFill {
  const cellArea = g.ground * g.ground;
  let cut = 0, fill = 0, maxCut = 0, maxFill = 0;
  for (let k = 0; k < s.cells.length; k++) {
    const i = s.cells[k];
    const diff = g.z[i] - designHeight(g, s, d, i);
    if (diff > 0) { cut += diff; if (diff > maxCut) maxCut = diff; }
    else { fill -= diff; if (-diff > maxFill) maxFill = -diff; }
  }
  return { cutM3: cut * cellArea, fillM3: fill * cellArea, maxCutM: maxCut, maxFillM: maxFill };
}

/**
 * Splits a field into sections along drawn lines (cell coordinates). Cells a
 * line passes through form a barrier; what the barriers leave connected is a
 * section, and the barrier cells then join the section beside them. Slivers
 * under 0.5% of the field are folded into a neighbour rather than graded alone.
 */
export function labelSections(g: Pick<DemGrid, 'w' | 'h'>, mask: Uint8Array, lines: [number, number][][]): { labels: Int32Array; count: number } {
  const { w, h } = g;
  const n = w * h;
  const barrier = new Uint8Array(n);
  for (const line of lines) {
    for (let k = 0; k + 1 < line.length; k++) {
      const [x0, y0] = line[k], [x1, y1] = line[k + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4) + 1;
      for (let s = 0; s <= steps; s++) {
        const c = Math.floor(x0 + (x1 - x0) * s / steps);
        const r = Math.floor(y0 + (y1 - y0) * s / steps);
        if (c >= 0 && r >= 0 && c < w && r < h) barrier[r * w + c] = 1;
      }
    }
  }
  const labels = new Int32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) if (mask[i]) total++;
  const minCells = Math.max(20, Math.round(total * 0.005));
  const stack: number[] = [];
  const comps: { id: number; size: number; sc: number; sr: number }[] = [];
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (!mask[i] || barrier[i] || labels[i]) continue;
    const id = next++;
    let size = 0, sc = 0, sr = 0;
    labels[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      const c = j % w, r = (j - c) / w;
      size++; sc += c; sr += r;
      const nb = [c > 0 ? j - 1 : -1, c < w - 1 ? j + 1 : -1, r > 0 ? j - w : -1, r < h - 1 ? j + w : -1];
      for (const m of nb) if (m >= 0 && mask[m] && !barrier[m] && !labels[m]) { labels[m] = id; stack.push(m); }
    }
    comps.push({ id, size, sc: sc / size, sr: sr / size });
  }
  const keep = comps.filter(c => c.size >= minCells);
  if (!keep.length && comps.length) keep.push(comps.sort((a, b) => b.size - a.size)[0]);
  const kept = new Set(keep.map(c => c.id));
  for (let i = 0; i < n; i++) if (labels[i] && !kept.has(labels[i])) labels[i] = 0;
  // Barrier cells and slivers join whichever section touches them.
  let pending = true;
  while (pending) {
    pending = false;
    for (let i = 0; i < n; i++) {
      if (!mask[i] || labels[i]) continue;
      const c = i % w, r = (i - c) / w;
      let got = 0;
      for (let dr = -1; dr <= 1 && !got; dr++) for (let dc = -1; dc <= 1 && !got; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < w && rr < h) got = labels[rr * w + cc];
      }
      if (got > 0) { labels[i] = -got; pending = true; }
    }
    for (let i = 0; i < n; i++) if (labels[i] < 0) labels[i] = -labels[i];
  }
  // Number sections west to east, then north to south.
  keep.sort((a, b) => (Math.abs(a.sc - b.sc) > 5 ? a.sc - b.sc : a.sr - b.sr));
  const remap = new Map(keep.map((c, k) => [c.id, k + 1]));
  for (let i = 0; i < n; i++) if (labels[i]) labels[i] = remap.get(labels[i]) ?? 0;
  return { labels, count: keep.length };
}

export function sectionCells(labels: Int32Array, count: number): Int32Array[] {
  const sizes = new Int32Array(count + 1);
  for (let i = 0; i < labels.length; i++) sizes[labels[i]]++;
  const out = Array.from({ length: count }, (_, k) => new Int32Array(sizes[k + 1]));
  const fill = new Int32Array(count + 1);
  for (let i = 0; i < labels.length; i++) { const l = labels[i]; if (l) out[l - 1][fill[l]++] = i; }
  return out;
}

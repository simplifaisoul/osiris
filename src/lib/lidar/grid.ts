import { fromMerc, toMerc, type Bbox } from './usgs';

/**
 * A field's elevation model: a Web Mercator raster aligned with the map, so it
 * can be draped back over the map without resampling. `ground` is the true
 * ground size of a cell in metres (Mercator stretches by 1/cos(lat), and every
 * area, slope and volume must be measured on the ground, not on the map).
 */
export interface DemGrid {
  w: number;
  h: number;
  /** Mercator bounds [minx, miny, maxx, maxy]; row 0 is the north edge. */
  bbox: Bbox;
  /** Mercator metres per cell. */
  dx: number;
  /** Ground metres per cell. */
  ground: number;
  /** Elevation in metres, NaN where there is no survey. */
  z: Float32Array;
}

/** The largest raster a field is analysed at; bigger fields get coarser cells. */
export const MAX_FIELD_CELLS = 1_600_000;
/** 3DEP's finest product is 1 m; finer cells would only interpolate. */
export const MIN_CELL_M = 1;
export const MAX_FIELD_ACRES = 3000;

export interface GridPlan { bbox: Bbox; w: number; h: number; dx: number; ground: number }

/** Size the raster for a ring of [lng, lat]: 1 m cells unless that would be too many. */
export function planGrid(ring: [number, number][], maxCells = MAX_FIELD_CELLS): GridPlan {
  const merc = ring.map(([lng, lat]) => toMerc(lng, lat));
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of merc) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const lat = fromMerc((minx + maxx) / 2, (miny + maxy) / 2)[1];
  const k = Math.cos(lat * Math.PI / 180);
  const groundArea = (maxx - minx) * k * (maxy - miny) * k;
  let ground = Math.max(MIN_CELL_M, Math.sqrt(groundArea / maxCells));
  ground = Math.ceil(ground * 4) / 4;
  const dx = ground / k;
  const pad = 3 * dx;
  minx -= pad; miny -= pad; maxx += pad; maxy += pad;
  const w = Math.max(4, Math.ceil((maxx - minx) / dx));
  const h = Math.max(4, Math.ceil((maxy - miny) / dx));
  return { bbox: [minx, maxy - h * dx, minx + w * dx, maxy], w, h, dx, ground };
}

/** Mercator → fractional cell coordinates (column, row), cell centres at +0.5. */
export function mercToCell(g: Pick<DemGrid, 'bbox' | 'dx'>, x: number, y: number): [number, number] {
  return [(x - g.bbox[0]) / g.dx, (g.bbox[3] - y) / g.dx];
}

export function cellToLngLat(g: Pick<DemGrid, 'bbox' | 'dx'>, c: number, r: number): [number, number] {
  return fromMerc(g.bbox[0] + c * g.dx, g.bbox[3] - r * g.dx);
}

export function lngLatToCell(g: Pick<DemGrid, 'bbox' | 'dx'>, lng: number, lat: number): [number, number] {
  const [x, y] = toMerc(lng, lat);
  return mercToCell(g, x, y);
}

/** Scanline fill: 1 for every cell whose centre lies inside the ring. */
export function rasterizeRing(w: number, h: number, ringCells: [number, number][]): Uint8Array {
  const mask = new Uint8Array(w * h);
  const n = ringCells.length;
  const xs: number[] = [];
  for (let r = 0; r < h; r++) {
    const y = r + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = ringCells[i];
      const [xj, yj] = ringCells[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) / (yj - yi) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const c1 = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let c = c0; c <= c1; c++) mask[r * w + c] = 1;
    }
  }
  return mask;
}

export interface FieldStats {
  cells: number;
  areaM2: number;
  minZ: number;
  maxZ: number;
  meanZ: number;
  /** Mask cells with no survey under them. */
  missing: number;
}

/** Drops unsurveyed cells from the mask (in place) and measures what is left. */
export function fieldStats(g: DemGrid, mask: Uint8Array): FieldStats {
  let cells = 0, missing = 0, minZ = Infinity, maxZ = -Infinity, sum = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const z = g.z[i];
    if (!Number.isFinite(z)) { mask[i] = 0; missing++; continue; }
    cells++; sum += z;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { cells, missing, areaM2: cells * g.ground * g.ground, minZ, maxZ, meanZ: cells ? sum / cells : NaN };
}

/** Image corners for a MapLibre image source: TL, TR, BR, BL. */
export function gridCorners(g: Pick<DemGrid, 'bbox'>): [[number, number], [number, number], [number, number], [number, number]] {
  const [minx, miny, maxx, maxy] = g.bbox;
  return [fromMerc(minx, maxy), fromMerc(maxx, maxy), fromMerc(maxx, miny), fromMerc(minx, miny)];
}

/** Light-from-the-northwest shading, 0..1, for texture under a colour ramp. */
export function hillshade(g: DemGrid, i: number, exaggeration = 4, az = 315, alt = 45): number {
  const { w, h, z } = g;
  const c = i % w, r = (i - c) / w;
  const at = (cc: number, rr: number) => {
    const v = z[Math.min(h - 1, Math.max(0, rr)) * w + Math.min(w - 1, Math.max(0, cc))];
    return Number.isFinite(v) ? v : z[i];
  };
  const dzdx = ((at(c + 1, r - 1) + 2 * at(c + 1, r) + at(c + 1, r + 1)) - (at(c - 1, r - 1) + 2 * at(c - 1, r) + at(c - 1, r + 1))) / (8 * g.ground);
  const dzdy = ((at(c - 1, r + 1) + 2 * at(c, r + 1) + at(c + 1, r + 1)) - (at(c - 1, r - 1) + 2 * at(c, r - 1) + at(c + 1, r - 1))) / (8 * g.ground);
  return shade(dzdx * exaggeration, dzdy * exaggeration, az, alt);
}

/** Lambertian shade for a surface gradient (east, south-positive), sun in degrees. */
export function shade(dzdx: number, dzdy: number, az: number, alt: number): number {
  const zen = (90 - alt) * Math.PI / 180;
  const azr = (360 - az + 90) * Math.PI / 180;
  const slope = Math.atan(Math.hypot(dzdx, dzdy));
  const aspect = Math.atan2(dzdy, -dzdx);
  const v = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(azr - aspect);
  return Math.max(0, Math.min(1, v));
}

type Stop = [number, number, number, number];
/** Low blue → cyan → green → yellow → orange → red high: the familiar field-survey ramp. */
export const ELEVATION_RAMP: Stop[] = [
  [0, 33, 72, 178], [0.18, 46, 141, 222], [0.36, 92, 199, 214], [0.52, 156, 214, 140],
  [0.68, 238, 222, 103], [0.84, 241, 141, 59], [1, 196, 38, 38],
];
/** Fill blue → white at grade → cut red. */
export const CUTFILL_RAMP: Stop[] = [
  [0, 24, 64, 168], [0.3, 92, 146, 222], [0.47, 226, 236, 246], [0.5, 246, 246, 246],
  [0.53, 248, 230, 222], [0.7, 232, 128, 96], [1, 178, 30, 30],
];

export function ramp(stops: Stop[], t: number): [number, number, number] {
  if (!(t > 0)) return [stops[0][1], stops[0][2], stops[0][3]];
  if (t >= 1) { const s = stops[stops.length - 1]; return [s[1], s[2], s[3]]; }
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const a = stops[k - 1], b = stops[k];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  const s = stops[stops.length - 1];
  return [s[1], s[2], s[3]];
}

/**
 * Low and high elevation for a colour stretch, trimmed at the 1st and 99th
 * percentiles: a single fence post or ditch would otherwise squeeze a whole
 * field's colour into one band.
 */
export function robustRange(values: Float32Array, mask: Uint8Array, lo = 0.01, hi = 0.99): [number, number] {
  const pick: number[] = [];
  const step = Math.max(1, Math.floor(mask.length / 200_000));
  for (let i = 0; i < mask.length; i += step) if (mask[i] && Number.isFinite(values[i])) pick.push(values[i]);
  if (!pick.length) return [0, 1];
  pick.sort((a, b) => a - b);
  const a = pick[Math.floor(lo * (pick.length - 1))];
  const b = pick[Math.ceil(hi * (pick.length - 1))];
  return a === b ? [a - 0.05, b + 0.05] : [a, b];
}

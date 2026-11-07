import { toMerc, fetchElevation, lidarFlightAt, describeFlight, type Bbox } from './lidar/usgs';
import type { LngLatBox } from './cutout';

/**
 * Heights for a cut-out. Inside the United States they come from USGS 3DEP,
 * which is 1 m lidar wherever a flight exists. Everywhere else, or when USGS
 * does not answer, they come from the open Terrain Tiles on AWS, the same
 * tiles the map's 3D terrain uses: about 30 m on land worldwide.
 */

export interface CutoutTerrain {
  /** Grid cells across and down. */
  w: number;
  h: number;
  /** Metres above sea level, north row first, with no gaps. */
  z: Float32Array;
  /** The box in Web Mercator metres: x0, y0, x1, y1. */
  merc: Bbox;
  /** Ground size in metres. */
  widthM: number;
  heightM: number;
  minZ: number;
  maxZ: number;
  source: 'lidar' | 'tiles';
  /** "USGS 3DEP lidar · Flown Jan 2014 · QL 2" */
  note: string;
}

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/';
const WORLD = 2 * Math.PI * 6378137;
const HALF = WORLD / 2;
const TILE = 256;
const MAX_TILES = 36;
const TILE_MAX_ZOOM = 15;

/** Cells across and down: `max` on the long side, the short side to scale. */
export function gridSize(widthM: number, heightM: number, max = 256): [number, number] {
  const long = Math.max(widthM, heightM);
  const w = Math.max(16, Math.round(max * widthM / long));
  const h = Math.max(16, Math.round(max * heightM / long));
  return [w, h];
}

/** Lower 48, Alaska, Hawaii and Puerto Rico: where 3DEP is worth asking. */
const US: [number, number, number, number][] = [
  [-125, 24, -66.5, 49.5], [-180, 51, -129, 71.5], [-161, 18.5, -154, 22.5], [-67.5, 17.8, -65.2, 18.6],
];
export function inUnitedStates(lng: number, lat: number): boolean {
  return US.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n);
}

/** Terrarium tiles store height as (R × 256 + G + B / 256) − 32768 metres. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** The tile range covering a Mercator box at zoom `z`. */
export function tileRange(merc: Bbox, z: number) {
  const n = 2 ** z;
  const col = (x: number) => ((x + HALF) / WORLD) * n;
  const row = (y: number) => ((HALF - y) / WORLD) * n;
  const x0 = Math.floor(col(merc[0])), x1 = Math.min(n - 1, Math.floor(col(merc[2]) - 1e-9));
  const y0 = Math.floor(row(merc[3])), y1 = Math.min(n - 1, Math.floor(row(merc[1]) - 1e-9));
  return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

/** The finest zoom that gives each cell at least a pixel, within the tile budget. */
export function tileZoom(merc: Bbox, cellGroundM: number, latDeg: number): number {
  const cos = Math.cos(latDeg * Math.PI / 180);
  let z = Math.ceil(Math.log2((WORLD * cos) / (TILE * cellGroundM)));
  z = Math.max(0, Math.min(TILE_MAX_ZOOM, z));
  while (z > 0 && tileRange(merc, z).count > MAX_TILES) z--;
  return z;
}

async function terrariumHeights(merc: Bbox, w: number, h: number, cellGroundM: number, latDeg: number, signal?: AbortSignal): Promise<Float32Array> {
  const z = tileZoom(merc, cellGroundM, latDeg);
  const r = tileRange(merc, z);
  const cols = r.x1 - r.x0 + 1, rows = r.y1 - r.y0 + 1;
  const W = cols * TILE, H = rows * TILE;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read elevation tiles');
  const jobs: Promise<void>[] = [];
  for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) {
    jobs.push((async () => {
      const res = await fetch(`${TERRARIUM}${z}/${tx}/${ty}.png`, { signal, credentials: 'omit' });
      if (!res.ok) throw new Error(`Elevation tiles HTTP ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      ctx.drawImage(bmp, (tx - r.x0) * TILE, (ty - r.y0) * TILE);
      bmp.close();
    })());
  }
  await Promise.all(jobs);
  const px = ctx.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) => {
    const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4;
    return decodeTerrarium(px[i], px[i + 1], px[i + 2]);
  };
  const n = 2 ** z;
  const out = new Float32Array(w * h);
  for (let R = 0; R < h; R++) for (let C = 0; C < w; C++) {
    const x = merc[0] + ((C + 0.5) / w) * (merc[2] - merc[0]);
    const y = merc[3] - ((R + 0.5) / h) * (merc[3] - merc[1]);
    const fx = (((x + HALF) / WORLD) * n - r.x0) * TILE - 0.5;
    const fy = (((HALF - y) / WORLD) * n - r.y0) * TILE - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const v = (at(ix, iy) * (1 - ax) + at(ix + 1, iy) * ax) * (1 - ay) + (at(ix, iy + 1) * (1 - ax) + at(ix + 1, iy + 1) * ax) * ay;
    // The tiles carry the sea floor too; a cut-out shows the sea at its surface.
    out[R * w + C] = Math.max(0, v);
  }
  return out;
}

/** Fill survey gaps (water, mostly) with the lowest height, so the block stays whole. */
function fillGaps(z: Float32Array): { minZ: number; maxZ: number; gaps: number } {
  let minZ = Infinity, maxZ = -Infinity, gaps = 0;
  for (const v of z) if (Number.isFinite(v)) { minZ = Math.min(minZ, v); maxZ = Math.max(maxZ, v); } else gaps++;
  if (!Number.isFinite(minZ)) { minZ = 0; maxZ = 0; }
  for (let i = 0; i < z.length; i++) if (!Number.isFinite(z[i])) z[i] = minZ;
  return { minZ, maxZ, gaps };
}

export async function loadCutoutTerrain(box: LngLatBox, signal?: AbortSignal, cells = 256): Promise<CutoutTerrain> {
  const [w0, s0, e0, n0] = box;
  const [x0, y0] = toMerc(w0, s0), [x1, y1] = toMerc(e0, n0);
  const merc: Bbox = [x0, y0, x1, y1];
  const midLat = (s0 + n0) / 2, midLng = (w0 + e0) / 2;
  const k = Math.cos(midLat * Math.PI / 180);
  const widthM = (x1 - x0) * k, heightM = (y1 - y0) * k;
  const [w, h] = gridSize(widthM, heightM, cells);

  if (inUnitedStates(midLng, midLat)) {
    try {
      const flight = lidarFlightAt(midLng, midLat, signal).catch(() => null);
      const z = await fetchElevation(merc, w, h, signal, 4, true);
      const { minZ, maxZ, gaps } = fillGaps(z);
      // Mostly empty means 3DEP has nothing here (offshore, or no survey yet).
      if (gaps < z.length * 0.6) {
        const f = await flight;
        return { w, h, z, merc, widthM, heightM, minZ, maxZ, source: 'lidar', note: `USGS 3DEP${f ? ` lidar · ${describeFlight(f)}` : ''}` };
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      // USGS is down or slow; the worldwide tiles still give a fair surface.
    }
  }
  const z = await terrariumHeights(merc, w, h, widthM / w, midLat, signal);
  const { minZ, maxZ } = fillGaps(z);
  return { w, h, z, merc, widthM, heightM, minZ, maxZ, source: 'tiles', note: 'Terrain Tiles (AWS Open Data), about 30 m' };
}

/** Height at a point, by bilinear lookup in the grid; null outside the box. */
export function heightAt(t: CutoutTerrain, lng: number, lat: number): number | null {
  const [x, y] = toMerc(lng, lat);
  const fc = ((x - t.merc[0]) / (t.merc[2] - t.merc[0])) * t.w - 0.5;
  const fr = ((t.merc[3] - y) / (t.merc[3] - t.merc[1])) * t.h - 0.5;
  if (fc < -0.5 || fr < -0.5 || fc > t.w - 0.5 || fr > t.h - 0.5) return null;
  const c = Math.max(0, Math.min(t.w - 1, fc)), r = Math.max(0, Math.min(t.h - 1, fr));
  const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(t.w - 1, c0 + 1), r1 = Math.min(t.h - 1, r0 + 1);
  const ac = c - c0, ar = r - r0;
  const z = (i: number, j: number) => t.z[j * t.w + i];
  return (z(c0, r0) * (1 - ac) + z(c1, r0) * ac) * (1 - ar) + (z(c0, r1) * (1 - ac) + z(c1, r1) * ac) * ar;
}

/** Where a point falls in the block, as fractions of its width and depth (0–1, west/north first). */
export function boxFraction(t: Pick<CutoutTerrain, 'merc'>, lng: number, lat: number): [number, number] {
  const [x, y] = toMerc(lng, lat);
  return [(x - t.merc[0]) / (t.merc[2] - t.merc[0]), (t.merc[3] - y) / (t.merc[3] - t.merc[1])];
}

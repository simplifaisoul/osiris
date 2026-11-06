import type { AddProtocolAction } from 'maplibre-gl';
import { EARTH_R, fetchElevation, M_TO_FT, type Bbox } from './usgs';
import { ELEVATION_RAMP, ramp, robustRange, shade } from './grid';

/**
 * Map-wide lidar relief, drawn in the browser.
 *
 * Each map tile fetches the raw USGS 3DEP heights for its square plus a
 * one-pixel border (258×258 floats) and paints them here, so the sun angle,
 * vertical exaggeration and colour stretch are ours to set — the service's own
 * rendered layers fix all three, and its contours come on an opaque page.
 *
 * Tile URL: osiris-lidar://{mode}/{z}/{x}/{y}?az=315&alt=45&ex=1&lo=..&hi=..
 *
 * The heights download in the background. A tile whose heights are not here
 * yet comes back empty at once and is redrawn when they land (see
 * onReliefTile), so a slow USGS answer never holds one of the map's image
 * request slots: satellite imagery and the field picture share those.
 */

export type ReliefMode = 'hillshade' | 'tinted' | 'color' | 'slope' | 'contour2' | 'contour5';

export const RELIEF_MODES: { id: ReliefMode; label: string }[] = [
  { id: 'hillshade', label: 'Shaded relief (gray)' },
  { id: 'tinted', label: 'Color elevation + shading' },
  { id: 'color', label: 'Color elevation (flat)' },
  { id: 'slope', label: 'Slope (shaded)' },
  { id: 'contour2', label: 'Contours, 2 ft' },
  { id: 'contour5', label: 'Contours, 5 ft' },
];

export interface ReliefParams { mode: ReliefMode; az: number; alt: number; ex: number; lo?: number; hi?: number }

export const RELIEF_MIN_ZOOM = 8;
export const RELIEF_MAX_ZOOM = 17;
const SIZE = 256;
const RAW = SIZE + 2;

export function reliefTileUrl(p: ReliefParams): string {
  const q = new URLSearchParams({ az: String(Math.round(p.az)), alt: String(Math.round(p.alt)), ex: String(+p.ex.toFixed(2)) });
  if (p.lo !== undefined && p.hi !== undefined) { q.set('lo', p.lo.toFixed(2)); q.set('hi', p.hi.toFixed(2)); }
  return `osiris-lidar://${p.mode}/{z}/{x}/{y}?${q}`;
}

function tileBbox(z: number, x: number, y: number, padPx = 0): Bbox {
  const size = (2 * Math.PI * EARTH_R) / 2 ** z;
  const px = size / SIZE;
  const minx = -Math.PI * EARTH_R + x * size;
  const maxy = Math.PI * EARTH_R - y * size;
  return [minx - padPx * px, maxy - size - padPx * px, minx + size + padPx * px, maxy + padPx * px];
}

/* Raw tiles, newest last. 96 tiles of 258² floats is ~26 MB. */
const raw = new Map<string, Float32Array>();
const RAW_LIMIT = 96;

function remember(key: string, z: Float32Array) {
  raw.delete(key); raw.set(key, z);
  while (raw.size > RAW_LIMIT) raw.delete(raw.keys().next().value!);
}

/* Downloads under way, oldest first. Past the limit the oldest are dropped:
   the operator has panned or zoomed away from them. */
const pending = new Map<string, { ctl: AbortController; job: Promise<Float32Array | null> }>();
const PENDING_LIMIT = 64;
/* Tiles handed to the map empty, to be redrawn when their heights land. */
const servedBlank = new Set<string>();
/** How long a tile waits for its heights before the map gets it empty. */
const WAIT_MS = 2500;
let onReady: ((z: number, x: number, y: number) => void) | null = null;

/** Called with each tile whose heights have just arrived, so the map can redraw it. */
export function onReliefTile(fn: ((z: number, x: number, y: number) => void) | null) { onReady = fn; }

function want(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  const hit = raw.get(key);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(key);
  if (running) return running.job;
  const ctl = new AbortController();
  const job = fetchElevation(tileBbox(z, x, y, 1), RAW, RAW, ctl.signal, 5, false)
    .then(v => {
      remember(key, v);
      // Only a tile the map already holds empty needs redrawing; one still
      // waiting for these heights paints them itself.
      if (servedBlank.delete(key)) onReady?.(z, x, y);
      return v;
    }, () => {
      if (!ctl.signal.aborted && !warned) {
        warned = true;
        console.warn('[OSIRIS] USGS elevation is not answering; some lidar relief tiles are blank');
      }
      return null;
    })
    .finally(() => { if (pending.get(key)?.ctl === ctl) pending.delete(key); });
  pending.set(key, { ctl, job });
  while (pending.size > PENDING_LIMIT) {
    const [k, old] = pending.entries().next().value!;
    old.ctl.abort();
    pending.delete(k);
    servedBlank.delete(k);
  }
  return job;
}

function slopeColor(pct: number): [number, number, number] {
  // Farm ground is mostly under 1%, hills tens of percent: a log scale shows both.
  const t = Math.max(0, Math.min(1, (Math.log10(Math.max(pct, 0.02)) + 1.7) / 3));
  return ramp([[0, 46, 125, 50], [0.35, 140, 196, 74], [0.55, 240, 221, 92], [0.75, 236, 140, 52], [1, 168, 28, 28]], t);
}

/** Paint one tile. Exported for tests; `zs` is the raw 258² heights in metres. */
export function paintTile(zs: Float32Array, z: number, y: number, p: ReliefParams): ImageData | { contours: number[][][]; index: boolean[] } {
  const size = (2 * Math.PI * EARTH_R) / 2 ** z;
  const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / 2 ** z)));
  const ground = (size / SIZE) * Math.cos(latC);
  if (p.mode === 'contour2' || p.mode === 'contour5') {
    const step = p.mode === 'contour2' ? 2 : 5;
    const contours: number[][][] = [];
    const index: boolean[] = [];
    let lo = Infinity, hi = -Infinity;
    for (const v of zs) if (Number.isFinite(v)) { const f = v * M_TO_FT; if (f < lo) lo = f; if (f > hi) hi = f; }
    if (!(hi > lo)) return { contours, index };
    for (let L = Math.ceil(lo / step) * step; L <= hi; L += step) {
      const segs: number[][] = [];
      for (let r = 0; r + 1 < RAW; r++) for (let c = 0; c + 1 < RAW; c++) {
        const a = zs[r * RAW + c] * M_TO_FT, b = zs[r * RAW + c + 1] * M_TO_FT;
        const d = zs[(r + 1) * RAW + c] * M_TO_FT, e = zs[(r + 1) * RAW + c + 1] * M_TO_FT;
        if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(d) && Number.isFinite(e))) continue;
        const pts: number[] = [];
        const edge = (p0: number, p1: number, x0: number, y0: number, x1: number, y1: number) => {
          if ((p0 > L) !== (p1 > L)) { const t = (L - p0) / (p1 - p0); pts.push(x0 + (x1 - x0) * t - 1, y0 + (y1 - y0) * t - 1); }
        };
        edge(a, b, c + 0.5, r + 0.5, c + 1.5, r + 0.5);
        edge(b, e, c + 1.5, r + 0.5, c + 1.5, r + 1.5);
        edge(d, e, c + 0.5, r + 1.5, c + 1.5, r + 1.5);
        edge(a, d, c + 0.5, r + 0.5, c + 0.5, r + 1.5);
        if (pts.length >= 4) segs.push(pts.slice(0, 4));
        if (pts.length >= 8) segs.push(pts.slice(4, 8));
      }
      if (segs.length) { contours.push(segs); index.push(Math.round(L) % (step * 5) === 0); }
    }
    return { contours, index };
  }

  const img = new ImageData(SIZE, SIZE);
  const out = img.data;
  // Colour tiles share the view's stretch: a stretch per tile shows every tile edge.
  const span: [number, number] = p.lo !== undefined && p.hi !== undefined && p.hi > p.lo ? [p.lo, p.hi] : [0, 1];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const R0 = r + 1, C0 = c + 1;
      const at = (cc: number, rr: number) => {
        const v = zs[rr * RAW + cc];
        return Number.isFinite(v) ? v : zs[R0 * RAW + C0];
      };
      const zc = zs[R0 * RAW + C0];
      const o = (r * SIZE + c) * 4;
      if (!Number.isFinite(zc)) { out[o + 3] = 0; continue; }
      const dzdx = ((at(C0 + 1, R0 - 1) + 2 * at(C0 + 1, R0) + at(C0 + 1, R0 + 1)) - (at(C0 - 1, R0 - 1) + 2 * at(C0 - 1, R0) + at(C0 - 1, R0 + 1))) / (8 * ground);
      const dzdy = ((at(C0 - 1, R0 + 1) + 2 * at(C0, R0 + 1) + at(C0 + 1, R0 + 1)) - (at(C0 - 1, R0 - 1) + 2 * at(C0, R0 - 1) + at(C0 + 1, R0 - 1))) / (8 * ground);
      let rgb: [number, number, number];
      if (p.mode === 'hillshade') {
        const s = shade(dzdx * p.ex, dzdy * p.ex, p.az, p.alt);
        const g = 30 + 225 * s;
        rgb = [g, g, g];
      } else if (p.mode === 'slope') {
        const s = shade(dzdx * p.ex, dzdy * p.ex, p.az, p.alt);
        const col = slopeColor(Math.hypot(dzdx, dzdy) * 100);
        const k = 0.55 + 0.45 * s;
        rgb = [col[0] * k, col[1] * k, col[2] * k];
      } else {
        const [lo, hi] = span;
        const col = ramp(ELEVATION_RAMP, (zc - lo) / (hi - lo));
        if (p.mode === 'tinted') {
          const k = 0.5 + 0.5 * shade(dzdx * p.ex, dzdy * p.ex, p.az, p.alt);
          rgb = [col[0] * k, col[1] * k, col[2] * k];
        } else rgb = col;
      }
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
    }
  }
  return img;
}

async function encode(painted: ReturnType<typeof paintTile>): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d')!;
  if (painted instanceof ImageData) ctx.putImageData(painted, 0, 0);
  else {
    ctx.lineCap = 'round';
    painted.contours.forEach((segs, k) => {
      ctx.strokeStyle = painted.index[k] ? 'rgba(255,214,102,0.95)' : 'rgba(255,236,170,0.7)';
      ctx.lineWidth = painted.index[k] ? 1.6 : 0.9;
      ctx.beginPath();
      for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
      ctx.stroke();
    });
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

const MATCH = /^osiris-lidar:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)\?(.*)$/;

export const reliefProtocol: AddProtocolAction = async (request, controller) => {
  const m = MATCH.exec(request.url);
  if (!m) throw new Error('Invalid lidar tile');
  const [, mode, zs, xs, ys, qs] = m;
  const z = +zs, x = +xs, y = +ys;
  const q = new URLSearchParams(qs);
  const p: ReliefParams = {
    mode: mode as ReliefMode, az: +(q.get('az') ?? 315), alt: +(q.get('alt') ?? 45), ex: +(q.get('ex') ?? 1),
    lo: q.has('lo') ? +q.get('lo')! : undefined, hi: q.has('hi') ? +q.get('hi')! : undefined,
  };
  const key = `${z}/${x}/${y}`;
  let heights = raw.get(key) ?? null;
  if (!heights) {
    const job = want(z, x, y);
    let timer: ReturnType<typeof setTimeout> | undefined;
    heights = await Promise.race([job, new Promise<null>(r => { timer = setTimeout(() => r(null), WAIT_MS); })]);
    clearTimeout(timer);
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!heights) {
      if (pending.has(key)) servedBlank.add(key);
      return { data: await blankTile() };
    }
  }
  remember(key, heights);
  // The store only asks for colour tiles once the view's stretch is known.
  if ((p.mode === 'tinted' || p.mode === 'color') && p.lo === undefined) return { data: await blankTile() };
  if (controller.signal.aborted) throw controller.signal.reason;
  return { data: await encode(paintTile(heights, z, y, p)) };
};

let warned = false;
let blank: ArrayBuffer | null = null;
async function blankTile(): Promise<ArrayBuffer> {
  if (!blank) {
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    canvas.getContext('2d'); // convertToBlob refuses a canvas that never had a context
    blank = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }
  return blank.slice(0);
}

let installed = false;
export function installReliefProtocol(addProtocol: (name: string, handler: AddProtocolAction) => void) {
  if (installed) return;
  addProtocol('osiris-lidar', reliefProtocol);
  installed = true;
}

/** Elevation (m) under a point, from the finest relief tile already loaded. */
export function cachedElevationAt(lng: number, lat: number): number | null {
  const mx = (lng * Math.PI / 180) * EARTH_R;
  const my = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * EARTH_R;
  for (let z = RELIEF_MAX_ZOOM; z >= RELIEF_MIN_ZOOM; z--) {
    const size = (2 * Math.PI * EARTH_R) / 2 ** z;
    const x = Math.floor((mx + Math.PI * EARTH_R) / size);
    const y = Math.floor((Math.PI * EARTH_R - my) / size);
    const t = raw.get(`${z}/${x}/${y}`);
    if (!t) continue;
    const px = size / SIZE;
    const fc = (mx - (-Math.PI * EARTH_R + x * size)) / px + 1 - 0.5;
    const fr = ((Math.PI * EARTH_R - y * size) - my) / px + 1 - 0.5;
    const c0 = Math.max(0, Math.min(RAW - 2, Math.floor(fc))), r0 = Math.max(0, Math.min(RAW - 2, Math.floor(fr)));
    const tx = fc - c0, ty = fr - r0;
    const a = t[r0 * RAW + c0], b = t[r0 * RAW + c0 + 1], d = t[(r0 + 1) * RAW + c0], e = t[(r0 + 1) * RAW + c0 + 1];
    const v = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Elevation range (m) over a Mercator box: the 1st to 99th percentile of a
 * coarse sample of the whole view, so one tower or quarry does not wash out a
 * valley. Same request (and retries) as the tiles, ahead of them in the queue.
 */
export async function viewRange(bbox: Bbox, signal?: AbortSignal): Promise<[number, number] | null> {
  const w = 128;
  const h = Math.max(16, Math.min(256, Math.round(w * (bbox[3] - bbox[1]) / Math.max(1, bbox[2] - bbox[0]))));
  const z = await fetchElevation(bbox, w, h, signal, 6, true);
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < z.length; i++) if (Number.isFinite(z[i])) { mask[i] = 1; n++; }
  return n ? robustRange(z, mask) : null;
}

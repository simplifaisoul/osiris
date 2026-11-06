/**
 * USGS 3D Elevation Program (3DEP) — the national lidar-derived elevation
 * service. Keyless, CORS-open, served at 1 m wherever a lidar flight exists.
 *
 * Elevations come back as raw 32-bit floats (BSQ), not as a rendered picture,
 * so every figure the terrain tools show is computed from the surveyed heights
 * themselves.
 */

export const DEP_IMAGE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';
const DEP_INDEX = 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/8/query';

export const EARTH_R = 6378137;
export const M_TO_FT = 3.280839895;
export const M2_PER_ACRE = 4046.8564224;
export const M3_TO_YD3 = 1.307950619;

export type Bbox = [number, number, number, number];

export function toMerc(lng: number, lat: number): [number, number] {
  const x = (lng * Math.PI / 180) * EARTH_R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * EARTH_R;
  return [x, y];
}

export function fromMerc(x: number, y: number): [number, number] {
  const lng = (x / EARTH_R) * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) * 180 / Math.PI;
  return [lng, lat];
}

/**
 * Decode a 3DEP `format=bsq&pixelType=F32` export: `w*h` little-endian floats,
 * row 0 at the north edge, followed by a one-bit-per-pixel validity mask
 * (most significant bit first). Pixels the mask marks invalid — no survey, or
 * outside the service — become NaN so nothing downstream mistakes them for 0.
 */
export function decodeBsq(buf: ArrayBuffer, w: number, h: number): Float32Array {
  const n = w * h;
  if (buf.byteLength < n * 4) throw new Error(`Elevation response too short (${buf.byteLength} bytes for ${w}×${h})`);
  const z = new Float32Array(buf.slice(0, n * 4));
  const maskBytes = Math.ceil(n / 8);
  const mask = buf.byteLength >= n * 4 + maskBytes ? new Uint8Array(buf, n * 4, maskBytes) : null;
  for (let i = 0; i < n; i++) {
    if ((mask && !(mask[i >> 3] & (0x80 >> (i & 7)))) || !(z[i] > -1000 && z[i] < 10000)) z[i] = NaN;
  }
  return z;
}

export function elevationUrl(bbox: Bbox, w: number, h: number): string {
  const p = new URLSearchParams({
    f: 'image', format: 'bsq', pixelType: 'F32', bboxSR: '3857', imageSR: '3857',
    bbox: bbox.map(v => v.toFixed(3)).join(','), size: `${w},${h}`,
    interpolation: 'RSP_BilinearInterpolation',
  });
  return `${DEP_IMAGE}/exportImage?${p}`;
}

/**
 * The service slows to seconds per request and starts answering 504 once a
 * client has more than a handful in flight, so every request here shares four
 * slots. A field download outranks map relief tiles, and a tile the map has
 * already given up on leaves the queue without ever being sent.
 */
const SLOTS = 4;
let busy = 0;
const waiting: { run: () => void; high: boolean; signal?: AbortSignal; reject: (e: unknown) => void }[] = [];
function pump() {
  while (busy < SLOTS && waiting.length) {
    const k = waiting.findIndex(w => w.high);
    const next = waiting.splice(k >= 0 ? k : 0, 1)[0];
    if (next.signal?.aborted) { next.reject(next.signal.reason); continue; }
    busy++;
    next.run();
  }
}
export function withSlot<T>(fn: () => Promise<T>, high: boolean, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push({
      high, signal, reject,
      run: () => { fn().then(resolve, reject).finally(() => { busy--; pump(); }); },
    });
    pump();
  });
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

/**
 * Heights in metres for a Web Mercator box, `w×h` cells, north row first.
 *
 * The service's gateway drops a share of requests with a 502 and then serves
 * the same box a moment later, so a failed attempt is retried with backoff
 * before it is reported.
 */
export async function fetchElevation(bbox: Bbox, w: number, h: number, signal?: AbortSignal, attempts = 6, high = true): Promise<Float32Array> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)), signal);
    try {
      const res = await withSlot(() => fetch(elevationUrl(bbox, w, h), { signal, credentials: 'omit' }), high, signal);
      if (res.status >= 500) { last = new Error(`USGS elevation HTTP ${res.status}`); continue; }
      if (!res.ok) throw new Error(`USGS elevation HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      // The service answers errors with a 200 and a JSON body.
      if (type.includes('json') || type.includes('text')) {
        const body = await res.text();
        throw new Error(`USGS elevation refused the request: ${body.slice(0, 160)}`);
      }
      return decodeBsq(await res.arrayBuffer(), w, h);
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
      if (e instanceof Error && /refused|HTTP 4/.test(e.message)) throw e;
    }
  }
  throw last instanceof Error ? last : new Error('USGS elevation unavailable');
}

/**
 * A large box as a mosaic of smaller requests: the service is quicker and far
 * more reliable on pieces of a few hundred thousand cells, and the pieces give
 * an honest progress count while a big field downloads.
 */
export async function fetchElevationTiled(
  bbox: Bbox, w: number, h: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal, piece = 512,
): Promise<Float32Array> {
  const out = new Float32Array(w * h);
  const dx = (bbox[2] - bbox[0]) / w;
  const dy = (bbox[3] - bbox[1]) / h;
  const jobs: { c0: number; r0: number; cw: number; rh: number }[] = [];
  for (let r0 = 0; r0 < h; r0 += piece) for (let c0 = 0; c0 < w; c0 += piece) {
    jobs.push({ c0, r0, cw: Math.min(piece, w - c0), rh: Math.min(piece, h - r0) });
  }
  let done = 0;
  onProgress?.(0, jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const sub: Bbox = [bbox[0] + j.c0 * dx, bbox[3] - (j.r0 + j.rh) * dy, bbox[0] + (j.c0 + j.cw) * dx, bbox[3] - j.r0 * dy];
      const z = await fetchElevation(sub, j.cw, j.rh, signal);
      for (let r = 0; r < j.rh; r++) out.set(z.subarray(r * j.cw, (r + 1) * j.cw), (j.r0 + r) * w + j.c0);
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return out;
}

export interface LidarFlight {
  project: string;
  start: number | null;
  end: number | null;
  ql: string | null;
  gsdM: number | null;
}

/** Which lidar flight the 1 m surface at this point was built from, or null if none. */
export async function lidarFlightAt(lng: number, lat: number, signal?: AbortSignal): Promise<LidarFlight | null> {
  const p = new URLSearchParams({
    geometry: `${lng.toFixed(5)},${lat.toFixed(5)}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'project,collect_start,collect_end,ql,dem_gsd_meters',
    returnGeometry: 'false', f: 'json',
  });
  const res = await fetch(`${DEP_INDEX}?${p}`, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`USGS lidar index HTTP ${res.status}`);
  const json = await res.json();
  const a = json?.features?.[0]?.attributes;
  if (!a) return null;
  return {
    project: String(a.project ?? ''),
    start: typeof a.collect_start === 'number' ? a.collect_start : null,
    end: typeof a.collect_end === 'number' ? a.collect_end : null,
    ql: a.ql ? String(a.ql).replace(/^QL\s*/i, '') : null,
    gsdM: typeof a.dem_gsd_meters === 'number' ? a.dem_gsd_meters : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (t: number) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** "Flown Dec 2023 – Feb 2024 · QL 1", the line the panel shows under the map. */
export function describeFlight(f: LidarFlight): string {
  const when = f.start && f.end
    ? (monthYear(f.start) === monthYear(f.end) ? monthYear(f.start) : `${monthYear(f.start)} – ${monthYear(f.end)}`)
    : f.start ? monthYear(f.start) : f.end ? monthYear(f.end) : 'date unknown';
  return `Flown ${when}${f.ql ? ` · QL ${f.ql}` : ''}`;
}

export interface ProfileSample { distM: number; z: number | null; lng: number; lat: number }

const haversineM = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** Evenly spaced elevations along a drawn line, straight from the service. */
export async function sampleProfile(coords: [number, number][], count = 400, signal?: AbortSignal, attempts = 6): Promise<ProfileSample[]> {
  const geometry = JSON.stringify({ paths: [coords], spatialReference: { wkid: 4326 } });
  const body = new URLSearchParams({
    geometry, geometryType: 'esriGeometryPolyline', sampleCount: String(count),
    returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation', f: 'json',
  });
  // Same gateway as the heights, same habit of dropping requests: retry those.
  let json: { samples?: { location: { x: number; y: number }; locationId: number; value: string }[]; error?: { message?: string } } | null = null;
  let last: unknown;
  for (let attempt = 0; attempt < attempts && !json; attempt++) {
    if (attempt) await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)), signal);
    try {
      const res = await withSlot(() => fetch(`${DEP_IMAGE}/getSamples`, { method: 'POST', body, signal, credentials: 'omit' }), true, signal);
      if (res.status >= 500) { last = new Error(`USGS profile HTTP ${res.status}`); continue; }
      if (!res.ok) throw new Error(`USGS profile HTTP ${res.status}`);
      json = await res.json();
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
      if (e instanceof Error && /HTTP 4/.test(e.message)) throw e;
    }
  }
  if (!json) throw last instanceof Error ? last : new Error('USGS profile unavailable');
  if (json.error) throw new Error(json.error.message || 'USGS profile failed');
  const samples: { location: { x: number; y: number }; locationId: number; value: string }[] = json?.samples ?? [];
  samples.sort((a, b) => a.locationId - b.locationId);
  let dist = 0;
  let prev: [number, number] | null = null;
  return samples.map(s => {
    const here: [number, number] = [s.location.x, s.location.y];
    if (prev) dist += haversineM(prev, here);
    prev = here;
    const v = Number(s.value);
    return { distM: dist, z: Number.isFinite(v) && v > -1000 ? v : null, lng: here[0], lat: here[1] };
  });
}

/** What to tell the operator when a USGS request finally gives up. */
export function usgsErrorText(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : '';
  if (!msg) return fallback;
  // A gateway error arrives without CORS headers, so the browser only says "Failed to fetch".
  if (/failed to fetch|networkerror|load failed|HTTP 5\d\d/i.test(msg)) return 'The USGS elevation service is not answering right now. Try again in a minute.';
  return msg;
}

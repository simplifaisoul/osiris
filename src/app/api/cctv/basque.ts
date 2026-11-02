import type { CctvCamera } from './types';
import { createPool } from '@/lib/fetch-pool';

/**
 * OSIRIS — Basque Country traffic cameras (Open Data Euskadi traffic API)
 * Source: https://api.euskadi.eus/traffic/v1.0/cameras — the Basque
 * Government's open traffic API, CC BY 4.0, no key.
 *
 * The API lists 489 cameras from seven operators, 20 to a page. Only the
 * Diputación Foral de Bizkaia's (Bizkaimove) are taken: theirs are the only
 * stills every visitor can load. The others answer only within Spain —
 * trafikoa.eus refuses the connection and bilbao.eus returns 403 from
 * elsewhere — and Vitoria-Gasteiz's redirect to a "no signal" placeholder.
 * Bizkaia's rows give their position as UTM zone 30N (ETRS89) easting and
 * northing in the longitude and latitude fields.
 */

const API_URL = 'https://api.euskadi.eus/traffic/v1.0/cameras';
const PORTAL_URL = 'https://www.bizkaimove.eus/bm/camaras.html';

/** The API's id for the Diputación Foral de Bizkaia. */
const BIZKAIA_SOURCE = '2';

/** Bizkaia's frames; the API still lists them under the old plain-http domain. */
const IMAGE_HOST = 'www.bizkaimove.eus';

/** The Basque Country, padded — anything outside is a bad coordinate. */
const BOUNDS = { minLat: 42.4, maxLat: 43.6, minLng: -3.6, maxLng: -1.6 };

/** A frame older than this means the camera has stopped publishing. */
const MAX_FRAME_AGE_MS = 6 * 60 * 60 * 1000;

/** One camera from the API — only the fields we consume. */
export interface EuskadiCameraRecord {
  cameraId?: string;
  sourceId?: string;
  cameraName?: string;
  urlImage?: string;
  latitude?: string;
  longitude?: string;
  road?: string;
  kilometer?: string;
  address?: string;
}

/** UTM zone 30N on the GRS80 ellipsoid (ETRS89) to latitude and longitude. */
export function utm30nToLatLng(easting: number, northing: number): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = northing / k0 / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const phi = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi), cos = Math.cos(phi), t = Math.tan(phi) ** 2, c = ep2 * cos ** 2;
  const n = a / Math.sqrt(1 - e2 * sin ** 2), r = a * (1 - e2) / (1 - e2 * sin ** 2) ** 1.5;
  const d = (easting - 500000) / (n * k0);
  const lat = phi - (n * Math.tan(phi) / r) * (d ** 2 / 2 - (5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * ep2 - 3 * c ** 2) * d ** 6 / 720);
  const lng = (d - (1 + 2 * t + c) * d ** 3 / 6 + (5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * ep2 + 24 * t ** 2) * d ** 5 / 120) / cos;
  return [lat * 180 / Math.PI, -3 + lng * 180 / Math.PI];
}

/** The frame's HTTPS address on Bizkaimove's own host; null for anything else. */
function frameUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  // bizkaimove.com redirects to bizkaimove.eus, which serves the same frame over https.
  if (/^(www\.)?bizkaimove\.com$/i.test(url.hostname)) url.hostname = IMAGE_HOST;
  if (url.hostname.toLowerCase() !== IMAGE_HOST) return null;
  if (!/^\/camaras\/cam\d+\.jpg$/i.test(url.pathname)) return null;
  url.protocol = 'https:';
  return url.toString();
}

/** Map one page of API rows to cameras. Exported for tests. */
export function parseBasque(rows: unknown): CctvCamera[] {
  if (!Array.isArray(rows)) return [];
  const cams: CctvCamera[] = [];
  for (const row of rows as EuskadiCameraRecord[]) {
    if (row?.sourceId !== BIZKAIA_SOURCE) continue;
    const id = (row.cameraId ?? '').trim();
    if (!/^\d+$/.test(id)) continue;

    const feed = frameUrl(row.urlImage);
    if (!feed) continue;

    let lat = Number(row.latitude), lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Grid metres rather than degrees.
    if (Math.abs(lat) > 90) [lat, lng] = utm30nToLatLng(lng, lat);
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;

    // "CCTV 300 - Cámara DOMO nudo Kukularra" — the operator's own number adds nothing.
    const name = (row.cameraName ?? '').replace(/^CCTV\s*\d+\s*-\s*/i, '').trim() || `Bizkaia camera ${id}`;
    const road = (row.road ?? '').replace(/\s*-\s*/g, '-').trim();
    cams.push({
      id: `bizkaia-${id}`,
      lat,
      lng,
      name: road && !name.includes(road) ? `${road} — ${name}` : name,
      city: row.address?.trim() ? `${row.address.trim()}, Bizkaia` : 'Bizkaia',
      country: 'Spain',
      feed_url: feed,
      stream_type: 'jpg',
      external_url: PORTAL_URL,
      source: 'Bizkaimove',
    });
  }
  return cams;
}

async function fetchPage(page: number): Promise<{ totalPages: number; cameras: unknown }> {
  const res = await fetch(`${API_URL}?_page=${page}`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Euskadi traffic API page ${page} HTTP ${res.status}`);
  return res.json();
}

/**
 * Whether a camera is publishing right now. One of Bizkaia's frames had not
 * changed in over a year when this was written. Only the headers are read.
 */
async function isPublishing(cam: CctvCamera): Promise<boolean> {
  try {
    const res = await fetch(cam.feed_url!, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(4000) });
    await res.body?.cancel();
    if (!res.ok) return false;
    const modified = Date.parse(res.headers.get('last-modified') ?? '');
    return !(Date.now() - modified > MAX_FRAME_AGE_MS);
  } catch {
    return false;
  }
}

export async function fetchBasqueCameras(): Promise<CctvCamera[]> {
  const first = await fetchPage(1);
  const pages = Math.min(Number(first.totalPages) || 1, 100);
  const pool = createPool(4);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => pool.run(() => fetchPage(i + 2))),
  );
  const cams = [first, ...rest].flatMap(p => parseBasque(p.cameras));

  const live = await Promise.all(cams.map(c => pool.run(() => isPublishing(c))));
  const kept = cams.filter((_, i) => live[i]);
  console.log(`[OSIRIS] Basque cameras — Bizkaimove: ${kept.length} of ${cams.length} publishing`);
  return kept;
}

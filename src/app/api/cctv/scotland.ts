import { createHash } from 'node:crypto';
import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Traffic Scotland cameras: about 400 on Scotland's motorways and
 * trunk roads, from Transport Scotland's traffic.gov.scot.
 *
 * The site's map reads every camera from one keyless file, /tsis/cameras (site
 * id, name, position, region). A camera's picture (320×240, stamped with the
 * time) appears only inside that camera's map popup, /tsis/camerahtml?sid=<id>,
 * as an inline JPEG. So each camera points at ./scotland/picture/route.ts,
 * which reads the popup when the camera is opened and answers with the picture.
 *
 * About one camera in six shows Traffic Scotland's "Currently Unavailable" card
 * instead of a picture. Those are left out: each refresh (every six hours) reads
 * every popup, a few at a time, and keeps the cameras with a real picture.
 */

const BASE = 'https://www.traffic.gov.scot';
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const REFRESH_MS = 6 * 60 * 60 * 1000;
const PROBES_AT_ONCE = 6;
/** Scotland, padded; a camera outside it is mis-geocoded. */
const BOUNDS = { minLat: 54.6, maxLat: 60.9, minLng: -8.7, maxLng: -0.7 };
/** SHA-1 of the "Currently Unavailable" card shown in place of a camera's picture. */
const UNAVAILABLE_SHA1 = '0bb6c5f64247b9d98e3e133072d83c15625df9f1';
const INLINE_JPEG = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/;

/** One row of /tsis/cameras (only the fields we read). */
export interface ScotlandSite {
  sid?: string | null;
  title?: string | null;
  lat?: string | null;
  lng?: string | null;
  region?: string | null;
}

/** Map one row, or null when it has no usable id or position. Exported for tests. */
export function mapScotlandSite(s: ScotlandSite): CctvCamera | null {
  const sid = String(s?.sid ?? '');
  if (!/^\d{1,5}$/.test(sid)) return null;
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;
  const region = s.region?.replace(/\s+/g, ' ').trim();
  return {
    id: `scot-${sid}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: s.title?.replace(/\s+/g, ' ').trim() || `Traffic Scotland camera ${sid}`,
    city: region ? `${region}, Scotland` : 'Scotland',
    country: 'United Kingdom',
    feed_url: `/api/cctv/scotland/picture?sid=${sid}`,
    source: 'Traffic Scotland',
  };
}

/** A camera's popup → its picture, or null when it has none or shows the "Currently Unavailable" card. Exported for tests. */
export function readScotlandPicture(html: string, unavailableSha1 = UNAVAILABLE_SHA1): Buffer | null {
  const m = html.match(INLINE_JPEG);
  if (!m) return null;
  const jpeg = Buffer.from(m[1], 'base64');
  if (!jpeg.length) return null;
  return createHash('sha1').update(jpeg).digest('hex') === unavailableSha1 ? null : jpeg;
}

/** The camera's current picture, or null when it is down. Throws when Traffic Scotland cannot be read. */
export async function fetchScotlandPicture(sid: string): Promise<Buffer | null> {
  const res = await fetch(`${BASE}/tsis/camerahtml?sid=${sid}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Traffic Scotland camera ${sid} HTTP ${res.status}`);
  return readScotlandPicture(await res.text());
}

export const fetchScotlandCameras = cachedSource('scotland', async (): Promise<CctvCamera[]> => {
  const res = await fetch(`${BASE}/tsis/cameras`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Traffic Scotland cameras HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.results)) throw new Error('Traffic Scotland cameras: no results');
  const seen = new Set<string>();
  const listed = (json.results as ScotlandSite[])
    .map(mapScotlandSite)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));

  const showing = new Set<string>();
  const queue = [...listed];
  await Promise.all(Array.from({ length: PROBES_AT_ONCE }, async () => {
    for (let cam = queue.shift(); cam; cam = queue.shift()) {
      if (await fetchScotlandPicture(cam.id.slice('scot-'.length)).catch(() => null)) showing.add(cam.id);
    }
  }));
  const cams = listed.filter(c => showing.has(c.id));
  console.log(`[OSIRIS] Traffic Scotland cameras: ${cams.length} (${listed.length - cams.length} currently unavailable)`);
  return cams;
}, REFRESH_MS);

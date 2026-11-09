import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Queensland cameras (Transport and Main Roads, QLDTraffic)
 *
 * Two GeoJSON files, the ones qldtraffic.qld.gov.au's own camera page loads,
 * published without a key:
 *
 *   webcameras.geojson    ~145 traffic cameras on the state-controlled roads,
 *                         from the Gold and Sunshine Coasts to Cairns. Stills
 *                         that refresh every minute or so.
 *   floodcameras.geojson  ~120 cameras at causeways and creek crossings that
 *                         go under in floods, a new picture every 30 minutes.
 *
 * Every row carries its own image URL on cameras.qldtraffic.qld.gov.au, and
 * QLDTraffic's page loads them with a cache-busting query string, so the
 * map's refresh can do the same.
 *
 * A camera that has stopped keeps its last picture online: on one check six of
 * the 121 flood cameras were between 6 and 73 hours old. Each picture's
 * Last-Modified is read when the index refreshes, and a camera that has not
 * posted for STALE_MS is left off the map rather than shown as if current.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const TRAFFIC = 'https://data.qldtraffic.qld.gov.au/webcameras.geojson';
const FLOOD = 'https://data.qldtraffic.qld.gov.au/floodcameras.geojson';

/** The flood cameras post every 30 minutes; three hours without one means it has stopped. */
export const STALE_MS = 3 * 60 * 60 * 1000;
const CHECKS_AT_ONCE = 24;
/**
 * The checks stop here, so the region stays inside the route's 12 s budget;
 * a camera not reached by then keeps its place, as one whose check fails does.
 */
const CHECK_BUDGET_MS = 5000;

/** Queensland, with its islands; rows outside it are mis-geocoded. */
const BOUNDS = { minLat: -29.3, maxLat: -9.0, minLng: 137.9, maxLng: 154.0 };

/** One feature as QLDTraffic publishes it (only the fields we read). */
export interface QldCameraFeature {
  geometry?: { coordinates?: [number, number] | number[] } | null;
  properties?: {
    id?: number;
    description?: string | null;
    locality?: string | null;
    district?: string | null;
    image_url?: string | null;
  } | null;
}

/** Map one feature to a camera, or null when it has no place or picture. */
export function mapQldCamera(f: QldCameraFeature, kind: 'traffic' | 'flood'): CctvCamera | null {
  const p = f.properties;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  const image = p?.image_url?.trim();
  if (!p || p.id == null || !image || !/^https:\/\//.test(image)) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;
  return {
    id: `qld-${kind}-${p.id}`,
    lat,
    lng,
    name: p.description?.trim() || (kind === 'flood' ? 'Flood camera' : 'Traffic camera'),
    city: p.locality?.trim() || p.district?.trim() || 'Queensland',
    country: 'Australia',
    feed_url: image,
    source: kind === 'flood' ? 'QLDTraffic flood camera' : 'QLDTraffic',
  };
}

/**
 * Whether a camera's picture is current. A picture that is gone, or older than
 * STALE_MS, is not; a check that fails on our side says nothing about the
 * camera, so it keeps its place.
 */
async function isCurrent(cam: CctvCamera, now: number): Promise<boolean> {
  try {
    const res = await fetch(cam.feed_url!, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const modified = Date.parse(res.headers.get('last-modified') ?? '');
    return !Number.isFinite(modified) || now - modified < STALE_MS;
  } catch {
    return true;
  }
}

/** The cameras whose pictures are current, checked CHECKS_AT_ONCE at a time for at most `budgetMs`. */
export async function currentOnly(cams: CctvCamera[], now = Date.now(), budgetMs = CHECK_BUDGET_MS): Promise<CctvCamera[]> {
  const keep = cams.map(() => true);
  const deadline = Date.now() + budgetMs;
  let next = 0;
  const worker = async () => {
    while (next < cams.length && Date.now() < deadline) {
      const i = next++;
      keep[i] = await isCurrent(cams[i], now);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHECKS_AT_ONCE, cams.length) }, worker));
  return cams.filter((_, i) => keep[i]);
}

async function load(url: string, kind: 'traffic' | 'flood'): Promise<CctvCamera[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`QLDTraffic ${kind} cameras HTTP ${res.status}`);
  const data = await res.json();
  const features: QldCameraFeature[] = Array.isArray(data?.features) ? data.features : [];
  return features.map(f => mapQldCamera(f, kind)).filter((c): c is CctvCamera => !!c);
}

export const fetchQueenslandCameras = cachedSource('queensland', async (): Promise<CctvCamera[]> => {
  /* Either file can fail on its own; the other still loads. */
  const [traffic, flood] = await Promise.allSettled([load(TRAFFIC, 'traffic'), load(FLOOD, 'flood')]);
  const listed = [traffic, flood].flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  for (const r of [traffic, flood]) if (r.status === 'rejected') console.warn('[OSIRIS]', r.reason instanceof Error ? r.reason.message : r.reason);
  if (!listed.length && traffic.status === 'rejected') throw traffic.reason;
  const cams = await currentOnly(listed);
  console.log(`[OSIRIS] Queensland cameras — QLDTraffic: ${cams.length} current of ${listed.length}`);
  return cams;
});

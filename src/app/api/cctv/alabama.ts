import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Alabama cameras, from ALDOT's ALGO Traffic (algotraffic.com).
 *
 * The site's own API lists every camera keyless at api.algotraffic.com/v4.0/
 * Cameras: about 650, each with a 1920×1080 snapshot from the same API that is
 * renewed every few minutes. Their live streams answer 403 without the site's
 * session token, so only the snapshots are used. Cameras the API marks other
 * than `Public` (first-responder or hidden ones) are left out.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://api.algotraffic.com/v4.0/Cameras';
/** The only place a picture link may point. */
const IMAGE_PREFIX = 'https://api.algotraffic.com/';

/** Alabama, padded; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 30.1, maxLat: 35.1, minLng: -88.6, maxLng: -84.8 };

/** One camera of the API (only the fields we read). */
export interface AlgoCamera {
  id?: number | null;
  accessLevel?: string | null;
  snapshotImageUrl?: string | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    county?: string | null;
    displayRouteDesignator?: string | null;
    displayCrossStreet?: string | null;
    direction?: string | null;
  } | null;
}

/** Map one camera, or null when it is not public, has no place or no picture. Exported for tests. */
export function mapAlabamaCamera(cam: AlgoCamera): CctvCamera | null {
  if (typeof cam?.id !== 'number' || cam.accessLevel !== 'Public') return null;
  const image = cam.snapshotImageUrl?.trim();
  if (!image?.startsWith(IMAGE_PREFIX)) return null;

  const loc = cam.location;
  const lat = loc?.latitude;
  const lng = loc?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  const route = loc?.displayRouteDesignator?.trim();
  const cross = loc?.displayCrossStreet?.trim();
  const direction = loc?.direction?.trim();
  const place = [route, cross && cross !== 'Unknown' ? cross : null].filter(Boolean).join(' at ');
  const city = loc?.city?.trim() || (loc?.county?.trim() ? `${loc.county.trim()} County` : 'Alabama');
  return {
    id: `al-${cam.id}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: (place || `Camera ${cam.id}`) + (direction && direction !== 'Unknown' && direction !== 'Any' ? ` (${direction.toLowerCase()}bound)` : ''),
    city,
    country: 'US',
    feed_url: image,
    source: 'ALDOT ALGO Traffic',
  };
}

export const fetchAlabamaCameras = cachedSource('alabama', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Alabama cameras HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Alabama cameras: not a list');
  const seen = new Set<string>();
  const cams = (rows as AlgoCamera[])
    .map(mapAlabamaCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] Alabama cameras — ALGO Traffic: ${cams.length}`);
  return cams;
});

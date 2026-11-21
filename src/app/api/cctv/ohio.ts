import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Ohio DOT cameras (OHGO)
 * Source: https://ohgo.com — ~1,120 camera sites statewide, NO API KEY NEEDED.
 *
 * Cleveland, Columbus, Cincinnati, Toledo, Dayton and Akron freeways and the
 * interstates between them. OHGO's own map reads every camera in a box from
 * api.ohgo.com/roadmarkers/cameras (keyless, Access-Control-Allow-Origin: *);
 * OHGO's documented API wants a key, this does not. Each site's picture is a
 * still on ODOT's camera server, itscameras.dot.state.oh.us, renewed every
 * few minutes and mostly 1280×720 or larger.
 *
 * The feed also carries about forty of Kentucky's TRIMARC cameras around
 * Cincinnati. Their pictures are on www.trimarc.org, which does not answer,
 * so only ODOT's own server is accepted.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
/** The state, padded; also the box asked for. */
const BOUNDS = { minLat: 38.2, maxLat: 42.4, minLng: -85.0, maxLng: -80.3 };
export const CAMERAS_URL = `https://api.ohgo.com/roadmarkers/cameras?pointData=${encodeURIComponent(JSON.stringify({
  lowLongitude: BOUNDS.minLng,
  highLongitude: BOUNDS.maxLng,
  lowLatitude: BOUNDS.minLat,
  highLatitude: BOUNDS.maxLat,
  routeDirection: '',
  routeName: '',
}))}`;
/** The only place a picture may come from: ODOT's camera server (the feed sometimes spells out :443). */
const IMAGE = /^https:\/\/itscameras\.dot\.state\.oh\.us(?::443)?(\/[\w./-]+\.jpe?g)$/i;

/** One site of /roadmarkers/cameras (only the fields we read). */
export interface OhgoSite {
  Id?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  Location?: string | null;
  Cameras?: Array<{ Direction?: string | null; LargeURL?: string | null }> | null;
}

/** Map one site to a pin with its first view, or null when it has no picture of ODOT's. Exported for tests. */
export function mapOhgoSite(s: OhgoSite): CctvCamera | null {
  const id = String(s?.Id ?? '').trim();
  if (!/^\d+$/.test(id)) return null;
  const image = s.Cameras?.map(c => c?.LargeURL?.trim().match(IMAGE)).find(Boolean);
  if (!image) return null;
  const { Latitude: lat, Longitude: lng } = s;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  // "I-74 at Elmore St, 4140": the trailing number is ODOT's site number.
  const name = (s.Location ?? '').replace(/,\s*\d+\s*$/, '').replace(/\s+/g, ' ').trim();
  return {
    id: `ohgo-${Number(id)}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: name || `Ohio camera ${Number(id)}`,
    city: 'Ohio',
    country: 'US',
    feed_url: `https://itscameras.dot.state.oh.us${image[1]}`,
    source: 'ODOT',
  };
}

export const fetchOhioCameras = cachedSource('ohio', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OHGO cameras HTTP ${res.status}`);
  const sites: OhgoSite[] = await res.json();
  if (!Array.isArray(sites)) throw new Error('OHGO cameras: not a list');
  const seen = new Set<string>();
  const cams = sites
    .map(mapOhgoSite)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] Ohio cameras: ${cams.length}`);
  return cams;
});

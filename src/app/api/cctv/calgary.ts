import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — City of Calgary traffic cameras, from the city's open-data portal:
 * the "Traffic Cameras" dataset, data.calgary.ca/resource/k7p9-kppz, keyless
 * and Access-Control-Allow-Origin: *. About 220 cameras, each an 840×630 still
 * on trafficcam.calgary.ca that refreshes every minute or two.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const DATASET = 'https://data.calgary.ca/resource/k7p9-kppz.json?$limit=1000';
/** The only place a picture link may point. */
const IMAGE_ORIGIN = 'https://trafficcam.calgary.ca/';

/** Calgary and its ring road; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 50.8, maxLat: 51.3, minLng: -114.4, maxLng: -113.8 };

/** One row of the dataset (only the fields we read). */
export interface CalgaryCameraRow {
  camera_url?: { url?: string | null; description?: string | null } | null;
  camera_location?: string | null;
  quadrant?: string | null;
  point?: { coordinates?: number[] | null } | null;
}

/** Map one row to a camera, or null when it has no place or picture. Exported for tests. */
export function mapCalgaryCamera(row: CalgaryCameraRow): CctvCamera | null {
  const image = row?.camera_url?.url?.trim();
  if (!image?.startsWith(IMAGE_ORIGIN)) return null;
  // `loc0.jpg` is the city's "Camera 1": the file name is the stable id.
  const id = image.match(/\/loc(\d+)\.jpg$/i)?.[1];
  if (!id) return null;

  const [lng, lat] = row.point?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  const quadrant = row.quadrant?.trim();
  return {
    id: `calgary-${id}`,
    lat,
    lng,
    name: row.camera_location?.replace(/\s+/g, ' ').trim() || row.camera_url?.description?.trim() || `Calgary camera ${id}`,
    city: quadrant ? `Calgary ${quadrant}` : 'Calgary',
    country: 'Canada',
    feed_url: image,
    source: 'City of Calgary',
  };
}

export const fetchCalgaryCameras = cachedSource('calgary', async (): Promise<CctvCamera[]> => {
  const res = await fetch(DATASET, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Calgary cameras HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Calgary cameras: not a list');
  const seen = new Set<string>();
  const cams = (rows as CalgaryCameraRow[])
    .map(mapCalgaryCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] Calgary cameras — City of Calgary: ${cams.length}`);
  return cams;
});

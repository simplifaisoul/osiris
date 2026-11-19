import { cachedSource } from '@/lib/sourceCache';
import { currentOnly } from './queensland';
import type { CctvCamera } from './types';

/**
 * OSIRIS — City of Austin traffic cameras (Austin Transportation and Public
 * Works), from the city's open-data portal: the "Traffic Cameras" dataset,
 * data.austintexas.gov/resource/b4k4-adkb, keyless and Access-Control-Allow-Origin: *.
 *
 * About 820 cameras the city lists as turned on, each with a 1920×1080 still
 * on cctv.austinmobility.io that refreshes every few minutes. On one check a
 * third of a sample had not posted for over 14 hours, so each picture's
 * Last-Modified is read at refresh and a stopped camera is left off the map
 * (see ./queensland's `currentOnly`).
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const DATASET = "https://data.austintexas.gov/resource/b4k4-adkb.json?$where=camera_status='TURNED_ON'&$limit=5000";
/** The only place a picture link may point. */
const IMAGE_ORIGIN = 'https://cctv.austinmobility.io';
/** Eight hundred checks need longer than Queensland's default; the region gets the slow budget. */
const CHECK_BUDGET_MS = 20_000;

/** Austin and its suburbs; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 29.9, maxLat: 30.8, minLng: -98.2, maxLng: -97.3 };

/** One row of the dataset (only the fields we read). */
export interface AustinCameraRow {
  camera_id?: string | null;
  location_name?: string | null;
  camera_status?: string | null;
  screenshot_address?: string | null;
  location?: { coordinates?: number[] | null } | null;
}

/** Map one row to a camera, or null when it is off, or has no place or picture. Exported for tests. */
export function mapAustinCamera(row: AustinCameraRow): CctvCamera | null {
  if (row?.camera_status !== 'TURNED_ON') return null;
  const id = row.camera_id?.trim();
  if (!id || !/^\d+$/.test(id)) return null;

  const image = row.screenshot_address?.trim();
  if (!image?.startsWith(`${IMAGE_ORIGIN}/image/`)) return null;

  const [lng, lat] = row.location?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  return {
    id: `austin-${id}`,
    lat,
    lng,
    name: row.location_name?.replace(/\s+/g, ' ').trim() || `Austin camera ${id}`,
    city: 'Austin',
    country: 'US',
    feed_url: image,
    source: 'City of Austin',
  };
}

export const fetchAustinCameras = cachedSource('austin', async (): Promise<CctvCamera[]> => {
  const res = await fetch(DATASET, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Austin cameras HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Austin cameras: not a list');
  const listed = (rows as AustinCameraRow[]).map(mapAustinCamera).filter((c): c is CctvCamera => !!c);
  const cams = await currentOnly(listed, Date.now(), CHECK_BUDGET_MS);
  console.log(`[OSIRIS] Austin cameras — City of Austin: ${cams.length} current of ${listed.length}`);
  return cams;
});

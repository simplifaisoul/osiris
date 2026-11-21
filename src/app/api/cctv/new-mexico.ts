import { cachedSource } from '@/lib/sourceCache';
import { proxiedImageUrl, type CctvCamera } from './types';

/**
 * OSIRIS — New Mexico DOT cameras (NMRoads)
 * Source: https://nmroads.com — ~185 cameras, NO API KEY NEEDED.
 *
 * Albuquerque's freeways, Santa Fe, Las Cruces and the I-25, I-40 and I-10
 * runs across the state. NMRoads' map reads its whole list from one file,
 * servicev5.nmroads.com/RealMapWAR//GetCameraInfo (JSON, despite answering as
 * text/javascript). Each camera's picture is a still renewed every minute at
 * ss.nmroads.com/snapshots/<name>.jpg, 320×240 up to 1920×1080. That host
 * answers over plain http only, which an https page refuses as mixed content,
 * so the picture is served through the camera proxy (see proxiedImageUrl).
 * The live video is RTMP, which a browser cannot play.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://servicev5.nmroads.com/RealMapWAR//GetCameraInfo';
/** The only place a picture may come from: NMRoads' snapshot folder. */
const SNAPSHOT = /^https?:\/\/ss\.nmroads\.com\/snapshots\/([\w.-]+)\.jpg$/i;
/** The state, padded; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 31.3, maxLat: 37.05, minLng: -109.1, maxLng: -103.0 };

/** One entry of GetCameraInfo's `cameraInfo` (only the fields we read). */
export interface NmRoadsCamera {
  title?: string | null;
  grouping?: string | null;
  snapshotFile?: string | null;
  enabled?: boolean | null;
  lat?: number | null;
  lon?: number | null;
}

/** "Albuquerque Area" → "Albuquerque"; a statewide or corridor group says only the state. */
function place(grouping?: string | null): string {
  const g = grouping?.trim().replace(/\s+Area$/i, '');
  return g && !/statewide|corridor/i.test(g) ? `${g}, New Mexico` : 'New Mexico';
}

/** Map one entry, or null when it is switched off, misplaced or has no picture of NMRoads'. Exported for tests. */
export function mapNmRoadsCamera(c: NmRoadsCamera): CctvCamera | null {
  if (c?.enabled === false) return null;
  const file = c?.snapshotFile?.trim().match(SNAPSHOT);
  if (!file) return null;
  const { lat, lon: lng } = c;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  return {
    id: `nm-${file[1].toLowerCase()}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: c.title?.replace(/\s+/g, ' ').trim() || `New Mexico camera ${file[1]}`,
    city: place(c.grouping),
    country: 'US',
    // Always asked for over http: the host does not answer on https at all.
    feed_url: proxiedImageUrl(`http://ss.nmroads.com/snapshots/${file[1]}.jpg`),
    source: 'NMDOT',
  };
}

export const fetchNewMexicoCameras = cachedSource('new-mexico', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`NMRoads cameras HTTP ${res.status}`);
  const list: NmRoadsCamera[] = JSON.parse(await res.text())?.cameraInfo;
  if (!Array.isArray(list)) throw new Error('NMRoads cameras: no cameraInfo');
  const seen = new Set<string>();
  const cams = list
    .map(mapNmRoadsCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] New Mexico cameras: ${cams.length}`);
  return cams;
});

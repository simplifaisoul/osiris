import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — New Jersey Turnpike and Garden State Parkway cameras, from the
 * NJ Turnpike Authority's own camera page.
 *
 * www.njta.gov/travel-resources/camera-list/ carries its whole list in the map
 * block's data-block-config attribute, as HTML-escaped JSON: about 70
 * Turnpike and 65 Parkway cameras, from Cape May and the Delaware Memorial
 * Bridge to Newark, Jersey City and Bergen County. Each has a position, a
 * mile marker and a live HLS stream on wink.njta.com (640×480 H.264, keyless,
 * CORS-open). The Authority publishes no still pictures, so these are video
 * only.
 *
 * NJDOT's own cameras (511nj.org) are not here: that site answers every
 * request from outside with 403.
 *
 * A camera can stay listed after its stream is gone, so each refresh reads
 * every playlist (a few hundred bytes each) and keeps those that answer. That
 * is about 140 small requests, so the list is refreshed every six hours.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const PAGE_URL = 'https://www.njta.gov/travel-resources/camera-list/';
const REFRESH_MS = 6 * 60 * 60_000;
const PROBES_AT_ONCE = 8;
/** New Jersey, padded to take in the Delaware Memorial Bridge; a row outside it is misplaced. */
const BOUNDS = { minLat: 38.85, maxLat: 41.4, minLng: -75.6, maxLng: -73.85 };
const ROADS: Record<string, string> = { turnpike: 'NJ Turnpike', parkway: 'Garden State Parkway' };

/** One camera in the page's map data (only the fields we read). */
export interface NjtaCamera {
  id?: number | string | null;
  lat?: number | null;
  lng?: number | null;
  mile_marker?: number | string | null;
  /** "Liberty State Park (Jersey City)", or only the town: "(Bass River Twp)". */
  relative_text?: string | null;
  video_url?: string | null;
  type?: string | null;
}

/** The cameras in the camera page's map data, by road. Exported for tests. */
export function readCameraPage(html: string): Record<string, NjtaCamera[]> {
  const attr = html.match(/data-block-config="([^"]*)"/)?.[1];
  if (!attr) throw new Error('NJTA cameras: no map data on the page');
  const config = JSON.parse(attr
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'));
  const cameras = config?.initialData?.cameras;
  if (!cameras || typeof cameras !== 'object') throw new Error('NJTA cameras: no camera list in the map data');
  return cameras;
}

/** Map one camera on `road` (turnpike or parkway), or null when it is not a usable camera. Exported for tests. */
export function mapNjtaCamera(c: NjtaCamera, road: string): CctvCamera | null {
  const roadName = ROADS[road];
  if (!roadName || c?.type !== 'camera') return null;
  const id = String(c.id ?? '').trim();
  if (!/^\d+$/.test(id)) return null;
  const { lat, lng } = c;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;
  const url = String(c.video_url ?? '').trim();
  if (!/^https:\/\/wink\.njta\.com\/[^?#\s]+\.m3u8$/.test(url)) return null;

  const text = String(c.relative_text ?? '').replace(/\s+/g, ' ').trim();
  const mile = c.mile_marker != null && c.mile_marker !== '' ? ` MP ${c.mile_marker}` : '';
  // A text that is only the town says nothing about where on the road, so the mile marker does.
  const name = !text ? `${roadName}${mile}` : text.startsWith('(') ? `${roadName}${mile} ${text}` : `${roadName}: ${text}`;
  const town = text.match(/\(([^()]+)\)$/)?.[1];
  return {
    id: `njta-${id}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name,
    city: town ? `${town}, New Jersey` : 'New Jersey',
    country: 'US',
    stream_url: url,
    stream_type: 'hls',
    source: 'NJ Turnpike Authority',
  };
}

/** Whether a camera's stream answers now. */
async function plays(cam: CctvCamera): Promise<boolean> {
  try {
    const res = await fetch(cam.stream_url!, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    return res.ok && (await res.text()).startsWith('#EXTM3U');
  } catch {
    return false;
  }
}

export const fetchNewJerseyCameras = cachedSource('new-jersey', async (): Promise<CctvCamera[]> => {
  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`NJTA cameras HTTP ${res.status}`);
  const seen = new Set<string>();
  const listed = Object.entries(readCameraPage(await res.text()))
    .flatMap(([road, rows]) => (Array.isArray(rows) ? rows : []).map(c => mapNjtaCamera(c, road)))
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));

  const ok = new Set<string>();
  const queue = [...listed];
  await Promise.all(Array.from({ length: PROBES_AT_ONCE }, async () => {
    for (let cam = queue.shift(); cam; cam = queue.shift()) if (await plays(cam)) ok.add(cam.id);
  }));
  const cams = listed.filter(c => ok.has(c.id));
  console.log(`[OSIRIS] NJ Turnpike Authority cameras: ${cams.length} (${listed.length - cams.length} not playing)`);
  return cams;
}, REFRESH_MS);

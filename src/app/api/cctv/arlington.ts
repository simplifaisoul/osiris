import { cachedSource } from '@/lib/sourceCache';
import { withoutCamerasNear, type CctvCamera } from './types';
import { fetchVirginiaCameras } from './virginia';

/**
 * OSIRIS — Arlington County (Virginia) traffic cameras, at the County's own
 * signalised intersections: Columbia Pike, Route 50, Glebe Road and the rest.
 * VDOT's layer (./virginia) republishes about forty of them, with a still as
 * well as the video, so those are left to VDOT.
 *
 * The County's camera page reads its whole list from one open-data file,
 * datahub-v2-s3.arlingtonva.us/Uploads/AutomatedJobs/Traffic+Cameras.json:
 * about 310 cameras, each with a position, a status and a stream port. Every
 * camera is live HLS from itsvideo.arlingtonva.us, keyless, with
 * Access-Control-Allow-Origin: *, from 320×240 up to 1280×720. The County
 * publishes no still pictures, so these are video only.
 *
 * Not every listed camera can play. About forty are 404 at any moment, and
 * about forty more stream at 2–4 Mbps from a server that delivers them at
 * under 1 Mbps, so they sit black and then stall. Each refresh therefore reads
 * every camera's playlist (a few hundred bytes each) and keeps those that
 * answer at up to 1.5 Mbps, which play smoothly. That is about 300 small
 * requests, so the list is refreshed every six hours rather than every half
 * hour.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://datahub-v2-s3.arlingtonva.us/Uploads/AutomatedJobs/Traffic+Cameras.json';
/** Above this the County's server cannot keep up; every stream at or below it played smoothly. */
const MAX_BANDWIDTH = 1_500_000;
const REFRESH_MS = 6 * 60 * 60_000;
const PROBES_AT_ONCE = 12;
/** The County, padded; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 38.8, maxLat: 38.95, minLng: -77.2, maxLng: -77.0 };

/** One row of Traffic+Cameras.json (only the fields we read). */
export interface ArlingtonCamera {
  'Camera Site'?: string | null;
  /** The intersection; the County's own page reads this column as "Camera Encoder". */
  'Camera EncoderB2'?: string | null;
  'Camera Encoder'?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  port?: string | number | null;
  STATUS?: string | null;
}

/** Map one row, or null when it is offline, misplaced or has no stream. Exported for tests. */
export function mapArlingtonCamera(c: ArlingtonCamera): CctvCamera | null {
  if (c?.STATUS !== 'ONLINE') return null;
  const site = String(c['Camera Site'] ?? '').trim();
  if (!/^cam\d+$/.test(site)) return null;
  // The County's player asks for HLS ten ports above the one listed (8001 → 8011).
  const port = Number(c.port);
  if (!Number.isInteger(port) || port < 8001 || port > 8009) return null;
  const { Latitude: lat, Longitude: lng } = c;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  // "Columbia Pike @ S Glebe  - 024": the trailing number is the County's asset number.
  const name = (c['Camera EncoderB2'] ?? c['Camera Encoder'] ?? '').replace(/\s+-\s+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
  return {
    id: `arlington-${site}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: name || `Arlington camera ${site.slice(3)}`,
    city: 'Arlington, Virginia',
    country: 'US',
    stream_url: `https://itsvideo.arlingtonva.us:${port + 10}/live/${site}.stream/playlist.m3u8`,
    stream_type: 'hls',
    source: 'Arlington County',
  };
}

/** Whether a camera's stream answers now, at a rate the County's server can deliver. */
async function plays(cam: CctvCamera): Promise<boolean> {
  try {
    const res = await fetch(cam.stream_url!, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    const text = res.ok ? await res.text() : '';
    if (!text.startsWith('#EXTM3U')) return false;
    const bandwidth = Number(text.match(/BANDWIDTH=(\d+)/)?.[1]);
    return !bandwidth || bandwidth <= MAX_BANDWIDTH;
  } catch {
    return false;
  }
}

export const fetchArlingtonCameras = cachedSource('arlington', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Arlington cameras HTTP ${res.status}`);
  // Served as application/octet-stream.
  const list: ArlingtonCamera[] = JSON.parse(await res.text());
  if (!Array.isArray(list)) throw new Error('Arlington cameras: not a list');
  const seen = new Set<string>();
  const own = list
    .map(mapArlingtonCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  // VDOT's list is cached for the route anyway; if it is down, show them all.
  const listed = withoutCamerasNear(own, await fetchVirginiaCameras().catch(() => []), 30);

  const ok = new Set<string>();
  const queue = [...listed];
  await Promise.all(Array.from({ length: PROBES_AT_ONCE }, async () => {
    for (let cam = queue.shift(); cam; cam = queue.shift()) if (await plays(cam)) ok.add(cam.id);
  }));
  const cams = listed.filter(c => ok.has(c.id));
  console.log(`[OSIRIS] Arlington County cameras: ${cams.length} (${own.length - listed.length} left to VDOT, ${listed.length - cams.length} not playable)`);
  return cams;
}, REFRESH_MS);

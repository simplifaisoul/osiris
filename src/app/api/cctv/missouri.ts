import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — MoDOT's live traffic cameras, from the keyless file its Traveler
 * Information map reads. About 875 cameras, each an HLS stream (320×240) from
 * MoDOT's own streaming servers or from Ozarks Traffic in Springfield, with
 * Access-Control-Allow-Origin: *.
 *
 * Some of MoDOT's streaming servers do not answer at all: in November 2026
 * four of its six timed out on every camera tried. A server's cameras are
 * kept only when one of a few of its playlists answers, checked each time the
 * list is read, so a server that comes back brings its cameras with it.
 * Kansas City's cameras go through a KC Scout relay that answers 403, so they
 * are left out; KanDrive already lists KC Scout's stills.
 */

const FEED = 'https://traveler.modot.org/timconfig/feed/desktop/StreamingCams2.json';
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const STREAM = /^https:\/\/([a-z0-9.-]+)\/rtplive\/([a-z0-9_]+)\/playlist\.m3u8$/i;
const OZARKS = 's2.ozarkstrafficoneview.com';
const BOUNDS = { minLat: 35.9, maxLat: 40.7, minLng: -95.8, maxLng: -89.0 };
/**
 * Playlists tried per server, and how long each may take: long enough for a
 * server that answers while every region is loading at once on a cold start.
 */
const TRIES = 4;
const TRY_MS = 8000;

/** One camera in the feed (only the fields we read). */
export interface MoDotCamera {
  location?: string | null;
  x?: number | null;
  y?: number | null;
  html?: string | null;
}

/** Map one camera, or null when it has no place or no stream we can play. Exported for tests. */
export function mapMoDotCamera(c: MoDotCamera): CctvCamera | null {
  const m = c?.html?.trim().match(STREAM);
  if (!m) return null;
  const { y: lat, x: lng } = c;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;
  const host = m[1].toLowerCase();
  const ozarks = host === OZARKS;
  return {
    id: `modot-${m[2].toLowerCase()}`,
    lat,
    lng,
    name: c.location?.trim() || `MoDOT camera ${m[2]}`,
    city: ozarks ? 'Springfield' : 'Missouri',
    country: 'US',
    stream_url: `https://${host}/rtplive/${m[2]}/playlist.m3u8`,
    stream_type: 'hls',
    source: ozarks ? 'Ozarks Traffic' : 'MoDOT',
  };
}

/** Whether a streaming server answers: any of a few of its cameras' playlists, spread through its list. */
async function answers(urls: string[]): Promise<boolean> {
  const step = Math.max(1, Math.floor(urls.length / TRIES));
  const picked = urls.filter((_, i) => i % step === 0).slice(0, TRIES);
  return Promise.any(picked.map(async url => {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TRY_MS) });
    if (!res.ok || !(await res.text()).startsWith('#EXTM3U')) throw new Error(`${url} did not answer`);
  })).then(() => true, () => false);
}

/** Every camera on a server that answers. Throws when the list cannot be read, so the region keeps its last good one. */
export async function loadMissouriCameras(): Promise<CctvCamera[]> {
  const res = await fetch(FEED, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MoDOT cameras HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('MoDOT cameras: not a list');

  const byServer = new Map<string, CctvCamera[]>();
  const seen = new Set<string>();
  for (const c of data as MoDotCamera[]) {
    const cam = mapMoDotCamera(c);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    const host = new URL(cam.stream_url!).host;
    byServer.set(host, [...(byServer.get(host) ?? []), cam]);
  }
  const servers = [...byServer.entries()];
  const up = await Promise.all(servers.map(([, cams]) => answers(cams.map(c => c.stream_url!))));
  const cams = servers.flatMap(([, list], i) => (up[i] ? list : []));
  const down = servers.filter((_, i) => !up[i]).map(([host]) => host);
  console.log(`[OSIRIS] Missouri cameras — MoDOT: ${cams.length} live${down.length ? `; left out ${seen.size - cams.length} on servers that did not answer (${down.join(', ')})` : ''}`);
  return cams;
}

export const fetchMissouriCameras = cachedSource('missouri', loadMissouriCameras);

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * OSIRIS — where a camera's live stream is right now.
 *
 * Mississippi DOT and West Virginia DOT name each camera's stream server only
 * on that camera's own page, and they move cameras between servers. Overnight
 * on 2026-11-20 MDOT moved 130 streams off three of its Jackson servers, and
 * every old address answered 404: a catalogue that had the server written
 * into it lost a third of the state in a day.
 *
 * So those catalogues (./mississippi, ./west-virginia) point here with the
 * camera's site and stream name. This reads the same page the agency's own map
 * opens for that camera, finds which server has the stream now, and redirects
 * there. hls.js and <img> both follow a redirect, and hls.js resolves the
 * playlist's segments against the address it ended at. That is one request to
 * the agency per camera per half hour; the rest answer from memory.
 *
 *   /api/cctv/stream?src=ms&site=1&cam=010406          → the live HLS playlist
 *   /api/cctv/stream?src=ms&site=1&cam=010406&still=1  → a frame of it (JPEG)
 *   /api/cctv/stream?src=wv&cam=CAM001                 → the live HLS playlist
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const FOUND_TTL_MS = 30 * 60_000;
const FAILED_TTL_MS = 60_000;
const MAX_ENTRIES = 2000;

export interface Located {
  stream: string;
  still?: string;
}

/** MDOT's Wowza frame addresses, the only thing a site page says about its streams. */
const MDOT_FRAME = /https:\/\/(streaming[a-z0-9]*\.mdottraffic\.com)\/thumbnail\?application=([A-Za-z0-9_-]+)&(?:amp;)?streamname=([A-Za-z0-9_-]+)\.stream/g;
/** WV511's player names the stream outright. */
const WV_STREAM = /https:\/\/(vtc\d+\.roadsummary\.com)\/rtplive\/([A-Za-z0-9_-]+)\/playlist\.m3u8/g;

/** A Mississippi site page → the wanted camera's stream, or the site's first if it was renamed. Exported for tests. */
export function locateMississippi(html: string, cam: string): Located | null {
  const found = [...html.matchAll(MDOT_FRAME)];
  const m = found.find(f => f[3] === cam) ?? found[0];
  if (!m) return null;
  const [, host, app, name] = m;
  return {
    stream: `https://${host}/${app}/${name}.stream/playlist.m3u8`,
    still: `https://${host}/thumbnail?application=${app}&streamname=${name}.stream&size=1280x720&fitmode=letterbox&format=jpg`,
  };
}

/** A WV511 player page → that camera's own stream, never another's. Exported for tests. */
export function locateWestVirginia(html: string, cam: string): Located | null {
  const m = [...html.matchAll(WV_STREAM)].find(f => f[2] === cam);
  return m ? { stream: m[0] } : null;
}

interface Source {
  /** What a valid request names, checked before anything is fetched. */
  valid: (site: string, cam: string) => boolean;
  page: (site: string, cam: string) => string;
  locate: (html: string, cam: string) => Located | null;
}

const SOURCES: Record<string, Source> = {
  ms: {
    valid: (site, cam) => /^\d{1,5}$/.test(site) && /^[A-Za-z0-9_-]{1,32}$/.test(cam),
    page: site => `https://www.mdottraffic.com/mapbubbles/camerasite.aspx?site=${site}`,
    locate: locateMississippi,
  },
  wv: {
    valid: (_site, cam) => /^[A-Za-z0-9_-]{1,32}$/.test(cam),
    page: (_site, cam) => `https://www.wv511.org/flowplayeri.aspx?CAMID=${cam}`,
    locate: locateWestVirginia,
  },
};

const cache = new Map<string, { until: number; value: Located | null }>();

/** For tests. */
export const clearStreamCache = () => cache.clear();

async function locate(src: Source, site: string, cam: string, key: string): Promise<Located | null> {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  let value: Located | null = null;
  let ttl = FAILED_TTL_MS;
  try {
    const res = await fetch(src.page(site, cam), { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      value = src.locate(await res.text(), cam);
      if (value) ttl = FOUND_TTL_MS;
    }
  } catch {
    // Unreachable: answer 404 for now, and ask again in a minute.
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { until: Date.now() + ttl, value });
  return value;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const name = params.get('src') ?? '';
  const site = params.get('site') ?? '';
  const cam = params.get('cam') ?? '';
  const src = Object.hasOwn(SOURCES, name) ? SOURCES[name] : undefined;
  if (!src || !src.valid(site, cam)) return NextResponse.json({ error: 'unknown camera' }, { status: 400 });

  const found = await locate(src, site, cam, `${name}:${site}:${cam}`);
  const target = params.has('still') ? found?.still : found?.stream;
  if (!target) return NextResponse.json({ error: 'camera unavailable' }, { status: 404 });

  // Short, so a camera the agency moves again is followed within a minute.
  return NextResponse.redirect(target, { status: 302, headers: { 'Cache-Control': 'private, max-age=60' } });
}

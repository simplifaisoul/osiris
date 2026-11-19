import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Minnesota and Colorado cameras, from their new 511 sites.
 *
 * MnDOT's 511mn.org and CDOT's COtrip moved to the CARS program's "511x" app
 * in 2026. Its map reads every camera from one keyless GeoJSON file on the
 * state's own API host, `api-511x-<state>.carsprogram.org/cameras/map-features`,
 * which answers Access-Control-Allow-Origin: *. (The bare `/cameras` path only
 * answers a health check, which is why it looked closed before.)
 *
 *   Minnesota  ~1,530 sites; ~1,250 live HLS from video.dot.state.mn.us
 *              (720×480 to 1080p), the rest road-weather stills.
 *   Colorado   ~1,000 sites; ~820 live HLS from publicstreamer*.cotrip.org
 *              (320×240), the rest stills from CDOT's cellular and county
 *              cameras.
 *
 * Every stream host sends Access-Control-Allow-Origin: *, so the player opens
 * them straight from the source. A site can carry several views (one per
 * direction); the map shows one pin per site, with its first live view, or
 * its first still when it has no video.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';

/** A still that has not changed for this long belongs to a camera that has stopped. */
export const STALE_MS = 3 * 60 * 60 * 1000;

export interface Cars511xState {
  /** The state's code in the API host name, e.g. `mn`. */
  code: string;
  idPrefix: string;
  source: string;
  state: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export const MINNESOTA: Cars511xState = {
  code: 'mn',
  idPrefix: 'mn511',
  source: 'MnDOT',
  state: 'Minnesota',
  bounds: { minLat: 43.4, maxLat: 49.5, minLng: -97.3, maxLng: -89.4 },
};

export const COLORADO: Cars511xState = {
  code: 'co',
  idPrefix: 'co511',
  source: 'CDOT',
  state: 'Colorado',
  bounds: { minLat: 36.9, maxLat: 41.1, minLng: -109.1, maxLng: -102.0 },
};

/** One view of a site, as the map-features file publishes it (only the fields we read). */
export interface Cars511xView {
  type?: string | null;
  url?: string | null;
  videoPreviewUrl?: string | null;
  imageTimestamp?: number | null;
  broken?: boolean | null;
}

export interface Cars511xFeature {
  geometry?: { coordinates?: number[] | null } | null;
  properties?: {
    id?: number | string | null;
    name?: string | null;
    public?: boolean | null;
    location?: { cityReference?: string | null } | null;
    views?: Cars511xView[] | null;
  } | null;
}

const https = (url?: string | null) => {
  const trimmed = url?.trim();
  return trimmed && /^https:\/\//i.test(trimmed) ? trimmed : undefined;
};

/**
 * Where the camera is, in the site's own words: "in Shorewood" reads as the
 * town; "near Olathe" and "3 miles north of Kent" are kept as written.
 */
function place(ref: string | null | undefined, state: string): string {
  const text = ref?.trim();
  if (!text) return state;
  return text.startsWith('in ') ? text.slice(3) : text;
}

/** Map one site to a camera, or null when it has no place, or nothing to show. Exported for tests. */
export function mapCars511xFeature(f: Cars511xFeature, cfg: Cars511xState, now = Date.now()): CctvCamera | null {
  const p = f?.properties;
  if (!p || p.public === false || p.id == null) return null;
  const id = String(p.id);
  if (!/^\d+$/.test(id)) return null;

  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const b = cfg.bounds;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return null;

  const views = (p.views ?? []).filter(v => v && !v.broken);
  const live = views.find(v => v.type === 'WMP' && /\.m3u8(\?|$)/i.test(https(v.url) ?? ''));
  const stillView = views.find(v => v.type === 'STILL_IMAGE' && https(v.url)
    && !(typeof v.imageTimestamp === 'number' && now - v.imageTimestamp > STALE_MS));
  const stream = https(live?.url);
  const still = live ? https(live.videoPreviewUrl) : https(stillView?.url);
  if (!stream && !still) return null;

  return {
    id: `${cfg.idPrefix}-${id}`,
    lat,
    lng,
    name: p.name?.trim() || `${cfg.source} camera ${id}`,
    city: place(p.location?.cityReference, cfg.state),
    country: 'US',
    ...(still ? { feed_url: still } : {}),
    ...(stream ? { stream_url: stream, stream_type: 'hls' as const } : {}),
    source: cfg.source,
  };
}

/** Every camera one state publishes. Throws when the file cannot be read, so the region keeps its last good list. */
export async function loadCars511xCameras(cfg: Cars511xState): Promise<CctvCamera[]> {
  const res = await fetch(`https://api-511x-${cfg.code}.carsprogram.org/cameras/map-features`, {
    headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${cfg.source} cameras HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.features)) throw new Error(`${cfg.source} cameras: no features`);

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (const f of data.features as Cars511xFeature[]) {
    const cam = mapCars511xFeature(f, cfg, now);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }
  console.log(`[OSIRIS] ${cfg.state} cameras — ${cfg.source}: ${cams.length} (${cams.filter(c => c.stream_url).length} live)`);
  return cams;
}

export const fetchMinnesotaCameras = cachedSource('minnesota', () => loadCars511xCameras(MINNESOTA));
export const fetchColoradoCameras = cachedSource('colorado', () => loadCars511xCameras(COLORADO));

import type { CctvCamera } from './types';

/**
 * OSIRIS — Estonia's road cameras (Transpordiamet, the Transport Administration)
 *
 * Its Tark Tee traffic map reads them from a public ArcGIS layer,
 * www.tarktee.ee/tarktee/rest/services/tram/road_cameras — keyless, about 180
 * cameras at the road-weather stations on the national roads. The pictures are
 * 2592×1944 photographs, a new one roughly every ten minutes.
 *
 * Each new picture gets a new file name (`94/94_202611190326.jpg`), so, as
 * with Singapore's cameras (see ./singapore), a link written into the camera
 * list would be out of date long before the list is rebuilt. A camera's
 * feed_url is therefore FRAME_ROUTE, which looks up its current picture (one
 * shared lookup a minute) and redirects to it. A camera whose newest picture
 * is older than STALE_MS has stopped and is left off the map.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://www.tarktee.ee/tarktee/rest/services/tram/road_cameras/MapServer/0/query'
  + '?where=1%3D1&outFields=site_name,image_path,image_time&outSR=4326&f=json';
/** Where the map's pictures live; image_path is relative to it. */
const IMAGE_BASE = 'https://www.tarktee.ee/images/';
/** Where a camera's feed_url sends the browser: the current picture. */
export const FRAME_ROUTE = '/api/cctv/estonia';

/** A camera posts every ten minutes or so; three hours without a picture means it has stopped. */
export const STALE_MS = 3 * 60 * 60 * 1000;
/** How long one lookup of the current pictures is shared. */
export const LOOKUP_MS = 60 * 1000;

/** Estonia, with its islands; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 57.4, maxLat: 59.9, minLng: 21.6, maxLng: 28.3 };

/** One feature of the layer (only the fields we read). */
export interface EeCameraFeature {
  attributes?: { site_name?: string | null; image_path?: string | null; image_time?: number | null } | null;
  geometry?: { x?: number | null; y?: number | null } | null;
}

export interface EeFrame {
  number: string;
  lat: number;
  lng: number;
  site: string;
  image: string;
}

/** A camera's number: digits only, so it can never carry a path or a query. */
export function cameraNumber(raw: unknown): string | null {
  return typeof raw === 'string' && /^[1-9]\d{0,5}$/.test(raw) ? raw : null;
}

/**
 * The camera number and picture link from an image_path, only when it has the
 * layer's own shape: `<camera>/<camera>_<yyyymmddhhmm>.jpg`.
 */
export function picture(path: unknown): { number: string; image: string } | null {
  if (typeof path !== 'string') return null;
  const m = /^([1-9]\d{0,5})\/\1_\d{12}\.jpg$/.exec(path);
  return m ? { number: m[1], image: IMAGE_BASE + path } : null;
}

/** The cameras in one answer that have a place and a current picture. */
export function currentFrames(body: unknown, now = Date.now()): EeFrame[] {
  const features = (body as { features?: EeCameraFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const frames: EeFrame[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const a = f?.attributes;
    const pic = picture(a?.image_path);
    const lat = f?.geometry?.y;
    const lng = f?.geometry?.x;
    if (!a || !pic || seen.has(pic.number) || typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    if (typeof a.image_time !== 'number' || now - a.image_time > STALE_MS) continue;
    seen.add(pic.number);
    frames.push({ number: pic.number, lat, lng, site: a.site_name?.trim() || `Camera ${pic.number}`, image: pic.image });
  }
  return frames;
}

export function toCamera(frame: EeFrame): CctvCamera {
  return {
    id: `ee-${frame.number}`,
    lat: frame.lat,
    lng: frame.lng,
    name: `${frame.site} road camera`,
    city: frame.site,
    country: 'Estonia',
    feed_url: `${FRAME_ROUTE}?id=${frame.number}`,
    source: 'Transpordiamet',
  };
}

async function fetchFrames(): Promise<EeFrame[]> {
  const res = await fetch(CAMERAS_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`Tark Tee road cameras HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.features)) throw new Error('Tark Tee road cameras: no features');
  return currentFrames(body);
}

let lookup: { at: number; frames: Map<string, string> } | null = null;
let inflight: Promise<Map<string, string>> | null = null;

/**
 * Every current camera's picture link, by camera number. Looked up at most once
 * a minute, and requests that arrive meanwhile share the lookup. When a lookup
 * fails, the last one is kept for at most STALE_MS and not retried for a minute.
 */
async function currentLinks(): Promise<Map<string, string>> {
  if (lookup && Date.now() - lookup.at < LOOKUP_MS) return lookup.frames;
  inflight ??= fetchFrames()
    .then(frames => {
      lookup = { at: Date.now(), frames: new Map(frames.map(f => [f.number, f.image])) };
      return lookup.frames;
    })
    .catch(err => {
      console.warn('[OSIRIS] Estonia picture lookup failed:', err instanceof Error ? err.message : err);
      const kept = lookup && Date.now() - lookup.at < STALE_MS ? lookup.frames : new Map<string, string>();
      lookup = { at: Date.now(), frames: kept };
      return kept;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** The link to a camera's current picture, or null when it has none. */
export async function currentFrameUrl(id: string): Promise<string | null> {
  const number = cameraNumber(id);
  if (!number) return null;
  return (await currentLinks()).get(number) ?? null;
}

/** The camera list for the map. Throws when the layer cannot be read, so the region keeps its last good list. */
export async function fetchEstoniaCameras(): Promise<CctvCamera[]> {
  const frames = await fetchFrames();
  lookup = { at: Date.now(), frames: new Map(frames.map(f => [f.number, f.image])) };
  console.log(`[OSIRIS] Estonia cameras — Transpordiamet: ${frames.length}`);
  return frames.map(toCamera);
}

/** For tests: forget the last lookup. */
export function resetEstoniaLookup(): void {
  lookup = null;
  inflight = null;
}

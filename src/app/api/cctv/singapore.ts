import type { CctvCamera } from './types';

/**
 * OSIRIS — Singapore traffic cameras (Land Transport Authority, via data.gov.sg)
 *
 * One keyless JSON list gives every camera's position and the link to its
 * latest picture on images.data.gov.sg. It carried about 90 cameras until
 * July 2026 and has carried 8 since: the Woodlands and Tuas checkpoints and
 * Sentosa Gateway. LTA's own OneMotoring camera page shows the same 8.
 *
 * Each new picture gets a new link, every few minutes, so a link written into
 * the camera list is out of date long before the list is rebuilt, and the
 * viewer's refresh would keep asking for the same old picture. A camera's
 * feed_url is therefore FRAME_ROUTE, which looks up the current link (one
 * shared lookup a minute) and redirects to it.
 *
 * The list has no names. OneMotoring captions each camera "View from <place>";
 * NAMES holds those captions, read from
 * onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html
 * on 2026-11-12. A camera not in it is named by its number, never guessed.
 *
 * Data: Traffic Images from data.gov.sg, Singapore Open Data Licence v1.0
 * (https://data.gov.sg/open-data-licence).
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const TRAFFIC_IMAGES_URL = 'https://api.data.gov.sg/v1/transport/traffic-images';
/** The only place a picture link may point. */
const IMAGE_ORIGIN = 'https://images.data.gov.sg';
const IMAGE_PATH = '/api/traffic-images/';
/** Where a camera's feed_url sends the browser: the current picture. */
export const FRAME_ROUTE = '/api/cctv/singapore';

/** A camera posts every few minutes; an hour without a picture means it has stopped. */
export const STALE_MS = 60 * 60 * 1000;
/** How long one lookup of the current links is shared. */
export const LOOKUP_MS = 60 * 1000;

const NAMES: Record<string, string> = {
  '2701': 'Woodlands Causeway (Towards Johor)',
  '2702': 'Woodlands Checkpoint (Towards BKE)',
  '2704': 'Woodlands Flyover (Towards Checkpoint)',
  '4703': 'Second Link at Tuas',
  '4712': 'After Tuas West Road',
  '4713': 'Tuas Checkpoint',
  '4798': 'Sentosa Gateway (Towards Telok Blangah)',
  '4799': 'Sentosa Gateway (Towards Sentosa)',
};

/** Singapore, with its islands; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 };

/** One camera as data.gov.sg publishes it (only the fields we read). */
export interface SgCameraRow {
  camera_id?: string | number;
  timestamp?: string;
  image?: string;
  location?: { latitude?: number; longitude?: number };
}

/** A camera's number: digits only, so it can never carry a path or a query. */
export function cameraNumber(raw: unknown): string | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  return /^[1-9]\d{0,7}$/.test(text) ? text : null;
}

/** A picture link, only when it is a JPEG in data.gov.sg's traffic-image folder. */
export function pictureLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== IMAGE_ORIGIN || url.username || url.password || url.search || url.hash) return null;
  return url.pathname.startsWith(IMAGE_PATH) && /\.jpe?g$/i.test(url.pathname) ? url.href : null;
}

export interface SgFrame {
  number: string;
  lat: number;
  lng: number;
  image: string;
}

/**
 * The cameras in one data.gov.sg answer that have a place and a current
 * picture. A picture older than STALE_MS is left out: a camera that has
 * stopped is not shown as if it were live.
 */
export function currentFrames(body: unknown, now = Date.now()): SgFrame[] {
  const rows = (body as { items?: { cameras?: SgCameraRow[] }[] } | null)?.items?.[0]?.cameras;
  if (!Array.isArray(rows)) return [];
  const frames: SgFrame[] = [];
  for (const row of rows) {
    const number = cameraNumber(row?.camera_id);
    const lat = row?.location?.latitude;
    const lng = row?.location?.longitude;
    const image = pictureLink(row?.image);
    if (!number || !image || typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    const at = Date.parse(row.timestamp ?? '');
    if (!Number.isFinite(at) || now - at > STALE_MS) continue;
    frames.push({ number, lat, lng, image });
  }
  return frames;
}

export function toCamera(frame: SgFrame): CctvCamera {
  return {
    id: `sin-${frame.number}`,
    lat: frame.lat,
    lng: frame.lng,
    name: NAMES[frame.number] ?? `Camera ${frame.number}`,
    city: 'Singapore',
    country: 'Singapore',
    feed_url: `${FRAME_ROUTE}?id=${frame.number}`,
    source: 'LTA Singapore',
  };
}

async function fetchFrames(): Promise<SgFrame[]> {
  const res = await fetch(TRAFFIC_IMAGES_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`data.gov.sg traffic images HTTP ${res.status}`);
  return currentFrames(await res.json());
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
      console.warn('[OSIRIS] Singapore picture lookup failed:', err instanceof Error ? err.message : err);
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

/** The camera list for the map. Throws when data.gov.sg cannot be read, so the region keeps its last good list. */
export async function fetchSingaporeCameras(): Promise<CctvCamera[]> {
  const frames = await fetchFrames();
  lookup = { at: Date.now(), frames: new Map(frames.map(f => [f.number, f.image])) };
  return frames.map(toCamera);
}

/** For tests: forget the last lookup. */
export function resetSingaporeLookup(): void {
  lookup = null;
  inflight = null;
}

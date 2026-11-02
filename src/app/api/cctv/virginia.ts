import type { CctvCamera } from './types';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Virginia traffic cameras (VDOT 511)
 * Source: https://511.vdot.virginia.gov — the state's own 511 map.
 * ~1,700 live HLS streams statewide — NO API KEY NEEDED.
 *
 * The map is an Iteris build, not the IBI 511 stack the southern states run.
 * It reads its camera layer as one GeoJSON FeatureCollection from
 * /services/511/map/layers/map/cams (about 1.5 MB). Each feature carries the
 * position, a description, the operating jurisdiction, a snapshot and the
 * stream in several forms. `https_url` is the HLS playlist on one of VDOT's
 * eight media-sfs*.vdotcameras.com servers, all of which answer with
 * `Access-Control-Allow-Origin: *`, so the streams play in a tile as they are.
 *
 * The feed's `name` is an opaque stream key, so the label is `description`.
 */

const FEED_URL = 'https://511.vdot.virginia.gov/services/511/map/layers/map/cams';
const MAP_URL = 'https://511.vdot.virginia.gov/';

/** VDOT's streams and snapshots are all served from here; anything else is not theirs. */
const MEDIA_DOMAIN = 'vdotcameras.com';

/** Virginia, padded — anything outside is a bad coordinate. */
const VA_BOUNDS = { minLat: 36.4, maxLat: 39.6, minLng: -83.8, maxLng: -75.1 };

/** One feature from the cams layer — only the fields we consume. */
export interface VirginiaCameraFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: {
    id?: string | number | null;
    description?: string | null;
    route?: string | null;
    jurisdiction?: string | null;
    active?: boolean;
    problem_stream?: boolean;
    https_url?: string | null;
    image_url?: string | null;
  } | null;
}

/** An https URL on VDOT's own media domain, or null. */
function vdotUrl(raw: string | null | undefined, path: RegExp): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') return null;
  if (host !== MEDIA_DOMAIN && !host.endsWith('.' + MEDIA_DOMAIN)) return null;
  if (!path.test(url.pathname)) return null;
  return url.toString();
}

/** Map the cams FeatureCollection to cameras. Exported for tests. */
export function parseVirginia(payload: unknown): CctvCamera[] {
  const features = (payload as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const feature of features as VirginiaCameraFeature[]) {
    const props = feature?.properties;
    // VDOT's own flags — a camera it has switched off or marked as a problem stream stays off the map.
    if (!props || props.active === false || props.problem_stream === true) continue;

    const id = props.id != null ? String(props.id).trim() : '';
    if (!/^[\w-]+$/.test(id) || seen.has(id)) continue;

    const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    if (!Array.isArray(coords)) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < VA_BOUNDS.minLat || lat > VA_BOUNDS.maxLat) continue;
    if (lng < VA_BOUNDS.minLng || lng > VA_BOUNDS.maxLng) continue;

    const stream = vdotUrl(props.https_url, /\.m3u8$/i);
    const snapshot = vdotUrl(props.image_url, /\.(png|jpe?g)$/i);
    if (!stream && !snapshot) continue;

    seen.add(id);
    const jurisdiction = props.jurisdiction?.trim();
    cams.push({
      id: `vdot-${id}`,
      lat,
      lng,
      name: props.description?.trim() || props.route?.trim() || `VDOT Camera ${id}`,
      city: jurisdiction ? `${jurisdiction}, Virginia` : 'Virginia',
      country: 'US',
      ...(snapshot ? { feed_url: snapshot } : {}),
      ...(stream ? { stream_url: stream, stream_type: 'hls' as const } : {}),
      external_url: MAP_URL,
      source: 'VDOT',
    });
  }

  return cams;
}

async function loadVirginiaCameras(): Promise<CctvCamera[]> {
  const res = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`VDOT 511 cams layer HTTP ${res.status}`);

  const cams = parseVirginia(await res.json());
  console.log(`[OSIRIS] Virginia cameras — VDOT 511: ${cams.length}`);
  return cams;
}

export const fetchVirginiaCameras = cachedSource('virginia', loadVirginiaCameras);

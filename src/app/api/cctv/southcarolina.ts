import type { CctvCamera } from './types';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — South Carolina traffic cameras (SCDOT 511)
 * Source: https://www.511sc.org — the state's own 511 map.
 * ~800 live HLS streams statewide — NO API KEY NEEDED.
 *
 * 511SC is an Iteris build. Its map reads the camera layer as one GeoJSON
 * FeatureCollection from Iteris' CDN for the state, and each feature carries
 * the position, a description, the operating jurisdiction, a snapshot and the
 * stream in several forms. `https_url` is the HLS playlist on SCDOT's SkyVDN
 * streaming servers (s18/s19/s20.us-east-1.skyvdn.com), which answer with
 * `Access-Control-Allow-Origin: *`, so the streams play in a tile as they are.
 *
 * The feed's `name` is a short device number, so the label is `description`.
 */

const FEED_URL = 'https://sc.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson';
const MAP_URL = 'https://www.511sc.org/';

/** SCDOT's streams and snapshots are all served from here; anything else is not theirs. */
const MEDIA_DOMAIN = 'skyvdn.com';

/** South Carolina, padded — anything outside is a bad coordinate. */
const SC_BOUNDS = { minLat: 31.9, maxLat: 35.3, minLng: -83.5, maxLng: -78.4 };

/** One feature from icons.cameras.geojson — only the fields we consume. */
export interface SouthCarolinaCameraFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: {
    id?: string | number | null;
    name?: string | null;
    description?: string | null;
    route?: string | null;
    jurisdiction?: string | null;
    active?: boolean;
    problem_stream?: boolean;
    https_url?: string | null;
    image_url?: string | null;
  } | null;
}

/** An https URL on SCDOT's own media domain, or null. */
function mediaUrl(raw: string | null | undefined, path: RegExp): string | null {
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

/** Map the cameras FeatureCollection to cameras. Exported for tests. */
export function parseSouthCarolina(payload: unknown): CctvCamera[] {
  const features = (payload as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const feature of features as SouthCarolinaCameraFeature[]) {
    const props = feature?.properties;
    // SCDOT's own flags — a camera it has switched off or marked as a problem stream stays off the map.
    if (!props || props.active === false || props.problem_stream === true) continue;

    const id = props.id != null ? String(props.id).trim() : '';
    if (!/^[\w-]+$/.test(id) || seen.has(id)) continue;

    const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    if (!Array.isArray(coords)) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < SC_BOUNDS.minLat || lat > SC_BOUNDS.maxLat) continue;
    if (lng < SC_BOUNDS.minLng || lng > SC_BOUNDS.maxLng) continue;

    const stream = mediaUrl(props.https_url, /\.m3u8$/i);
    const snapshot = mediaUrl(props.image_url, /\.(png|jpe?g)$/i);
    if (!stream && !snapshot) continue;

    seen.add(id);
    const jurisdiction = props.jurisdiction?.trim();
    const device = props.name?.trim();
    cams.push({
      id: `scdot-${id}`,
      lat,
      lng,
      name: props.description?.trim() || props.route?.trim() || `SCDOT Camera ${device || id}`,
      city: jurisdiction ? `${jurisdiction}, South Carolina` : 'South Carolina',
      country: 'US',
      ...(snapshot ? { feed_url: snapshot } : {}),
      ...(stream ? { stream_url: stream, stream_type: 'hls' as const } : {}),
      external_url: MAP_URL,
      source: 'SCDOT',
    });
  }

  return cams;
}

async function loadSouthCarolinaCameras(): Promise<CctvCamera[]> {
  const res = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`SCDOT 511 cameras layer HTTP ${res.status}`);

  const cams = parseSouthCarolina(await res.json());
  console.log(`[OSIRIS] South Carolina cameras — SCDOT 511: ${cams.length}`);
  return cams;
}

export const fetchSouthCarolinaCameras = cachedSource('southcarolina', loadSouthCarolinaCameras);

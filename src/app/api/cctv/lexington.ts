import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Lexington, Kentucky traffic cameras (Lexington-Fayette Urban County
 * Government), from the layer the state's GoKY map reads:
 * services1.arcgis.com/Mg7DLdfYcSWIaDnu, Traffic_Camera_Locations_Public_view,
 * keyless. About 110 cameras at the city's intersections.
 *
 * Each camera streams to the city's Wowza server, and `still_url` asks that
 * server for a frame of the live stream: a 704×480 picture taken when it is
 * requested, served with Access-Control-Allow-Origin: *. The streams
 * themselves answer 403 to anyone but the city's player, so the map uses the
 * frames.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://services1.arcgis.com/Mg7DLdfYcSWIaDnu/ArcGIS/rest/services/Traffic_Camera_Locations_Public_view/FeatureServer/0/query'
  + '?where=1%3D1&outFields=location,still_url&returnGeometry=true&outSR=4326&f=json';
/** The only place a picture link may point: the city's Wowza thumbnail service. */
const IMAGE_PREFIX = 'https://6855e4345af72.streamlock.net:1935/thumbnail?';

/** Fayette County, padded; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 37.85, maxLat: 38.25, minLng: -84.7, maxLng: -84.25 };

/** One feature of the layer (only the fields we read). */
export interface LexingtonCameraFeature {
  attributes?: { location?: string | null; still_url?: string | null } | null;
  geometry?: { x?: number | null; y?: number | null } | null;
}

/** Map one feature, or null when it has no place or no frame link of the city's. Exported for tests. */
export function mapLexingtonCamera(f: LexingtonCameraFeature): CctvCamera | null {
  const image = f?.attributes?.still_url?.trim();
  if (!image?.startsWith(IMAGE_PREFIX)) return null;
  // `lex-cam-014.stream` → `lex-cam-014`: the stream's name is the camera's id.
  const stream = new URL(image).searchParams.get('streamname')?.replace(/\.stream$/, '');
  if (!stream || !/^[A-Za-z0-9-]+$/.test(stream)) return null;

  const { x: lng, y: lat } = f.geometry ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  return {
    id: `lexky-${stream}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: f.attributes?.location?.replace(/\s+/g, ' ').trim() || `Lexington camera ${stream}`,
    city: 'Lexington',
    country: 'US',
    feed_url: image,
    source: 'LFUCG Traffic',
  };
}

export const fetchLexingtonCameras = cachedSource('lexington', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Lexington cameras HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`Lexington cameras: ${JSON.stringify(data.error).slice(0, 200)}`);
  const features: LexingtonCameraFeature[] = Array.isArray(data?.features) ? data.features : [];
  const seen = new Set<string>();
  const cams = features
    .map(mapLexingtonCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] Lexington cameras — LFUCG: ${cams.length}`);
  return cams;
});

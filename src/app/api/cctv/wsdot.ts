import { decodeWindows1252, type CctvCamera } from './types';

/**
 * OSIRIS — Washington State DOT cameras.
 *
 * The camera file WSDOT's own travel map reads (the `cameras` entry of
 * wsdot.com/Travel/Real-time/Map/appconfig.json): an Esri feature set of about
 * 1,700 cameras, keyless, served with Access-Control-Allow-Origin: *. It
 * replaces data.wsdot.wa.gov/log/public/cameras.json, which now answers 404 —
 * that is why Washington had gone dark on the map.
 *
 * Positions come in Web Mercator (EPSG:3857). The file is Windows-1252, not
 * UTF-8: a dash in a title is the single byte 0x96. About seventy rows are
 * Oregon's TripCheck pictures, already on the map through ./oregon, and a few
 * are private webcams; only WSDOT's own pictures are kept.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://data.wsdot.wa.gov/travelcenter/Cameras.json';
/** The only place a picture link may point. */
const IMAGE_ORIGIN = 'https://images.wsdot.wa.gov/';

/** Washington, padded for the cameras that watch its border crossings. */
const BOUNDS = { minLat: 45.3, maxLat: 49.2, minLng: -125.0, maxLng: -116.0 };

/** One feature of the file (only the fields we read). */
export interface WsdotCameraFeature {
  attributes?: {
    CameraID?: number | null;
    CameraTitle?: string | null;
    CompassDirection?: string | null;
    ImageURL?: string | null;
  } | null;
  geometry?: { x?: number | null; y?: number | null } | null;
}

const EARTH_RADIUS = 6378137;

/** Web Mercator metres to degrees. */
export function fromWebMercator(x: number, y: number): { lat: number; lng: number } {
  return {
    lng: (x / EARTH_RADIUS) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI),
  };
}

/** Map one feature to a camera, or null when it is not a placed WSDOT picture. Exported for tests. */
export function mapWsdotCamera(feature: WsdotCameraFeature): CctvCamera | null {
  const a = feature?.attributes;
  const image = a?.ImageURL?.trim();
  if (!a || typeof a.CameraID !== 'number' || !image?.startsWith(IMAGE_ORIGIN)) return null;

  const { x, y } = feature.geometry ?? {};
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const { lat, lng } = fromWebMercator(x, y);
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  return {
    // The same ids the old file gave these cameras, so saved links still open them.
    id: `wsdot-${a.CameraID}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: a.CameraTitle?.replace(/\s+/g, ' ').trim() || 'WSDOT Camera',
    city: 'Washington',
    country: 'US',
    feed_url: image,
    source: 'WSDOT',
  };
}

export async function fetchWsdotCameras(): Promise<CctvCamera[]> {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`WSDOT cameras HTTP ${res.status}`);
  const data = JSON.parse(decodeWindows1252(await res.arrayBuffer()));
  const features: WsdotCameraFeature[] = Array.isArray(data?.features) ? data.features : [];
  const seen = new Set<string>();
  const cams = features
    .map(mapWsdotCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] Washington cameras — WSDOT: ${cams.length}`);
  return cams;
}

import { cachedSource } from '@/lib/sourceCache';
import { withoutCamerasNear, type CctvCamera } from './types';
import { fetchOntarioCameras } from './ontario';

/**
 * OSIRIS — York Region (Ontario) traffic cameras, at the Region's own
 * intersections north of Toronto. Ontario 511 (./ontario) has the provincial
 * highways there, and republishes fifteen of the Region's cameras on Highways
 * 7, 9 and 48; those are left to Ontario 511.
 *
 * The Region publishes them as an open-data map layer,
 * ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Traffic/MapServer/0, keyless:
 * about 390 cameras. Each picture is a still at
 * ww5.yorkmaps.ca/webtrafficimages/loc<N>.jpg, renewed every minute, from
 * 352×240 up to 1920×1080, served with Access-Control-Allow-Origin: *.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_URL = 'https://ww8.yorkmaps.ca/arcgis/rest/services/OpenData/Traffic/MapServer/0/query'
  + '?where=1%3D1&outFields=FACILITYID,photo,url,cameralocation&returnGeometry=true&outSR=4326&f=json';
/** The only place a picture may come from: the Region's camera image folder. */
const IMAGE_PREFIX = 'https://ww5.yorkmaps.ca/webtrafficimages/';
const PAGE_PREFIX = 'https://ww5.yorkmaps.ca/';

/** The Region, padded; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 43.7, maxLat: 44.45, minLng: -79.9, maxLng: -79.05 };

/** One feature of the layer (only the fields we read). */
export interface YorkCameraFeature {
  attributes?: { FACILITYID?: string | number | null; photo?: string | null; url?: string | null; cameralocation?: string | null } | null;
  geometry?: { x?: number | null; y?: number | null } | null;
}

/** Map one feature, or null when it has no place or no picture of the Region's. Exported for tests. */
export function mapYorkCamera(f: YorkCameraFeature): CctvCamera | null {
  const a = f?.attributes;
  const image = a?.photo?.trim();
  if (!image?.startsWith(IMAGE_PREFIX)) return null;
  const id = String(a?.FACILITYID ?? '').trim();
  if (!/^\d+$/.test(id)) return null;

  const { x: lng, y: lat } = f.geometry ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;

  const page = a?.url?.trim();
  return {
    id: `york-${id}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: a?.cameralocation?.replace(/\s+/g, ' ').trim() || `York Region camera ${id}`,
    city: 'York Region',
    country: 'Canada',
    feed_url: image,
    ...(page?.startsWith(PAGE_PREFIX) ? { external_url: page } : {}),
    source: 'York Region',
  };
}

export const fetchYorkRegionCameras = cachedSource('york-region', async (): Promise<CctvCamera[]> => {
  const res = await fetch(CAMERAS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`York Region cameras HTTP ${res.status}`);
  const data = await res.json();
  // ArcGIS reports a failed query inside a 200.
  if (data?.error) throw new Error(`York Region cameras: ${JSON.stringify(data.error).slice(0, 200)}`);
  const features: YorkCameraFeature[] = Array.isArray(data?.features) ? data.features : [];
  const seen = new Set<string>();
  const own = features
    .map(mapYorkCamera)
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  // Ontario 511's list is cached for the route anyway; if it is down, show them all.
  const cams = withoutCamerasNear(own, await fetchOntarioCameras().catch(() => []), 30);
  console.log(`[OSIRIS] York Region cameras: ${cams.length} (${own.length - cams.length} left to Ontario 511)`);
  return cams;
});

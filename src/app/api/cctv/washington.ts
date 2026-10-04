import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Washington CCTV Cameras (WSDOT)
 * Source: https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather
 * ~1,700 cameras statewide — NO API KEY NEEDED.
 *
 * The old file at /log/public/cameras.json is a 404. This feature service is
 * the live index. Frames are stills, mostly on images.wsdot.wa.gov, and a
 * browser cannot load them directly, so feed_url goes through the CCTV proxy.
 */

const CAMERAS_URL = 'https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,CameraTitle,ImageURL,CompassDirection&returnGeometry=true&outSR=4326&f=json&resultRecordCount=2000';

/** Washington plus the I-5 bridge cameras that sit just over the Oregon line. */
const WA_BOUNDS = { minLat: 45.5, maxLat: 49.1, minLng: -125.0, maxLng: -116.8 };

/** A browser cannot load these stills directly, so they go through the proxy. */
function proxied(url: string): string {
  return `/api/cctv/proxy?url=${encodeURIComponent(url)}`;
}

export interface WsdotFeature {
  attributes?: {
    OBJECTID?: number;
    CameraTitle?: string | null;
    ImageURL?: string | null;
    CompassDirection?: string | null;
  };
  geometry?: { x?: number; y?: number } | null;
}

/** Map one ArcGIS feature to a camera, or null if it should be skipped. Exported for tests. */
export function mapFeature(feature: WsdotFeature): CctvCamera | null {
  const a = feature?.attributes;
  if (!a || a.OBJECTID == null || !a.ImageURL?.trim()) return null;

  const lat = feature.geometry?.y;
  const lng = feature.geometry?.x;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat! < WA_BOUNDS.minLat || lat! > WA_BOUNDS.maxLat) return null;
  if (lng! < WA_BOUNDS.minLng || lng! > WA_BOUNDS.maxLng) return null;

  const direction = a.CompassDirection ? ` ${a.CompassDirection}` : '';
  return {
    id: `wsdot-${a.OBJECTID}`,
    lat: lat!,
    lng: lng!,
    name: `${(a.CameraTitle || `WSDOT Camera ${a.OBJECTID}`).trim()}${direction}`,
    city: 'Washington',
    country: 'US',
    feed_url: proxied(a.ImageURL.trim()),
    source: 'WSDOT',
  };
}

async function loadWashingtonCameras(): Promise<CctvCamera[]> {
  const res = await stealthFetch(CAMERAS_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`WSDOT HTTP ${res.status}`);

  const data = await res.json();
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const feature of data?.features || []) {
    const cam = mapFeature(feature);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }

  console.log(`[OSIRIS] Washington cameras — WSDOT: ${cams.length}`);
  return cams;
}

export const fetchWashingtonCameras = cachedSource('washington', loadWashingtonCameras);

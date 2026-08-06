import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Oregon CCTV Cameras (ODOT TripCheck)
 * Source: https://www.tripcheck.com/Scripts/map/data/cctvinventory.js
 * ~1,100 cameras statewide — NO API KEY NEEDED.
 *
 * The inventory is an Esri-style feature dump; frames are served from
 * tripcheck.com/RoadCams/cams/<filename>.
 */

const INVENTORY = 'https://www.tripcheck.com/Scripts/map/data/cctvinventory.js';
const IMAGE_BASE = 'https://tripcheck.com/RoadCams/cams';

/** Oregon bounding box — drops any stray/placeholder coordinates. */
const OR_BOUNDS = { minLat: 41.9, maxLat: 46.3, minLng: -124.6, maxLng: -116.4 };

export interface TripCheckFeature {
  attributes?: {
    cameraId?: number;
    filename?: string | null;
    latitude?: number;
    longitude?: number;
    route?: string | null;
    title?: string | null;
  };
}

/** Map one TripCheck feature to a camera, or null if unusable. Exported for tests. */
export function mapFeature(feature: TripCheckFeature): CctvCamera | null {
  const a = feature?.attributes;
  if (!a || a.cameraId == null || !a.filename) return null;

  const lat = a.latitude;
  const lng = a.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat! < OR_BOUNDS.minLat || lat! > OR_BOUNDS.maxLat) return null;
  if (lng! < OR_BOUNDS.minLng || lng! > OR_BOUNDS.maxLng) return null;

  return {
    id: `odot-${a.cameraId}`,
    lat: lat!,
    lng: lng!,
    name: (a.title || a.route || `ODOT Camera ${a.cameraId}`).trim(),
    city: (a.route || 'Oregon').trim(),
    country: 'US',
    feed_url: `${IMAGE_BASE}/${a.filename}`,
    source: 'ODOT TripCheck',
  };
}

async function loadOregonCameras(): Promise<CctvCamera[]> {
  // TripCheck 406s on a specific JSON Accept header — it only serves `*/*`.
  const res = await stealthFetch(INVENTORY, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`TripCheck HTTP ${res.status}`);

  const data = JSON.parse(await res.text());
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const feature of data?.features || []) {
    const cam = mapFeature(feature);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }

  console.log(`[OSIRIS] Oregon cameras — ODOT TripCheck: ${cams.length}`);
  return cams;
}

export const fetchOregonCameras = cachedSource('oregon', loadOregonCameras);

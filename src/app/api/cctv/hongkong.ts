import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — Hong Kong CCTV Cameras (Transport Department)
 * Source: https://data.gov.hk — Traffic Snapshot Images
 *   Location index: static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml
 *   Snapshots:      tdcctv.data.one.gov.hk/<key>.JPG
 * ~1,000 cameras with published WGS84 coordinates — NO API KEY NEEDED.
 *
 * The XML index is the authoritative list; CURATED_FALLBACK is only used when
 * data.gov.hk is unreachable, so the layer never goes fully dark.
 */

const LOCATIONS_XML =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml';

/** Hong Kong SAR bounding box — drops any mis-projected coordinates. */
const HK_BOUNDS = { minLat: 22.1, maxLat: 22.6, minLng: 113.8, maxLng: 114.5 };

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]) : '';
}

/** Parse the TD location index into cameras. Exported for tests. */
export function parseTdXml(xml: string): CctvCamera[] {
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const block of xml.split('<image>').slice(1)) {
    const key = tag(block, 'key');
    const url = tag(block, 'url');
    const lat = parseFloat(tag(block, 'latitude'));
    const lng = parseFloat(tag(block, 'longitude'));

    if (!key || !url || seen.has(key)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < HK_BOUNDS.minLat || lat > HK_BOUNDS.maxLat) continue;
    if (lng < HK_BOUNDS.minLng || lng > HK_BOUNDS.maxLng) continue;
    seen.add(key);

    // "Aberdeen Praya Road near Fish Market [H429F]" -> drop the trailing key
    const name = tag(block, 'description').replace(/\s*\[[^\]]*\]\s*$/, '');

    cams.push({
      id: `hk-${key}`,
      lat,
      lng,
      name: name || `HK Camera ${key}`,
      city: tag(block, 'district') || tag(block, 'region') || 'Hong Kong',
      country: 'Hong Kong',
      feed_url: url,
      source: 'HK Transport Dept',
    });
  }

  return cams;
}

async function fetchTdCameras(): Promise<CctvCamera[]> {
  try {
    const res = await stealthFetch(LOCATIONS_XML, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/xml,text/xml' },
    });
    if (!res.ok) return [];
    return parseTdXml(await res.text());
  } catch {
    return [];
  }
}

/** Minimal static set used only when the data.gov.hk index is unavailable. */
const CURATED_FALLBACK = [
  { id: 'K101', lat: 22.3372, lng: 114.1542, name: 'Kwai Chung Rd / Container Port Rd', area: 'Kwai Chung' },
  { id: 'K110', lat: 22.3186, lng: 114.1682, name: 'West Kowloon Highway', area: 'West Kowloon' },
  { id: 'K201', lat: 22.2833, lng: 114.1551, name: 'Cross-Harbour Tunnel (Kowloon)', area: 'Hung Hom' },
  { id: 'H101', lat: 22.2802, lng: 114.1544, name: 'Cross-Harbour Tunnel (HK Island)', area: 'Causeway Bay' },
  { id: 'H202', lat: 22.2826, lng: 114.1422, name: 'Connaught Rd Central', area: 'Central' },
  { id: 'H203', lat: 22.2866, lng: 114.1364, name: 'Western Harbour Crossing', area: 'Sheung Wan' },
  { id: 'N101', lat: 22.3737, lng: 114.1125, name: 'Tuen Mun Highway', area: 'Tuen Mun' },
  { id: 'T103', lat: 22.3142, lng: 113.9435, name: 'Tsing Ma Bridge', area: 'Tsing Yi' },
  { id: 'BC105', lat: 22.3194, lng: 114.1695, name: 'Nathan Rd - Mong Kok', area: 'Mong Kok' },
  { id: 'BC106', lat: 22.3078, lng: 114.1717, name: 'Nathan Rd - Tsim Sha Tsui', area: 'Tsim Sha Tsui' },
];

export async function fetchHongKongCameras(): Promise<CctvCamera[]> {
  const td = await fetchTdCameras();
  if (td.length > 0) {
    console.log(`[OSIRIS] Hong Kong cameras — TD index: ${td.length}`);
    return td;
  }

  console.warn('[OSIRIS] Hong Kong TD index unavailable — using curated fallback');
  return CURATED_FALLBACK.map((cam) => ({
    id: `hk-${cam.id}`,
    lat: cam.lat,
    lng: cam.lng,
    name: cam.name,
    city: cam.area,
    country: 'Hong Kong',
    feed_url: `https://tdcctv.data.one.gov.hk/${cam.id}F.JPG`,
    source: 'HK Transport Dept',
  }));
}

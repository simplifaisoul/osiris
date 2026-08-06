import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Michigan CCTV Cameras (MDOT MiDrive)
 * Source: https://mdotjboss.state.mi.us/MiDrive/camera/list
 * ~800 cameras statewide — NO API KEY NEEDED.
 *
 * MiDrive returns JSON whose fields carry rendered HTML rather than plain
 * values: coordinates live in the `county` "Go to" link and the frame URL in
 * the `image` <img src>. Both are extracted below.
 */

const CAMERA_LIST = 'https://mdotjboss.state.mi.us/MiDrive/camera/list';

/** Michigan bounding box — drops any stray/placeholder coordinates. */
const MI_BOUNDS = { minLat: 41.6, maxLat: 48.3, minLng: -90.5, maxLng: -82.1 };

export interface MiDriveRecord {
  route?: string | null;
  county?: string | null;
  location?: string | null;
  direction?: string | null;
  image?: string | null;
}

/** Drop anchors wholesale (the "Go to" link) before stripping remaining tags. */
function stripHtml(s: string): string {
  return s
    .replace(/<a\b[\s\S]*?<\/a>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map one MiDrive record to a camera, or null if unusable. Exported for tests. */
export function mapRecord(rec: MiDriveRecord): CctvCamera | null {
  const county = rec?.county || '';
  const image = rec?.image || '';

  const coords = county.match(/lat=(-?[\d.]+)&(?:amp;)?lon=(-?[\d.]+)/);
  const src = image.match(/src="(https?:\/\/[^"]+)"/);
  const idMatch = county.match(/[?&]id=(\d+)/);
  if (!coords || !src || !idMatch) return null;

  const lat = parseFloat(coords[1]);
  const lng = parseFloat(coords[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < MI_BOUNDS.minLat || lat > MI_BOUNDS.maxLat) return null;
  if (lng < MI_BOUNDS.minLng || lng > MI_BOUNDS.maxLng) return null;

  const route = (rec.route || '').trim();
  const location = (rec.location || '').trim();
  const name = [route, location].filter(Boolean).join(' ').trim();

  return {
    id: `mdot-${idMatch[1]}`,
    lat,
    lng,
    name: name || `MDOT Camera ${idMatch[1]}`,
    city: stripHtml(county) || 'Michigan',
    country: 'US',
    feed_url: src[1],
    source: 'MDOT MiDrive',
  };
}

async function loadMichiganCameras(): Promise<CctvCamera[]> {
  const res = await stealthFetch(CAMERA_LIST, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`MiDrive HTTP ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('MiDrive returned a non-array payload');

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const rec of data) {
    const cam = mapRecord(rec);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }

  console.log(`[OSIRIS] Michigan cameras — MDOT MiDrive: ${cams.length}`);
  return cams;
}

export const fetchMichiganCameras = cachedSource('michigan', loadMichiganCameras);

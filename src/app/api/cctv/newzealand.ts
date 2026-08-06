import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — New Zealand CCTV Cameras (NZTA Waka Kotahi)
 * Source: https://trafficnz.info/service/traffic/rest/4/cameras/all
 * ~320 state-highway cameras nationwide — NO API KEY NEEDED.
 *
 * Cameras flagged <offline> or <underMaintenance> are skipped so the map only
 * carries feeds that actually resolve to a frame.
 */

const CAMERAS_XML = 'https://trafficnz.info/service/traffic/rest/4/cameras/all';
const BASE = 'https://trafficnz.info';

/** New Zealand bounding box (incl. Chatham Is. longitude wrap is not needed — NZTA publishes mainland only). */
const NZ_BOUNDS = { minLat: -47.5, maxLat: -34, minLng: 166, maxLng: 179 };

/** Blocks nested inside <camera> that repeat <id>/<name> and would confuse a flat scan. */
const NESTED = /<(journey|journeyLeg|region|way)>[\s\S]*?<\/\1>/g;

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

/** Parse the NZTA camera feed. Exported for tests. */
export function parseNzXml(xml: string): CctvCamera[] {
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const raw of xml.split('<camera>').slice(1)) {
    const block = raw.split('</camera>')[0];

    // <region> is the only nested block we want a value from
    const regionMatch = block.match(/<region>[\s\S]*?<\/region>/);
    const region = regionMatch ? tag(regionMatch[0], 'name') : '';

    const flat = block.replace(NESTED, '');

    const id = tag(flat, 'id');
    const imageUrl = tag(flat, 'imageUrl');
    const lat = parseFloat(tag(flat, 'latitude'));
    const lng = parseFloat(tag(flat, 'longitude'));

    if (!id || !imageUrl || seen.has(id)) continue;
    if (tag(flat, 'offline') === 'true' || tag(flat, 'underMaintenance') === 'true') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < NZ_BOUNDS.minLat || lat > NZ_BOUNDS.maxLat) continue;
    if (lng < NZ_BOUNDS.minLng || lng > NZ_BOUNDS.maxLng) continue;
    seen.add(id);

    const name = tag(flat, 'name') || tag(flat, 'description') || `NZTA Camera ${id}`;
    const direction = tag(flat, 'direction');

    cams.push({
      id: `nz-${id}`,
      lat,
      lng,
      name: direction && direction !== 'NA' ? `${name} (${direction})` : name,
      city: region || 'New Zealand',
      country: 'New Zealand',
      feed_url: `${BASE}${imageUrl}`,
      external_url: `${BASE}/camera/view/${id}`,
      source: 'NZTA',
    });
  }

  return cams;
}

async function loadNewZealandCameras(): Promise<CctvCamera[]> {
  const res = await stealthFetch(CAMERAS_XML, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/xml,text/xml' },
  });
  if (!res.ok) throw new Error(`NZTA HTTP ${res.status}`);

  const cams = parseNzXml(await res.text());
  console.log(`[OSIRIS] New Zealand cameras — NZTA: ${cams.length}`);
  return cams;
}

export const fetchNewZealandCameras = cachedSource('newzealand', loadNewZealandCameras);

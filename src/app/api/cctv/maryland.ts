import type { CctvCamera } from './types';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Maryland traffic cameras (MDOT SHA CHART)
 * Source: https://chart.maryland.gov — the state's Coordinated Highways Action
 * Response Team, which also runs 511 (md511.maryland.gov redirects here).
 * ~550 live HLS streams statewide — NO API KEY NEEDED.
 *
 * CHART publishes its cameras as an official data feed, documented on
 * https://chart.maryland.gov/DataFeeds/GetDataFeeds. Each row carries the
 * position, a name and description, a region, a status and `cctvIp`, the
 * streaming server the camera lives on. CHART's own player plays
 *
 *   https://{cctvIp}/rtplive/{id}/playlist.m3u8
 *
 * and those servers answer with `Access-Control-Allow-Origin: *`, so the
 * streams play in a tile as they are.
 *
 * Every camera in the feed is kept, whatever its `opStatus` or `commMode`:
 * a camera CHART reports as failing usually still answers, and when it does
 * not the viewer says so.
 */

const FEED_URL = 'https://chartexp1.sha.maryland.gov/CHARTExportClientService/getCameraMapDataJSON.do';
const PLAYER_PREFIX = 'https://chart.maryland.gov/Video/GetVideo/';

/** CHART's streaming servers are strmrN.sha.maryland.gov; anything else is not theirs. */
const STREAM_HOST = /^[a-z0-9-]+\.sha\.maryland\.gov$/;

/** Maryland, padded — anything outside is a bad coordinate. */
const MD_BOUNDS = { minLat: 37.85, maxLat: 39.8, minLng: -79.55, maxLng: -74.95 };

/** CHART's region names, where the raw one reads oddly as a place. */
const REGION_LABELS: Record<string, string> = {
  'Wash. DC': 'Washington DC area',
  'Western MD': 'Western Maryland',
  'Southern MD': 'Southern Maryland',
};

/** "<region>, Maryland", unless the region already names the state. */
function regionLabel(region: string | undefined): string {
  if (!region) return 'Maryland';
  const label = REGION_LABELS[region] ?? region;
  return /maryland/i.test(label) ? label : `${label}, Maryland`;
}

/** One row from getCameraMapDataJSON.do — only the fields we consume. */
export interface MarylandCameraRecord {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  cctvIp?: string | null;
  lat?: number | null;
  lon?: number | null;
  cameraCategories?: string[] | null;
  publicVideoURL?: string | null;
  opStatus?: string | null;
  commMode?: string | null;
}

/** A camera's label: its name, unless CHART left that as a bare device number. */
function cameraName(rec: MarylandCameraRecord, id: string): string {
  const name = rec.name?.trim() ?? '';
  const description = rec.description?.trim() ?? '';
  if (name && !/^\d+$/.test(name)) return name;
  return description || name || `CHART Camera ${id.slice(0, 8)}`;
}

/** Map the camera feed to cameras. Exported for tests. */
export function parseMaryland(payload: unknown): CctvCamera[] {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const rec of rows as MarylandCameraRecord[]) {
    if (!rec) continue;

    const id = (rec.id ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(id) || seen.has(id)) continue;

    const host = (rec.cctvIp ?? '').trim().toLowerCase();
    if (!STREAM_HOST.test(host)) continue;

    const lat = Number(rec.lat);
    const lng = Number(rec.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < MD_BOUNDS.minLat || lat > MD_BOUNDS.maxLat) continue;
    if (lng < MD_BOUNDS.minLng || lng > MD_BOUNDS.maxLng) continue;

    seen.add(id);
    const region = rec.cameraCategories?.[0]?.trim();
    const player = rec.publicVideoURL?.trim();

    cams.push({
      id: `chart-${id}`,
      lat,
      lng,
      name: cameraName(rec, id),
      city: regionLabel(region),
      country: 'US',
      stream_url: `https://${host}/rtplive/${id}/playlist.m3u8`,
      stream_type: 'hls',
      external_url: player?.startsWith(PLAYER_PREFIX) ? player : `${PLAYER_PREFIX}${id}`,
      source: 'MDOT SHA CHART',
    });
  }

  return cams;
}

async function loadMarylandCameras(): Promise<CctvCamera[]> {
  const res = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`CHART camera feed HTTP ${res.status}`);

  const cams = parseMaryland(await res.json());
  console.log(`[OSIRIS] Maryland cameras — CHART: ${cams.length}`);
  return cams;
}

export const fetchMarylandCameras = cachedSource('maryland', loadMarylandCameras);

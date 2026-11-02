import type { CctvCamera } from './types';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Delaware traffic cameras (DelDOT Transportation Management Center)
 * Source: https://deldot.gov/map/ — the state's own traffic map.
 * ~360 live HLS streams across New Castle, Kent and Sussex — NO API KEY NEEDED.
 *
 * The map reads a single JSON list from the TMC, which carries every camera's
 * position, title and stream addresses. Each row offers the same stream in
 * several forms; `m3u8s` is the HTTPS playlist on video.deldot.gov, which
 * answers with `Access-Control-Allow-Origin: *`, so it plays in a tile as it
 * is. The plain-http `m3u8` on port 1935 would be blocked as mixed content.
 *
 * The map page itself sits behind a firewall that turns away scripted
 * requests; the JSON list does not, and needs no spoofed headers.
 */

const FEED_URL = 'https://tmc.deldot.gov/json/videocamera.json';
const MAP_URL = 'https://deldot.gov/map/';

/** DelDOT's streams are all served from here; anything else is not theirs. */
const STREAM_HOST = 'video.deldot.gov';

/** Delaware, padded — anything outside is a bad coordinate. */
const DE_BOUNDS = { minLat: 38.4, maxLat: 39.9, minLng: -75.85, maxLng: -74.95 };

/** One row from videocamera.json — only the fields we consume. */
export interface DelawareCameraRecord {
  id?: string;
  title?: string | null;
  county?: string | null;
  lat?: number | null;
  lon?: number | null;
  enabled?: boolean;
  status?: string | null;
  urls?: {
    m3u8s?: string | null;
    m3u8?: string | null;
  } | null;
}

/** The HTTPS playlist, if it is one of DelDOT's own; null otherwise. */
function streamUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== STREAM_HOST) return null;
  if (!/\.m3u8$/i.test(url.pathname)) return null;
  // The feed spells out :443; the URL is the same without it.
  if (url.port === '443') url.port = '';
  return url.toString();
}

/** Map the videocamera.json payload to cameras. Exported for tests. */
export function parseDelaware(payload: unknown): CctvCamera[] {
  const rows = (payload as { videoCameras?: unknown } | null)?.videoCameras;
  if (!Array.isArray(rows)) return [];

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const row of rows as DelawareCameraRecord[]) {
    // DelDOT's own flags — a camera it has switched off or marked unavailable stays off the map.
    if (!row || row.enabled === false || row.status !== 'Active') continue;

    const id = (row.id ?? '').trim();
    if (!/^[\w-]+$/.test(id) || seen.has(id)) continue;

    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < DE_BOUNDS.minLat || lat > DE_BOUNDS.maxLat) continue;
    if (lng < DE_BOUNDS.minLng || lng > DE_BOUNDS.maxLng) continue;

    const stream = streamUrl(row.urls?.m3u8s);
    if (!stream) continue;

    seen.add(id);
    cams.push({
      id: `deldot-${id}`,
      lat,
      lng,
      name: row.title?.trim() || `DelDOT Camera ${id}`,
      city: row.county?.trim() ? `${row.county.trim()} County, Delaware` : 'Delaware',
      country: 'US',
      stream_url: stream,
      stream_type: 'hls',
      external_url: MAP_URL,
      source: 'DelDOT',
    });
  }

  return cams;
}

async function loadDelawareCameras(): Promise<CctvCamera[]> {
  const res = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`DelDOT videocamera.json HTTP ${res.status}`);

  const cams = parseDelaware(await res.json());
  console.log(`[OSIRIS] Delaware cameras — DelDOT: ${cams.length}`);
  return cams;
}

export const fetchDelawareCameras = cachedSource('delaware', loadDelawareCameras);

import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';
import { buildQuery, parseWkt } from './ibi511';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Louisiana CCTV Cameras (LADOTD / 511la.org)
 * Source: https://511la.org — the same IBI 511 stack Utah and Nevada run on
 * Data endpoint: /List/GetData/Cameras (DataTables, 100 rows/page)
 * 336 statewide traffic cameras — NO API KEY NEEDED.
 *
 * 511LA's documented REST API wants a developer key and throttles to ten calls
 * a minute. The list page its own browser uses does not: `/List/GetData/`
 * takes the DataTables state as a JSON `query` parameter and hands back every
 * field, coordinates included. That is what this reads.
 *
 * Every row carries both a JPEG at /map/Cctv/{id} and an HLS playlist on one
 * of three `*.dotd.la.gov` edges, so these come up as video tiles with a
 * snapshot behind them.
 *
 * This fills in I-10, I-12, I-20, I-49 and the New Orleans and Baton Rouge
 * approaches — the stretch of the Gulf coast the map had nothing on.
 */

const BASE = 'https://511la.org';
const PAGE_SIZE = 100; // the server caps a response at 100 rows whatever we ask for
const MAX_PAGES = 10; // safety bound (~1000 cameras) so a bad total can't fan out forever

/** Louisiana bounding box — drops any mis-geocoded rows. */
const LA_BOUNDS = { minLat: 28.8, maxLat: 33.1, minLng: -94.2, maxLng: -88.6 };

/** One row from /List/GetData/Cameras (only the fields we consume). */
export interface LouisianaCameraRecord {
  id: number;
  roadway?: string | null;
  location?: string | null;
  latLng?: { geography?: { wellKnownText?: string | null } | null } | null;
  images?: Array<{
    id?: number;
    description?: string | null;
    imageUrl?: string | null;
    videoUrl?: string | null;
    blocked?: boolean;
    disabled?: boolean;
    videoDisabled?: boolean;
  }> | null;
}

/** Map a raw record to a CctvCamera, or null if it should be skipped. */
export function mapRecord(rec: LouisianaCameraRecord): CctvCamera | null {
  if (!rec || typeof rec.id !== 'number') return null;

  const img = rec.images?.[0];
  if (!img || img.blocked || img.disabled) return null;

  const coords = parseWkt(rec.latLng?.geography?.wellKnownText);
  if (!coords) return null;

  const { lat, lng } = coords;
  if (lat < LA_BOUNDS.minLat || lat > LA_BOUNDS.maxLat) return null;
  if (lng < LA_BOUNDS.minLng || lng > LA_BOUNDS.maxLng) return null;

  /* The opposite of Nevada's problem: here `location` is a real cross-street
     on all 336 ("I-20 at Greenwood Road (US 79)"), while `description` is
     usually a sentence about which way the traffic runs. So the caption is the
     fallback, not the label.

     "N/A" has to drop out during the pick rather than after it — the platform
     writes that string into whichever field it has nothing for, and it is
     truthy enough to end the chain and lose the fields behind it. */
  const name = [rec.location, rec.roadway, img.description]
    .map(v => v?.trim())
    .find(v => v && v !== 'N/A');

  const snapshot = img.imageUrl ? `${BASE}${img.imageUrl}` : undefined;
  /* One row (I-12 at LA 21) puts a `/snapshots?…&ext=.jpg` address in
     `videoUrl` rather than a playlist, and it answers with a JPEG. Requiring
     .m3u8 leaves that camera on its snapshot instead of handing the player
     something it cannot read. */
  const video = img.videoDisabled ? undefined : hlsUrl(img.videoUrl);
  if (!snapshot && !video) return null;

  return {
    id: `ladotd-${rec.id}`,
    lat,
    lng,
    name: name || `LADOTD Camera ${rec.id}`,
    city: 'Louisiana',
    country: 'US',
    ...(snapshot ? { feed_url: snapshot } : {}),
    ...(video ? { stream_url: video, stream_type: 'hls' as const } : {}),
    source: 'LADOTD',
  };
}

/** The video address, but only when it is actually an HLS playlist. */
function hlsUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /\.m3u8(\?|$)/i.test(trimmed) ? trimmed : undefined;
}

async function fetchPage(start: number): Promise<{ rows: LouisianaCameraRecord[]; total: number }> {
  const url = `${BASE}/List/GetData/Cameras?query=${buildQuery(start, PAGE_SIZE)}&lang=en`;
  const res = await stealthFetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`LADOTD HTTP ${res.status}`);
  const data = await res.json();
  return {
    rows: Array.isArray(data?.data) ? data.data : [],
    total: Number(data?.recordsTotal) || 0,
  };
}

async function loadLouisianaCameras(): Promise<CctvCamera[]> {
  // The first page also tells us how many there are in total.
  const first = await fetchPage(0);
  const seen = new Map<number, CctvCamera>();

  const ingest = (rows: LouisianaCameraRecord[]) => {
    for (const rec of rows) {
      const cam = mapRecord(rec);
      if (cam) seen.set(rec.id, cam);
    }
  };
  ingest(first.rows);

  const starts: number[] = [];
  for (let s = PAGE_SIZE; s < first.total && s < PAGE_SIZE * MAX_PAGES; s += PAGE_SIZE) {
    starts.push(s);
  }
  const results = await Promise.allSettled(starts.map(s => fetchPage(s)));
  for (const r of results) {
    if (r.status === 'fulfilled') ingest(r.value.rows);
  }

  const cams = [...seen.values()];
  console.log(`[OSIRIS] Louisiana cameras — LADOTD: ${cams.length}`);
  return cams;
}

export const fetchLouisianaCameras = cachedSource('louisiana', loadLouisianaCameras);

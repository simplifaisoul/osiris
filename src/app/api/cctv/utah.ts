import { stealthFetch } from '@/lib/stealthFetch';
import type { CctvCamera } from './types';
/* Shared with Nevada — both states run the same IBI 511 platform. */
import { buildQuery, parseWkt } from './ibi511';

export { buildQuery, parseWkt };

/**
 * OSIRIS — Utah CCTV Cameras (UDOT Traffic / udottraffic.utah.gov)
 * Source: https://prod-ut.ibi511.com — IBI 511 traveler-information system
 * Data endpoint: /List/GetData/Cameras (DataTables, server-side, 100 rows/page)
 * ~2,000 statewide traffic cameras — NO API KEY NEEDED
 *
 * Each camera exposes a live JPEG/PNG snapshot at /map/Cctv/{id}.
 */

const BASE = 'https://prod-ut.ibi511.com';
const PAGE_SIZE = 100; // server caps each response at 100 rows regardless of length
const MAX_PAGES = 40; // safety bound (~4000 cameras) so a runaway total can't fan out forever

// Utah bounding box (with a small margin) used to drop any mis-geocoded rows
const UTAH_BOUNDS = { minLat: 36.9, maxLat: 42.1, minLng: -114.2, maxLng: -108.9 };

/** One row from /List/GetData/Cameras (only the fields we consume). */
export interface UtahCameraRecord {
  id: number;
  location?: string | null;
  roadway?: string | null;
  latLng?: { geography?: { wellKnownText?: string | null } | null } | null;
  images?: Array<{
    imageUrl?: string | null;
    blocked?: boolean;
    disabled?: boolean;
    videoDisabled?: boolean;
  }> | null;
}

/** Map a raw record to a CctvCamera, or null if it should be skipped. */
export function mapRecord(rec: UtahCameraRecord): CctvCamera | null {
  if (!rec || typeof rec.id !== 'number') return null;

  const img = rec.images?.[0];
  if (!img || img.blocked || img.disabled) return null;

  const coords = parseWkt(rec.latLng?.geography?.wellKnownText);
  if (!coords) return null;

  const { lat, lng } = coords;
  if (
    lat < UTAH_BOUNDS.minLat || lat > UTAH_BOUNDS.maxLat ||
    lng < UTAH_BOUNDS.minLng || lng > UTAH_BOUNDS.maxLng
  ) {
    return null;
  }

  return {
    id: `udot-${rec.id}`,
    lat,
    lng,
    name: rec.location || rec.roadway || 'UDOT Traffic Camera',
    city: 'Utah',
    country: 'US',
    feed_url: `${BASE}/map/Cctv/${rec.id}`,
    source: 'UDOT',
  };
}

async function fetchPage(start: number): Promise<UtahCameraRecord[]> {
  const url = `${BASE}/List/GetData/Cameras?query=${buildQuery(start, PAGE_SIZE)}&lang=en-US`;
  const res = await stealthFetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchUtahCameras(): Promise<CctvCamera[]> {
  try {
    // First page tells us the total record count.
    const firstUrl = `${BASE}/List/GetData/Cameras?query=${buildQuery(0, PAGE_SIZE)}&lang=en-US`;
    const firstRes = await stealthFetch(firstUrl, {
      signal: AbortSignal.timeout(12000),
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    });
    if (!firstRes.ok) return [];
    const firstData = await firstRes.json();

    const total = Number(firstData?.recordsTotal) || 0;
    const seen = new Map<number, CctvCamera>();

    const ingest = (rows: UtahCameraRecord[]) => {
      for (const rec of rows) {
        const cam = mapRecord(rec);
        if (cam) seen.set(rec.id, cam);
      }
    };

    ingest(Array.isArray(firstData?.data) ? firstData.data : []);

    // Remaining pages, fetched in parallel.
    const starts: number[] = [];
    for (let start = PAGE_SIZE; start < total && start < PAGE_SIZE * MAX_PAGES; start += PAGE_SIZE) {
      starts.push(start);
    }

    const results = await Promise.allSettled(starts.map(fetchPage));
    for (const r of results) {
      if (r.status === 'fulfilled') ingest(r.value);
    }

    return [...seen.values()];
  } catch {
    return [];
  }
}

import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Ohio CCTV Cameras (ODOT / OHGO)
 * Source: https://publicapi.ohgo.com — ODOT's documented public API
 * ~1,120 cameras statewide. **Needs a free API key**, unlike every other
 * camera source here: https://publicapi.ohgo.com/accounts/registration takes
 * an email and a password, collects no personal information, and issues the
 * key immediately. Set `OHGO_API_KEY` to switch the layer on; leave it unset
 * and Ohio is simply absent, the same way the other optional keys behave.
 *
 * Ohio is not on the IBI 511 stack the other states share — it is ODOT's own
 * API — so this reads it directly rather than through `loadIbi511Cameras`.
 * `page-all=true` returns the whole set in one response, so there is no paging
 * loop to lose pages in.
 *
 * Snapshot-only: every row is a single fixed view on
 * `itscameras.dot.state.oh.us`, refreshed every 5 seconds. No video is
 * published. `direction` reads "View" on all 1,119 rows and `description` and
 * `mainRoute` both repeat `location` verbatim, so only `location` is worth
 * reading — it already carries the road and cross street.
 *
 * ODOT publishes no city, so cameras caption as "Ohio", the same as Idaho,
 * Alaska and Alberta. The API does expose a `region` filter (akron,
 * cincinnati, cleveland, columbus, dayton, toledo, and the five compass
 * regions) if authoritative city captions are ever wanted — that would be
 * ODOT's own classification rather than an inference drawn from the image
 * path, which is the only other thing that hints at a city.
 */

const ENDPOINT = 'https://publicapi.ohgo.com/api/v1/cameras?page-all=true';

/** Ohio bounding box — drops any mis-geocoded row. */
const OH_BOUNDS = { minLat: 38.3, maxLat: 42.4, minLng: -85.0, maxLng: -80.4 };

/** One camera site from /api/v1/cameras — only the fields we consume. */
export interface OhgoCameraRecord {
  id?: string;
  latitude?: number;
  longitude?: number;
  location?: string | null;
  description?: string | null;
  cameraViews?: Array<{
    direction?: string | null;
    smallUrl?: string | null;
    largeUrl?: string | null;
    mainRoute?: string | null;
  }> | null;
}

/** Map a raw record to a camera, or null if it should be skipped. */
export function mapOhgoRecord(rec: OhgoCameraRecord): CctvCamera | null {
  if (!rec || typeof rec.id !== 'string' || !rec.id.trim()) return null;

  const { latitude: lat, longitude: lng } = rec;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const b = OH_BOUNDS;
  if (lat! < b.minLat || lat! > b.maxLat || lng! < b.minLng || lng! > b.maxLng) return null;

  /* smallUrl and largeUrl are the same address on every row ODOT publishes;
     prefer the large one so a change to that stays harmless. */
  const view = rec.cameraViews?.[0];
  const image = view?.largeUrl?.trim() || view?.smallUrl?.trim();
  if (!image) return null;

  const name = rec.location?.trim() || rec.description?.trim() || view?.mainRoute?.trim();

  return {
    id: `ohgo-${rec.id}`,
    lat: lat!,
    lng: lng!,
    name: name && name !== 'N/A' ? name : `ODOT Camera ${rec.id}`,
    city: 'Ohio',
    country: 'US',
    feed_url: image,
    stream_type: 'jpg',
    source: 'ODOT',
  };
}

async function loadOhioCameras(): Promise<CctvCamera[]> {
  const key = process.env.OHGO_API_KEY?.trim();
  // No key, no layer. Ohio is absent rather than broken, and nothing else in
  // the map is affected.
  if (!key) return [];

  /* Plain fetch, not stealthFetch: this request is authenticated with a key
     ODOT issued to us, so spoofing a residential address on top of it would
     be both pointless and rude to an agency that asked only for an email. */
  const res = await fetch(ENDPOINT, {
    headers: { Authorization: `APIKEY ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OHGO HTTP ${res.status}`);

  const data = await res.json();
  const rows: OhgoCameraRecord[] = Array.isArray(data?.results) ? data.results : [];
  const total = Number(data?.totalResultCount) || 0;

  /* Same rule as the 511 loader: a short read is a failed refresh, not a
     smaller state, and it is ROWS that tell us so. `page-all=true` should hand
     back the whole set in one response, so anything materially short of
     `totalResultCount` means we did not get what ODOT sent. Throwing leaves
     sourceCache serving the last good index instead of caching the gap. */
  if (total > 0 && rows.length < total * 0.95) {
    throw new Error(`OHGO short read: ${rows.length} of ${total} rows`);
  }

  const seen = new Map<string, CctvCamera>();
  for (const rec of rows) {
    const cam = mapOhgoRecord(rec);
    if (cam) seen.set(cam.id, cam);
  }

  const cams = [...seen.values()];
  console.log(`[OSIRIS] ODOT cameras: ${cams.length} from ${rows.length} of ${total} rows`);
  return cams;
}

export const fetchOhioCameras = cachedSource('ohio', loadOhioCameras);

import { stealthFetch } from '@/lib/stealthFetch';
import type { CctvCamera } from './types';

/**
 * OSIRIS — helpers for the IBI 511 traveler-information platform.
 *
 * Several state DOTs run the same vendor stack behind different domains, and
 * they all expose cameras the same way: a DataTables endpoint at
 * `/List/GetData/Cameras` that pages 100 rows at a time, with each row's
 * position as WKT. Utah and Nevada read the query builder and WKT parser from
 * here; Florida, Georgia, North Carolina and Arizona read the whole loader.
 *
 * Each of those four publishes the same record shape, so the only thing that
 * differs between them is the domain, the bounding box, and the wording of
 * their `location` column — which `cameraLabel` handles for all of them.
 */

/** Build the URL-encoded DataTables `query` parameter for a given page. */
export function buildQuery(start: number, length: number): string {
  const query = {
    columns: [
      { data: null, name: '' },
      { name: 'sortOrder', s: true },
      { name: 'roadway', s: true },
      { data: 3, name: '' },
    ],
    order: [{ column: 1, dir: 'asc' }],
    start,
    length,
    search: { value: '' },
  };
  return encodeURIComponent(JSON.stringify(query));
}

/** Parse a `POINT (lng lat)` WKT string into coordinates. */
export function parseWkt(wkt?: string | null): { lat: number; lng: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** One row from /List/GetData/Cameras — only the fields we consume. */
export interface Ibi511Record {
  id: number;
  roadway?: string | null;
  direction?: string | null;
  location?: string | null;
  city?: string | null;
  county?: string | null;
  latLng?: { geography?: { wellKnownText?: string | null } | null } | null;
  images?: Array<{
    description?: string | null;
    imageUrl?: string | null;
    videoUrl?: string | null;
    /** True when the playlist needs a session the map cannot obtain. */
    isVideoAuthRequired?: boolean;
    blocked?: boolean;
    disabled?: boolean;
    videoDisabled?: boolean;
  }> | null;
}

/** What separates one state's deployment from another's. */
export interface Ibi511Source {
  /** Origin, e.g. `https://fl511.com`. */
  base: string;
  /** Prefixes every camera id, so two states can't collide on a numeric id. */
  idPrefix: string;
  /** The agency shown on the camera card. */
  source: string;
  /** Caption of last resort, when a row names neither a city nor a county. */
  state: string;
  /** Drops mis-geocoded rows — every one of these feeds has a few. */
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

const PAGE_SIZE = 100; // the server caps a response at 100 rows whatever we ask for
/** Safety bound (~6,000 cameras) so a bad `recordsTotal` can't fan out forever. */
const MAX_PAGES = 60;
/**
 * Florida alone is fifty pages, so these go in batches rather than all at once.
 *
 * Ten is deliberate. At six, Georgia's forty-one pages took 16.5s and blew the
 * route's 12s per-region budget, which meant its cameras only ever appeared on
 * the *second* request — the first one having been abandoned while the fetch
 * carried on filling the cache. Ten brings Georgia to 4.4s and Florida to
 * 5.8s, both inside the budget, with no refusals from either agency.
 */
const CONCURRENCY = 10;

/**
 * An asset-code prefix on an otherwise readable label: GDOT writes
 * `GDOT-1130: I-20 E at SR5 MM 34.2 (Douglas)`, Alpharetta writes `ALPH-0050:`.
 */
const CODE_PREFIX = /^[A-Z]{2,8}-?\d*\s*:\s*/;

/**
 * Whether a location string names a place rather than a piece of equipment.
 *
 * A space is the whole test, and it is enough: across a 1,200-row sample every
 * NCDOT code and every FDOT asset code ran the words together with underscores
 * or dashes (`CCTV01-NC12-28S_CANALZONE`, `0517N_75_Alligator_Alley_M052`),
 * and every value with a space in it was a real label. Also requiring a
 * lowercase letter looks like a stronger test but throws away good ones —
 * `I-95 @ MM 306.9` in Florida, and one Arizona label in nine.
 */
function readable(s: string): boolean {
  return / /.test(s);
}

/**
 * The best name the row can honestly support.
 *
 * Most rows carry a real cross-street in `location` — `SR-95 @SR-68 Laughlin
 * Rd`, `I-95 MP 134.0 Northbound` — sometimes behind an asset-code prefix.
 * NCDOT and a corner of FDOT instead put a pure internal code there
 * (`CCTV01-NC12-28S_CANALZONE`), and no amount of parsing turns that into a
 * place name, so those fall back to the road and the direction it watches.
 */
export function cameraLabel(rec: Ibi511Record): string | null {
  const loc = rec.location?.trim().replace(CODE_PREFIX, '');
  if (loc && loc !== 'N/A' && readable(loc)) return loc;

  const road = rec.roadway?.trim();
  if (!road || road === 'N/A') return loc && loc !== 'N/A' ? loc : null;
  const dir = rec.direction?.trim();
  return dir && dir !== 'N/A' ? `${road} ${dir}` : road;
}

/** Where the camera is, for the caption under its name. */
export function cameraCity(rec: Ibi511Record, state: string): string {
  const city = rec.city?.trim();
  if (city && city !== 'N/A') return city;
  const county = rec.county?.trim();
  if (county && county !== 'N/A') return `${county} County`;
  return state;
}

/** The video address, but only when it is actually an HLS playlist. */
function hlsUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /\.m3u8(\?|$)/i.test(trimmed) ? trimmed : undefined;
}

/** Map a raw row to a camera, or null if it should be skipped. */
export function mapIbi511Record(rec: Ibi511Record, cfg: Ibi511Source): CctvCamera | null {
  if (!rec || typeof rec.id !== 'number') return null;

  const img = rec.images?.[0];
  if (!img || img.blocked || img.disabled) return null;

  const coords = parseWkt(rec.latLng?.geography?.wellKnownText);
  if (!coords) return null;

  const { lat, lng } = coords;
  const b = cfg.bounds;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return null;

  const snapshot = img.imageUrl ? `${cfg.base}${img.imageUrl}` : undefined;
  /* `isVideoAuthRequired` is the platform saying the playlist is gated behind
     a session its own player negotiates. Georgia, Florida and NCDOT set it on
     every row and their edges answer 401 to anyone else — user agent and
     referer make no difference — so taking those URLs would hand the player
     nine thousand streams that cannot open. Their snapshots are public and
     serve fine, which is what those cameras show instead. Louisiana and
     Arizona set it on none. */
  const gated = img.isVideoAuthRequired === true;
  const video = img.videoDisabled || gated ? undefined : hlsUrl(img.videoUrl);
  if (!snapshot && !video) return null;

  return {
    id: `${cfg.idPrefix}-${rec.id}`,
    lat,
    lng,
    name: cameraLabel(rec) || `${cfg.source} Camera ${rec.id}`,
    city: cameraCity(rec, cfg.state),
    country: 'US',
    ...(snapshot ? { feed_url: snapshot } : {}),
    ...(video ? { stream_url: video, stream_type: 'hls' as const } : {}),
    source: cfg.source,
  };
}

async function fetchPage(cfg: Ibi511Source, start: number): Promise<{ rows: Ibi511Record[]; total: number }> {
  const url = `${cfg.base}/List/GetData/Cameras?query=${buildQuery(start, PAGE_SIZE)}&lang=en`;
  const res = await stealthFetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${cfg.source} HTTP ${res.status}`);
  const data = await res.json();
  return {
    rows: Array.isArray(data?.data) ? data.data : [],
    total: Number(data?.recordsTotal) || 0,
  };
}

/** Every camera one of these deployments publishes, paged and de-duplicated. */
export async function loadIbi511Cameras(cfg: Ibi511Source): Promise<CctvCamera[]> {
  // The first page also tells us how many there are in total.
  const first = await fetchPage(cfg, 0);
  const seen = new Map<number, CctvCamera>();

  const ingest = (rows: Ibi511Record[]) => {
    for (const rec of rows) {
      const cam = mapIbi511Record(rec, cfg);
      if (cam) seen.set(rec.id, cam);
    }
  };
  ingest(first.rows);

  const starts: number[] = [];
  for (let s = PAGE_SIZE; s < first.total && s < PAGE_SIZE * MAX_PAGES; s += PAGE_SIZE) {
    starts.push(s);
  }

  const failed: number[] = [];
  for (let i = 0; i < starts.length; i += CONCURRENCY) {
    const batch = starts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(s => fetchPage(cfg, s)));
    results.forEach((r, j) => r.status === 'fulfilled' ? ingest(r.value.rows) : failed.push(batch[j]));
  }

  // One more go at whatever dropped. These agencies throttle a burst rather
  // than refuse it outright, so a page that failed in a batch of ten usually
  // succeeds on its own a moment later.
  if (failed.length) {
    const retried = await Promise.allSettled(failed.map(s => fetchPage(cfg, s)));
    for (const r of retried) if (r.status === 'fulfilled') ingest(r.value.rows);
  }

  const cams = [...seen.values()];

  /* A short read is a failed refresh, not a smaller state.
     `Promise.allSettled` made lost pages invisible: a burst that came back
     throttled once cached 200 of Arizona's 644 and 3,143 of Georgia's 4,043,
     and served that for the next half hour. Throwing hands the decision to
     sourceCache, which keeps the last good index instead — none of these
     feeds drops rows of its own accord, so anything materially short of
     `recordsTotal` is pages we did not get. */
  if (first.total > 0 && cams.length < first.total * 0.95) {
    throw new Error(`${cfg.source} short read: ${cams.length} of ${first.total}`);
  }

  console.log(`[OSIRIS] ${cfg.source} cameras: ${cams.length} of ${first.total}`);
  return cams;
}

/**
 * OSIRIS — place search, shared by the browser and /api/geosearch.
 *
 * Nominatim alone was the problem: it is a *geocoder*, not a type-ahead index,
 * so it needs near-complete input. Measured side by side, "eiffel tow" returns
 * nothing from Nominatim and the correct Paris landmark from Photon; "sydny
 * opera house" (typo) returns one weak hit vs six good ones.
 *
 * Photon is Komoot's autocomplete index over the same OSM data — prefix and
 * fuzzy tolerant — so it leads. Nominatim still runs as a supplement because it
 * resolves some structured/administrative phrasings Photon ranks poorly, and
 * merging the two is what closes the "location is 100% missing" gap.
 *
 * The browser asks Photon itself (it allows any origin) rather than going
 * through our server. Photon judges fair use per address, and with every
 * visitor's type-ahead sent from the same two server addresses, Photon stopped
 * answering them: requests from the production hosts time out, so search sat
 * on that timeout and then showed nothing. Asked from the browser, each
 * visitor uses their own allowance. Nominatim stays server-only (see
 * lib/nominatim.ts), so the browser asks /api/geosearch only when Photon comes
 * back thin.
 */

const PHOTON = 'https://photon.komoot.io/api';

export interface GeoResult {
  name: string;
  context: string;
  lat: number;
  lng: number;
  kind: string;
  source: 'photon' | 'nominatim';
  /** Nominatim importance, when the hit came from there. Ranking only. */
  score?: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

export interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  name?: string;
  importance?: number;
}

/**
 * Nominatim's importance above which a hit is treated as globally prominent.
 * Photon is the better prefix matcher but ranks purely lexically — searching
 * "heathrow" puts Heathrow, Florida above London Heathrow Airport. Nominatim
 * scores the airport 0.606 and the town 0.352, so this promotes the former
 * without disturbing queries Nominatim can't answer at all.
 */
const PROMINENT = 0.5;

/** Collapse OSM class/value pairs into the handful of kinds the UI icons. */
export function classifyKind(key?: string, value?: string): string {
  if (!key) return 'place';
  if (key === 'place' && ['country'].includes(value || '')) return 'country';
  if (key === 'place' && ['state', 'region', 'province', 'county'].includes(value || '')) return 'region';
  if (key === 'place' && ['city', 'town', 'village', 'hamlet', 'municipality'].includes(value || '')) return 'city';
  if (key === 'boundary') return 'region';
  if (key === 'highway' || key === 'street') return 'street';
  if (key === 'building' || key === 'address' || value === 'house') return 'address';
  if (['amenity', 'tourism', 'shop', 'leisure', 'historic', 'office', 'railway', 'aeroway', 'natural', 'man_made'].includes(key)) {
    return 'poi';
  }
  return 'place';
}

export function normalizePhoton(f: PhotonFeature): GeoResult | null {
  const c = f?.geometry?.coordinates;
  const p = f?.properties;
  if (!c || c.length < 2 || !p) return null;
  const [lng, lat] = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Photon splits an address across name/housenumber/street
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name || street || p.city || p.country || 'Unnamed place';
  const context = [p.name && street ? street : null, p.district, p.city, p.state, p.country]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3)
    .join(', ');

  return { name, context, lat, lng, kind: classifyKind(p.osm_key, p.osm_value), source: 'photon' };
}

export function normalizeNominatim(r: NominatimRow): GeoResult | null {
  const lat = parseFloat(r?.lat || '');
  const lng = parseFloat(r?.lon || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const parts = (r.display_name || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name: r.name || parts[0] || 'Unnamed place',
    context: parts.slice(1, 4).join(', '),
    lat,
    lng,
    kind: classifyKind(r.class, r.type),
    source: 'nominatim',
    score: typeof r.importance === 'number' ? r.importance : undefined,
  };
}

/** Roughly 100 m — close enough that two hits are the same place. */
const DEDUPE_DEG = 0.001;

/**
 * Merge provider results, Photon first, dropping anything the other provider
 * already covers at effectively the same coordinate with the same name.
 */
export function mergeResults(primary: GeoResult[], secondary: GeoResult[], limit = 8): GeoResult[] {
  const out: GeoResult[] = [];

  const isDuplicate = (r: GeoResult) =>
    out.some(
      (o) =>
        Math.abs(o.lat - r.lat) < DEDUPE_DEG &&
        Math.abs(o.lng - r.lng) < DEDUPE_DEG &&
        o.name.toLowerCase() === r.name.toLowerCase(),
    );

  // A landmark the world knows leads, whichever index found it; everything else
  // keeps Photon's ordering, which is what makes partial input work.
  const prominent = secondary
    .filter((r) => (r.score ?? 0) >= PROMINENT)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const rest = secondary.filter((r) => (r.score ?? 0) < PROMINENT);

  for (const r of [...prominent, ...primary, ...rest]) {
    if (out.length >= limit) break;
    if (!isDuplicate(r)) out.push(r);
  }
  return out;
}

export function photonUrl(q: string, near?: { lat: number; lng: number } | null): string {
  let url = `${PHOTON}/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
  // Bias toward what the operator is currently looking at
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) url += `&lat=${near.lat}&lon=${near.lng}`;
  return url;
}

/** Photon answers most of what a type-ahead is asked; below this it needs help. */
export const ENOUGH_FROM_PHOTON = 3;

/** Photon normally answers in well under a second; past this it is not coming. */
const PHOTON_TIMEOUT_MS = 5_000;
/** Our route can wait on Nominatim's queue; past this, show what Photon found. */
const SUPPLEMENT_TIMEOUT_MS = 12_000;

/**
 * GET a JSON body, or null if it fails or takes longer than `ms`. Throws only
 * when `signal` aborts, so a superseded search stops instead of falling back.
 */
async function getJson<T>(url: string, signal: AbortSignal | undefined, ms: number): Promise<T | null> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * Search from the browser: Photon directly, then our server's Nominatim
 * supplement when Photon is thin or unreachable. If Photon found something but
 * not enough, `onPartial` gets it straight away, so a slow supplement never
 * holds back what is already known. Throws only when `signal` aborts.
 */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal,
  onPartial?: (results: GeoResult[]) => void,
): Promise<GeoResult[]> {
  const photon = await getJson<{ features?: PhotonFeature[] }>(photonUrl(q, near), signal, PHOTON_TIMEOUT_MS);
  const direct = (photon?.features || []).map(normalizePhoton).filter((r): r is GeoResult => r !== null);
  if (direct.length >= ENOUGH_FROM_PHOTON) return mergeResults(direct, []);
  if (direct.length) onPartial?.(mergeResults(direct, []));

  const server = await getJson<{ results?: GeoResult[] }>(
    `/api/geosearch?q=${encodeURIComponent(q)}`, signal, SUPPLEMENT_TIMEOUT_MS,
  );
  return mergeResults(direct, server?.results || []);
}

/**
 * OSIRIS — place search, shared by the browser and /api/geosearch.
 *
 * Photon is an autocomplete index over OpenStreetMap — prefix and typo
 * tolerant, so "eiffel tow" and "sydny opera house" both find their place,
 * where a plain geocoder needs near-complete input.
 *
 * The browser asks our own route, never a geocoder: the route asks the Photon
 * server this deployment runs (see lib/photon.ts), and its answers are cached
 * for every visitor at the edge and in the server. The public Photon and
 * Nominatim servers are not used.
 */

export interface GeoResult {
  name: string;
  context: string;
  lat: number;
  lng: number;
  kind: string;
}

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

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

  return { name, context, lat, lng, kind: classifyKind(p.osm_key, p.osm_value) };
}

/**
 * Where the operator is looking, to the nearest tenth of a degree (about
 * 11 km). That is all the bias needs, and it lets everyone looking at the
 * same city share one cached answer instead of one per pixel of map.
 */
export function biasOf(near?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  if (!near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng)) return null;
  if (Math.abs(near.lat) > 90 || Math.abs(near.lng) > 180) return null;
  return { lat: Math.round(near.lat * 10) / 10, lng: Math.round(near.lng * 10) / 10 };
}

/** The geocoder answers in well under a second; past this it is not coming. */
const TIMEOUT_MS = 8_000;

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
 * Search from the browser, through our route, biased toward where the map is
 * looking. Throws only when `signal` aborts.
 */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const bias = biasOf(near);
  const url = `/api/geosearch?q=${encodeURIComponent(q)}${bias ? `&lat=${bias.lat}&lng=${bias.lng}` : ''}`;
  const json = await getJson<{ results?: GeoResult[] }>(url, signal, TIMEOUT_MS);
  return json?.results || [];
}

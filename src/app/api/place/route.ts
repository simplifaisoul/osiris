import { NextResponse } from 'next/server';
import { httpJson, optional, OSIRIS_UA } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';

export const maxDuration = 30;

/**
 * OSIRIS — Place Intelligence API
 *
 * Answers "what is here?" for a coordinate, from open sources only:
 *   Overpass   — the nearest named POI and its OSM tags (hours, phone, …)
 *   Nominatim  — postal address / fallback identity when no POI is nearby
 *   Wikipedia  — one-paragraph description and a photo
 *   Mangrove   — open, cryptographically signed public reviews (CC0)
 *
 * There is no keyless equivalent of Google's review corpus. Mangrove is the
 * genuine open-data counterpart, but its coverage is thin — most places return
 * zero reviews, and the response says so rather than implying a rating exists.
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const MANGROVE = 'https://api.mangrove.reviews';

/** POI keys worth surfacing, in priority order when an element carries several. */
const CATEGORY_KEYS = ['amenity', 'tourism', 'shop', 'leisure', 'historic', 'office', 'craft'] as const;

export interface PlaceReview {
  rating: number | null;
  opinion: string;
  author: string;
  date: string;
}

export interface PlaceResult {
  name: string;
  category: string | null;
  lat: number;
  lng: number;
  address: string | null;
  details: Record<string, string>;
  description: { text: string; title: string; url: string; thumbnail: string | null } | null;
  reviews: { count: number; average: number | null; items: PlaceReview[] };
  osm: { type: string; id: number } | null;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Metres between two WGS84 points (equirectangular — fine at POI scale). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const mLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(mLat);
  return Math.round(Math.sqrt(dLat * dLat + x * x) * R);
}

/**
 * Rank a candidate POI — lower is better.
 *
 * Pure distance picks the wrong thing constantly: probing the Brandenburg Gate
 * lands on the Quadriga statue sitting on top of it, and the Eiffel Tower on a
 * restaurant inside it. Prominence has to count, so notable features (ones with
 * a Wikidata/Wikipedia entry, landmarks, and mapped areas rather than points)
 * win out over a marginally closer minor node.
 */
export function scoreCandidate(el: OverpassElement, lat: number, lng: number): number {
  const elLat = el.lat ?? el.center?.lat;
  const elLng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(elLat) || !Number.isFinite(elLng)) return Infinity;

  const tags = el.tags || {};
  // +15m floor so a coincident node can't collapse the score to zero
  let score = distanceMeters(lat, lng, elLat as number, elLng as number) + 15;

  if (tags.wikidata || tags.wikipedia) score *= 0.3;
  if (tags.tourism === 'attraction' || tags.historic) score *= 0.6;
  if (el.type === 'way' || el.type === 'relation') score *= 0.85;

  return score;
}

/** Choose the most relevant named element near the probe point. Exported for tests. */
export function pickBest(
  elements: OverpassElement[],
  lat: number,
  lng: number,
): OverpassElement | null {
  let best: OverpassElement | null = null;
  let bestScore = Infinity;

  for (const el of elements) {
    if (!el?.tags?.name) continue;
    const score = scoreCandidate(el, lat, lng);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

/** Human-readable category from OSM tags, e.g. "fast_food" -> "Fast Food". */
export function readCategory(tags: Record<string, string>): string | null {
  for (const key of CATEGORY_KEYS) {
    const v = tags[key];
    if (v && v !== 'yes') {
      return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

/** Pull the handful of OSM tags worth showing in a place card. */
export function readDetails(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const map: Array<[string, string]> = [
    ['opening_hours', 'Hours'],
    ['phone', 'Phone'],
    ['contact:phone', 'Phone'],
    ['website', 'Website'],
    ['contact:website', 'Website'],
    ['cuisine', 'Cuisine'],
    ['wheelchair', 'Wheelchair'],
    ['operator', 'Operator'],
    ['brand', 'Brand'],
    ['stars', 'Stars'],
    ['internet_access', 'Wi-Fi'],
    ['outdoor_seating', 'Outdoor Seating'],
    ['takeaway', 'Takeaway'],
    ['delivery', 'Delivery'],
    ['start_date', 'Built'],
    ['architect', 'Architect'],
    ['height', 'Height'],
  ];
  for (const [key, label] of map) {
    const v = tags[key];
    if (v && !out[label]) {
      out[label] = key === 'cuisine' ? v.replace(/[_;]/g, ' ').trim() : v;
    }
  }
  return out;
}

/** Decode Mangrove's signed reviews and keep the ones near this place. */
export function normalizeReviews(
  payload: { reviews?: Array<{ payload?: Record<string, unknown> }> },
  lat: number,
  lng: number,
  radiusM = 120,
): { count: number; average: number | null; items: PlaceReview[] } {
  const items: PlaceReview[] = [];

  for (const r of payload?.reviews || []) {
    const p = r?.payload;
    if (!p || typeof p.sub !== 'string') continue;

    // sub looks like: geo:52.5344,13.3585?q=Name&u=50
    const m = p.sub.match(/^geo:(-?[\d.]+),(-?[\d.]+)/);
    if (!m) continue;
    if (distanceMeters(lat, lng, parseFloat(m[1]), parseFloat(m[2])) > radiusM) continue;

    const rating = typeof p.rating === 'number' ? p.rating : null;
    const meta = (p.metadata || {}) as Record<string, unknown>;
    items.push({
      rating,
      opinion: typeof p.opinion === 'string' ? p.opinion : '',
      author: typeof meta.nickname === 'string' ? meta.nickname : 'anonymous',
      date: typeof p.iat === 'number' ? new Date(p.iat * 1000).toISOString().slice(0, 10) : '',
    });
  }

  const rated = items.filter((i) => i.rating !== null);
  const average = rated.length
    ? Math.round(rated.reduce((s, i) => s + (i.rating as number), 0) / rated.length)
    : null;

  items.sort((a, b) => b.date.localeCompare(a.date));
  return { count: items.length, average, items: items.slice(0, 10) };
}

async function fetchOverpass(lat: number, lng: number): Promise<OverpassElement[]> {
  const filter = CATEGORY_KEYS.map(
    (k) => `node(around:140,${lat},${lng})[${k}][name];way(around:140,${lat},${lng})[${k}][name];`,
  ).join('');
  const query = `[out:json][timeout:12];(${filter});out center tags 40;`;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    // Overpass rejects spoofed browser UAs with 406 — identify honestly.
    headers: { 'User-Agent': OSIRIS_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  return json.elements || [];
}

/** Resolve an OSM wikidata/wikipedia tag to an English Wikipedia summary. */
async function fetchDescription(tags: Record<string, string>, lat: number, lng: number) {
  let title: string | null = null;
  let lang = 'en';

  if (tags.wikidata) {
    const wd = await optional(
      httpJson<{ entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }> }>(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(tags.wikidata)}` +
        `&props=sitelinks&sitefilter=enwiki&format=json`,
      ),
    );
    title = wd?.entities?.[tags.wikidata]?.sitelinks?.enwiki?.title || null;
  }

  if (!title && tags.wikipedia) {
    // tag format is "de:Brandenburger Tor"
    const [tagLang, ...rest] = tags.wikipedia.split(':');
    if (rest.length) { lang = tagLang; title = rest.join(':'); }
  }

  if (!title) {
    const geo = await optional(
      httpJson<{ query?: { geosearch?: Array<{ title: string }> } }>(
        `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` +
        `&gscoord=${lat}%7C${lng}&gsradius=250&gslimit=1&format=json`,
      ),
    );
    title = geo?.query?.geosearch?.[0]?.title || null;
  }

  if (!title) return null;

  const sum = await optional(
    httpJson<{ title?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string } }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    ),
  );
  if (!sum?.extract) return null;

  return {
    text: sum.extract,
    title: sum.title || title,
    url: sum.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    thumbnail: sum.thumbnail?.source || null,
  };
}

async function lookupPlace(lat: number, lng: number): Promise<PlaceResult> {
  // POI lookup and address lookup are independent — run them together.
  const [elements, reverse] = await Promise.all([
    optional(fetchOverpass(lat, lng)),
    optional(
    httpJson<{ display_name?: string; name?: string; extratags?: Record<string, string>; type?: string; class?: string }>(
      `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&extratags=1&zoom=18`,
    ),
    ),
  ]);

  const poi = pickBest(elements || [], lat, lng);
  const tags = { ...(reverse?.extratags || {}), ...(poi?.tags || {}) };

  const name =
    poi?.tags?.name ||
    reverse?.name ||
    reverse?.display_name?.split(',')[0] ||
    'Unnamed location';

  const poiLat = poi?.lat ?? poi?.center?.lat ?? lat;
  const poiLng = poi?.lon ?? poi?.center?.lon ?? lng;

  const [description, mangrove] = await Promise.all([
    optional(fetchDescription(tags, poiLat, poiLng)),
    optional(
    httpJson<{ reviews?: Array<{ payload?: Record<string, unknown> }> }>(
      `${MANGROVE}/reviews?q=${encodeURIComponent(name)}&limit=40`,
    ),
    ),
  ]);

  const result: PlaceResult = {
    name,
    category: readCategory(tags) || (reverse?.type ? readCategory({ [reverse.class || 'amenity']: reverse.type }) : null),
    lat: poiLat,
    lng: poiLng,
    address: reverse?.display_name || null,
    details: readDetails(tags),
    description,
    reviews: normalizeReviews(mangrove || {}, poiLat, poiLng),
    osm: poi?.type && poi?.id ? { type: poi.type, id: poi.id } : null,
  };

  return result;
}

/**
 * Overpass rate-limits aggressively (a burst of probes gets `rate_limited`
 * back), and a cold lookup costs ~5s across four upstreams. Cache by rounded
 * coordinate — ~11 m of precision, which is well inside the POI search radius,
 * so nearby probes reuse the same answer.
 */
function cachedLookup(lat: number, lng: number): Promise<PlaceResult[]> {
  const key = `place:${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cachedSource(key, async () => [await lookupPlace(lat, lng)])();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const [result] = await cachedLookup(lat, lng);
    if (!result) {
      return NextResponse.json({ error: 'Place lookup failed' }, { status: 502 });
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' },
    });
  } catch (error) {
    console.error('[OSIRIS] Place lookup error:', error);
    return NextResponse.json({ error: 'Place lookup failed' }, { status: 500 });
  }
}

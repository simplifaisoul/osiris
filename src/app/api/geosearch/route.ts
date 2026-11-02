import { NextResponse } from 'next/server';
import { geocoder, geocoderConfigured, sharedSearch, sharedSearchConfigured } from '@/lib/geocoder';
import { biasOf, normalizeFeature, type GeoResult, type GeocoderFeature } from '@/lib/geosearch';

export const maxDuration = 20;

/**
 * OSIRIS — place search through the OSIRIS geocoder.
 *
 * When OSIRIS_GEOCODER_URL is set, the browser's search asks this route, and
 * this route asks that geocoder through lib/geocoder.ts, which caches answers
 * and keeps bursts off it. `lat`/`lng` bias the answer toward where the map
 * is looking; the browser rounds them (see biasOf) so the edge can share
 * answers.
 *
 * Without OSIRIS_GEOCODER_URL, this route asks the shared search of the
 * deployment that runs osirisai.live (/api/geosearch/shared, through
 * lib/geocoder.ts), so a copy on someone's own machine searches the same
 * geocoder with nothing to set up. SHARED_SEARCH_URL points it elsewhere, or
 * `off` turns it off.
 *
 * 501 means there is nothing to ask here (no geocoder, and the shared search
 * is off): the browser then searches Wikipedia and Wikidata itself. 503 means
 * the geocoder or the shared search did not answer this time (down, resting
 * after a failure, or too busy), and the browser does the same for this one
 * search. Neither is cached.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
const EDGE = { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' };

/** A result from the shared search is only shown if it is one. */
const isResult = (r: GeoResult) =>
  typeof r?.name === 'string' && typeof r.kind === 'string' && Number.isFinite(r.lat) && Number.isFinite(r.lng);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const answer = (results: GeoResult[], status: number, headers: Record<string, string>) =>
    NextResponse.json({ results }, { status, headers });

  const own = geocoderConfigured();
  if (!own && !sharedSearchConfigured()) return answer([], 501, NO_STORE);
  if (q.length < 2) return answer([], 200, NO_STORE);

  const near = biasOf({ lat: parseFloat(searchParams.get('lat') || ''), lng: parseFloat(searchParams.get('lng') || '') });
  if (!own) {
    const shared = await sharedSearch<{ results?: GeoResult[] }>({ q, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}) });
    if (!shared) return answer([], 503, NO_STORE);
    return answer((Array.isArray(shared.results) ? shared.results : []).filter(isResult), 200, EDGE);
  }

  const json = await geocoder<{ features?: GeocoderFeature[] }>({
    q,
    limit: '8',
    ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}),
  });
  if (!json) return answer([], 503, NO_STORE);

  return answer((json.features || []).map(normalizeFeature).filter((r): r is GeoResult => r !== null), 200, EDGE);
}

import { NextResponse } from 'next/server';
import { photon, photonConfigured, sharedSearch, sharedSearchConfigured } from '@/lib/photon';
import { nominatim, nominatimConfigured } from '@/lib/nominatim';
import {
  biasOf, normalizeNominatim, normalizePhoton, NOMINATIM_HEADER,
  type GeoResult, type NominatimRow, type PhotonFeature,
} from '@/lib/geosearch';

export const maxDuration = 20;

/**
 * OSIRIS — place search through the deployment's own geocoder.
 *
 * When PHOTON_URL is set, the browser's search asks this route, and this
 * route asks that Photon server through lib/photon.ts, which caches answers
 * and keeps bursts off it. `lat`/`lng` bias the answer toward where the map
 * is looking; the browser rounds them (see biasOf) so the edge can share
 * answers.
 *
 * Without PHOTON_URL, this route asks the shared search of the deployment
 * that runs osirisai.live (/api/geosearch/shared, through lib/photon.ts), so
 * a copy on someone's own machine searches the same geocoder with nothing to
 * set up. SHARED_SEARCH_URL points it elsewhere, or `off` turns it off.
 *
 * 501 means there is nothing to ask here (no geocoder, and the shared search
 * is off): the browser then searches Wikipedia and Wikidata itself. 503 means
 * the geocoder or the shared search did not answer this time (down, resting
 * after a failure, or too busy), and the browser does the same for this one
 * search. Neither is cached.
 *
 * `source=nominatim` is the backup, "Search OpenStreetMap", when the copy's
 * operator turned it on (NOMINATIM_URL; see lib/nominatim.ts). The browser
 * asks for it only when someone chooses it, never as they type. Every answer
 * says in NOMINATIM_HEADER whether it is on, so the search box knows whether
 * to offer it.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
const EDGE = { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' };

/** A result from the shared search is only shown if it is one. */
const isResult = (r: GeoResult) =>
  typeof r?.name === 'string' && typeof r.kind === 'string' && Number.isFinite(r.lat) && Number.isFinite(r.lng);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const offer = { [NOMINATIM_HEADER]: nominatimConfigured() ? 'on' : 'off' };
  const answer = (results: GeoResult[], status: number, cache: Record<string, string>) =>
    NextResponse.json({ results }, { status, headers: { ...cache, ...offer } });

  if (searchParams.get('source') === 'nominatim') {
    if (!nominatimConfigured()) return answer([], 501, NO_STORE);
    if (q.length < 2) return answer([], 200, NO_STORE);
    const rows = await nominatim<NominatimRow[]>({ q, limit: '8' });
    if (!rows) return answer([], 503, NO_STORE);
    return answer((Array.isArray(rows) ? rows : []).map(normalizeNominatim).filter((r): r is GeoResult => r !== null), 200, EDGE);
  }

  const own = photonConfigured();
  if (!own && !sharedSearchConfigured()) return answer([], 501, NO_STORE);
  if (q.length < 2) return answer([], 200, NO_STORE);

  const near = biasOf({ lat: parseFloat(searchParams.get('lat') || ''), lng: parseFloat(searchParams.get('lng') || '') });
  if (!own) {
    const shared = await sharedSearch<{ results?: GeoResult[] }>({ q, ...(near ? { lat: String(near.lat), lng: String(near.lng) } : {}) });
    if (!shared) return answer([], 503, NO_STORE);
    return answer((Array.isArray(shared.results) ? shared.results : []).filter(isResult), 200, EDGE);
  }

  const json = await photon<{ features?: PhotonFeature[] }>({
    q,
    limit: '8',
    ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}),
  });
  if (!json) return answer([], 503, NO_STORE);

  return answer((json.features || []).map(normalizePhoton).filter((r): r is GeoResult => r !== null), 200, EDGE);
}

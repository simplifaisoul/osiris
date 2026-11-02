import { NextResponse } from 'next/server';
import { photon, photonConfigured } from '@/lib/photon';
import { biasOf, normalizePhoton, type GeoResult, type PhotonFeature } from '@/lib/geosearch';

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
 * 501 means this deployment has no geocoder of its own: the browser then
 * searches Wikipedia and Wikidata itself. 503 means the geocoder did not
 * answer this time (down, resting after a failure, or too busy), and the
 * browser does the same for this one search. Neither is cached.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!photonConfigured()) return NextResponse.json({ results: [] }, { status: 501, headers: NO_STORE });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const near = biasOf({ lat: parseFloat(searchParams.get('lat') || ''), lng: parseFloat(searchParams.get('lng') || '') });
  const json = await photon<{ features?: PhotonFeature[] }>({
    q,
    limit: '8',
    ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}),
  });
  if (!json) return NextResponse.json({ results: [] }, { status: 503, headers: NO_STORE });

  const results = (json.features || []).map(normalizePhoton).filter((r): r is GeoResult => r !== null);
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } });
}

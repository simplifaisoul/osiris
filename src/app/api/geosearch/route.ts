import { NextResponse } from 'next/server';
import { cachedSource } from '@/lib/sourceCache';
import { photon } from '@/lib/photon';
import { biasOf, normalizePhoton, type GeoResult, type PhotonFeature } from '@/lib/geosearch';

export const maxDuration = 20;

/**
 * OSIRIS — place search.
 *
 * The browser's type-ahead asks this route, and this route asks the Photon
 * server the deployment runs, through lib/photon.ts, which caches answers and
 * keeps bursts off it. `lat`/`lng` bias the answer toward where the map is
 * looking; the browser rounds them (see biasOf) so the edge can share answers.
 *
 * A refused or failed lookup comes back as an empty list that is not cached
 * anywhere, so the next search asks again instead of being served a
 * remembered blank.
 */

async function searchPhoton(q: string, near: { lat: number; lng: number } | null): Promise<GeoResult[]> {
  const json = await photon<{ features?: PhotonFeature[] }>('api', {
    q,
    limit: '8',
    ...(near ? { lat: String(near.lat), lon: String(near.lng) } : {}),
  });
  return (json?.features || []).map(normalizePhoton).filter((r): r is GeoResult => r !== null);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (q.length < 2) return NextResponse.json({ results: [] });

    const near = biasOf({ lat: parseFloat(searchParams.get('lat') || ''), lng: parseFloat(searchParams.get('lng') || '') });
    const results = await cachedSource<GeoResult>(
      `geosearch:${q.toLowerCase()}:${near ? `${near.lat},${near.lng}` : ''}`,
      () => searchPhoton(q, near),
      10 * 60 * 1000,
    )();

    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': results.length ? 'public, s-maxage=600, stale-while-revalidate=1800' : 'no-store' } },
    );
  } catch (error) {
    console.error('[OSIRIS] Geosearch error:', error);
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}

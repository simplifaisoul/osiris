import { NextResponse } from 'next/server';
import { cachedSource } from '@/lib/sourceCache';
import { nominatim } from '@/lib/nominatim';
import { mergeResults, normalizeNominatim, type GeoResult, type NominatimRow } from '@/lib/geosearch';

export const maxDuration = 20;

/**
 * OSIRIS — the Nominatim half of place search.
 *
 * The browser asks Photon itself and comes here only when Photon comes back
 * thin (see lib/geosearch.ts). This route used to ask Photon first as well,
 * but Photon stopped answering the production hosts, so every search waited
 * out that timeout before it reached Nominatim.
 *
 * Nominatim's public instance allows one request a second for everyone using
 * it, so the lookup goes through lib/nominatim.ts, which caches, queues and
 * refuses bursts. A refused or failed lookup comes back as an empty list that
 * is not cached anywhere, so the next search asks again instead of being
 * served a remembered blank.
 */

async function searchNominatim(q: string): Promise<GeoResult[]> {
  const json = await nominatim<NominatimRow[]>('search', { q, limit: '6', addressdetails: '0' });
  return (Array.isArray(json) ? json : []).map(normalizeNominatim).filter((r): r is GeoResult => r !== null);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (q.length < 2) return NextResponse.json({ results: [] });

    const results = await cachedSource<GeoResult>(
      `geosearch:${q.toLowerCase()}`,
      async () => mergeResults([], await searchNominatim(q)),
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

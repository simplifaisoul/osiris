import { NextResponse } from 'next/server';
import { ATTRIBUTION, nominatim } from '@/lib/nominatim';

export const maxDuration = 15;

/**
 * OSIRIS — the place name for a coordinate.
 *
 * The map's location readout used to ask Nominatim from the browser as the
 * cursor moved, which meant one stream of requests per visitor and no shared
 * cache. It asks this instead: the coordinate is rounded to a tenth of a
 * degree — about 11 km, far finer than the "city, region, country" line it
 * fills — so everyone looking at the same part of the world is answered from
 * one lookup, and lib/nominatim.ts holds the budget for the whole app.
 */

interface ReverseRow {
  address?: Record<string, string>;
  display_name?: string;
}

/** Coarse enough that a moving cursor reuses one answer, fine enough to name a city. */
const GRID = 10;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const row = await nominatim<ReverseRow>('reverse', {
    lat: (Math.round(lat * GRID) / GRID).toFixed(1),
    lon: (Math.round(lng * GRID) / GRID).toFixed(1),
    zoom: '10',
    addressdetails: '1',
  });

  const address = row?.address ?? {};
  const label = [
    address.city || address.town || address.village || address.county,
    address.state || address.region,
    address.country,
  ].filter(Boolean).join(', ');

  return NextResponse.json(
    { label: label || null, attribution: ATTRIBUTION },
    // A tenth of a degree does not change; a month at the edge, a day in the browser.
    { headers: { 'Cache-Control': 'public, s-maxage=2592000, max-age=86400, stale-while-revalidate=86400' } },
  );
}

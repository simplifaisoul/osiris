import { NextResponse } from 'next/server';
import { ATTRIBUTION, photon } from '@/lib/photon';

export const maxDuration = 15;

/**
 * OSIRIS — the place name for a coordinate.
 *
 * The map's location readout asks this as the cursor moves. The coordinate is
 * rounded to a tenth of a degree — about 11 km, far finer than the "city,
 * region, country" line it fills — so everyone looking at the same part of the
 * world is answered from one lookup, and lib/photon.ts caches it for the app.
 */

interface ReversePlace {
  name?: string;
  osm_key?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
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

  // The nearest OpenStreetMap object within 50 km; its address says which city, region and country it is in.
  const json = await photon<{ features?: { properties?: ReversePlace }[] }>('reverse', {
    lat: (Math.round(lat * GRID) / GRID).toFixed(1),
    lon: (Math.round(lng * GRID) / GRID).toFixed(1),
    radius: '50',
  });

  const p = json?.features?.[0]?.properties ?? {};
  const label = [
    // A town or village node is its own place; its address has no city above it.
    p.city || (p.osm_key === 'place' ? p.name : undefined) || p.county,
    p.state,
    p.country,
  ].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');

  return NextResponse.json(
    { label: label || null, attribution: ATTRIBUTION },
    // A tenth of a degree does not change; a month at the edge, a day in the browser.
    { headers: { 'Cache-Control': label ? 'public, s-maxage=2592000, max-age=86400, stale-while-revalidate=86400' : 'no-store' } },
  );
}

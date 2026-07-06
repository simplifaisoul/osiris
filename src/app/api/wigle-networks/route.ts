import { NextResponse } from 'next/server';
import { runSource } from '@/lib/sources';
import { wigleNetworks } from '@/lib/sources/adapters/wigleNetworks';

/**
 * Osiris — WiGLE Wireless Networks (near a point)
 * Opt-in, keyed (WIGLE_API_NAME + WIGLE_API_TOKEN). Disabled cleanly without
 * credentials. Requires lat/lng — WiGLE's search API has no global feed.
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius') || '3';

  if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
  }

  const result = await runSource(wigleNetworks, { lat, lng, radius });

  return NextResponse.json({
    networks: result.data ?? [],
    total: result.data?.length ?? 0,
    timestamp: new Date().toISOString(),
    source: result.sourceId,
    stale: result.stale,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
  });
}

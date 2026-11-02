import { NextResponse } from 'next/server';
import { coverage, feedsWaitingForKeys, vehiclesIn } from '@/lib/transit-live';
import { parseBBox } from '@/lib/transit';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * OSIRIS — Live transit vehicles from operators' GTFS-Realtime feeds.
 *
 *   GET /api/transit?bbox=west,south,east,north  every vehicle in the box
 *   GET /api/transit?coverage=1                  where there are feeds, and how many vehicles each had
 *
 * Feeds are read only for the area asked about and shared between callers for
 * 20 seconds; see @/lib/transit-live.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('coverage')) {
    const feeds = coverage();
    return NextResponse.json(
      { feeds, total: feeds.length, withKey: feedsWaitingForKeys(), timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  }

  const view = parseBBox(searchParams.get('bbox'));
  if (!view) {
    return NextResponse.json({ error: 'bbox is required as west,south,east,north in degrees' }, { status: 400 });
  }
  // A map polls every 20 s; this leaves room for panning around between polls.
  // Its own key: the limiter is shared, and map polling must not use up a
  // visitor's allowance for the RECON lookups.
  if (isRateLimited(`transit:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const result = await vehiclesIn(view);
  return NextResponse.json(
    { ...result, total: result.vehicles.length, timestamp: new Date().toISOString() },
    // Each feed is cached for 20 s already; the response must not outlive that.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

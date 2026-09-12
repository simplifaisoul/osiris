import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * OSIRIS — Global Stats API
 * Lightweight aggregation endpoint.
 * Fetches metrics from all local APIs and returns ONLY the counts.
 *
 * ARCHITECTURE NOTE (10k+ Concurrent Users):
 * This endpoint ensures the Next.js server serves ~100 bytes instead of 10MB+
 * of raw GeoJSON mapping data when 10,000 users boot the dashboard simultaneously.
 * The underlying API routes utilize their own 45-60s TTL caching, meaning the
 * heavy external APIs (adsb.lol, USGS) are only hit once per minute, while this
 * lightweight stats route safely serves 10k concurrent users instantly.
 */

type Stats = { flights: number; sats: number; cctv: number; weather: number; nuclear: number; incidents: number };
type Snapshot = { stats: Stats; timestamp: string; at: number };
const EMPTY: Stats = { flights: 0, sats: 0, cctv: 0, weather: 0, nuclear: 0, incidents: 0 };

/* One computation serves everyone. Each one pulls six of this app's own feeds —
   CCTV alone is ~5MB — and parses them only to count. The per-fetch
   `revalidate` hints never helped: Next's data cache refuses anything over 2MB,
   so the two largest feeds were refetched in full on every call, and
   Cloudflare does not cache /api responses either. Every arriving visitor paid
   for all six, and under production load the endpoint took 15-19s to return
   ~100 bytes. Now there is at most one computation per TTL, concurrent callers
   share it, and a stale snapshot answers instantly while a fresh one is
   computed behind it. */
const TTL_MS = 30_000;
let snapshot: Snapshot | undefined;
let inflight: Promise<Snapshot> | undefined;

/** Test hook, mirroring clearMaritimeSnapshot. */
export function clearStatsSnapshot() {
  snapshot = undefined;
  inflight = undefined;
}

/** Counts for the feeds that answered; a feed that failed is simply absent. */
async function computeStats(origin: string): Promise<Partial<Stats>> {
  // Fetch all internal APIs in parallel (they have their own Cache-Control TTLs)
  const [flightsRes, satsRes, cctvRes, weatherRes, infraRes, gdeltRes] = await Promise.allSettled([
    fetch(`${origin}/api/flights`, { signal: AbortSignal.timeout(20000), next: { revalidate: 45 } }),
    fetch(`${origin}/api/satellites`, { signal: AbortSignal.timeout(20000), next: { revalidate: 3600 } }),
    fetch(`${origin}/api/cctv`, { signal: AbortSignal.timeout(20000), next: { revalidate: 3600 } }),
    fetch(`${origin}/api/weather`, { signal: AbortSignal.timeout(20000), next: { revalidate: 300 } }),
    fetch(`${origin}/api/infrastructure`, { signal: AbortSignal.timeout(20000), next: { revalidate: 86400 } }),
    fetch(`${origin}/api/gdelt`, { signal: AbortSignal.timeout(20000), next: { revalidate: 300 } })
  ]);

  const fresh: Partial<Stats> = {};

  // Safely parse counts
  if (flightsRes.status === 'fulfilled' && flightsRes.value.ok) {
    const data = await flightsRes.value.json();
    fresh.flights = (data.commercial_flights?.length || 0) +
              (data.private_flights?.length || 0) +
              (data.private_jets?.length || 0) +
              (data.military_flights?.length || 0);
  }

  if (satsRes.status === 'fulfilled' && satsRes.value.ok) {
    const data = await satsRes.value.json();
    fresh.sats = data.satellites?.length || 0;
  }

  if (cctvRes.status === 'fulfilled' && cctvRes.value.ok) {
    const data = await cctvRes.value.json();
    fresh.cctv = data.cameras?.length || 0;
  }

  if (weatherRes.status === 'fulfilled' && weatherRes.value.ok) {
    const data = await weatherRes.value.json();
    fresh.weather = data.events?.length || 0;
  }

  if (infraRes.status === 'fulfilled' && infraRes.value.ok) {
    const data = await infraRes.value.json();
    fresh.nuclear = data.infrastructure?.length || 0;
  }

  if (gdeltRes.status === 'fulfilled' && gdeltRes.value.ok) {
      const data = await gdeltRes.value.json();
      fresh.incidents = data.events?.length || 0;
  }

  return fresh;
}

function refresh(origin: string) {
  inflight ??= computeStats(origin)
    .then(fresh => {
      /* A feed that failed keeps its last good count instead of dropping to
         zero, and a computation that reached nothing does not count as fresh.
         Caching is what makes this matter: without it, a transient failure
         showed zeros to one request; with it, the same failure would be
         pinned for a whole TTL. */
      const reached = Object.keys(fresh).length > 0;
      const next: Snapshot = {
        stats: { ...EMPTY, ...snapshot?.stats, ...fresh },
        timestamp: reached || !snapshot ? new Date().toISOString() : snapshot.timestamp,
        at: reached ? Date.now() : snapshot?.at ?? 0,
      };
      snapshot = next;
      return next;
    })
    .finally(() => { inflight = undefined; });
  return inflight;
}

function respond({ stats, timestamp }: Snapshot) {
  return NextResponse.json({ stats, timestamp }, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    }
  });
}

export async function GET(req: Request) {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return respond(snapshot);

  const pending = refresh(new URL(req.url).origin);
  // Stale beats slow: answer now, and let the refresh land for the next caller.
  if (snapshot) {
    pending.catch(error => console.error('Stats refresh failed:', error));
    return respond(snapshot);
  }

  try {
    return respond(await pending);
  } catch (error) {
    console.error('Stats aggregation failed:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}

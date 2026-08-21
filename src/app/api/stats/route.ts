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

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    // Fetch all internal APIs in parallel (they have their own Cache-Control TTLs)
    const [flightsRes, satsRes, cctvRes, weatherRes, infraRes, gdeltRes] = await Promise.allSettled([
      fetch(`${origin}/api/flights`, { signal: AbortSignal.timeout(20000), next: { revalidate: 45 } }),
      fetch(`${origin}/api/satellites`, { signal: AbortSignal.timeout(20000), next: { revalidate: 3600 } }),
      fetch(`${origin}/api/cctv`, { signal: AbortSignal.timeout(20000), next: { revalidate: 3600 } }),
      fetch(`${origin}/api/weather`, { signal: AbortSignal.timeout(20000), next: { revalidate: 300 } }),
      fetch(`${origin}/api/infrastructure`, { signal: AbortSignal.timeout(20000), next: { revalidate: 86400 } }),
      fetch(`${origin}/api/gdelt`, { signal: AbortSignal.timeout(20000), next: { revalidate: 300 } })
    ]);

    let flights = 0;
    let sats = 0;
    let cctv = 0;
    let weather = 0;
    let nuclear = 0;
    let incidents = 0;

    // Safely parse counts
    if (flightsRes.status === 'fulfilled' && flightsRes.value.ok) {
      const data = await flightsRes.value.json();
      flights = (data.commercial_flights?.length || 0) + 
                (data.private_flights?.length || 0) + 
                (data.private_jets?.length || 0) + 
                (data.military_flights?.length || 0);
    }

    if (satsRes.status === 'fulfilled' && satsRes.value.ok) {
      const data = await satsRes.value.json();
      sats = data.satellites?.length || 0;
    }

    if (cctvRes.status === 'fulfilled' && cctvRes.value.ok) {
      const data = await cctvRes.value.json();
      cctv = data.cameras?.length || 0;
    }

    if (weatherRes.status === 'fulfilled' && weatherRes.value.ok) {
      const data = await weatherRes.value.json();
      weather = data.events?.length || 0;
    }

    if (infraRes.status === 'fulfilled' && infraRes.value.ok) {
      const data = await infraRes.value.json();
      nuclear = data.infrastructure?.length || 0;
    }

    if (gdeltRes.status === 'fulfilled' && gdeltRes.value.ok) {
        const data = await gdeltRes.value.json();
        incidents = data.events?.length || 0;
    }

    return NextResponse.json({
      stats: {
        flights,
        sats,
        cctv,
        weather,
        nuclear,
        incidents
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      }
    });

  } catch (error) {
    console.error('Stats aggregation failed:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}

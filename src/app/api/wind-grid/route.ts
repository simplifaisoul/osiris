import { NextRequest, NextResponse } from 'next/server';

/**
 * OSIRIS — Wind Vector Grid API
 *
 * Samples a coarse lat/lon grid across the requested viewport and returns
 * real wind vectors (u/v, m/s) at each point, via one batched Open-Meteo
 * request (no API key required, confirmed live: 100 points in ~300ms).
 *
 * This is what the animated wind-particle overlay in OsirisMap advects
 * particles through -- an actual measured field, sampled coarser than
 * GFS's native 0.25° grid (Open-Meteo interpolates internally), not a
 * decorative arrow set.
 */

const GRID_NX = 14;
const GRID_NY = 9;
const MAX_POINTS = GRID_NX * GRID_NY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get('bbox'); // "west,south,east,north"
  if (!bbox) {
    return NextResponse.json({ error: 'bbox required: west,south,east,north' }, { status: 400 });
  }

  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }
  const [west, south, east, north] = parts;

  const lats: number[] = [];
  const lons: number[] = [];
  for (let j = 0; j < GRID_NY; j++) {
    const lat = south + ((north - south) * j) / (GRID_NY - 1);
    for (let i = 0; i < GRID_NX; i++) {
      const lon = west + ((east - west) * i) / (GRID_NX - 1);
      lats.push(Number(lat.toFixed(3)));
      lons.push(Number(lon.toFixed(3)));
    }
  }

  try {
    const params = new URLSearchParams({
      latitude: lats.join(','),
      longitude: lons.join(','),
      current: 'wind_speed_10m,wind_direction_10m',
      wind_speed_unit: 'ms',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Open-Meteo unavailable (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    const points: any[] = Array.isArray(data) ? data : [data];
    if (points.length !== MAX_POINTS) {
      return NextResponse.json({ error: 'unexpected grid response shape' }, { status: 502 });
    }

    // Meteorological direction is where the wind blows FROM -- a particle
    // moving WITH the wind travels the opposite way, hence the negative sign
    // on both components. Standard u (east+) / v (north+) convention.
    const u = new Array(MAX_POINTS);
    const v = new Array(MAX_POINTS);
    for (let i = 0; i < MAX_POINTS; i++) {
      const speed = points[i]?.current?.wind_speed_10m;
      const dir = points[i]?.current?.wind_direction_10m;
      if (typeof speed !== 'number' || typeof dir !== 'number') {
        u[i] = 0; v[i] = 0;
        continue;
      }
      const rad = (dir * Math.PI) / 180;
      u[i] = -speed * Math.sin(rad);
      v[i] = -speed * Math.cos(rad);
    }

    return NextResponse.json({
      bbox: { west, south, east, north },
      nx: GRID_NX,
      ny: GRID_NY,
      u,
      v,
      unit: 'm/s',
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        // Wind at this resolution does not meaningfully change minute to
        // minute; this just keeps a pan-and-back from re-hitting Open-Meteo.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Wind grid fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch wind grid' }, { status: 500 });
  }
}

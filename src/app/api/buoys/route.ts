import { NextResponse } from 'next/server';
import { runSource } from '@/lib/sources';
import { ndbcBuoys } from '@/lib/sources/adapters/ndbcBuoys';

/**
 * Osiris — NOAA NDBC Marine Buoys
 * Real-time wind/wave/temperature observations from moored ocean buoys, keyless.
 */

export async function GET() {
  const result = await runSource(ndbcBuoys);

  return NextResponse.json({
    buoys: result.data ?? [],
    total: result.data?.length ?? 0,
    timestamp: new Date().toISOString(),
    source: result.sourceId,
    stale: result.stale,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
  });
}

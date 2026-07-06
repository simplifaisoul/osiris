import { NextResponse } from 'next/server';
import { runSource } from '@/lib/sources';
import { noaaTsunami } from '@/lib/sources/adapters/noaaTsunami';

/**
 * Osiris — NOAA Tsunami Warning Center
 * Recent tsunami information statements/warnings, keyless.
 */

export async function GET() {
  const result = await runSource(noaaTsunami);

  return NextResponse.json({
    events: result.data ?? [],
    total: result.data?.length ?? 0,
    timestamp: new Date().toISOString(),
    source: result.sourceId,
    stale: result.stale,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}

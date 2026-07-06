import { NextResponse } from 'next/server';
import { runSource } from '@/lib/sources';
import { shodanExposed } from '@/lib/sources/adapters/shodanExposed';

/**
 * Osiris — Shodan Exposed Devices
 * Opt-in, keyed (SHODAN_API_KEY). Disabled cleanly without a key.
 */

export async function GET() {
  const result = await runSource(shodanExposed);

  return NextResponse.json({
    hosts: result.data ?? [],
    total: result.data?.length ?? 0,
    timestamp: new Date().toISOString(),
    source: result.sourceId,
    stale: result.stale,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  });
}

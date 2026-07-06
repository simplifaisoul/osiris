import { NextResponse } from 'next/server';
import { runSource } from '@/lib/sources';
import { ransomwareTracker } from '@/lib/sources/adapters/ransomwareTracker';

/**
 * Osiris — ransomware.live Recent Victims
 * Recently disclosed ransomware victims by group/country, keyless.
 */

export async function GET() {
  const result = await runSource(ransomwareTracker);

  return NextResponse.json({
    victims: result.data ?? [],
    total: result.data?.length ?? 0,
    timestamp: new Date().toISOString(),
    source: result.sourceId,
    stale: result.stale,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
  });
}

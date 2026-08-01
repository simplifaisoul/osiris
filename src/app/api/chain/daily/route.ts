import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { buildDailyBrief } from '@/lib/chainFeeds';

/**
 * OSIRIS — Daily chain-threat brief.
 *
 * Aggregates on-chain exploits (DefiLlama), crypto/blockchain CVEs (NVD)
 * and newly designated OFAC wallets into one dated digest. Fully keyless.
 * Sections degrade independently and report why via `degraded`.
 */

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(120, Math.max(1, Number(searchParams.get('days')) || 30));
  const force = searchParams.get('refresh') === '1';

  if (isRateLimited(getClientIp(req), 30, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const brief = await buildDailyBrief(days, force);
    return NextResponse.json(brief, {
      // Matches the in-process cache; the upstreams move daily at most.
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (e) {
    console.error('[OSIRIS] daily brief failed:', e);
    return NextResponse.json({ error: 'Failed to build daily brief' }, { status: 502 });
  }
}

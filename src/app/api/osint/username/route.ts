import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { scanUsername, isValidUsername } from '@/lib/sherlock';

/**
 * OSIRIS — Username enumeration across social platforms.
 *
 * Implements the Sherlock Project's detection rules against its site
 * database (MIT). Keyless.
 *
 *   ?username=  target handle (required)
 *   ?all=1      sweep the full database instead of the priority tier
 *   ?nsfw=1     include adult sites (excluded by default)
 *   ?limit=     cap the number of sites checked
 */

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get('username') || '').trim();

  if (!username) {
    return NextResponse.json({ error: 'Missing username parameter' }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Invalid username. Allowed: letters, digits, and . _ - @ (max 64).' },
      { status: 400 }
    );
  }

  // Each scan fans out to dozens of upstreams, so this is stricter than the
  // other OSINT routes.
  if (isRateLimited(getClientIp(req), 6, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const all = searchParams.get('all') === '1';
  const includeNsfw = searchParams.get('nsfw') === '1';
  const limitParam = Number(searchParams.get('limit'));
  // A full sweep has to fit the request budget; concurrency rises with breadth
  // but stays bounded so the connection pool survives.
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : all ? 200 : undefined;

  try {
    const scan = await scanUsername(username, {
      all,
      includeNsfw,
      limit,
      concurrency: all ? 18 : 12,
      timeoutMs: all ? 6000 : 8000,
      verify: searchParams.get('verify') !== '0',
    });
    return NextResponse.json(
      { ...scan, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    console.error('[OSIRIS] username scan failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Username scan failed' },
      { status: 502 }
    );
  }
}

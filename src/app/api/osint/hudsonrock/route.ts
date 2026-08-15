import { NextResponse } from 'next/server';

/**
 * OSIRIS — Hudson Rock Infostealer Intelligence
 *
 * Cavalier's free OSINT endpoints report whether an asset appears in Hudson
 * Rock's infostealer corpus — machines compromised by Redline, Lumma, Vidar
 * and friends, whose saved credentials are circulating. No key required.
 *
 * Credentials come back already redacted at source (`0**********e`, IPs as
 * `202.9.**.**`), so nothing here needs further masking before display.
 *
 * Two response shapes, kept distinct rather than flattened:
 *   person (email / username / phone) → { message, stealers[], total_* }
 *   domain                            → org-wide counts, password strength
 *                                       stats, third parties, stealer families
 */

const BASE = 'https://cavalier.hudsonrock.com/api/json/v2/osint-tools';

export type AssetType = 'email' | 'domain' | 'username' | 'phone';

// A phone number is looked up through the username endpoint — that is what
// Hudson Rock exposes; there is no search-by-phone.
const ENDPOINTS: Record<AssetType, { path: string; param: string }> = {
  email:    { path: 'search-by-email',    param: 'email' },
  domain:   { path: 'search-by-domain',   param: 'domain' },
  username: { path: 'search-by-username', param: 'username' },
  phone:    { path: 'search-by-username', param: 'username' },
};

/**
 * One input box serves all four asset types, so the type is inferred unless
 * the caller pins it with &type=. Order matters: an email also contains the
 * dot a domain is matched on, and a phone number must be tested before the
 * username catch-all.
 */
export function detectAssetType(raw: string): AssetType {
  const q = raw.trim();
  if (q.includes('@')) return 'email';
  if (/^\+?[\d][\d\s().-]{6,}$/.test(q)) return 'phone';
  if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i.test(q)) return 'domain';
  return 'username';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').trim();
  const forced = searchParams.get('type') as AssetType | null;

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const type: AssetType = forced && ENDPOINTS[forced] ? forced : detectAssetType(query);
  const { path, param } = ENDPOINTS[type];
  const url = `${BASE}/${path}?${param}=${encodeURIComponent(query)}`;

  try {
    // A domain lookup aggregates every compromised machine touching that
    // organisation and measured ~4.5s against tesla.com, so this is well
    // above what the person lookups (~0.6s) need.
    const res = await fetch(url, {
      signal: AbortSignal.timeout(25000),
      headers: { Accept: 'application/json' },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      // Cavalier rejects malformed input with 400 {success:false,error:"…"},
      // which is worth surfacing verbatim — it names the actual problem
      // ("Email must be a valid email address") better than we could.
      return NextResponse.json(
        { error: data?.error || `Hudson Rock returned ${res.status}`, query, type },
        { status: res.status === 400 ? 400 : 502 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Hudson Rock returned an unreadable response', query, type }, { status: 502 });
    }

    // Domain responses have no `stealers` array and no `message`; a clean
    // person lookup returns 200 with stealers: [] rather than a 404, so
    // "compromised" has to be read from the payload, not the status code.
    const compromised =
      type === 'domain'
        ? Number(data.totalStealers || 0) > 0
        : Array.isArray(data.stealers) && data.stealers.length > 0;

    return NextResponse.json(
      { query, type, compromised, source: 'Hudson Rock Cavalier', ...data },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return NextResponse.json(
      { error: timedOut ? 'Hudson Rock lookup timed out' : 'Hudson Rock lookup failed', query, type },
      { status: 504 }
    );
  }
}

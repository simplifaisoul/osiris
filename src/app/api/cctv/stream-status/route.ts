import { NextResponse } from 'next/server';
import { safeFetch } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/** rtsp.me shows this when the camera owner's quota is exhausted */
const RTSP_BLOCKED = /temporarily limited|Top up/i;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');

  // Check the host, not the string. "https://evil.com/?x=rtsp.me/embed"
  // satisfies a substring test, which turned this into a fetch-anything route.
  // safeFetch still refused private ranges, so it was never an internal-network
  // hole, but the host is what should have been gating it.
  let host = '';
  try { host = new URL(url || '').hostname.toLowerCase(); } catch { /* not a URL */ }
  const isRtspMe = host === 'rtsp.me' || host.endsWith('.rtsp.me');

  if (!url || !isRtspMe || !/\/embed/i.test(url)) {
    return NextResponse.json({ available: false, blocked: false, reason: 'not_rtsp_me' });
  }

  try {
    const res = await safeFetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0; +https://github.com/simplifaisoul/osiris)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ available: false, blocked: true, provider: 'rtsp.me' });
    }

    const html = await res.text();
    const blocked = RTSP_BLOCKED.test(html);

    return NextResponse.json({
      available: !blocked,
      blocked,
      provider: 'rtsp.me',
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    return NextResponse.json({ available: null, blocked: null, provider: 'rtsp.me' }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

/* When CARTO refuses this proxy (403) or rate-limits it (429), it does so for
   every tile, and asking anyway costs an upstream round trip per tile — hundreds
   a second on a busy server — for an answer already known. That work starves
   the rest of the app. So after REFUSAL_LIMIT refusals inside REFUSAL_WINDOW_MS,
   stop asking for PAUSE_MS. Tiles already in Next's fetch cache are still
   served during the pause; everything else gets the same refusal at once. Once
   the pause ends, tiles are requested again, and only a fresh run of refusals
   starts another pause. */
const REFUSAL_LIMIT = 20;
const REFUSAL_WINDOW_MS = 60_000;
const PAUSE_MS = 60_000;
const recentRefusals: number[] = [];
let pausedUntil = 0;

function noteRefusal() {
  const now = Date.now();
  recentRefusals.push(now);
  if (recentRefusals.length > REFUSAL_LIMIT) recentRefusals.shift();
  if (recentRefusals.length === REFUSAL_LIMIT && now - recentRefusals[0] < REFUSAL_WINDOW_MS) {
    pausedUntil = now + PAUSE_MS;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const paused = Date.now() < pausedUntil;
  try {
    /* Only CARTO's basemap hosts, over https on the default port: the style,
       tiles, sprite and fonts all live there, and the map needs nothing else
       from cartocdn.com. No basemap URL has a query string, so it is dropped,
       which keeps one stored copy per tile in the year-long fetch cache. */
    const targetUrl = new URL(url);
    const host = targetUrl.hostname.toLowerCase();
    if (
      targetUrl.protocol !== 'https:' || targetUrl.port || targetUrl.username || targetUrl.password ||
      (host !== 'basemaps.cartocdn.com' && !host.endsWith('.basemaps.cartocdn.com'))
    ) {
      return NextResponse.json({ error: 'Forbidden domain' }, { status: 403 });
    }
    targetUrl.search = '';
    targetUrl.hash = '';

    /* While paused, an already-aborted signal: Next looks in its fetch cache
       before the network, so a cached tile still comes back, and anything else
       fails here without leaving the server. */
    const response = await fetch(targetUrl.toString(), { signal: paused ? AbortSignal.abort() : AbortSignal.timeout(15000),
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Osiris-Tile-Proxy/1.0',
      },
      // Using Next.js fetch cache options to heavily cache tiles locally
      next: {
        revalidate: 31536000, // Cache for 1 year
      }
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) noteRefusal();
      return NextResponse.json({ error: 'Failed to fetch tile' }, { status: response.status });
    }

    const data = await response.arrayBuffer();
    
    // Forward the content-type from the upstream response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    if (paused) return NextResponse.json({ error: 'Failed to fetch tile' }, { status: 403 });
    console.error('Tile proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

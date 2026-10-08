import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Only allow approved tile domains to prevent open proxy abuse
    const targetUrl = new URL(url);
    const host = targetUrl.hostname.toLowerCase();
    const ALLOWED_TILE_DOMAINS = [
      'cartocdn.com',
      'yandex.net',        // Яндекс-спутник (core-sat-*.yandex.net)
      'yandex.ru',
      'yandex.com',
      'nayawp.ru',        // зеркала спутниковых тайлов Яндекса
      'arcgisonline.com', // ESRI World Imagery
    ];
    const allowed = ALLOWED_TILE_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden domain' }, { status: 403 });
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://yandex.ru/maps/',
      },
      // Using Next.js fetch cache options to heavily cache tiles locally
      next: {
        revalidate: 31536000, // Cache for 1 year
      }
    });

    if (!response.ok) {
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
    console.error('Tile proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

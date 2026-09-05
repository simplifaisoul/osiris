import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * CCTV image proxy — bypasses CORS / hotlink protection on camera CDNs.
 * Whitelisted domains only to prevent open-proxy abuse.
 */
const ALLOWED_HOSTS = [
  'cdn.skylinewebcams.com',
  'cdn2.skylinewebcams.com',
  's3-eu-west-1.amazonaws.com',
  'voyage.aprr.fr',
  // Rijkswaterstaat motorway frames — 401 without a Referer.
  'stream.inmoves.nl',
  'thb.gov.tw',
  'etraffic.dgt.es',
];

// Taiwan Highway Bureau cameras are DigiEver encoders, and they emit a
// malformed response header when the request carries a Referer — Node's parser
// then rejects the entire response with "Parse Error: Invalid header token".
// Asking without a Referer returns a clean JPEG. Measured across all eight
// cctv-ss01…08 servers: 8/8 fail with a Referer, 8/8 succeed without one.
//
// This is what the old curl.exe shell-out was working around. That never ran in
// production at all — curl.exe is a Windows binary name, so on the Linux host
// every THB request failed, which is why the live map showed "FEED UNAVAILABLE"
// on Taiwan while it worked on a Windows dev machine.
//
// An Accept header is still required: without one these servers hang up.
const NO_REFERER_HOSTS = ['thb.gov.tw'];

function isAllowed(hostname: string): boolean {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

function sendsReferer(hostname: string): boolean {
  return !NO_REFERER_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

/** Fetches a camera frame. `referer` is omitted for hosts that choke on it. */
function proxyFetch(url: string, referer: string | null): Promise<{ status: number; contentType: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Accept': 'image/*,*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    };
    if (referer) headers['Referer'] = referer;

    const options: any = {
      headers,
      timeout: 12000,
    };

    if (isHttps) {
      options.rejectUnauthorized = false;
    }

    const req = mod.get(url, options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        proxyFetch(res.headers.location, referer).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 502,
          contentType: res.headers['content-type'] || 'image/jpeg',
          data: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!isAllowed(target.hostname.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden domain: ' + target.hostname }, { status: 403 });
  }

  try {
    const host = target.hostname.toLowerCase();
    const result = await proxyFetch(
      target.toString(),
      sendsReferer(host) ? `https://${target.hostname}/` : null
    );

    if (result.status >= 400) {
      return NextResponse.json({ error: `Upstream ${result.status}` }, { status: result.status });
    }

    return new NextResponse(new Uint8Array(result.data), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Camera proxy error:', error?.message || error);
    return NextResponse.json({ error: 'Proxy failed: ' + (error?.message || 'unknown') }, { status: 502 });
  }
}

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
  'thb.gov.tw',
];

// THB servers send non-standard HTTP headers that Node's strict parser rejects.
// These need special handling via curl fallback.
const LENIENT_HOSTS = ['thb.gov.tw'];

function isAllowed(hostname: string): boolean {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

function needsLenientParsing(hostname: string): boolean {
  return LENIENT_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

/** Standard proxy for well-behaved servers */
function proxyFetch(url: string, referer: string): Promise<{ status: number; contentType: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options: any = {
      headers: {
        'Accept': 'image/*,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': referer,
      },
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

/** Lenient proxy using fetch for servers with non-standard HTTP headers */
async function lenientFetch(url: string): Promise<{ status: number; contentType: string; data: Buffer }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/*,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return { status: res.status, contentType: 'application/json', data: Buffer.from('{}') };
    const arrayBuffer = await res.arrayBuffer();
    return { status: 200, contentType: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(arrayBuffer) };
  } catch {
    return { status: 502, contentType: 'application/json', data: Buffer.from('{}') };
  }
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
    let result: { status: number; contentType: string; data: Buffer };

    if (needsLenientParsing(target.hostname.toLowerCase())) {
      result = await lenientFetch(target.toString());
    } else {
      result = await proxyFetch(target.toString(), `https://${target.hostname}/`);
    }

    if (result.status >= 400) {
      return NextResponse.json({ error: `Upstream ${result.status}` }, { status: result.status });
    }

    return new NextResponse(result.data, {
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

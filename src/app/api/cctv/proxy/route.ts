import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import http from 'http';
import net from 'node:net';
import { validateHost } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * CCTV image proxy — bypasses CORS / hotlink protection on camera CDNs.
 * Whitelisted domains only to prevent open-proxy abuse.
 *
 * Never list a shared host here — a cloud storage endpoint, a CDN anyone can
 * publish to. This route answers on OSIRIS's own origin, so anyone able to put
 * a file on an allowed host can have OSIRIS serve it.
 */
const ALLOWED_HOSTS = [
  'cdn.skylinewebcams.com',
  'cdn2.skylinewebcams.com',
  'voyage.aprr.fr',
  // Rijkswaterstaat motorway frames — 401 without a Referer.
  'stream.inmoves.nl',
  'thb.gov.tw',
  'etraffic.dgt.es',
  'eismoinfo.lt',
  // Serves over plain http, which an https page blocks as mixed content.
  'infobanjirjps.selangor.gov.my',
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

const RASTER_TYPE = /^image\/(jpeg|pjpeg|png|gif|webp|avif|bmp)\s*(;|$)/i;

/**
 * The type to serve a frame as, or null when it is not a picture.
 *
 * Singapore's LTA cameras label every JPEG `application/octet-stream` and send
 * `X-Content-Type-Options: nosniff` with it, so the browser refuses to render
 * it in an <img> and all nine cameras showed as broken. The first bytes of a
 * file say what it is; a declared raster type is taken at its word.
 *
 * Anything else is refused: HTML, and SVG too, which can carry script. This
 * route answers on OSIRIS's own origin, so a page relayed through it would run
 * as OSIRIS and could read what visitors keep in its storage.
 */
export function imageType(data: Buffer, declared: string): string | null {
  if (RASTER_TYPE.test(declared)) return declared;
  const head = data.subarray(0, 12);
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

/**
 * A host that answers on one address and blackholes another is common among
 * camera operators: infobanjirjps.selangor.gov.my publishes 175.143.72.197,
 * which answers in two seconds, and 58.27.97.62, which accepts the connection
 * and then says nothing. Node sends the request to whichever address the
 * resolver hands it first and waits out the timeout, where a browser would
 * have moved on. So each address is tried in turn, and the attempt timeout is
 * short enough that two fit inside this route's budget.
 */
const ATTEMPT_TIMEOUT_MS = 6000;
const MAX_ADDRESSES = 2;
const MAX_REDIRECTS = 3;

/**
 * Fetches a camera frame, trying each address the host publishes.
 *
 * Every hop is checked, redirects included: it must be an allowed camera host,
 * and every address it resolves to must be public. The request then goes to
 * those checked addresses, so a second DNS answer cannot swap in another.
 */
async function fetchFrame(url: string, referer: string | null, redirects = 0): Promise<{ status: number; contentType: string; data: Buffer }> {
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol) || !isAllowed(target.hostname.toLowerCase())) {
    throw new Error('Redirected outside the camera allowlist');
  }
  const check = await validateHost(target.hostname);
  if (!check.ok) throw new Error('Camera host is not on a public address');
  let lastError: unknown;
  for (const address of (check.resolved ?? []).slice(0, MAX_ADDRESSES)) {
    try {
      return await proxyFetch(url, referer, address, redirects);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('No address answered');
}

/** One attempt, against one address. `referer` is omitted for hosts that choke on it. */
function proxyFetch(url: string, referer: string | null, address: string, redirects: number): Promise<{ status: number; contentType: string; data: Buffer }> {
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
      timeout: ATTEMPT_TIMEOUT_MS,
    };

    /* Only the address is pinned; the Host header and TLS name still come
       from the URL, so the request is the same one Node would have sent, and
       the certificate is still checked against the host's name. */
    const family = net.isIPv6(address) ? 6 : 4;
    options.lookup = (_host: string, opts: { all?: boolean }, cb: (err: null, addr: unknown, family?: number) => void) =>
      // Node asks for every address when Happy Eyeballs is on; this is the one.
      cb(null, opts?.all ? [{ address, family }] : address, family);

    const req = mod.get(url, options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('Too many redirects'));
          return;
        }
        // A redirect can point at another host, so it is checked afresh.
        fetchFrame(new URL(res.headers.location, url).toString(), referer, redirects + 1).then(resolve).catch(reject);
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
    const result = await fetchFrame(
      target.toString(),
      sendsReferer(host) ? `https://${target.hostname}/` : null
    );

    if (result.status >= 400) {
      return NextResponse.json({ error: `Upstream ${result.status}` }, { status: result.status });
    }

    const type = imageType(result.data, result.contentType);
    if (!type) {
      return NextResponse.json({ error: 'Upstream did not send an image' }, { status: 502 });
    }

    return new NextResponse(new Uint8Array(result.data), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=10',
        'Access-Control-Allow-Origin': '*',
        // A declared raster type is trusted above; nosniff holds the browser to it.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Camera proxy error:', error?.message || error);
    return NextResponse.json({ error: 'Proxy failed: ' + (error?.message || 'unknown') }, { status: 502 });
  }
}

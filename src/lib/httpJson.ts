import https from 'https';
import zlib from 'zlib';
import type { IncomingHttpHeaders } from 'http';
import type { Readable } from 'stream';

/**
 * OSIRIS — JSON fetch over Node's https client.
 *
 * Some upstreams OSIRIS depends on cannot be reached with the bundled undici
 * `fetch` from the Next server runtime — it stalls and throws
 * UND_ERR_CONNECT_TIMEOUT after 10s, while `https.get` to the same URL returns
 * in a few hundred ms. This helper is the shared escape hatch.
 *
 * It also sends a real identifying User-Agent rather than a spoofed browser
 * one: the OSM community endpoints (Nominatim, Overpass) reject browser UAs
 * with 406/429 and ask for contact details in their usage policies.
 */

export const OSIRIS_UA = 'OSIRIS-OSINT/1.0 (+https://github.com/simplifaisoul/osiris)';

export interface RequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * One request, decoded but not interpreted.
 *
 * Everything public here is a thin wrapper over this, so the connection
 * handling — identifying UA, timeout, content-encoding decode — is written
 * once. A 304 resolves with an empty body rather than throwing: it is a
 * successful answer to a conditional request, not an error.
 */
function request(url: string, { timeoutMs = 20000, headers = {} }: RequestOptions): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { 'User-Agent': OSIRIS_UA, Accept: 'application/json', 'Accept-Language': 'en', ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 400) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        // 304 carries no body, and no content-encoding to decode.
        if (status === 304) {
          res.resume();
          resolve({ status, headers: res.headers, body: '' });
          return;
        }

        // Some hosts serve pre-compressed static JSON and set Content-Encoding
        // regardless of what we asked for — adsb.lol's trace files do exactly
        // that — so decode by the header rather than by what we requested.
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        let stream: Readable = res;
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        let body = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => { body += chunk; });
        stream.on('error', reject);
        stream.on('end', () => resolve({ status, headers: res.headers, body }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Upstream timed out')));
    req.on('error', reject);
  });
}

/** The transport, stopping short of the JSON parse — for CSV and plain text. */
export async function httpText(url: string, opts: RequestOptions = {}): Promise<string> {
  return (await request(url, opts)).body;
}

export async function httpJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  return JSON.parse(await httpText(url, opts)) as T;
}

/** Validators from a previous response, replayed to ask whether it has changed. */
export interface Validators {
  etag?: string;
  lastModified?: string;
}

export interface ConditionalResult extends Validators {
  /** False when the upstream answered 304 — the caller's copy is still current. */
  changed: boolean;
  /** Null on 304. */
  body: string | null;
}

/**
 * A conditional GET, for polling a large dump that changes rarely.
 *
 * Re-downloading a multi-megabyte file on a fast poll to discover it is
 * byte-identical is the expensive way to learn nothing. Replaying the previous
 * `ETag`/`Last-Modified` lets the upstream answer 304 with an empty body
 * instead, which turns the common case into a few hundred bytes of headers.
 *
 * Pass the validators from the previous call; store the ones this returns.
 * With none supplied it degrades to an ordinary GET, so the first call and any
 * upstream that ignores validators both still work.
 */
export async function httpConditional(
  url: string,
  { etag, lastModified, ...opts }: RequestOptions & Validators = {},
): Promise<ConditionalResult> {
  const conditional: Record<string, string> = {};
  if (etag) conditional['If-None-Match'] = etag;
  if (lastModified) conditional['If-Modified-Since'] = lastModified;

  const res = await request(url, { ...opts, headers: { ...opts.headers, ...conditional } });

  const next: Validators = {
    etag: typeof res.headers.etag === 'string' ? res.headers.etag : etag,
    lastModified: typeof res.headers['last-modified'] === 'string' ? res.headers['last-modified'] : lastModified,
  };

  if (res.status === 304) return { changed: false, body: null, ...next };
  return { changed: true, body: res.body, ...next };
}

/** Resolve a promise to null instead of throwing — for optional enrichment calls. */
export async function optional<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}

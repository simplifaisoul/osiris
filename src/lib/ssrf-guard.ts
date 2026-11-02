import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard shared by route handlers that take a user-controlled host / IP
 * and turn it into a network request.
 *
 * Defense is two-layered:
 *   1. Canonicalise the input. Reject non-dotted-quad IPv4 forms and any
 *      IPv6 address that falls inside a reserved range.
 *   2. For hostnames, resolve A + AAAA records and reject if *any* answer
 *      lands in a reserved range. Total Time-Of-Check / Time-Of-Use defence
 *      requires IP pinning at the socket layer, but rejecting at lookup time
 *      blocks every non-rebinding attack and forces a rebinder to win a
 *      TTL=0 race against the downstream consumer.
 */

const IPV4_BLOCKS_TEXT: Array<[string, number]> = [
  ['0.0.0.0', 8],          // "this" network
  ['10.0.0.0', 8],         // RFC1918
  ['100.64.0.0', 10],      // CGNAT / Tailscale
  ['127.0.0.0', 8],        // loopback
  ['169.254.0.0', 16],     // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12],      // RFC1918
  ['192.0.0.0', 24],       // IETF protocol assignments
  ['192.0.2.0', 24],       // TEST-NET-1
  ['192.168.0.0', 16],     // RFC1918
  ['198.18.0.0', 15],      // benchmarking
  ['198.51.100.0', 24],    // TEST-NET-2
  ['203.0.113.0', 24],     // TEST-NET-3
  ['224.0.0.0', 4],        // multicast
  ['240.0.0.0', 4],        // reserved (incl. 255.255.255.255 broadcast)
];

const IPV6_BLOCK_PREFIXES = [
  '::',           // unspecified
  '::1',          // loopback
  '::ffff:',      // IPv4-mapped (covers ::ffff:127.0.0.1, ::ffff:10.x, etc.)
  '64:ff9b::',    // NAT64
  '64:ff9b:1:',   // local NAT64
  '100::',        // discard prefix
  '2001:db8:',    // documentation
  'fc',           // unique-local (fc00::/7) — any addr starting with fc/fd
  'fd',
  'fe8', 'fe9', 'fea', 'feb', // link-local fe80::/10
  'fec', 'fed', 'fee', 'fef', // site-local fec0::/10 (deprecated but still routable to internal hosts on some stacks)
  'ff',           // multicast ff00::/8
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  // Build the 32-bit value via multiplication so the intermediate stays a
  // safe positive integer; bitwise OR would coerce to a signed int32.
  return parts[0] * 0x1000000 + parts[1] * 0x10000 + parts[2] * 0x100 + parts[3];
}

function ipv4InBlocked(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [net, bits] of IPV4_BLOCKS_TEXT) {
    const netInt = ipv4ToInt(net);
    // 2^(32-bits) is the size of the block; the "network address" must match
    // after stripping the host bits.
    const blockSize = bits === 0 ? 0x100000000 : Math.pow(2, 32 - bits);
    if (Math.floor(ipInt / blockSize) === Math.floor(netInt / blockSize)) return true;
  }
  return false;
}

function ipv6InBlocked(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  // Exact-match singletons first
  if (lower === '::' || lower === '::1') return true;
  for (const prefix of IPV6_BLOCK_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Returns the canonical dotted-quad form if `s` looks like an IPv4 address in
 * any common notation (dotted-quad, dotted-octal, dotted-hex, decimal, hex
 * single-int), otherwise null. Non-canonical forms (e.g. `2130706433`,
 * `0177.0.0.1`, `0x7f.0.0.1`) get rejected at the parse step so callers can
 * decline them rather than try to figure out what the kernel will resolve.
 */
export function parseIPv4(s: string): string | null {
  // Strict dotted-quad first — fast path
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    const parts = s.split('.').map(Number);
    if (parts.some(p => p < 0 || p > 255)) return null;
    return parts.join('.');
  }
  // Non-canonical forms (decimal, hex, octal, short notation) — reject. The
  // call sites here only ever want canonical dotted-quad; anything else is
  // either an attacker probe or a bug upstream.
  if (/^\d+$/.test(s)) return null;
  if (/^0x[0-9a-fA-F]+$/.test(s)) return null;
  if (/^(\d+\.){0,3}\d+$/.test(s) && s.includes('.')) {
    // Mixed forms — explicitly reject rather than coerce
    return null;
  }
  return null;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  /** Resolved IPs (literal input or DNS answers). Empty if validation failed before resolution. */
  resolved?: string[];
}

/**
 * Validate that `host` (either an IP literal or a hostname) is safe to use as
 * a network target. Returns ok=false when the literal IP is in a blocked
 * range, the IP literal uses a non-canonical form, or any resolved A/AAAA
 * answer lands in a blocked range.
 */
export async function validateHost(host: string): Promise<ValidationResult> {
  const trimmed = host.trim();
  if (!trimmed) return { ok: false, reason: 'empty host' };

  // Strip brackets for IPv6 literals like [::1]
  const bracketed = trimmed.replace(/^\[|\]$/g, '');

  // Reject obvious metadata-style hostnames before they ever hit DNS. These
  // are independent of which IP they resolve to; the names alone are not
  // legitimate scan / probe targets.
  const lowerHost = trimmed.toLowerCase();
  const NAME_BLOCKLIST = [
    /^localhost$/i,
    /\.localhost$/i,
    /^host\.docker\.internal$/i,
    /\.local$/i,
    /\.internal$/i,
    /^metadata\.google\.internal$/i,
  ];
  if (NAME_BLOCKLIST.some(re => re.test(lowerHost))) {
    return { ok: false, reason: 'hostname matches reserved name pattern' };
  }

  // Literal IP path
  const ipFamily = isIP(bracketed);
  if (ipFamily === 4) {
    const canonical = parseIPv4(bracketed);
    if (!canonical) return { ok: false, reason: 'non-canonical IPv4 form rejected' };
    if (ipv4InBlocked(canonical)) return { ok: false, reason: 'IPv4 in reserved range' };
    return { ok: true, resolved: [canonical] };
  }
  if (ipFamily === 6) {
    if (ipv6InBlocked(bracketed)) return { ok: false, reason: 'IPv6 in reserved range' };
    return { ok: true, resolved: [bracketed] };
  }

  // Hostname — basic syntax check then resolve and re-check
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(trimmed)) {
    return { ok: false, reason: 'invalid hostname syntax' };
  }

  let answers: Array<{ address: string; family: number }> = [];
  try {
    answers = await lookup(trimmed, { all: true });
  } catch (err) {
    return { ok: false, reason: `DNS lookup failed: ${(err as Error).message}` };
  }
  if (answers.length === 0) {
    return { ok: false, reason: 'hostname has no A/AAAA records' };
  }
  for (const a of answers) {
    if (a.family === 4) {
      if (ipv4InBlocked(a.address)) return { ok: false, reason: `hostname resolves to reserved IPv4 ${a.address}` };
    } else if (a.family === 6) {
      if (ipv6InBlocked(a.address)) return { ok: false, reason: `hostname resolves to reserved IPv6 ${a.address}` };
    }
  }
  return { ok: true, resolved: answers.map(a => a.address) };
}

/**
 * Wrap a fetch call so that:
 *   - the URL's host is validated before the request (block private targets)
 *   - redirects are followed manually, with each hop re-validated (block a
 *     redirect to a private host from a public-looking original)
 */
export async function safeFetch(
  inputUrl: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 3;
  // Spread into a new init we mutate, then explicitly drop our extra prop
  // so it isn't passed through to fetch().
  const passInit: RequestInit & { maxRedirects?: number } = { ...init };
  delete passInit.maxRedirects;
  let currentUrl = inputUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    let parsed: URL;
    try { parsed = new URL(currentUrl); } catch { throw new Error('safeFetch: invalid URL'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`safeFetch: blocked protocol ${parsed.protocol}`);
    }
    const check = await validateHost(parsed.hostname);
    if (!check.ok) {
      throw new Error(`safeFetch: blocked target — ${check.reason}`);
    }
    const res = await fetch(currentUrl, { ...passInit, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      const nextUrl = new URL(loc, currentUrl).toString();
      currentUrl = nextUrl;
      continue;
    }
    return res;
  }
  throw new Error('safeFetch: too many redirects');
}

// ── SHARED RATE LIMITER ──
// In-memory rate limiting per-isolate for basic proxy abuse prevention
const rateMap = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(ip: string, limit: number = 20, windowMs: number = 60_000): boolean {
  const now = Date.now();
  for (const [key, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(key);
  }
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

/**
 * Best available identity for the caller, for rate-limiting purposes.
 *
 * This used to read the FIRST entry of `x-forwarded-for`, which is the one
 * value in the whole chain the client writes itself. Sending a different
 * `X-Forwarded-For` on every request therefore bought a fresh rate-limit
 * bucket every time, and the scanner's five-per-minute limit did not bind at
 * all. The header order is `client, proxy1, proxy2` — read left to right it is
 * attacker-controlled; the entry our own edge appended is the rightmost one.
 *
 * So: prefer the headers a platform edge sets and overwrites (a client cannot
 * forge `cf-connecting-ip` through Cloudflare), then fall back to the rightmost
 * forwarded entry rather than the leftmost. Anything that does not parse as an
 * address collapses to a single shared 'unknown' bucket, which throttles
 * unidentifiable callers together rather than exempting them.
 */
export function getClientIp(req: Request): string {
  const h = (name: string) => req.headers.get(name)?.trim() || '';

  // Set by the edge itself, not forwardable by the client.
  const platform = h('cf-connecting-ip') || h('x-vercel-forwarded-for') || h('true-client-ip');
  if (platform && isIpLike(platform)) return platform;

  // Set by a reverse proxy we run (nginx et al).
  const real = h('x-real-ip');
  if (real && isIpLike(real)) return real;

  // Rightmost entry is the peer address our nearest proxy observed.
  const chain = h('x-forwarded-for').split(',').map(s => s.trim()).filter(Boolean);
  const nearest = chain[chain.length - 1];
  if (nearest && isIpLike(nearest)) return nearest;

  return 'unknown';
}

/** `[2a00::1]` → `2a00::1`, and `::ffff:81.2.69.142` (how a dual-stack
 *  socket reports an IPv4 peer) → `81.2.69.142`. */
function bareIp(value: string): string {
  return value.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:(?=\d+\.)/i, '');
}

/**
 * True only for an address that can locate a person: a canonical IPv4 or an
 * IPv6 literal outside every reserved range above. The geolocation route
 * used to treat all of 172.0.0.0/8 as private, which threw away real public
 * visitors (T-Mobile US hands out 172.56–172.63) along with 172.16/12.
 */
export function isPublicIp(value: string): boolean {
  const ip = bareIp(value);
  const v4 = parseIPv4(ip);
  if (v4) return !ipv4InBlocked(v4);
  return isIP(ip) === 6 && !ipv6InBlocked(ip);
}

/**
 * The visitor's own address, for geolocation: the first public one among the
 * headers an edge or proxy sets, or null when there is none.
 *
 * Unlike getClientIp this reads X-Forwarded-For left to right. The leftmost
 * entry is client-written, and here that is fine: a forged value only
 * mislocates the person who forged it, while the rightmost entry is often a
 * CDN edge in another city.
 */
export function visitorIp(req: Request): string | null {
  const candidates = ['cf-connecting-ip', 'true-client-ip', 'x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']
    .flatMap(name => (req.headers.get(name) || '').split(','))
    .map(s => s.trim())
    .filter(Boolean);
  const found = candidates.find(isPublicIp);
  return found ? bareIp(found) : null;
}

/** Cheap shape check — rejects the arbitrary strings a spoofed header carries. */
function isIpLike(value: string): boolean {
  const bare = value.startsWith('[') ? value.slice(1, value.indexOf(']')) : value.split('%')[0];
  if (parseIPv4(bare)) return true;
  return /^[0-9a-f:]+$/i.test(bare) && bare.includes(':');
}

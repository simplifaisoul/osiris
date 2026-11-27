import { NextResponse } from 'next/server';
import type { LiveFix } from '@/lib/aircraft-live';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — one aircraft's latest position.
 *
 * The flights layer is a snapshot taken every few minutes; this answers for a
 * single aircraft the operator has selected, so its card can follow it live.
 * adsb.lol is asked first and adsb.fi second. Neither sends CORS headers, so
 * the page cannot ask them itself.
 *
 * Several visitors following the same aircraft share one answer for five
 * seconds, and all requests together are held to a few a second, so a busy
 * day cannot hammer the community feeds; past that the caller is told to come
 * back shortly and moves the aircraft on from its last fix meanwhile.
 */

const CACHE_MS = 5_000;
/** Outbound budget: three requests a second on average, six at once. */
const RATE_PER_S = 3;
const BURST = 6;
/** adsb.fi soft-throttles above about one request a second (it answers with an empty list). */
const ADSBFI_GAP_MS = 1_100;
const UA = 'OSIRIS/1.0 (+https://osirisai.live)';

const cache = new Map<string, { at: number; fix: LiveFix | null }>();
const inflight = new Map<string, Promise<LiveFix | null>>();
let tokens = BURST;
let refilledAt = Date.now();
let adsbFiAt = 0;

function takeToken(now: number): boolean {
  tokens = Math.min(BURST, tokens + ((now - refilledAt) / 1000) * RATE_PER_S);
  refilledAt = now;
  if (tokens < 1) return false;
  tokens -= 1;
  return true;
}

interface ReadsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  lastPosition?: { lat?: number; lon?: number; seen_pos?: number };
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  seen_pos?: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A readsb-style aircraft record (adsb.lol and adsb.fi both answer in this shape) as a fix. */
export function fixFromReadsb(a: ReadsbAircraft, now: number, source: string): LiveFix | null {
  const lat = num(a.lat) ?? num(a.lastPosition?.lat);
  const lng = num(a.lon) ?? num(a.lastPosition?.lon);
  if (lat === null || lng === null || !a.hex) return null;
  const seen = num(a.seen_pos) ?? num(a.lastPosition?.seen_pos) ?? 0;
  const onGround = a.alt_baro === 'ground';
  return {
    icao24: a.hex.toLowerCase(),
    callsign: a.flight?.trim() || null,
    registration: a.r?.trim() || null,
    typeCode: a.t?.trim() || null,
    lat,
    lng,
    altFt: onGround ? null : num(a.alt_baro),
    onGround,
    gsKt: num(a.gs),
    trackDeg: num(a.track) ?? num(a.true_heading),
    vertRateFpm: num(a.baro_rate) ?? num(a.geom_rate),
    squawk: a.squawk?.trim() || null,
    at: Math.round(now - seen * 1000),
    source,
  };
}

async function ask(url: string, source: string): Promise<LiveFix | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`${source} ${res.status}`);
  const body = (await res.json()) as { ac?: ReadsbAircraft[] };
  const a = body.ac?.[0];
  return a ? fixFromReadsb(a, Date.now(), source) : null;
}

async function lookup(hex: string): Promise<LiveFix | null> {
  let fix: LiveFix | null = null;
  try { fix = await ask(`https://api.adsb.lol/v2/hex/${hex}`, 'adsb.lol'); } catch { /* try the next */ }
  // Only a current position from the first answers outright; an old last-known
  // one is worth a second opinion.
  const now = Date.now();
  if ((!fix || now - fix.at > 60_000) && now - adsbFiAt >= ADSBFI_GAP_MS) {
    adsbFiAt = now;
    try {
      const other = await ask(`https://opendata.adsb.fi/api/v2/hex/${hex}`, 'adsb.fi');
      if (other && (!fix || other.at > fix.at)) fix = other;
    } catch { /* keep what we have */ }
  }
  return fix;
}

export async function GET(req: Request) {
  const hex = new URL(req.url).searchParams.get('icao24')?.trim().toLowerCase() ?? '';
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return NextResponse.json({ error: 'six-digit hex icao24 required' }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(hex);
  let fix: LiveFix | null;
  if (hit && now - hit.at < CACHE_MS) {
    fix = hit.fix;
  } else {
    let pending = inflight.get(hex);
    if (!pending) {
      if (!takeToken(now)) {
        return NextResponse.json({ error: 'busy' }, { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } });
      }
      pending = lookup(hex).finally(() => inflight.delete(hex));
      inflight.set(hex, pending);
    }
    fix = await pending;
    cache.set(hex, { at: Date.now(), fix });
    // The map of recent answers stays small: drop the stale ones as it grows.
    if (cache.size > 2_000) for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k);
  }

  if (!fix) {
    return NextResponse.json({ error: 'no position', icao24: hex }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=5' } });
  }
  return NextResponse.json(fix, { headers: { 'Cache-Control': 'public, s-maxage=5' } });
}

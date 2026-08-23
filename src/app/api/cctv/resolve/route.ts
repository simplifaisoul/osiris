import { NextResponse } from 'next/server';
import { safeFetch } from '@/lib/ssrf-guard';
import { isSkylineUrl, parseSkylinePage } from '@/lib/skyline';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Resolves a SkylineWebcams page to something the viewer can embed.
 *
 * Most of these pages are a wrapper around a public YouTube livestream from the
 * camera's actual operator, so the viewer can show the feed inline instead of
 * sending the operator off-platform. See src/lib/skyline.ts for the breakdown
 * and for why the HLS-backed ones are left alone.
 *
 * The video id is read live rather than baked into the camera data: these are
 * long-running livestreams, and a stream that restarts comes back under a new
 * id. A baked id would work until it silently didn't.
 */

// Three different lifetimes, because these are three different facts.
const OK_TTL_MS = 30 * 60_000;         // a resolved stream id is stable for a while
const NO_FEED_TTL_MS = 5 * 60_000;     // 'this page has no embeddable feed' is a
                                       // property of the page, good to reuse
const UNREACHABLE_TTL_MS = 30_000;     // a network failure says nothing about the
                                       // page. Caching it as long as a real answer
                                       // turns one timeout into minutes of a camera
                                       // looking unavailable when it is fine.
const MAX_ENTRIES = 1000;

type Resolution =
  | { embeddable: true; kind: 'youtube'; videoId: string; embedUrl: string }
  | { embeddable: false; kind: 'hls' | 'unknown' | 'unreachable' };

const cache = new Map<string, { at: number; ttl: number; value: Resolution }>();

function cached(url: string): Resolution | null {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(url);
    return null;
  }
  return hit.value;
}

function remember(url: string, value: Resolution) {
  // Only Skyline URLs reach this, so the key space is bounded by their site —
  // but bound it here too rather than trusting that to stay true.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const ttl = value.embeddable
    ? OK_TTL_MS
    : value.kind === 'unreachable' ? UNREACHABLE_TTL_MS : NO_FEED_TTL_MS;
  cache.set(url, { at: Date.now(), ttl, value });
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url');

  // The host allowlist is what keeps this from being a fetch-anything route:
  // it can only ever retrieve pages from skylinewebcams.com.
  if (!url || !isSkylineUrl(url)) {
    return NextResponse.json(
      { embeddable: false, kind: 'unknown', reason: 'not_skyline' },
      { status: 400 },
    );
  }

  const hit = cached(url);
  if (hit) {
    return NextResponse.json(hit, { headers: { 'X-Cache': 'HIT' } });
  }

  let value: Resolution;
  try {
    const res = await safeFetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0; +https://github.com/simplifaisoul/osiris)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      value = { embeddable: false, kind: 'unreachable' };
    } else {
      const feed = parseSkylinePage(await res.text());
      value = feed.kind === 'youtube'
        ? { embeddable: true, kind: 'youtube', videoId: feed.videoId, embedUrl: feed.embedUrl }
        : { embeddable: false, kind: feed.kind };
    }
  } catch (err) {
    // A resolver failure must not look like "this camera is broken" — the
    // viewer still has the external link to fall back to. Log it, though:
    // a silent catch here is how a wholly broken resolver looks identical
    // to a camera that genuinely has no embeddable feed.
    console.error('cctv resolve failed:', url, err instanceof Error ? err.message : err);
    value = { embeddable: false, kind: 'unreachable' };
  }

  remember(url, value);

  return NextResponse.json(value, {
    headers: {
      'X-Cache': 'MISS',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
    },
  });
}

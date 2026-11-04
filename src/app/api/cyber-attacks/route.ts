import { NextResponse } from 'next/server';
import {
  parseFeodoBlocklist,
  parseTweetFeedC2,
  placeIndicator,
  FEODO_SOURCE,
  FEODO_SOURCE_URL,
  TWEETFEED_SOURCE,
  TWEETFEED_URL,
  type C2Indicator,
} from '@/lib/c2-indicators';
import { locateIps } from '@/lib/malware-live';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — botnet C2 indicators: abuse.ch Feodo Tracker, plus the addresses
 * security researchers posted as #C2 or #botnet in the last 30 days
 * (TweetFeed). See `@/lib/c2-indicators` for what each source is.
 *
 * One indicator per C2 server, carrying only what its source reports. This
 * route does not synthesise attacker origins, attack actions or duplicate
 * events; see `@/lib/c2-indicators` for what it used to do and why that was
 * wrong. Every address is placed by its own geolocation, through the malware
 * layer's cache; a Feodo row that cannot be located keeps its country
 * centroid, and a post that cannot be located is left out, since it names no
 * country at all.
 *
 * `fetched_at` is when OSIRIS polled the providers. It is not an observation
 * time — those are each indicator's `first_seen` and `last_online`.
 */

interface SourceCount { name: string; count: number; error?: string }

interface C2Payload {
  indicators: C2Indicator[];
  total: number;
  online: number;
  fetched_at: string;
  source: string;
  source_url: string;
  sources: SourceCount[];
}

let cached: C2Payload | null = null;
let cacheTime = 0;
/**
 * Feodo changes over days and TweetFeed a few times an hour. Half an hour keeps
 * TweetFeed's ~1 MB month file to ~50 MB a day at most, and its ETag makes an
 * unchanged refresh a 304. A payload missing a source or a location is retried
 * sooner.
 */
const CACHE_TTL = 30 * 60_000;
const RETRY_MS = 5 * 60_000;

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' };

/** TweetFeed's last parse, kept with the ETag that lets a refresh skip the download. */
let tweetFeed: { etag: string | null; indicators: C2Indicator[] } | null = null;

async function feodo(): Promise<C2Indicator[]> {
  const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json', {
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
    headers: { 'User-Agent': 'OSIRIS/4.3', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeodoBlocklist(await res.json());
}

async function tweetFeedC2(now: number): Promise<C2Indicator[]> {
  const res = await fetch(TWEETFEED_URL, {
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
    headers: {
      'User-Agent': 'OSIRIS/4.3',
      Accept: 'text/csv',
      ...(tweetFeed?.etag ? { 'If-None-Match': tweetFeed.etag } : {}),
    },
  });
  if (res.status === 304 && tweetFeed) return tweetFeed.indicators;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const indicators = parseTweetFeedC2(await res.text(), now);
  tweetFeed = { etag: res.headers.get('etag'), indicators };
  return indicators;
}

const reason = (r: PromiseSettledResult<unknown>) =>
  r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : undefined;

export async function GET() {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }

  try {
    const [listed, posted] = await Promise.allSettled([feodo(), tweetFeedC2(now)]);
    if (listed.status === 'rejected' && posted.status === 'rejected') {
      console.warn('[OSIRIS] C2 indicator feeds failed:', reason(listed), reason(posted));
      // An upstream blip must not empty a layer that was showing something.
      if (cached) return NextResponse.json(cached, { headers: CACHE_HEADERS });
      return NextResponse.json({ indicators: [], total: 0, online: 0, error: 'C2 feeds unavailable' });
    }

    const feodoRows = listed.status === 'fulfilled' ? listed.value : [];
    const seen = new Set(feodoRows.map(i => i.ip));
    const postedRows = (posted.status === 'fulfilled' ? posted.value : []).filter(i => !seen.has(i.ip));

    const geo = await locateIps([...feodoRows, ...postedRows].map(i => i.ip));
    const placedPosts = postedRows.map(i => placeIndicator(i, geo.get(i.ip))).filter(i => i.lat !== null);
    const indicators = [...feodoRows.map(i => placeIndicator(i, geo.get(i.ip))), ...placedPosts];

    const result: C2Payload = {
      indicators,
      total: indicators.length,
      online: indicators.filter(i => i.status === 'online').length,
      fetched_at: new Date().toISOString(),
      source: `${FEODO_SOURCE} + ${TWEETFEED_SOURCE}`,
      source_url: FEODO_SOURCE_URL,
      sources: [
        { name: FEODO_SOURCE, count: feodoRows.length, ...(reason(listed) ? { error: reason(listed) } : {}) },
        { name: TWEETFEED_SOURCE, count: placedPosts.length, ...(reason(posted) ? { error: reason(posted) } : {}) },
      ],
    };

    const complete = listed.status === 'fulfilled' && posted.status === 'fulfilled' && placedPosts.length === postedRows.length;
    cached = result;
    cacheTime = complete ? now : now - CACHE_TTL + RETRY_MS;

    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('[OSIRIS] C2 indicator feed error:', error);
    return NextResponse.json({ indicators: [], total: 0, online: 0, error: 'Feed unavailable' }, { status: 500 });
  }
}

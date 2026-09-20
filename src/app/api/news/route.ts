import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cachedSource } from '@/lib/sourceCache';
import { fingerprint, htmlToText, parseChannelPage, type TelegramPost } from '@/lib/telegram';
import type { Bloc } from '@/lib/alert-digest';
import { alertKind, locateReport, type AlertKind, type AlertPlace } from '@/lib/alert-places';

/**
 * OSIRIS — Live Alerts news feed.
 *
 * Reads public Telegram OSINT channels, falling back to wire RSS if Telegram
 * blocks the host. Each channel is cached on its own for a few minutes, so a
 * busy dashboard costs Telegram one request per channel per window, and a
 * channel that fails a refresh keeps serving its last good posts.
 */

// Public Telegram OSINT channels, picked for what they report rather than what
// they argue. Measured over 72 hours of live posts, each one carries more
// events — strikes, impacts, intercepts, damage, movements — than commentary,
// and the roster spans the spectrum so no single narrative owns the feed.
// `lean` and `bloc` travel with every item to the UI: a partisan field report
// is still a partisan source, and is labelled as one.
//
// Dropped 2026-09-18 for talking more than they report (event share over
// quote share, same window): Middle East Spectator 12/41, NEXTA Live 15/45
// (and 1% English), Bellum Acta 25/44 (also runs advertising in its footer).
// Earlier: OSINTtechnical (silent since June 2022), Clash Report and Liveuamap.
const TELEGRAM_CHANNELS: { handle: string; name: string; lean: string; bloc: Bloc }[] = [
  // Incident feeds: what happened, where, with footage. Least commentary of any source measured.
  { handle: 'Osintdefender',         name: 'OSINTdefender',         lean: 'Global incident OSINT',         bloc: 'independent' },
  { handle: 'WarMonitors',           name: 'War Monitor',           lean: 'Global conflict monitor',       bloc: 'independent' },
  // Russia–Ukraine, reported from both sides of the line.
  { handle: 'rybar_in_english',      name: 'Rybar',                 lean: 'Russian military OSINT',        bloc: 'russian' },
  { handle: 'DDGeopolitics',         name: 'DD Geopolitics',        lean: 'Multipolar / Russian',          bloc: 'russian' },
  { handle: 'KyivIndependent_official', name: 'Kyiv Independent',   lean: 'Ukrainian newsroom',            bloc: 'western' },
  // Gaza, the West Bank and south Lebanon, from newsrooms on the ground.
  { handle: 'QudsNen',               name: 'Quds News Network',     lean: 'Palestinian / Gaza & West Bank', bloc: 'regional' },
  { handle: 'AlMayadeenEnglish',     name: 'Al Mayadeen English',   lean: 'Lebanese / Resistance Axis',    bloc: 'regional' },
];
type Channel = (typeof TELEGRAM_CHANNELS)[number];

const POSTS_PER_CHANNEL = 8;
const CHANNEL_TTL_MS = 3 * 60_000;
/** A live feed shows live posts: anything older is left out, however quiet the channel. */
export const MAX_POST_AGE_MS = 72 * 3_600_000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FALLBACK_FEEDS = {
  BBC: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  AlJazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  GDACS: 'https://www.gdacs.org/xml/rss.xml'
};

const RISK_KEYWORDS = ['war','missile','strike','attack','crisis','tension','military','conflict','defense','clash','nuclear','invasion','bomb','drone','weapon','sanctions','ceasefire','escalation', 'killed', 'destroyed', 'operation', 'casualty', 'frontline', 'threat'];

/* Whole words, plus plural and verb endings. Substring matching scored
   "award", "software" and "warning" as war, "cooperation" as an operation and
   "Bombay" as a bomb. */
const RISK_PATTERNS = RISK_KEYWORDS.map(kw => ({
  kw,
  rx: new RegExp(`\\b${kw === 'casualty' ? 'casualt(?:y|ies)' : `${kw}(?:s|es|ed|ing)?`}\\b`, 'i'),
}));

const KEYWORD_COORDS: Record<string, [number, number]> = {
  'ukraine': [49.487, 31.272], 'kyiv': [50.450, 30.523], 'russia': [61.524, 105.318],
  'moscow': [55.755, 37.617], 'israel': [31.046, 34.851], 'gaza': [31.416, 34.333],
  'iran': [32.427, 53.688], 'lebanon': [33.854, 35.862], 'syria': [34.802, 38.996],
  'yemen': [15.552, 48.516], 'china': [35.861, 104.195], 'taiwan': [23.697, 120.960],
  'united states': [38.907, -77.036], 'europe': [48.800, 2.300], 'middle east': [31.500, 34.800]
};

/**
 * Counts risk keywords in the text. That is the whole method: one point of
 * base, two per distinct term matched, capped at 10.
 *
 * It used to ship its output labelled "AI Analysis indicates elevated tactical
 * priority based on OSINT stream patterns." No model is consulted and no
 * pattern is learned — the phrasing lent a word count the authority of an
 * analytical judgement. The matched terms now travel with the score so a
 * reader can see exactly what produced it.
 */
export function scoreRisk(text: string): { score: number; matched: string[] } {
  const matched = RISK_PATTERNS.filter(p => p.rx.test(text)).map(p => p.kw);
  return { score: Math.min(10, 1 + matched.length * 2), matched };
}

/**
 * Resolves a place name to its preset anchor — a country or territory
 * centroid, not the location of the reported event. An article about a strike
 * in Rafah resolves to the middle of Gaza, because that is the only thing a
 * keyword match can support. Callers get the term that matched so the marker
 * can be labelled for what it is.
 */
export function findCoords(text: string): { coords: [number, number]; anchor: string } | null {
  const lower = text.toLowerCase();
  for (const [keyword, coords] of Object.entries(KEYWORD_COORDS)) {
    if (lower.includes(keyword)) return { coords, anchor: keyword };
  }
  return null;
}

/** The newest posts inside the live window, newest last as Telegram orders them. */
export function recentPosts(posts: TelegramPost[], now = Date.now()): TelegramPost[] {
  return posts
    .filter(p => now - Date.parse(p.publishedAt) <= MAX_POST_AGE_MS)
    .slice(-POSTS_PER_CHANNEL);
}

export interface ChannelPost { post: TelegramPost; channel: Pick<Channel, 'handle' | 'name' | 'lean' | 'bloc'> }

/**
 * Folds the same report posted by several channels into one story: the
 * earliest post leads and the others are listed as carrying it. Forwards are
 * the common case, so this records who carried a story, not who confirmed it.
 */
export function mergeCrossPosts(posts: ChannelPost[]): { lead: ChannelPost; carriedBy: ChannelPost[] }[] {
  const byKey = new Map<string, ChannelPost[]>();
  for (const p of posts) {
    const fp = fingerprint(p.post.text);
    // Too short to tell two different posts apart ("Video", "Map update").
    const key = fp.split(' ').length >= 6 ? fp : `id:${p.post.id}`;
    byKey.set(key, [...(byKey.get(key) || []), p]);
  }
  return [...byKey.values()].map(group => {
    const [lead, ...rest] = [...group].sort((a, b) => Date.parse(a.post.publishedAt) - Date.parse(b.post.publishedAt));
    // A channel reposting itself is not a second channel carrying the story.
    const seen = new Set([lead.channel.handle]);
    const carriedBy = rest.filter(c => {
      if (seen.has(c.channel.handle)) return false;
      seen.add(c.channel.handle);
      return true;
    });
    return { lead, carriedBy };
  });
}

const channelFeeds = TELEGRAM_CHANNELS.map(channel => ({
  channel,
  load: cachedSource<TelegramPost>(`telegram:${channel.handle}`, async () => {
    const res = await fetch(`https://t.me/s/${channel.handle}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Cached whole; the age window is applied per request, as posts age in the cache.
    return parseChannelPage(await res.text(), channel.handle);
  }, CHANNEL_TTL_MS),
}));

interface RssItem { title: string; description: string; link: string; pubDate: string; source: string }

function parseRSSItems(xml: string, sourceName: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const getTag = (tag: string) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return (m?.[1] || m?.[2] || '').trim();
    };

    const title = htmlToText(getTag('title'));
    const pubDate = getTag('pubDate');
    // Same rule as Telegram: no timestamp, no item — never back-dated to "now".
    if (!title || !pubDate || Number.isNaN(Date.parse(pubDate))) continue;

    items.push({
      title: title.length > 140 ? `${title.substring(0, 140)}…` : title,
      description: htmlToText(getTag('description')),
      link: getTag('link'),
      pubDate: new Date(pubDate).toISOString(),
      source: sourceName,
    });
  }
  return items;
}

function assess(text: string) {
  const risk = scoreRisk(text);
  const located = findCoords(text);
  return {
    risk_score: risk.score,
    /* How the score was produced, and from what. Both fields exist so no
       consumer has to take the number on trust. */
    risk_method: 'keyword-count',
    risk_keywords: risk.matched,
    keyword_assessment: risk.score >= 8
      ? `Keyword filter matched ${risk.matched.length} risk terms: ${risk.matched.join(', ')}.`
      : null,
    coords: located ? located.coords : null,
    coords_default: !located,
    /* 'country-anchor' means the marker is a preset centroid for the term
       in `coords_anchor`, not the location of the reported event. */
    location_precision: located ? 'country-anchor' as const : null,
    coords_anchor: located ? located.anchor : null,
  };
}

const hashId = (s: string) => crypto.createHash('md5').update(s).digest('hex');

interface Carrier { source: string; source_name: string; lean: string; bloc: Bloc; link: string; published: string }

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  description: string;
  link: string;
  published: string;
  source: string;
  source_name: string;
  lean: string | null;
  bloc: Bloc | null;
  flag: TelegramPost['flag'];
  media: TelegramPost['media'];
  forwarded_from: TelegramPost['forwardedFrom'];
  reply_to: string | null;
  views: number | null;
  also_reported_by: Carrier[];
  /** Rocket, event or news — see alertKind. */
  alert_kind: AlertKind;
  /** The place the report names, when one resolved; see locateReport. */
  place: Omit<AlertPlace, 'lat' | 'lng'> | null;
} & Omit<ReturnType<typeof assess>, 'location_precision'> & {
  location_precision: 'country-anchor' | AlertPlace['precision'] | null;
};

/** How long a request waits for place lookups before answering with what it has. */
const PLACE_BUDGET_MS = 2500;

/**
 * Pins each item to the place it names, where one resolves. Lookups are
 * throttled to Nominatim's one a second, so a cold start cannot place every
 * item inside one request: whatever has not resolved by the budget keeps its
 * country anchor this time, and the lookup carries on so the next refresh has it.
 */
async function placeItems(items: NewsItem[]): Promise<void> {
  const found = new Map<string, AlertPlace>();
  const all = Promise.all(items.map(async item => {
    const place = await locateReport(item.title, item.description).catch(() => null);
    if (place) found.set(item.id, place);
  }));
  await Promise.race([all, new Promise(resolve => setTimeout(resolve, PLACE_BUDGET_MS))]);

  for (const item of items) {
    const place = found.get(item.id);
    if (!place) continue;
    item.coords = [place.lat, place.lng];
    item.coords_default = false;
    item.location_precision = place.precision;
    item.coords_anchor = place.name;
    item.place = { name: place.name, label: place.label, precision: place.precision };
  }
}

export async function GET() {
  try {
    const now = Date.now();
    const loaded = await Promise.all(channelFeeds.map(async f => {
      const all = await f.load();
      return { channel: f.channel, all, posts: recentPosts(all, now) };
    }));

    const sources = loaded.map(({ channel, all, posts }) => ({
      handle: channel.handle,
      name: channel.name,
      lean: channel.lean,
      bloc: channel.bloc,
      /** Posts inside the live window. */
      count: posts.length,
      /** The channel's newest post, even when it is older than the window. */
      latest: all.length ? all[all.length - 1].publishedAt : null,
    }));

    const stories = mergeCrossPosts(loaded.flatMap(({ channel, posts }) => posts.map(post => ({ post, channel }))));

    let newsItems: NewsItem[] = stories.map(({ lead: { post, channel }, carriedBy }) => ({
      id: hashId(post.url),
      title: post.headline,
      summary: post.summary,
      description: post.text,
      link: post.url,
      published: post.publishedAt,
      source: `t.me/${channel.handle}`,
      source_name: channel.name,
      lean: channel.lean,
      bloc: channel.bloc,
      flag: post.flag,
      media: post.media,
      forwarded_from: post.forwardedFrom,
      reply_to: post.replyTo,
      views: post.views,
      also_reported_by: carriedBy.map(c => ({
        source: `t.me/${c.channel.handle}`,
        source_name: c.channel.name,
        lean: c.channel.lean,
        bloc: c.channel.bloc,
        link: c.post.url,
        published: c.post.publishedAt,
      })),
      alert_kind: alertKind(post.headline, post.text),
      place: null,
      ...assess(post.text),
    }));

    // FAILSAFE: if Telegram blocks the host entirely, fall back to wire RSS.
    if (newsItems.length === 0) {
      const fallback = await Promise.all(Object.entries(FALLBACK_FEEDS).map(async ([source, url]) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return [];
          return parseRSSItems(await res.text(), source).slice(0, 5);
        } catch { return []; }
      }));
      newsItems = fallback.flat().map(article => ({
        id: hashId(article.link + article.pubDate),
        title: article.title,
        summary: article.description,
        description: article.description,
        link: article.link,
        published: article.pubDate,
        source: article.source,
        source_name: article.source,
        lean: null,
        bloc: null,
        flag: null,
        media: null,
        forwarded_from: null,
        reply_to: null,
        views: null,
        also_reported_by: [],
        alert_kind: alertKind(article.title, article.description),
        place: null,
        ...assess(`${article.title}\n${article.description}`),
      }));
    }

    await placeItems(newsItems);

    newsItems.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));

    return NextResponse.json({
      news: newsItems,
      total: newsItems.length,
      sources,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch {
    return NextResponse.json({ news: [], error: 'Failed to fetch intel' }, { status: 500 });
  }
}

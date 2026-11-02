/**
 * OSIRIS OI: the newsroom a forecast searches.
 *
 * Publishers' own feeds, which they publish for exactly this (to be read,
 * headline and summary, with a link back to the story), from wire-grade and
 * specialist newsrooms, grouped by desk: world, politics, business, markets,
 * crypto, tech, energy, defense, health, science, climate, sports. A run
 * reads the desks its question needs, plus the newswire Yahoo Finance keeps
 * for each ticker the question turns on, and keeps the stories that are about
 * the question. Social networks are not a newsroom: a link to one is dropped,
 * whoever carried it.
 *
 * A story counts when it names the question's subject and, for a question of
 * several words, shares at least two of them. Each feed is read at most
 * every fifteen minutes, whatever the number of runs.
 */
import { hit } from './words';
import { text } from './parse';
import type { Desk } from './plan';
import type { Fetcher, GdeltArticle } from './web';

interface Feed { outlet: string; url: string; desks: Desk[] }

export const FEEDS: Feed[] = [
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', desks: ['world'] },
  { outlet: 'The Guardian', url: 'https://www.theguardian.com/world/rss', desks: ['world'] },
  { outlet: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', desks: ['world'] },
  { outlet: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', desks: ['world', 'politics'] },
  { outlet: 'France 24', url: 'https://www.france24.com/en/rss', desks: ['world'] },
  { outlet: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', desks: ['world', 'business'] },
  { outlet: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', desks: ['world', 'politics'] },
  { outlet: 'Politico', url: 'https://rss.politico.com/politics-news.xml', desks: ['politics'] },
  { outlet: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', desks: ['politics'] },
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', desks: ['politics'] },
  { outlet: 'The Hill', url: 'https://thehill.com/feed/', desks: ['politics'] },
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', desks: ['business'] },
  { outlet: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', desks: ['business'] },
  { outlet: 'The Guardian', url: 'https://www.theguardian.com/business/rss', desks: ['business'] },
  { outlet: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', desks: ['business', 'markets'] },
  { outlet: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', desks: ['markets'] },
  { outlet: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', desks: ['markets'] },
  { outlet: 'The Economist', url: 'https://www.economist.com/finance-and-economics/rss.xml', desks: ['markets', 'business'] },
  { outlet: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', desks: ['markets'] },
  { outlet: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', desks: ['crypto'] },
  { outlet: 'Cointelegraph', url: 'https://cointelegraph.com/rss', desks: ['crypto'] },
  { outlet: 'Decrypt', url: 'https://decrypt.co/feed', desks: ['crypto'] },
  { outlet: 'The Block', url: 'https://www.theblock.co/rss.xml', desks: ['crypto'] },
  { outlet: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', desks: ['tech', 'science'] },
  { outlet: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', desks: ['tech'] },
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', desks: ['tech'] },
  { outlet: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', desks: ['tech'] },
  { outlet: 'TechCrunch', url: 'https://techcrunch.com/feed/', desks: ['tech'] },
  { outlet: 'OilPrice.com', url: 'https://oilprice.com/rss/main', desks: ['energy'] },
  { outlet: 'The Guardian', url: 'https://www.theguardian.com/environment/energy/rss', desks: ['energy', 'climate'] },
  { outlet: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml', desks: ['defense'] },
  { outlet: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', desks: ['defense'] },
  { outlet: 'The War Zone', url: 'https://www.twz.com/feed', desks: ['defense'] },
  { outlet: 'STAT', url: 'https://www.statnews.com/feed/', desks: ['health'] },
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', desks: ['health'] },
  { outlet: 'BBC News', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', desks: ['science', 'climate'] },
  { outlet: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', desks: ['science', 'health'] },
  { outlet: 'The Guardian', url: 'https://www.theguardian.com/environment/climate-crisis/rss', desks: ['climate'] },
  { outlet: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', desks: ['sports'] },
  { outlet: 'ESPN', url: 'https://www.espn.com/espn/rss/news', desks: ['sports'] },
  { outlet: 'The Guardian', url: 'https://www.theguardian.com/sport/rss', desks: ['sports'] },
];

/** Social networks and their kin: a post there is a claim, not reporting. */
const SOCIAL = /(^|\.)(t\.me|telegram\.(org|me)|twitter\.com|x\.com|reddit\.com|facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|stocktwits\.com|threads\.net|bsky\.app|truthsocial\.com|linkedin\.com|discord\.(gg|com)|quora\.com)$/i;

/** Whether a link points at a social network. */
export function isSocial(url: string): boolean {
  try { return SOCIAL.test(new URL(url).hostname.replace(/^www\./, '')); } catch { return false; }
}

/** Outlets Yahoo's ticker newswire carries, by site, so a story is credited to whoever wrote it. */
const OUTLETS: Record<string, string> = {
  'finance.yahoo.com': 'Yahoo Finance', 'reuters.com': 'Reuters', 'bloomberg.com': 'Bloomberg', 'cnbc.com': 'CNBC',
  'coindesk.com': 'CoinDesk', 'cointelegraph.com': 'Cointelegraph', 'decrypt.co': 'Decrypt', 'theblock.co': 'The Block',
  'benzinga.com': 'Benzinga', 'fool.com': 'The Motley Fool', 'barrons.com': "Barron's", 'marketwatch.com': 'MarketWatch',
  'investopedia.com': 'Investopedia', 'forbes.com': 'Forbes', 'fortune.com': 'Fortune', 'wsj.com': 'The Wall Street Journal',
  'ft.com': 'Financial Times', 'aol.com': 'AOL', 'investing.com': 'Investing.com', 'zacks.com': 'Zacks', 'insidermonkey.com': 'Insider Monkey',
};

export const siteOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
  }
  return ENT[e.toLowerCase()] ?? m;
});
/** Text out of a feed field: CDATA opened, tags dropped (an escaped tag twice over), entities decoded. */
const clean = (s: string) => decode(decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const field = (block: string, ...names: string[]) => {
  for (const n of names) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block);
    if (m && m[1].trim()) return m[1];
  }
  return '';
};

export interface FeedItem { title: string; url: string; published: string; summary: string }

/** A feed's stories: RSS 2.0 and RDF items, and Atom entries. */
export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const b = m[2];
    const title = text(clean(field(b, 'title')), 220);
    let url = clean(field(b, 'link'));
    if (!/^https?:\/\//i.test(url)) {
      // Atom: <link rel="alternate" href="…"/>, the alternate first.
      const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map(l => ({ rel: /rel=["']([^"']+)/i.exec(l[1])?.[1] ?? 'alternate', href: /href=["']([^"']+)/i.exec(l[1])?.[1] ?? '' }));
      url = decode(links.find(l => l.rel === 'alternate' && l.href)?.href ?? links.find(l => l.href)?.href ?? '');
    }
    if (!/^https?:\/\//i.test(url) && /isPermaLink=["']true/i.test(b)) url = clean(field(b, 'guid'));
    const when = clean(field(b, 'pubDate', 'dc:date', 'published', 'updated'));
    const t = Date.parse(when);
    if (!title || !/^https?:\/\//i.test(url)) continue;
    out.push({
      title,
      url: url.trim(),
      published: Number.isFinite(t) ? new Date(t).toISOString() : '',
      summary: text(clean(field(b, 'description', 'summary', 'content:encoded', 'content')), 420),
    });
  }
  return out;
}

const feedCache = new Map<string, { at: number; items: FeedItem[] }>();
const FEED_MS = 15 * 60_000;

/** A feed, from the cache or the publisher. A feed that fails costs only its own stories. */
async function readFeed(url: string, api: Fetcher, signal: AbortSignal): Promise<FeedItem[]> {
  const kept = feedCache.get(url);
  if (kept && Date.now() - kept.at < FEED_MS) return kept.items;
  const res = await api(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; OSIRIS-OI/1.0; +https://osirisai.live/docs#oi)', accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).catch(() => null);
  if (!res?.ok) return kept?.items ?? [];
  const items = parseFeed((await res.text().catch(() => '')).slice(0, 3_000_000));
  if (items.length) {
    feedCache.set(url, { at: Date.now(), items });
    if (feedCache.size > 128) feedCache.delete(feedCache.keys().next().value!);
  }
  return items;
}

/** Yahoo Finance's newswire for a ticker: the stories its desk files under that symbol. */
export const tickerFeed = (symbol: string) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

export interface NewsroomQuery {
  desks: Desk[];
  /** Tickers whose newswire to read too. */
  tickers: string[];
  /** The words a story is scored on. */
  words: string[];
  /** At least one of these must be in it: the question's names. */
  names: string[];
  /** Stories older than this many days are history, not news. */
  maxAgeDays?: number;
}

/**
 * The stories in the desks' feeds that are about the question, best first:
 * each must name one of the question's names; then the more of its words a
 * headline carries (worth three) or its summary (worth one), the better, and
 * the newer among equals. One story once, however many feeds carried it.
 */
export function rankStories(feeds: { outlet: string; items: FeedItem[] }[], q: NewsroomQuery, now = Date.now()): GdeltArticle[] {
  const maxAge = (q.maxAgeDays ?? 45) * 86_400_000;
  const seen = new Set<string>();
  const out: (GdeltArticle & { score: number; t: number })[] = [];
  for (const f of feeds) {
    for (const it of f.items) {
      const t = Date.parse(it.published);
      if (Number.isFinite(t) && now - t > maxAge) continue;
      if (isSocial(it.url)) continue;
      const title = it.title.toLowerCase();
      const body = it.summary.toLowerCase();
      if (!q.names.some(n => hit(title, n) || hit(body, n))) continue;
      // A question of several words needs two of them: "Israel" alone is in half the news, not in this question's.
      const shared = q.words.filter(w => hit(title, w) || hit(body, w)).length;
      if (shared < (q.words.length >= 3 ? 2 : 1)) continue;
      const score = q.words.reduce((s, w) => s + (hit(title, w) ? 3 : hit(body, w) ? 1 : 0), 0);
      if (score < 3) continue;
      const key = it.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
      if (seen.has(key) || seen.has(it.url)) continue;
      seen.add(key);
      seen.add(it.url);
      const site = siteOf(it.url);
      out.push({
        url: it.url, title: it.title, domain: site, seendate: it.published, language: 'English', sourcecountry: '',
        outlet: f.outlet === 'Yahoo Finance' && site !== 'finance.yahoo.com' ? OUTLETS[site] ?? site : f.outlet,
        summary: it.summary, score, t: Number.isFinite(t) ? t : 0,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || b.t - a.t);
}

/** The newsroom's stories on a question: its desks' feeds and its tickers' newswires, read at once. */
export async function searchNewsroom(q: NewsroomQuery, api: Fetcher, signal: AbortSignal): Promise<GdeltArticle[]> {
  const desks = new Set<Desk>(q.desks.length ? q.desks : ['world']);
  const feeds = [
    ...FEEDS.filter(f => f.desks.some(d => desks.has(d))),
    ...q.tickers.slice(0, 2).map(s => ({ outlet: 'Yahoo Finance', url: tickerFeed(s), desks: [] as Desk[] })),
  ];
  const read = await Promise.all(feeds.map(async f => ({ outlet: f.outlet, items: await readFeed(f.url, api, signal) })));
  return rankStories(read, q);
}

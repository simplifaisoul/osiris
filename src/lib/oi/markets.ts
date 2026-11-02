/**
 * OSIRIS OI: what the markets say about a question.
 *
 * Two kinds of market, both read without a key:
 *   - the price of what the question turns on (a coin, a share, an index, a
 *     commodity, a currency), two years of it day by day, from Yahoo
 *     Finance's chart API, which the platform's own market board reads;
 *   - what prediction markets price the question at: real money (Polymarket)
 *     and play money with a long track record (Manifold) on the outcome.
 *
 * Every reply is read defensively and kept for a while, so a run asks each
 * market once whatever the panel and the API do.
 */
import { hit } from './words';
import type { Series } from './quant';
import type { Odds } from './types';
import type { Fetcher } from './web';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Kept answers, by key, each for `ms`. */
function memo<T>(ms: number, max = 64) {
  const map = new Map<string, { at: number; v: T }>();
  return {
    get(k: string): T | undefined {
      const e = map.get(k);
      return e && Date.now() - e.at < ms ? e.v : undefined;
    },
    set(k: string, v: T) {
      map.set(k, { at: Date.now(), v });
      if (map.size > max) map.delete(map.keys().next().value!);
    },
  };
}

/* ───────────────────────────── Prices ───────────────────────────── */

/** A ticker as Yahoo Finance writes it: letters, digits and ^ = . - only. */
export const isSymbol = (s: string) => /^[A-Za-z0-9^=.-]{1,20}$/.test(s);

/** A chart reply as a daily series: the last close of each day, oldest first. Null when there is too little to use. */
export function parseChart(body: string): Series | null {
  try {
    const r = (JSON.parse(body) as { chart?: { result?: unknown[] } }).chart?.result?.[0] as {
      meta?: Record<string, unknown>; timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[]; adjclose?: { adjclose?: (number | null)[] }[] };
    } | undefined;
    const meta = r?.meta ?? {};
    const ts = r?.timestamp ?? [];
    const close = r?.indicators?.quote?.[0]?.close ?? [];
    const adj = r?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const offset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
    const byDay = new Map<string, { c: number; a: number }>();
    ts.forEach((t, i) => {
      const c = close[i];
      if (typeof c !== 'number' || !(c > 0) || !Number.isFinite(t)) return;
      const a = typeof adj[i] === 'number' && adj[i]! > 0 ? adj[i]! : c;
      // The exchange's own calendar day; a later bar on the same day (the live one) replaces the earlier.
      byDay.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), { c, a });
    });
    const days = [...byDay.keys()].sort();
    if (days.length < 30) return null;
    const symbol = typeof meta.symbol === 'string' ? meta.symbol : '';
    const name = [meta.longName, meta.shortName].find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? symbol;
    return {
      symbol,
      name: name.trim(),
      currency: typeof meta.currency === 'string' ? meta.currency.toUpperCase() : '',
      dates: days,
      closes: days.map(d => byDay.get(d)!.c),
      adjusted: days.map(d => byDay.get(d)!.a),
    };
  } catch {
    return null;
  }
}

const seriesCache = memo<Series | null>(30 * 60_000);

/** Five years of daily prices for a ticker (the baseline reads the last two, the backtest all of them), or null when Yahoo does not know it. */
export async function fetchSeries(symbol: string, api: Fetcher, signal: AbortSignal): Promise<Series | null> {
  if (!isSymbol(symbol)) return null;
  const key = symbol.toUpperCase();
  const kept = seriesCache.get(key);
  if (kept !== undefined) return kept;
  const res = await api(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&includeAdjustedClose=true`, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  }).catch(() => null);
  if (!res) return null;
  const series = res.ok ? parseChart(await res.text().catch(() => '')) : null;
  // A ticker Yahoo does not know is remembered as such; a failed request is not.
  if (series || res.status === 404) seriesCache.set(key, series);
  return series;
}

/* ───────────────────────────── Prediction markets ───────────────────────────── */

/** A prediction market found for a question, with where to see it. */
export interface MarketFind extends Odds {
  url: string;
}

const NUM = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN);
const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
};

/** Polymarket's search reply: the open yes/no markets in each event it found. */
export function parsePolymarket(body: string): MarketFind[] {
  try {
    const events = (JSON.parse(body) as { events?: unknown[] }).events ?? [];
    return events.flatMap(ev => {
      const e = ev as Record<string, unknown>;
      const slug = typeof e.slug === 'string' && /^[a-z0-9-]+$/i.test(e.slug) ? e.slug : '';
      return (Array.isArray(e.markets) ? e.markets : []).flatMap(mk => {
        const m = mk as Record<string, unknown>;
        const outcomes = arr(m.outcomes).map(String);
        const prices = arr(m.outcomePrices).map(NUM);
        const question = typeof m.question === 'string' ? m.question.trim() : '';
        if (!slug || !question || m.closed === true || m.active === false || outcomes[0] !== 'Yes' || !Number.isFinite(prices[0])) return [];
        const volume = [m.volumeNum, m.volume, e.volume].map(NUM).find(Number.isFinite) ?? 0;
        return [{
          platform: 'Polymarket' as const, question, probability: prices[0], volume,
          closes: typeof m.endDate === 'string' ? m.endDate : typeof e.endDate === 'string' ? e.endDate : '',
          url: `https://polymarket.com/event/${slug}`,
        }];
      });
    });
  } catch {
    return [];
  }
}

/** Manifold's search reply: its open binary markets. */
export function parseManifold(body: string): MarketFind[] {
  try {
    const list = JSON.parse(body) as unknown[];
    return (Array.isArray(list) ? list : []).flatMap(x => {
      const m = x as Record<string, unknown>;
      const url = typeof m.url === 'string' && /^https:\/\/manifold\.markets\//.test(m.url) ? m.url : '';
      const p = NUM(m.probability);
      if (!url || m.outcomeType !== 'BINARY' || m.isResolved === true || !Number.isFinite(p) || typeof m.question !== 'string') return [];
      const close = NUM(m.closeTime);
      return [{
        platform: 'Manifold' as const, question: m.question.trim(), probability: p, volume: NUM(m.volume) || 0,
        closes: Number.isFinite(close) ? new Date(close).toISOString() : '', url,
      }];
    });
  } catch {
    return [];
  }
}

/** The numbers in a text, as plain figures: "$150,000", "$150k" and "150K" are all 150000. */
export const numbersIn = (s: string) => new Set([...s.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kmb])?\b/gi)].map(m => {
  const n = parseFloat(m[1].replace(/,/g, ''));
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return String(n * mult);
}));

/**
 * The markets that ask (nearly) the question: those that share its words and,
 * when it has any, at least one of its figures (the level, the year), the
 * closest and most traded first. A
 * market priced at 0 or 1 has already settled and says nothing about what is
 * still open; one with next to no trading is no crowd.
 */
export function pickOdds(found: MarketFind[], question: string, words: string[], max = 3): MarketFind[] {
  const nums = numbersIn(question);
  const seen = new Set<string>();
  return found
    .filter(m => m.probability > 0.002 && m.probability < 0.998 && (m.platform === 'Manifold' ? m.volume >= 100 : m.volume >= 500))
    .map(m => {
      const low = m.question.toLowerCase();
      const shared = words.filter(w => hit(low, w)).length;
      const sameNumbers = [...numbersIn(m.question)].filter(n => nums.has(n)).length;
      return { m, shared, sameNumbers, score: shared + 2 * sameNumbers };
    })
    // The question's subject, and then two of its words or one of its figures: a market about something else is no crowd.
    .filter(x => x.shared >= 1 && (x.shared >= Math.min(2, words.length) || x.sameNumbers >= 1))
    // A question with figures in it (a level, a year) is about those figures: a market that shares none of them asks something else.
    .filter(x => !nums.size || x.sameNumbers >= 1)
    .sort((a, b) => b.score - a.score || b.m.volume - a.m.volume)
    .filter(x => { const k = `${x.m.platform}:${x.m.question.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max)
    .map(x => x.m);
}

/** A rung of a price ladder: the chance the crowd gives the price of trading at a level by the deadline. */
export interface Rung { level: number; direction: 'above' | 'below'; probability: number }

/** The price level a market asks about, and which way: "reach $200" is above, "dip to $50" below. Null when it names none. */
export function levelOf(question: string): { level: number; direction: 'above' | 'below' } | null {
  const m = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kmb])?\b/i.exec(question);
  if (!m) return null;
  const level = parseFloat(m[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1);
  if (!(level > 0)) return null;
  return { level, direction: /\b(dip|dips|fall|falls|drop|drops|below|under|crash|crashes|sink|sinks)\b/i.test(question) ? 'below' : 'above' };
}

/**
 * The ladder a market belongs to: the open markets in the same event, on the
 * same platform and deadline, that each ask about a level ("What price will
 * Solana hit in 2026?" asks it rung by rung, up and down). One price per
 * level and direction, the most traded; none unless there are three rungs.
 */
export function ladderOf(m: MarketFind, found: MarketFind[]): Rung[] {
  const day = m.closes.slice(0, 10);
  const best = new Map<string, MarketFind & { level: number; direction: 'above' | 'below' }>();
  for (const x of found) {
    if (x.platform !== m.platform || x.url !== m.url || x.closes.slice(0, 10) !== day) continue;
    const l = levelOf(x.question);
    if (!l) continue;
    const key = `${l.direction}:${l.level}`;
    const had = best.get(key);
    if (!had || x.volume > had.volume) best.set(key, { ...x, ...l });
  }
  const rungs = [...best.values()].map(x => ({ level: x.level, direction: x.direction, probability: x.probability })).sort((a, b) => a.level - b.level);
  return rungs.length >= 3 ? rungs : [];
}

const oddsCache = memo<MarketFind[]>(15 * 60_000);

/** The open markets either platform finds for a search. */
export async function searchMarkets(q: string, api: Fetcher, signal: AbortSignal): Promise<MarketFind[]> {
  const key = q.toLowerCase().trim();
  if (!key) return [];
  const kept = oddsCache.get(key);
  if (kept) return kept;
  const get = (url: string) => api(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).then(r => (r.ok ? r.text() : '')).catch(() => '');
  const [poly, mani] = await Promise.all([
    get(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=10&events_status=active`),
    get(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(q)}&limit=10&filter=open&contractType=BINARY`),
  ]);
  const found = [...parsePolymarket(poly), ...parseManifold(mani)];
  if (found.length) oddsCache.set(key, found);
  return found;
}

/** A question the world is betting on: a prediction market's most traded open question in a busy event. */
export interface Trending { question: string; probability: number; event: string; url: string; volume: number; closes: string }

/** Games and matches settle in hours: not questions to rehearse the future on. */
const GAME_TAGS = /^(sports?|games?|esports|nfl|nba|mlb|nhl|ufc|soccer|football|tennis|golf|cfb|cbb|f1|mma|boxing|cricket|chess|league of legends|cs2|dota)/i;

/**
 * The questions busiest on Polymarket that OI can rehearse: events at least
 * two weeks out and not games, each as its most traded open yes/no market
 * still in play (priced between 2% and 98%).
 */
export function parseTrending(body: string, now = Date.now()): Trending[] {
  try {
    const events = JSON.parse(body) as unknown[];
    const out: Trending[] = [];
    for (const ev of Array.isArray(events) ? events : []) {
      const e = ev as Record<string, unknown>;
      const slug = typeof e.slug === 'string' && /^[a-z0-9-]+$/i.test(e.slug) ? e.slug : '';
      const tags = (Array.isArray(e.tags) ? e.tags : []).map(t => String((t as Record<string, unknown>).label ?? ''));
      const end = Date.parse(String(e.endDate ?? ''));
      if (!slug || tags.some(t => GAME_TAGS.test(t)) || !(end > now + 14 * 86_400_000) || /up or down/i.test(String(e.title ?? ''))) continue;
      const best = parsePolymarket(JSON.stringify({ events: [e] }))
        .filter(m => m.probability >= 0.02 && m.probability <= 0.98)
        .sort((a, b) => b.volume - a.volume)[0];
      if (!best) continue;
      out.push({ question: best.question, probability: best.probability, event: String(e.title ?? ''), url: best.url, volume: Number(e.volume24hr) || 0, closes: best.closes });
    }
    return out;
  } catch {
    return [];
  }
}

const trendCache = memo<Trending[]>(10 * 60_000, 2);

/** What the world is betting on now, kept ten minutes. */
export async function trending(api: Fetcher, signal: AbortSignal, now = Date.now()): Promise<Trending[]> {
  const kept = trendCache.get('top');
  if (kept) return kept;
  // Only events that close two weeks out or later: the busiest hundred, whole,
  // run to some 30 MB, most of it games and this week's bets.
  const after = new Date(now + 14 * 86_400_000).toISOString();
  const res = await api(`https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=50&end_date_min=${after}`, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).catch(() => null);
  const items = res?.ok ? parseTrending(await res.text().catch(() => ''), now).slice(0, 8) : [];
  if (items.length) trendCache.set('top', items);
  return items;
}

/** A market's price as a line the actors and the report can quote. */
export function oddsLine(m: Odds): string {
  const vol = m.volume >= 1e6 ? `${(m.volume / 1e6).toFixed(1)}M` : m.volume >= 1e3 ? `${Math.round(m.volume / 1e3)}K` : `${Math.round(m.volume)}`;
  const traded = m.platform === 'Polymarket' ? `$${vol} traded` : `${vol} mana traded`;
  const closes = m.closes ? `, closes ${m.closes.slice(0, 10)}` : '';
  return `${m.platform} traders price YES at ${Math.round(m.probability * 1000) / 10}% (${traded}${closes}).`;
}

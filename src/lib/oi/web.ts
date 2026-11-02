/**
 * OSIRIS OI: the open web a forecast reads.
 *
 * Before the world model, OI researches the question the way an analyst
 * would, from sources that can be checked:
 *   - the reporting: the newsroom's desks (publishers' own feeds, see
 *     ./newsroom) and Yahoo Finance's newswire for any ticker in play, GDELT's
 *     open index of the world's newsrooms when it answers, and Wikipedia's
 *     Current events (the day's notable events, each summarised by its editors
 *     and linked to the report it cites); the article itself where the
 *     publisher serves it, cut to the paragraphs that bear on the question,
 *     else the publisher's own summary;
 *   - the numbers: two years of daily prices for any price the question turns
 *     on, with where it stands, how far it has moved and how much it swings;
 *   - the crowd: what prediction markets price the question at;
 *   - the background: Wikipedia.
 * Every item keeps its real link, so every quote an actor makes can be opened
 * and checked where it was published. Social networks are no source: the
 * newsroom drops them.
 *
 * Articles are fetched through the SSRF guard, a few at a time, with a hard
 * time and size limit each: a slow or hostile site costs only its own item.
 */
import { safeFetch } from '@/lib/ssrf-guard';
import { terms } from './words';
import { text } from './parse';
import { namesIn, type ResearchPlan } from './plan';
import { fetchSeries, ladderOf, oddsLine, pickOdds, searchMarkets } from './markets';
import { searchNewsroom } from './newsroom';
import { priceText, recent, seriesStats, type Series } from './quant';
import type { ContextItem } from './types';

export { parsePlan, planFallback, searchWords, type ResearchPlan } from './plan';
export type { Series } from './quant';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface WebDeps {
  /** For publishers' pages: through the SSRF guard. */
  page: Fetcher;
  /** For the fixed APIs and feeds: GDELT, Wikipedia, the newsroom, Yahoo Finance, the prediction markets. */
  api: Fetcher;
  /** GDELT asks for one request every five seconds from an address; this paces them across runs. */
  gdeltGapMs: number;
}

const UA = 'Mozilla/5.0 (compatible; OSIRIS-OI/1.0; +https://osirisai.live/docs#oi)';

/* ───────────────────────────── GDELT ───────────────────────────── */

/** A news article found for the question: in the newsroom, by GDELT, or cited by Wikipedia's Current events. */
export interface GdeltArticle {
  url: string;
  title: string;
  domain: string;
  seendate: string;
  language: string;
  sourcecountry: string;
  /** The outlet's name, where the finder gives it ("Reuters"). */
  outlet?: string;
  /** Who summarised it, when the headline is not the outlet's own: Wikipedia's editors. */
  via?: string;
  /** How many of the search's words it shares. */
  score?: number;
  /** The publisher's own summary, from its feed: what an actor reads when the page itself cannot be. */
  summary?: string;
}

/** GDELT's date, 20260930T224500Z, as ISO. */
function gdeltDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : '';
}

/** An article list, read defensively: GDELT answers a refusal in plain text. */
export function parseGdelt(body: string): GdeltArticle[] {
  try {
    const j = JSON.parse(body) as { articles?: unknown };
    if (!Array.isArray(j.articles)) return [];
    return j.articles.flatMap(a => {
      const o = a as Record<string, unknown>;
      const url = typeof o.url === 'string' ? o.url : '';
      if (!/^https?:\/\//i.test(url)) return [];
      return [{
        url, title: text(o.title, 220), domain: text(o.domain, 80), seendate: gdeltDate(String(o.seendate ?? '')),
        language: text(o.language, 30), sourcecountry: text(o.sourcecountry, 40),
      }];
    }).filter(a => a.title);
  } catch {
    return [];
  }
}

/**
 * The articles worth reading: English, one story once (by title), at most two
 * from any one site so a single outlet cannot make up the evidence.
 */
export function pickArticles(lists: GdeltArticle[][], max: number): GdeltArticle[] {
  const out: GdeltArticle[] = [];
  const titles = new Set<string>();
  const perSite = new Map<string, number>();
  // Interleave the searches, so the second one's best are not behind the first one's worst.
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const l of lists) {
      const a = l[i];
      if (!a || out.length >= max || (a.language && a.language !== 'English')) continue;
      const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
      const site = a.domain.replace(/^www\./, '');
      if (titles.has(key) || (perSite.get(site) ?? 0) >= 2) continue;
      titles.add(key);
      perSite.set(site, (perSite.get(site) ?? 0) + 1);
      out.push(a);
    }
  }
  return out;
}

let gdeltNext = 0;
let gdeltQueue: Promise<unknown> = Promise.resolve();

/** Waits its turn for GDELT, or gives up when the queue is longer than `maxWaitMs`. */
function gdeltTurn(gapMs: number, maxWaitMs: number): Promise<boolean> {
  const turn = gdeltQueue.then(async () => {
    const wait = gdeltNext - Date.now();
    if (wait > maxWaitMs) return false;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    gdeltNext = Date.now() + gapMs;
    return true;
  });
  gdeltQueue = turn.catch(() => undefined);
  return turn;
}

/** Searches answered lately, by query: the same question asked again reads the same coverage without asking GDELT twice. */
const gdeltCache = new Map<string, { at: number; articles: GdeltArticle[] }>();
const GDELT_CACHE_MS = 30 * 60_000;

async function searchGdelt(q: string, deps: WebDeps, signal: AbortSignal): Promise<GdeltArticle[]> {
  const key = q.toLowerCase();
  const hit = gdeltCache.get(key);
  if (hit && Date.now() - hit.at < GDELT_CACHE_MS) return hit.articles;
  const query = encodeURIComponent(`${q} sourcelang:english`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=25&format=json&sort=hybridrel&timespan=1month`;
  // Asked at its own pace. Told to slow down, it is left alone for a while: a refusal takes
  // GDELT seconds to send, and asking again soon only earns another.
  if (Date.now() < gdeltPausedUntil || !(await gdeltTurn(deps.gdeltGapMs, 15_000)) || signal.aborted) return [];
  const res = await deps.api(url, { headers: { 'user-agent': UA }, signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) }).catch(() => null);
  if (res?.status === 429) gdeltPausedUntil = Date.now() + GDELT_PAUSE_MS;
  if (!res?.ok) return [];
  const articles = parseGdelt(await res.text().catch(() => ''));
  if (articles.length) {
    gdeltCache.set(key, { at: Date.now(), articles });
    if (gdeltCache.size > 64) gdeltCache.delete(gdeltCache.keys().next().value!);
  }
  return articles;
}

let gdeltPausedUntil = 0;
const GDELT_PAUSE_MS = 10 * 60_000;

/** For tests: forget a pause GDELT asked for. */
export function resetGdeltPause() { gdeltPausedUntil = 0; }

/* ───────────────────────────── Wikipedia's Current events ───────────────────────────── */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Portal:Current events/2026 October 1" as 2026-10-01, or '' for any other page. */
export function currentEventsDate(title: string): string {
  const m = /Current events\/(\d{4}) ([A-Za-z]+) (\d{1,2})$/.exec(title);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[1]}-${String(month + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}T12:00:00Z` : '';
}

/**
 * A day of Wikipedia's Current events, as articles: each event its editors
 * summarised that bears on the question, headlined by their summary and
 * linked to the report they cite. An event bears on it when it names one of
 * the search's `names` (its first words) and shares two of its words in all;
 * the more it shares, the higher it scores.
 */
export function parseCurrentEvents(html: string, date: string, words: string[], names: string[] = words.slice(0, 2)): GdeltArticle[] {
  const out: GdeltArticle[] = [];
  const need = Math.min(2, words.length);
  // The innermost list items: one event each.
  for (const m of html.matchAll(/<li\b[^>]*>((?:(?!<li\b)[\s\S])*?)<\/li>/gi)) {
    const li = m[1];
    const links = [...li.matchAll(/<a\b[^>]*class="[^"]*external[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>|<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*external[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    if (!links.length) continue;
    const summary = stripTags(li).replace(/\s*\([^()]{2,60}\)\s*$/g, '').replace(/\s*\([^()]{2,60}\)\s*$/g, '').trim();
    const low = summary.toLowerCase();
    const score = words.filter(w => low.includes(w)).length;
    if (summary.length < 30 || score < need || !names.some(n => low.includes(n))) continue;
    const first = links[0];
    const url = decodeEntities(first[1] ?? first[3]);
    const outlet = stripTags(first[2] ?? first[4] ?? '').replace(/^\(|\)$/g, '').trim();
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    out.push({ url, title: text(summary, 260), domain, seendate: date, language: 'English', sourcecountry: '', outlet: outlet || domain, via: 'Wikipedia', score });
  }
  return out;
}

/** The latest days of Wikipedia's Current events that mention the search, newest first, read for their events. */
async function searchCurrentEvents(q: string, words: string[], deps: WebDeps, signal: AbortSignal, now = Date.now()): Promise<GdeltArticle[]> {
  const wiki = (params: string) => deps.api(`https://en.wikipedia.org/w/api.php?format=json&formatversion=2&${params}`, {
    headers: { 'user-agent': UA }, signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<Record<string, unknown> | null>;
  // Daily pages only (a month's page matches words from unrelated events), this year's and, early in
  // the year, last year's; every word of the search first, then just its first two (its names).
  const year = new Date(now).getUTCFullYear();
  const years = new Date(now).getUTCMonth() < 4 ? [year, year - 1] : [year];
  const wordsOf = q.split(' ');
  const tries = [...new Set([q, wordsOf.slice(0, 2).join(' ')])];
  let days: { title: string; date: string }[] = [];
  for (const t of tries) {
    for (const y of years) {
      const found = await wiki(`action=query&list=search&srnamespace=100&srlimit=20&srsort=create_timestamp_desc&srsearch=${encodeURIComponent(`${t} prefix:Portal:Current events/${y}`)}`);
      days.push(...((found?.query as { search?: { title?: string }[] } | undefined)?.search ?? [])
        .map(x => ({ title: String(x.title ?? ''), date: currentEventsDate(String(x.title ?? '')) })));
    }
    // The last six months: older news says little about what happens next.
    days = days.filter(d => d.date && now - Date.parse(d.date) < 183 * 86_400_000);
    if (days.length) break;
  }
  days = [...new Map(days.map(d => [d.title, d])).values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const pages = await Promise.all(days.map(d => wiki(`action=parse&prop=text&page=${encodeURIComponent(d.title)}`)));
  // The events that share most with the search first, the newest among equals.
  return pages.flatMap((p, i) => {
    const html = (p?.parse as { text?: string } | undefined)?.text;
    return typeof html === 'string' ? parseCurrentEvents(html, days[i].date, words) : [];
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.seendate.localeCompare(a.seendate)).slice(0, 10);
}

/* ───────────────────────────── Article text ───────────────────────────── */

const ENTITY: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ouml: 'ö', uuml: 'ü', auml: 'ä',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const BOILERPLATE = /cookie|subscribe|sign up|newsletter|all rights reserved|©|advertisement|javascript|your browser|log in|read more|click here|terms of (use|service)|privacy policy/i;

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0] ?? '';
  return stripTags(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
}

/** Cut at a sentence end before `max`, or at a word. */
export function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('." '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

/**
 * What an article says that bears on the question: its paragraphs, scored on
 * the question's words, the best few kept in the order they were written; the
 * page's own description when it has no readable paragraphs.
 */
export function articleText(html: string, words: string[], max = 520): { excerpt: string; site: string; published: string } {
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m, i) => ({ t: stripTags(m[1]), i }))
    .filter(p => p.t.length >= 60 && p.t.length <= 1500 && !BOILERPLATE.test(p.t));
  const score = (t: string) => {
    const low = t.toLowerCase();
    return words.reduce((n, w) => n + (low.includes(w) ? 1 : 0), 0);
  };
  const scored = paras.map(p => ({ ...p, s: score(p.t) }));
  // The paragraphs on the question when there are any, else the article's opening.
  const on = scored.some(p => p.s > 0) ? scored.filter(p => p.s > 0) : scored.slice(0, 2);
  const best = on.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3).sort((a, b) => a.i - b.i);
  let excerpt = best.map(p => p.t).join(' ');
  if (!excerpt) excerpt = meta(html, 'og:description') || meta(html, 'description');
  return {
    excerpt: clipText(excerpt, max),
    site: meta(html, 'og:site_name'),
    published: meta(html, 'article:published_time'),
  };
}

/** A response's text, up to `cap` bytes: the rest is never read. */
async function readCapped(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < cap) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(Math.min(size, cap));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.length, all.length - at));
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

async function readArticle(a: GdeltArticle, words: string[], deps: WebDeps, signal: AbortSignal): Promise<{ excerpt: string; site: string; published: string } | null> {
  try {
    const res = await deps.page(a.url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(7_000)]),
    });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '')) return null;
    return articleText(await readCapped(res, 1_500_000), words);
  } catch {
    return null;
  }
}

/* ───────────────────────────── Wikipedia ───────────────────────────── */

/**
 * The lead of the first article a topic finds, with its link. A
 * disambiguation page ("Solana may refer to:") is a list of other pages, not
 * background: the next result is taken instead.
 */
export function parseWikipedia(body: string): { title: string; extract: string; url: string } | null {
  try {
    const j = JSON.parse(body) as { query?: { pages?: { title?: string; extract?: string; fullurl?: string; index?: number; pageprops?: Record<string, unknown> }[] } };
    const pages = (j.query?.pages ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const p = pages.find(x => x.extract && x.fullurl && /^https:\/\/[a-z-]+\.wikipedia\.org\//.test(x.fullurl)
      && !(x.pageprops && 'disambiguation' in x.pageprops) && !/\bmay (also )?refer to:?\s*$/i.test(x.extract.trim()));
    return p ? { title: text(p.title, 120), extract: clipText(text(p.extract, 2000), 600), url: p.fullurl! } : null;
  } catch {
    return null;
  }
}

async function searchWikipedia(topic: string, deps: WebDeps, signal: AbortSignal) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=3&prop=extracts%7Cinfo%7Cpageprops&ppprop=disambiguation&exintro=1&explaintext=1&exlimit=3&inprop=url&redirects=1`;
  const res = await deps.api(url, { headers: { 'user-agent': UA }, signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) }).catch(() => null);
  return res?.ok ? parseWikipedia(await res.text().catch(() => '')) : null;
}

/* ───────────────────────────── The research ───────────────────────────── */

export const liveWeb: WebDeps = {
  page: (url, init) => safeFetch(url, { ...init, maxRedirects: 4 }),
  api: (url, init) => fetch(url, init),
  gdeltGapMs: 5_500,
};

/** At most `limit` at a time. */
async function each<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** What the research found: its sources, and the price histories behind any market data among them. */
export interface Research {
  items: ContextItem[];
  series: Series[];
}

const pctText = (x: number | null) => (x === null ? 'n/a' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10)}%`);

/** A price history as a source the actors can quote: where it stands, its year, its moves, its swings. */
export function seriesItem(s: Series, id: string): ContextItem | null {
  const st = seriesStats(recent(s));
  if (!st) return null;
  const p = (n: number) => priceText(n, s.currency);
  return {
    id,
    kind: 'series',
    symbol: s.symbol,
    title: `${s.name} (${s.symbol}): ${p(st.price)} on ${st.asOf}`,
    source: 'Yahoo Finance',
    published: `${st.asOf}T00:00:00Z`,
    place: '',
    lat: null,
    lng: null,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(s.symbol)}`,
    excerpt: `${s.name} (${s.symbol}) closed at ${p(st.price)} on ${st.asOf}. Past year: high ${p(st.high)} on ${st.highOn}, low ${p(st.low)} on ${st.lowOn}. Change over 30 days ${pctText(st.change30)}, 90 days ${pctText(st.change90)}, one year ${pctText(st.change365)}. It swings ${Math.round(st.vol * 100)}% a year (annualised volatility of daily moves).`,
  };
}

/** The names a story must carry to be about the question: the first word of each news search, else the question's own names. */
function namesFor(plan: ResearchPlan, question: string): string[] {
  const first = plan.news.map(q => terms(q)[0]).filter(Boolean);
  return [...new Set(first.length ? first : namesIn(question).flatMap(n => terms(n)))];
}

/**
 * The research for a question: news articles as `w1`, `w2`… (the newest
 * reporting that bears on it, each with its link and what the article says),
 * market data as `q1`…, prediction markets as `m1`…, then background as
 * `b1`, `b2`…, from Wikipedia.
 */
export async function researchWeb(plan: ResearchPlan, question: string, limit: number, signal: AbortSignal, deps: WebDeps = liveWeb): Promise<Research> {
  const words = terms(question, ...plan.news);
  const names = namesFor(plan, question);
  const [room, gdelt, events, background, series, markets] = await Promise.all([
    searchNewsroom({ desks: plan.desks, tickers: plan.instruments, words, names }, deps.api, signal).catch(() => [] as GdeltArticle[]),
    // GDELT asks for one request every five seconds: one search, the first.
    plan.news[0] ? searchGdelt(plan.news[0], deps, signal) : Promise.resolve([] as GdeltArticle[]),
    // Wikipedia's Current events, on the first search: the events its editors judged notable, each with its report.
    plan.news[0] ? searchCurrentEvents(plan.news[0], terms(plan.news[0]), deps, signal) : Promise.resolve([]),
    Promise.all(plan.background.map(t => searchWikipedia(t, deps, signal))),
    Promise.all(plan.instruments.slice(0, 2).map(sym => fetchSeries(sym, deps.api, signal).catch(() => null))),
    Promise.all(plan.markets.slice(0, 3).map(q => searchMarkets(q, deps.api, signal).catch(() => []))),
  ]);

  // Read a few more than are kept: some sites refuse, and those that answer come first.
  const picked = pickArticles([room, gdelt, events], limit + 4);
  const read = await each(picked, 4, a => readArticle(a, words, deps, signal));
  const excerptOf = (i: number) => read[i]?.excerpt || picked[i].summary || '';
  const ranked = picked.map((a, i) => ({ a, r: read[i], excerpt: excerptOf(i) }))
    .sort((x, y) => Number(Boolean(y.r?.excerpt)) - Number(Boolean(x.r?.excerpt)) || Number(Boolean(y.excerpt)) - Number(Boolean(x.excerpt)))
    .slice(0, limit);

  const items: ContextItem[] = ranked.map(({ a, r, excerpt }, i) => ({
    id: `w${i + 1}`,
    kind: 'web',
    title: a.title,
    // An event Wikipedia summarised keeps both names: its words are Wikipedia's, its report the outlet's.
    source: a.via ? `${text(a.outlet, 48) || a.domain} (${a.via} summary)` : a.outlet || text(r?.site, 60) || a.domain.replace(/^www\./, ''),
    published: a.seendate || (r?.published ?? ''),
    place: a.sourcecountry,
    lat: null,
    lng: null,
    url: a.url,
    ...(excerpt ? { excerpt } : {}),
  }));
  const found = series.filter((x): x is Series => x !== null);
  for (const sr of found) {
    const item = seriesItem(sr, `q${items.filter(c => c.kind === 'series').length + 1}`);
    if (item) items.push(item);
  }
  const allMarkets = markets.flat();
  pickOdds(allMarkets, question, terms(question)).forEach((m, i) => {
    const { url, ...odds } = m;
    // A rung of a price ladder brings the whole ladder: the crowd's price on every level.
    const ladder = ladderOf(m, allMarkets);
    items.push({ id: `m${i + 1}`, kind: 'odds', title: m.question, source: m.platform, published: '', place: '', lat: null, lng: null, url, excerpt: oddsLine(m), odds: ladder.length ? { ...odds, ladder } : odds });
  });
  const seen = new Set<string>();
  for (const b of background) {
    if (!b || seen.has(b.url)) continue;
    seen.add(b.url);
    items.push({ id: `b${seen.size}`, kind: 'wiki', title: b.title, source: 'Wikipedia', published: '', place: '', lat: null, lng: null, url: b.url, excerpt: b.extract });
  }
  return { items, series: found };
}

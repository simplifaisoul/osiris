/**
 * OSIRIS OI: the research plan, what a forecast reads before anything else.
 *
 * The model plans it from the question: news searches, the newsroom desks
 * that cover it, the tickers of any price it turns on, searches for
 * prediction markets on it, and background to read. Whatever the model
 * leaves out, the question's own names and words fill in. Pure and
 * client-safe: the scripted demo model plans with it too.
 */
import { terms } from './words';
import { text } from './parse';

export const DESKS = ['world', 'politics', 'business', 'markets', 'crypto', 'tech', 'energy', 'defense', 'health', 'science', 'climate', 'sports'] as const;
export type Desk = typeof DESKS[number];

/** What to read: news coverage, the desks it comes from, market prices, prediction markets, and background. */
export interface ResearchPlan {
  news: string[];
  background: string[];
  /** The newsroom desks that cover the question. */
  desks: Desk[];
  /** Tickers, as Yahoo Finance writes them, of the prices the question turns on. */
  instruments: string[];
  /** Searches for prediction markets on the question. */
  markets: string[];
  /** Places where a live public camera would show what the question turns on (traffic, a crowd, floodwater); usually none. */
  cameras: string[];
}

/** A search as GDELT takes it: words of three letters or more, at most five, no operators. */
export function searchWords(q: string): string {
  return q.normalize('NFKC').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/)
    .filter(w => w.replace(/['-]/g, '').length >= 3 && !/^(or|and|not)$/i.test(w))
    .slice(0, 5).join(' ');
}

/** A ticker as Yahoo Finance writes it. */
const SYMBOL = /^[A-Za-z0-9^=.-]{1,20}$/;

/** The desks a question's words point to. */
const DESK_WORDS: [RegExp, Desk[]][] = [
  [/\b(bitcoin|btc|ethereum|ether|eth|solana|sol|xrp|ripple|dogecoin|doge|cardano|crypto\w*|stablecoin|defi|token|binance|coinbase|blockchain)\b/i, ['crypto', 'markets']],
  [/\b(oil|brent|wti|crude|opec\+?|natural gas|lng|gasoline|energy|coal|electricity)\b/i, ['energy', 'markets']],
  [/\b(stocks?|shares?|s&p|nasdaq|dow|index|ipo|earnings|fed|federal reserve|interest rates?|inflation|cpi|yields?|bonds?|treasury|recession|gdp|dollar|euro|yen|currenc\w*|market cap|valuation)\b/i, ['markets', 'business']],
  [/\b(gold|silver|copper|wheat|commodit\w*)\b/i, ['markets']],
  [/\b(elect\w*|vote|voters|president\w*|prime minister|parliament|congress|senate|party|polls?|referendum|impeach\w*|minister|government|coalition|supreme court)\b/i, ['politics']],
  [/\b(war|invad\w*|invasion|military|army|troops|missiles?|strikes?|ceasefire|nato|attack\w*|conflict|nuclear weapons?|drones?|hezbollah|hamas|insurgen\w*)\b/i, ['world', 'defense']],
  [/\b(ai|artificial intelligence|openai|anthropic|nvidia|chips?|semiconductor\w*|software|apple|google|alphabet|microsoft|meta|amazon|tesla|spacex|smartphone|quantum)\b/i, ['tech']],
  [/\b(vaccines?|virus|pandemic|disease|health|fda|drugs?|outbreak|cancer|world health organi[sz]ation|measles|bird flu|h5n1)\b/i, ['health']],
  [/\b(climate|emissions?|temperatures?|warming|carbon|hurricanes?|wildfires?|cop\d+)\b/i, ['climate', 'science']],
  [/\b(world cup|olympic\w*|super bowl|champions league|premier league|nba|nfl|mlb|nhl|fifa|uefa|grand prix|formula 1|f1|wimbledon|tournament|championship)\b/i, ['sports']],
];

/** Prices a question names in so many words, by their tickers. */
const KNOWN: [RegExp, string][] = [
  [/\b(bitcoin|btc)\b/i, 'BTC-USD'], [/\b(ethereum|ether)\b/i, 'ETH-USD'], [/\bsolana\b/i, 'SOL-USD'], [/\b(xrp|ripple)\b/i, 'XRP-USD'],
  [/\bdogecoin\b/i, 'DOGE-USD'], [/\bcardano\b/i, 'ADA-USD'], [/\bgold\b/i, 'GC=F'], [/\bsilver\b/i, 'SI=F'], [/\bcopper\b/i, 'HG=F'],
  [/\bbrent\b/i, 'BZ=F'], [/\b(wti|crude oil|oil price)\b/i, 'CL=F'], [/\bnatural gas\b/i, 'NG=F'], [/\b(s&p 500|s&p|sp500)\b/i, '^GSPC'],
  [/\bnasdaq\b/i, '^NDX'], [/\bdow jones\b/i, '^DJI'], [/\bnikkei\b/i, '^N225'], [/\bftse\b/i, '^FTSE'], [/\bdax\b/i, '^GDAXI'],
  [/\bvix\b/i, '^VIX'], [/\b(eur\/usd|euro.{0,12}dollar)\b/i, 'EURUSD=X'], [/\b(usd\/jpy|yen)\b/i, 'JPY=X'], [/\b10-year (treasury|yield)/i, '^TNX'],
  [/\btesla\b/i, 'TSLA'], [/\bnvidia\b/i, 'NVDA'], [/\bapple\b/i, 'AAPL'], [/\bmicrosoft\b/i, 'MSFT'], [/\bamazon\b/i, 'AMZN'],
  [/\b(alphabet|google)\b/i, 'GOOGL'], [/\bmeta platforms\b/i, 'META'],
];

/** Whether a question asks about a price or a level at all: names alone do not make a market question. */
const PRICED = /\b(price|prices|trade|trading|reach|hit|above|below|close|settle|fall|drop|rise|rally|crash|ath|all-time high|\$|usd|per barrel|per ounce|points?|level|market cap|worth|value)\b|\$\s?\d/i;

/** A plan from the question alone, when the model's is missing: its names first, then its longest words. */
const NOT_NAMES = new Set(`Will Which What Who Where When How Why Does Do Did Is Are Was Can Could Would Should Shall May Might By Before
  After In On At Of The A An If Or And Than January February March April June July August September October November December
  Monday Tuesday Wednesday Thursday Friday Saturday Sunday`.split(/\s+/));

/** The capitalised names in a question. */
export function namesIn(question: string): string[] {
  return [...question.matchAll(/[A-Z][\p{L}+.&-]*(?:\s+[A-Z][\p{L}+.&-]*)*/gu)]
    .map(m => m[0].split(/\s+/).filter(w => !NOT_NAMES.has(w)).join(' ').replace(/[+.]+$/, ''))
    .filter(n => n.length >= 2);
}

export function desksFor(question: string): Desk[] {
  const out = new Set<Desk>();
  for (const [re, desks] of DESK_WORDS) if (re.test(question)) for (const d of desks) out.add(d);
  if (!out.size) out.add('world');
  return [...out].slice(0, 4);
}

export function tickersIn(question: string): string[] {
  if (!PRICED.test(question)) return [];
  return [...new Set(KNOWN.filter(([re]) => re.test(question)).map(([, t]) => t))].slice(0, 2);
}

/** What a street camera can actually show. A question about anything else gets no cameras. */
const SEEN_ON_CAMERA = /\b(traffic|congest\w*|gridlock|jams?|commut\w*|rush hour|crowds?|crowded|protests?|protesters|rall(?:y|ies)|demonstrat\w*|marches|queues?|border crossings?|floods?|flooding|floodwater|snow\w*|blizzards?|evacuat\w*|footfall|tourists?)\b/i;

/** Where to look, when the model did not say: the places the question names, if it is about something a camera shows. */
export function camerasFor(question: string): string[] {
  return SEEN_ON_CAMERA.test(question) ? namesIn(question).slice(0, 2) : [];
}

export function planFallback(question: string): ResearchPlan {
  const names = namesIn(question);
  const words = terms(question).filter(t => !names.some(n => n.toLowerCase().includes(t))).sort((a, b) => b.length - a.length);
  const news = searchWords([...names, ...words].slice(0, 4).join(' '));
  const instruments = tickersIn(question);
  // Prediction markets title a price question by the asset, its price and the year ("What price will Solana hit in 2026?").
  const year = /\b20\d{2}\b/.exec(question)?.[0];
  const priced = instruments.length && names[0] ? `${names[0].split(' ')[0]} price${year ? ` ${year}` : ''}` : '';
  const markets = [...new Set([priced, searchWords([...names, ...words].slice(0, 3).join(' '))].filter(q => q.length >= 3))];
  return {
    news: news ? [news] : [],
    background: names.slice(0, 2),
    desks: desksFor(question),
    instruments,
    markets,
    cameras: camerasFor(question),
  };
}

/** The model's plan, cleaned: whatever it left out or got wrong, the question's own words fill in. */
export function parsePlan(raw: Record<string, unknown> | null, question: string): ResearchPlan {
  const take = (v: unknown, n: number, max = 80) => (Array.isArray(v) ? v : []).map(x => text(x, max)).filter(Boolean).slice(0, n);
  const fallback = planFallback(question);
  const news = take(raw?.news ?? raw?.searches, 2).map(searchWords).filter(q => q.length >= 3);
  const background = take(raw?.background ?? raw?.topics, 2);
  const desks = take(raw?.desks, 6, 20).map(d => d.toLowerCase()).filter((d): d is Desk => (DESKS as readonly string[]).includes(d));
  const instruments = [...new Set(take(raw?.instruments ?? raw?.tickers, 6, 20).map(s => s.trim()).filter(s => SYMBOL.test(s)))].slice(0, 2);
  const markets = take(raw?.markets, 2).map(searchWords).filter(q => q.length >= 3);
  return {
    news: news.length ? news : fallback.news,
    background: background.length ? background : fallback.background,
    // The model's desks, and the ones the question's own words point to: a desk too many costs a feed read, one too few the story.
    desks: [...new Set([...desks, ...fallback.desks])].slice(0, 5),
    instruments: instruments.length ? instruments : fallback.instruments,
    // The model's searches, and the question's own: a market search is cheap, and one phrasing finds what another misses.
    markets: [...new Set([...markets, ...fallback.markets])].slice(0, 3),
    // The model decides whether cameras can help: an empty list is its answer, not a gap. Only a plan without the field falls back.
    cameras: Array.isArray(raw?.cameras) ? take(raw.cameras, 2) : fallback.cameras,
  };
}

/**
 * OSIRIS — Markets panel helpers.
 *
 * The pure pieces of the Markets & Intel panel, kept out of the component so
 * they can be tested: which benchmarks lead the Pulse strip, how a month's
 * move and a section's move are measured, how a move is coloured on the
 * heatmap, and how the watchlist is stored.
 */

export interface MarketQuote {
  name: string;
  symbol: string;
  price: number;
  change_percent: number;
  up: boolean;
  spark?: number[];
  currency?: string;
  market_open?: boolean;
  group?: string;
  /** Previous session's close, which the day's move is measured from. */
  prev_close?: number;
  day_high?: number;
  day_low?: number;
  volume?: number;
  /** Last trade, unix seconds. */
  time?: number;
  high_52w?: number;
  low_52w?: number;
  /** The exchange's own name for itself, e.g. "NYSE". */
  exchange?: string;
  /** The issuer's short name, e.g. "Lockheed Martin Corporation". */
  description?: string;
}

/**
 * The benchmarks the Pulse strip leads with, in reading order: US equities and
 * fear, rates and the dollar, then gold, oil and bitcoin.
 */
export const PULSE: ReadonlyArray<{ symbol: string; label: string }> = [
  { symbol: 'ES=F', label: 'S&P 500' },
  { symbol: 'NQ=F', label: 'NASDAQ' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: '^TNX', label: 'US 10Y' },
  { symbol: 'DX-Y.NYB', label: 'DOLLAR' },
  { symbol: 'GC=F', label: 'GOLD' },
  { symbol: 'CL=F', label: 'WTI' },
  { symbol: 'BTC-USD', label: 'BITCOIN' },
];

/** Percentage move across the sparkline window — a month of daily closes. */
export function monthChange(spark?: number[]): number | null {
  if (!spark || spark.length < 2) return null;
  const first = spark[0];
  const last = spark[spark.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / first) * 100;
}

/**
 * Heatmap colour for a move: green up, red down, stronger with size, and
 * saturating at ±`cap`% so one wild instrument doesn't wash out the rest — a
 * quiet day reads quiet, and a 3% day is as loud as a 10% one.
 */
export function heat(pct: number, cap = 3): { background: string; border: string } {
  const strength = Number.isFinite(pct) ? Math.min(Math.abs(pct) / cap, 1) : 0;
  const rgb = pct >= 0 ? '0,230,118' : '255,61,61';
  return {
    background: `rgba(${rgb},${(0.05 + strength * 0.35).toFixed(3)})`,
    border: `rgba(${rgb},${(0.15 + strength * 0.45).toFixed(3)})`,
  };
}

/** "+1.23%", "−0.40%" (a real minus), or "—" for no reading. */
export function formatMove(pct: number | null | undefined, digits = 2): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const fixed = Math.abs(pct).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${pct > 0 ? '+' : '−'}${fixed}%`;
}

/* ── watchlist ───────────────────────────────────────────────── */

export const WATCHLIST_KEY = 'osiris.markets.watchlist';
export const WATCHLIST_CAP = 30;

/** Yahoo symbols: letters, digits and ^ = . - (e.g. ^VIX, ES=F, DX-Y.NYB). */
const SYMBOL = /^[\w^=.-]{1,20}$/;

/** Tolerates anything localStorage might hand back, including nothing. */
export function parseWatchlist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    for (const s of value) if (typeof s === 'string' && SYMBOL.test(s)) seen.add(s);
    return [...seen].slice(0, WATCHLIST_CAP);
  } catch {
    return [];
  }
}

/** Star or unstar a symbol; newest stars go last, so the list keeps its order. */
export function toggleWatch(list: string[], symbol: string): string[] {
  if (list.includes(symbol)) return list.filter(s => s !== symbol);
  if (!SYMBOL.test(symbol)) return list;
  return [...list, symbol].slice(-WATCHLIST_CAP);
}

/* ── the terminal ────────────────────────────────────────────── */

/**
 * The panel's functions, each on a numbered key and a mnemonic, the way a
 * market terminal is driven: type the code, or the key's number, and GO.
 * `section` is the feed group a function lists, or what else it opens.
 */
export const FUNCTIONS = [
  { code: 'WEI', key: 1, title: 'World Equity Indices', section: 'indices', aliases: ['IDX', 'INDEX', 'INDICES'] },
  { code: 'DEF', key: 2, title: 'Defense Equities', section: 'stocks', aliases: ['DEFENSE', 'DEFENCE', 'EQUITY', 'EQ'] },
  { code: 'NRG', key: 3, title: 'Energy', section: 'oil', aliases: ['ENGY', 'ENERGY', 'OIL'] },
  { code: 'CMDTY', key: 4, title: 'Commodities', section: 'commodities', aliases: ['COMDTY', 'CMD', 'METALS', 'AGS'] },
  { code: 'FX', key: 5, title: 'Currencies', section: 'fx', aliases: ['FXC', 'WCRS', 'CCY', 'CURNCY'] },
  { code: 'CRYPTO', key: 6, title: 'Digital Assets', section: 'crypto', aliases: ['XBT', 'COIN', 'COINS'] },
  { code: 'WATCH', key: 7, title: 'Watchlist', section: 'watch', aliases: ['MON', 'MONITOR', 'STARS'] },
  { code: 'DON', key: 8, title: 'DonBot Token Scan', section: 'donbot', aliases: ['DONBOT', 'TOKEN', 'SCAN'] },
] as const;

export type FunctionCode = (typeof FUNCTIONS)[number]['code'];

/**
 * World equity indices by region, as a terminal's index monitor groups them.
 * Rates, volatility and the dollar ride with the indices in the feed but are
 * not indices of anything, so they get a block of their own.
 */
export const WEI_REGIONS: ReadonlyArray<{ label: string; symbols: readonly string[] }> = [
  { label: 'AMERICAS', symbols: ['ES=F', 'NQ=F'] },
  { label: 'EMEA', symbols: ['^GDAXI', '^FTSE', '^STOXX50E'] },
  { label: 'ASIA / PACIFIC', symbols: ['^N225', '^HSI'] },
  { label: 'RATES · VOLATILITY · DOLLAR', symbols: ['^TNX', '^VIX', 'DX-Y.NYB'] },
];

/** A symbol without Yahoo's decorations: ^GDAXI → GDAXI, ES=F → ES, BTC-USD → BTC, EURUSD=X → EURUSD. */
function bareSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/^\^/, '').replace(/=[FX]$/, '').replace(/-USD$/, '').replace(/\.NYB$/, '');
}

/** A name boiled down for matching: "EUR/USD" → "EURUSD", "WTI Crude" → "WTICRUDE". */
const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * What the command line asks for. Reads the way a terminal user types:
 * "LMT", "lmt us equity <GO>", "eurusd", "gold", "fx", "5", "don".
 */
export type Command =
  | { kind: 'function'; code: FunctionCode }
  | { kind: 'security'; symbol: string }
  | { kind: 'help' }
  | { kind: 'none' };

export function parseCommand(input: string, quotes: readonly MarketQuote[]): Command {
  const words = input.toUpperCase().replace(/<\s*GO\s*>/g, ' ').split(/\s+/).filter(Boolean);
  // A trailing GO, market-sector key or country code, typed after a ticker out
  // of habit: "LMT US EQUITY GO" is LMT.
  while (words.length > 1 && /^(GO|US|EQUITY|INDEX|CURNCY|COMDTY|CORP|GOVT)$/.test(words[words.length - 1])) words.pop();
  const text = words.join(' ');
  if (!text) return { kind: 'none' };
  if (text === 'HELP' || text === '?') return { kind: 'help' };

  const fn = FUNCTIONS.find(f => f.code === text || String(f.key) === text || (f.aliases as readonly string[]).includes(text));
  if (fn) return { kind: 'function', code: fn.code };

  const key = squash(text);
  const bySymbol = quotes.find(q => q.symbol.toUpperCase() === text)
    ?? quotes.find(q => squash(bareSymbol(q.symbol)) === key)
    ?? quotes.find(q => squash(q.name) === key)
    ?? quotes.find(q => key.length >= 2 && squash(q.name).startsWith(key))
    ?? quotes.find(q => key.length >= 3 && q.description && squash(q.description).startsWith(key));
  return bySymbol ? { kind: 'security', symbol: bySymbol.symbol } : { kind: 'none' };
}

export interface Suggestion { kind: 'function' | 'security'; value: string; label: string; hint: string }

/** A security's name for a heading: the issuer's, where the feed names it by its ticker ("LMT" → "Lockheed Martin Corporation"). */
export function longName(q: Pick<MarketQuote, 'name' | 'symbol' | 'description'>): string {
  return q.name === q.symbol && q.description ? q.description : q.name;
}

/** What the command line offers as it is typed: functions first, then securities. At most `limit`. */
export function suggest(input: string, quotes: readonly MarketQuote[], limit = 6): Suggestion[] {
  const text = input.toUpperCase().trim();
  if (!text) return [];
  const key = squash(text);
  const out: Suggestion[] = [];
  for (const f of FUNCTIONS) {
    if (f.code.startsWith(text) || String(f.key) === text || f.aliases.some(a => a.startsWith(text)) || f.title.toUpperCase().startsWith(text)) {
      out.push({ kind: 'function', value: f.code, label: f.code, hint: f.title });
    }
  }
  for (const q of quotes) {
    if (out.length >= limit) break;
    if (squash(bareSymbol(q.symbol)).startsWith(key) || squash(q.name).includes(key) || (key.length >= 3 && q.description && squash(q.description).includes(key))) {
      out.push({ kind: 'security', value: q.symbol, label: longName(q), hint: q.symbol });
    }
  }
  return out.slice(0, limit);
}

/**
 * How many decimals a quote is shown to: currencies to four (three for the
 * yen), the 10-year yield to three, small coins to four, everything else two.
 */
export function priceDecimals(q: Pick<MarketQuote, 'symbol' | 'price' | 'group'>): number {
  if (q.group === 'fx') return Math.abs(q.price) >= 20 ? 3 : 4;
  if (q.symbol === '^TNX') return 3;
  if (q.group === 'crypto' && Math.abs(q.price) < 10) return 4;
  return 2;
}

export function formatPrice(q: Pick<MarketQuote, 'symbol' | 'price' | 'group'>, value = q.price): string {
  if (!Number.isFinite(value)) return '—';
  const digits = priceDecimals(q);
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Net change on the day: from the previous close when there is one, else backed out of the percentage. */
export function netChange(q: Pick<MarketQuote, 'price' | 'change_percent' | 'prev_close'>): number | null {
  if (Number.isFinite(q.prev_close)) return q.price - (q.prev_close as number);
  if (!Number.isFinite(q.change_percent) || q.change_percent <= -100) return null;
  return q.price - q.price / (1 + q.change_percent / 100);
}

/** "+12.50", "−0.0040" — signed, with a real minus, at the quote's precision. */
export function formatNet(q: Pick<MarketQuote, 'symbol' | 'price' | 'group'>, net: number | null): string {
  if (net == null || !Number.isFinite(net)) return '—';
  const text = formatPrice(q, Math.abs(net));
  if (Number(text.replace(/,/g, '')) === 0) return text;
  return `${net > 0 ? '+' : '−'}${text}`;
}

/** Where a price sits between a low and a high, 0 to 1 — or null when there is no range. */
export function rangePosition(price: number, low?: number, high?: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  const span = (high as number) - (low as number);
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (price - (low as number)) / span));
}

/** 892,732 → "893K", 1.2e9 → "1.2B". */
export function formatVolume(v?: number): string {
  if (!v || !Number.isFinite(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(v);
}

/** The last trade's time in UTC, "14:32" — or its date, "09/30", once it is from an earlier day. */
export function tradeTime(unixSec: number | undefined, now = Date.now()): string {
  if (!unixSec || !Number.isFinite(unixSec)) return '—';
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (now - d.getTime() > 20 * 3600_000) return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * The exchanges on the world clock, with their regular sessions in local
 * time. Holidays and early closes are not modelled — a session reads open on
 * any weekday inside its hours — which the clock says in its tooltip.
 */
export const EXCHANGES = [
  { code: 'NY', zone: 'America/New_York', open: '09:30', close: '16:00' },
  { code: 'LDN', zone: 'Europe/London', open: '08:00', close: '16:30' },
  { code: 'FRA', zone: 'Europe/Berlin', open: '09:00', close: '17:30' },
  { code: 'HK', zone: 'Asia/Hong_Kong', open: '09:30', close: '16:00' },
  { code: 'TKY', zone: 'Asia/Tokyo', open: '09:00', close: '15:30' },
] as const;

/** Local time and whether the regular session is on, for every exchange on the clock. */
export function exchangeClocks(now: Date = new Date()): { code: string; time: string; open: boolean }[] {
  return EXCHANGES.map(ex => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ex.zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const time = `${get('hour')}:${get('minute')}`;
    const weekday = !['Sat', 'Sun'].includes(get('weekday'));
    return { code: ex.code, time, open: weekday && time >= ex.open && time < ex.close };
  });
}

export type SortKey = 'feed' | 'name' | 'move' | 'month';

/** Rows in the order asked for — A→Z or smallest first when `ascending`; 'feed' keeps the order they came in. */
export function sortQuotes<T extends MarketQuote>(rows: readonly T[], key: SortKey, ascending = false): T[] {
  if (key === 'feed') return [...rows];
  const value = (q: T): number | string => key === 'name' ? q.name.toUpperCase() : key === 'move' ? q.change_percent : monthChange(q.spark) ?? -Infinity;
  const sorted = [...rows].sort((a, b) => {
    const va = value(a), vb = value(b);
    return typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
  });
  return ascending ? sorted : sorted.reverse();
}

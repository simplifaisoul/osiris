
import { NextResponse } from 'next/server';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Financial Markets & Commodities API
 *
 * Indices, rates, FX, defense equities, energy, commodities and crypto, all
 * from Yahoo's v8 chart endpoint. One request per symbol buys the last close,
 * a month of daily closes for the sparkline, and the session window — so the
 * panel can show a trend and say whether the market is actually open.
 *
 * The old v6 quote fallback was removed: Yahoo decommissioned it and it 404s
 * on every call, so it only ever added a round-trip to a failing request.
 */

export interface Quote {
  group: string;
  name: string;
  symbol: string;
  price: number;
  change_percent: number;
  up: boolean;
  /** Daily closes, oldest first — enough to draw a one-month sparkline. */
  spark: number[];
  currency: string;
  market_open: boolean;
}

/** Display name and section for every instrument we track. */
const TICKERS: Array<{ symbol: string; name: string; group: string }> = [
  { symbol: 'ES=F', name: 'S&P 500', group: 'indices' },
  { symbol: 'NQ=F', name: 'Nasdaq 100', group: 'indices' },
  { symbol: '^VIX', name: 'VIX', group: 'indices' },
  { symbol: 'DX-Y.NYB', name: 'Dollar Index', group: 'indices' },
  { symbol: '^TNX', name: 'US 10Y', group: 'indices' },

  { symbol: 'RTX', name: 'RTX', group: 'stocks' },
  { symbol: 'LMT', name: 'LMT', group: 'stocks' },
  { symbol: 'NOC', name: 'NOC', group: 'stocks' },
  { symbol: 'GD', name: 'GD', group: 'stocks' },
  { symbol: 'BA', name: 'BA', group: 'stocks' },
  { symbol: 'LHX', name: 'LHX', group: 'stocks' },
  { symbol: 'PLTR', name: 'PLTR', group: 'stocks' },

  { symbol: 'CL=F', name: 'WTI Crude', group: 'oil' },
  { symbol: 'BZ=F', name: 'Brent Crude', group: 'oil' },
  { symbol: 'NG=F', name: 'Natural Gas', group: 'oil' },

  { symbol: 'GC=F', name: 'Gold', group: 'commodities' },
  { symbol: 'SI=F', name: 'Silver', group: 'commodities' },
  { symbol: 'HG=F', name: 'Copper', group: 'commodities' },
  { symbol: 'ZW=F', name: 'Wheat', group: 'commodities' },
  { symbol: 'ZC=F', name: 'Corn', group: 'commodities' },

  { symbol: 'BTC-USD', name: 'Bitcoin', group: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', group: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana', group: 'crypto' },
  { symbol: 'XRP-USD', name: 'XRP', group: 'crypto' },

  { symbol: 'EURUSD=X', name: 'EUR/USD', group: 'fx' },
  { symbol: 'USDJPY=X', name: 'USD/JPY', group: 'fx' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', group: 'fx' },
  { symbol: 'USDCNY=X', name: 'USD/CNY', group: 'fx' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Round to 2dp without dragging in floating-point tails. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function fetchQuote(t: { symbol: string; name: string; group: string }): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?interval=1d&range=1mo`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const result = (await res.json())?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice;
    if (!Number.isFinite(price)) return null;

    // Yahoo leaves nulls in the close series for non-trading days; a sparkline
    // only needs the shape, so drop them rather than trying to interpolate.
    const spark: number[] = (result.indicators?.quote?.[0]?.close || [])
      .filter((c: unknown): c is number => Number.isFinite(c))
      .map((c: number) => r2(c));

    /* Over a one-month range `chartPreviousClose` is the close before the whole
       month, which would report a monthly move as if it were today's. The last
       entry in the series is the current session, so the one before it is the
       previous close. */
    const prevClose = spark.length >= 2 ? spark[spark.length - 2] : meta.chartPreviousClose;
    if (!Number.isFinite(prevClose) || prevClose === 0) return null;

    const changePercent = ((price - prevClose) / prevClose) * 100;

    // The session window Yahoo reports for this exchange. Crypto trades around
    // the clock and reports a full-day window, so this comes out open for it.
    const period = meta.currentTradingPeriod?.regular;
    const nowSec = Date.now() / 1000;
    const marketOpen = Number.isFinite(period?.start) && Number.isFinite(period?.end)
      ? nowSec >= period.start && nowSec <= period.end
      : false;

    return {
      group: t.group,
      name: t.name,
      symbol: t.symbol,
      price: r2(price),
      change_percent: r2(changePercent),
      up: changePercent >= 0,
      spark,
      currency: meta.currency || 'USD',
      market_open: marketOpen,
    };
  } catch { return null; }
}

/**
 * Yahoo is one host, and firing every symbol at it at once is the access
 * pattern upstreams throttle first — enough in-flight connections and requests
 * start hanging until they time out, which loses the whole refresh. A small
 * number of workers walking the list keeps the fan-out civil and still
 * finishes well inside a request.
 */
const CONCURRENCY = 5;

/**
 * The last good quote for each symbol.
 *
 * A refresh that loses some symbols used to drop them from the payload
 * entirely, which empties a whole tab: the workers start on the first five
 * tickers, those are the five indices, and they race cold connections
 * together — so INDICES was the group that kept vanishing. Holding the
 * previous value per symbol means a transient miss costs freshness rather
 * than the instrument.
 */
const lastGood = new Map<string, Quote>();

/** Run `fetchQuote` over a list with a bounded number of requests in flight. */
async function fetchBatch(tickers: typeof TICKERS, into: Map<string, Quote>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tickers.length) {
      const ticker = tickers[next++];
      const quote = await fetchQuote(ticker);
      if (quote) into.set(ticker.symbol, quote);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/**
 * All instruments in one pass, with a second go at whatever missed. The retry
 * runs against connections the first pass has already opened, which is exactly
 * what the symbols unlucky enough to be first in the list need.
 */
export async function fetchAllQuotes(): Promise<Quote[]> {
  const fresh = new Map<string, Quote>();

  await fetchBatch(TICKERS, fresh);

  const missed = TICKERS.filter(t => !fresh.has(t.symbol));
  if (missed.length) await fetchBatch(missed, fresh);

  for (const [symbol, quote] of fresh) lastGood.set(symbol, quote);

  return TICKERS
    .map(t => fresh.get(t.symbol) || lastGood.get(t.symbol))
    .filter((q): q is Quote => q !== undefined);
}

/**
 * 60s TTL. The client polls far less often than that; the cache is here so a
 * burst of viewers shares one upstream pass, and — more importantly — so a
 * failed refresh keeps serving the last good prices instead of blanking the
 * whole panel, which is what used to happen on a cold start.
 */
const getQuotes = cachedSource<Quote>('markets', fetchAllQuotes, 60_000);

/** Chokepoint risk that has a direct read-through to the instruments above. */
async function fetchScmAlerts(origin: string): Promise<string[]> {
  const alerts: string[] = [];
  try {
    const res = await fetch(`${origin}/api/maritime`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return alerts;
    const chokepoints = (await res.json())?.chokepoints || [];

    const atRisk = (name: string) => {
      const c = chokepoints.find((x: { name?: string; risk?: string }) => x.name === name);
      return c && (c.risk === 'CRITICAL' || c.risk === 'HIGH') ? c.risk : null;
    };

    const hormuz = atRisk('Strait of Hormuz');
    const suez = atRisk('Suez Canal');
    const panama = atRisk('Panama Canal');
    if (hormuz) alerts.push(`🚨 HORMUZ ${hormuz}: High risk of WTI/Brent Crude price spike due to congestion.`);
    if (suez) alerts.push(`🚨 SUEZ ${suez}: Potential supply chain delays impacting European markets and Energy.`);
    if (panama) alerts.push(`🚨 PANAMA ${panama}: LNG and Agriculture (Corn/Wheat) shipment delays expected.`);
  } catch {
    // Maritime unreachable — the market data still stands on its own.
  }
  return alerts;
}

/** Fold the flat quote list back into the per-section shape the UI reads. */
export function groupQuotes(quotes: Quote[]): Record<string, Record<string, Quote>> {
  const out: Record<string, Record<string, Quote>> = {
    indices: {}, stocks: {}, oil: {}, commodities: {}, crypto: {}, fx: {},
  };
  for (const q of quotes) {
    (out[q.group] ||= {})[q.name] = q;
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const [quotes, scm_alerts] = await Promise.all([getQuotes(), fetchScmAlerts(origin)]);

    return NextResponse.json({
      ...groupQuotes(quotes),
      scm_alerts,
      count: quotes.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' }, // Prevent caching so alerts update real-time
    });
  } catch (error) {
    console.error('Markets fetch error:', error);
    return NextResponse.json(
      { ...groupQuotes([]), scm_alerts: [], count: 0, error: 'Failed' },
      { status: 500 },
    );
  }
}

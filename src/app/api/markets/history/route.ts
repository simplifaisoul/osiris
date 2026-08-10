import { NextResponse } from 'next/server';

/**
 * OSIRIS — Instrument price history.
 *
 * OHLC candles for one symbol, for the chart in the markets panel. Each range
 * carries its own interval: a day at 5-minute bars, a year at weekly ones, so
 * every window comes back at a resolution that is worth drawing.
 */

/**
 * Ranges the client may ask for, and the bar size each is served at.
 *
 * Case matters, and deliberately so: `1m` is one-minute bars while `1M` is one
 * month, the same convention the trading tools use. Do not case-fold the query
 * parameter — it would collapse the two.
 */
export const RANGES: Record<string, { interval: string; range: string }> = {
  '1m': { interval: '1m', range: '1d' },
  '15m': { interval: '15m', range: '2d' },
  '24H': { interval: '5m', range: '1d' },
  '1W': { interval: '30m', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  '6M': { interval: '1d', range: '6mo' },
  '1Y': { interval: '1wk', range: '1y' },
};

export interface Candle {
  /** Epoch seconds — what lightweight-charts expects for an intraday scale. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Yahoo pads its series with nulls wherever a bar has no trade. A candle with
 * a missing leg cannot be drawn, so drop it rather than invent a value.
 */
export function parseCandles(result: unknown): Candle[] {
  const r = result as {
    timestamp?: number[];
    indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
  } | null;

  const stamps = r?.timestamp;
  const q = r?.indicators?.quote?.[0];
  if (!Array.isArray(stamps) || !q) return [];

  const out: Candle[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if (![o, h, l, c].every(v => Number.isFinite(v))) continue;
    if (!Number.isFinite(stamps[i])) continue;
    out.push({
      time: stamps[i],
      open: o as number,
      high: h as number,
      low: l as number,
      close: c as number,
      volume: Number.isFinite(q.volume?.[i]) ? (q.volume![i] as number) : 0,
    });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim();
  const rangeKey = searchParams.get('range') || '1M';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }
  const spec = RANGES[rangeKey];
  if (!spec) {
    return NextResponse.json({ error: `range must be one of ${Object.keys(RANGES).join(', ')}` }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${spec.range}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}`, candles: [] }, { status: 502 });
    }

    const result = (await res.json())?.chart?.result?.[0];
    const candles = parseCandles(result);

    return NextResponse.json({
      symbol,
      range: rangeKey,
      interval: spec.interval,
      currency: result?.meta?.currency || 'USD',
      candles,
    }, {
      // Intraday bars go stale fast; a minute of edge caching still absorbs
      // the clicking-through-ranges burst.
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    console.error('Markets history error:', error);
    return NextResponse.json({ error: 'Failed', candles: [] }, { status: 500 });
  }
}

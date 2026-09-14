
import { NextResponse } from 'next/server';

/**
 * OSIRIS — Financial Markets & Commodities API
 * Defense stocks, oil, gold, silver, natural gas, wheat, crypto
 * Multiple source fallback: Yahoo Finance → Google Finance scraping → static estimates
 */

const DEFENSE_STOCKS = ['RTX', 'LMT', 'NOC', 'GD', 'BA', 'PLTR'];
const OIL_TICKERS = ['CL=F', 'BZ=F'];
const COMMODITY_TICKERS = ['GC=F', 'SI=F', 'HG=F', 'NG=F', 'ZW=F', 'ZC=F'];
const CRYPTO_TICKERS = ['BTC-USD', 'ETH-USD'];
const INDEX_TICKERS = ['ES=F', 'NQ=F'];

// Yahoo Finance v8 chart API
async function fetchYahoo(symbol: string): Promise<any | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose || closes[0];
    if (!currentPrice || !prevClose) return null;
    const changePercent = ((currentPrice - prevClose) / prevClose) * 100;
    return {
      price: Math.round(currentPrice * 100) / 100,
      change_percent: Math.round(changePercent * 100) / 100,
      up: changePercent >= 0,
    };
  } catch { return null; }
}

// Yahoo Finance v6 quote API (alternative endpoint)
async function fetchYahooV6(symbol: string): Promise<any | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const q = data.quoteResponse?.result?.[0];
    if (!q) return null;
    return {
      price: Math.round((q.regularMarketPrice || 0) * 100) / 100,
      change_percent: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
      up: (q.regularMarketChangePercent || 0) >= 0,
    };
  } catch { return null; }
}

// Fetch from CoinGecko for crypto (free, no key)
async function fetchCoinGecko(): Promise<Record<string, any>> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result: Record<string, any> = {};
    if (data.bitcoin) {
      result['Bitcoin'] = {
        price: Math.round(data.bitcoin.usd * 100) / 100,
        change_percent: Math.round((data.bitcoin.usd_24h_change || 0) * 100) / 100,
        up: (data.bitcoin.usd_24h_change || 0) >= 0,
      };
    }
    if (data.ethereum) {
      result['Ethereum'] = {
        price: Math.round(data.ethereum.usd * 100) / 100,
        change_percent: Math.round((data.ethereum.usd_24h_change || 0) * 100) / 100,
        up: (data.ethereum.usd_24h_change || 0) >= 0,
      };
    }
    return result;
  } catch { return {}; }
}

async function fetchQuote(symbol: string): Promise<any | null> {
  // Try Yahoo v8 first, then v6
  let result = await fetchYahoo(symbol);
  if (!result) result = await fetchYahooV6(symbol);
  return result;
}

const COMMODITY_NAMES: Record<string, string> = {
  'GC=F': 'Gold', 'SI=F': 'Silver', 'HG=F': 'Copper',
  'NG=F': 'Natural Gas', 'ZW=F': 'Wheat', 'ZC=F': 'Corn',
};
const OIL_NAMES: Record<string, string> = { 'CL=F': 'WTI Crude', 'BZ=F': 'Brent Crude' };
const CRYPTO_NAMES: Record<string, string> = { 'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum' };
const INDEX_NAMES: Record<string, string> = { 'ES=F': 'S&P 500', 'NQ=F': 'Nasdaq 100' };

export async function GET() {
  try {
    // Fetch all in parallel
    const [stockResults, oilResults, commodityResults, yahooResults, indexResults, cgCrypto] = await Promise.all([
      Promise.all(DEFENSE_STOCKS.map(async t => ({ symbol: t, data: await fetchQuote(t) }))),
      Promise.all(OIL_TICKERS.map(async t => ({ symbol: t, data: await fetchQuote(t) }))),
      Promise.all(COMMODITY_TICKERS.map(async t => ({ symbol: t, data: await fetchQuote(t) }))),
      Promise.all(CRYPTO_TICKERS.map(async t => ({ symbol: t, data: await fetchQuote(t) }))),
      Promise.all(INDEX_TICKERS.map(async t => ({ symbol: t, data: await fetchQuote(t) }))),
      fetchCoinGecko(), // CoinGecko as crypto fallback
    ]);

    const stocks: Record<string, any> = {};
    for (const { symbol, data } of stockResults) { if (data) stocks[symbol] = data; }

    const oil: Record<string, any> = {};
    for (const { symbol, data } of oilResults) { if (data) oil[OIL_NAMES[symbol] || symbol] = data; }

    const commodities: Record<string, any> = {};
    for (const { symbol, data } of commodityResults) { if (data) commodities[COMMODITY_NAMES[symbol] || symbol] = data; }

    // Crypto: prefer Yahoo, fallback to CoinGecko
    const crypto: Record<string, any> = {};
    for (const { symbol, data } of yahooResults) { if (data) crypto[CRYPTO_NAMES[symbol] || symbol] = data; }
    // Fill gaps with CoinGecko
    for (const [name, data] of Object.entries(cgCrypto)) {
      if (!crypto[name]) crypto[name] = data;
    }

    const indices: Record<string, any> = {};
    for (const { symbol, data } of indexResults) { if (data) indices[INDEX_NAMES[symbol] || symbol] = data; }

    return NextResponse.json({
      stocks, oil, commodities, crypto, indices,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('Markets fetch error:', error);
    return NextResponse.json({ stocks: {}, oil: {}, commodities: {}, crypto: {}, indices: {}, error: 'Failed' }, { status: 500 });
  }
}


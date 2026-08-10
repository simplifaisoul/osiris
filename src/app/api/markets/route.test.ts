import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuote, groupQuotes, type Quote } from './route';

const TICKER = { symbol: 'LMT', name: 'LMT', group: 'stocks' };

/** A trimmed v8 chart response — only the fields the parser reads. */
function chartResponse(over: {
  price?: number | null;
  prevClose?: number | null;
  closes?: (number | null)[];
  period?: { start: number; end: number } | null;
} = {}) {
  const {
    price = 100,
    prevClose = 80,
    closes = [80, 90, 100],
    period = { start: 0, end: 4102444800 }, // wide-open window
  } = over;
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          meta: {
            regularMarketPrice: price,
            chartPreviousClose: prevClose,
            currency: 'USD',
            ...(period ? { currentTradingPeriod: { regular: period } } : {}),
          },
          indicators: { quote: [{ close: closes }] },
        }],
      },
    }),
  };
}

function mockFetch(res: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchQuote', () => {
  it('derives the percentage move from the previous close', async () => {
    mockFetch(chartResponse({ price: 110, closes: [50, 100, 110] }));
    const q = await fetchQuote(TICKER);
    expect(q?.change_percent).toBe(10);
    expect(q?.up).toBe(true);
  });

  it('marks a decline as down', async () => {
    mockFetch(chartResponse({ price: 90, closes: [50, 100, 90] }));
    const q = await fetchQuote(TICKER);
    expect(q?.change_percent).toBe(-10);
    expect(q?.up).toBe(false);
  });

  /* The regression that made every instrument look like a runaway gainer:
     over a one-month range chartPreviousClose predates the whole series, so
     using it reported the month's move as the day's. */
  it('measures against yesterday, not the start of the month', async () => {
    mockFetch(chartResponse({ price: 110, prevClose: 55, closes: [55, 100, 110] }));
    expect((await fetchQuote(TICKER))?.change_percent).toBe(10);
  });

  it('falls back to chartPreviousClose when the series is too short', async () => {
    mockFetch(chartResponse({ price: 110, prevClose: 100, closes: [110] }));
    expect((await fetchQuote(TICKER))?.change_percent).toBe(10);
  });

  it('drops the nulls Yahoo leaves in the close series', async () => {
    mockFetch(chartResponse({ closes: [10, null, 12, null, 14] }));
    expect((await fetchQuote(TICKER))?.spark).toEqual([10, 12, 14]);
  });

  // A zero previous close would make the percentage infinite.
  it('returns null rather than dividing by a zero previous close', async () => {
    mockFetch(chartResponse({ prevClose: 0, closes: [100] }));
    expect(await fetchQuote(TICKER)).toBeNull();
  });

  it('returns null when the price is missing', async () => {
    mockFetch(chartResponse({ price: null }));
    expect(await fetchQuote(TICKER)).toBeNull();
  });

  it('reports the session closed when now sits outside the trading window', async () => {
    mockFetch(chartResponse({ period: { start: 0, end: 1 } }));
    expect((await fetchQuote(TICKER))?.market_open).toBe(false);
  });

  it('reports the session open inside the trading window', async () => {
    mockFetch(chartResponse());
    expect((await fetchQuote(TICKER))?.market_open).toBe(true);
  });

  // No window at all is not evidence that trading is live.
  it('treats a missing trading period as closed', async () => {
    mockFetch(chartResponse({ period: null }));
    expect((await fetchQuote(TICKER))?.market_open).toBe(false);
  });

  it('returns null on a non-ok response instead of throwing', async () => {
    mockFetch({ ok: false, json: async () => ({}) });
    expect(await fetchQuote(TICKER)).toBeNull();
  });

  it('swallows a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchQuote(TICKER)).toBeNull();
  });
});

describe('groupQuotes', () => {
  const quote = (name: string, group: string): Quote => ({
    group, name, symbol: name, price: 1, change_percent: 0, up: true,
    spark: [], currency: 'USD', market_open: true,
  });

  it('files each quote under its section, keyed by display name', () => {
    const out = groupQuotes([quote('Gold', 'commodities'), quote('LMT', 'stocks')]);
    expect(out.commodities.Gold.symbol).toBe('Gold');
    expect(out.stocks.LMT.symbol).toBe('LMT');
  });

  // The panel iterates a fixed tab list, so every section must exist even
  // when its instruments all failed to load.
  it('always returns every section', () => {
    expect(Object.keys(groupQuotes([])).sort())
      .toEqual(['commodities', 'crypto', 'fx', 'indices', 'oil', 'stocks']);
  });
});

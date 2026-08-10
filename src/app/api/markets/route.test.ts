import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuote, fetchAllQuotes, groupQuotes, type Quote } from './route';

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

/* These share the route's module-level last-good cache, so they run in order:
   the first populates it, the second depends on it being warm. */
describe('fetchAllQuotes', () => {
  /** Answer normally, except for symbols the caller wants to fail. */
  function mockUpstream(failing: string[] = []) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const symbol = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
      if (failing.includes(symbol)) throw new Error('upstream down');
      return chartResponse({ price: 100, closes: [90, 100] });
    }));
  }

  it('returns instruments in the declared order, not the order they answered', async () => {
    mockUpstream();
    const quotes = await fetchAllQuotes();
    const indices = quotes.filter(q => q.group === 'indices').map(q => q.name);
    expect(indices).toEqual(['S&P 500', 'Nasdaq 100', 'VIX', 'Dollar Index', 'US 10Y']);
  });

  /* The bug this guards: the workers start on the first five tickers — which
     are the five indices — so they raced cold connections together and failed
     as a group. Dropping them emptied the whole INDICES tab. */
  it('keeps the last good value for a symbol that fails this refresh', async () => {
    mockUpstream(['ES=F', '^VIX']);
    const quotes = await fetchAllQuotes();
    const names = quotes.filter(q => q.group === 'indices').map(q => q.name);
    expect(names).toContain('S&P 500');
    expect(names).toContain('VIX');
    expect(quotes).toHaveLength(28);
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

import { describe, it, expect } from 'vitest';
import {
  FUNCTIONS, PULSE, WATCHLIST_CAP, WEI_REGIONS,
  exchangeClocks, formatMove, formatNet, formatPrice, formatVolume, heat, monthChange, netChange,
  longName, parseCommand, parseWatchlist, priceDecimals, rangePosition, sortQuotes, suggest, toggleWatch, tradeTime,
  type MarketQuote,
} from './markets';

const q = (symbol: string, change_percent: number, extra: Partial<MarketQuote> = {}): MarketQuote =>
  ({ name: symbol, symbol, price: 1, change_percent, up: change_percent >= 0, ...extra });

/** A slice of the real feed, enough for the command line to resolve against. */
const FEED: MarketQuote[] = [
  q('ES=F', 0.1, { name: 'S&P 500', group: 'indices', price: 7734.25 }),
  q('^GDAXI', -0.7, { name: 'DAX', group: 'indices' }),
  q('^N225', 1.3, { name: 'Nikkei 225', group: 'indices' }),
  q('LMT', -0.6, { name: 'LMT', group: 'stocks', description: 'Lockheed Martin Corporation' }),
  q('GC=F', 0.1, { name: 'Gold', group: 'commodities' }),
  q('CL=F', 0.8, { name: 'WTI Crude', group: 'oil' }),
  q('BTC-USD', 0.03, { name: 'Bitcoin', group: 'crypto' }),
  q('EURUSD=X', 0.2, { name: 'EUR/USD', group: 'fx', price: 1.0834 }),
];

describe('PULSE', () => {
  it('names eight distinct benchmarks', () => {
    expect(PULSE).toHaveLength(8);
    expect(new Set(PULSE.map(p => p.symbol)).size).toBe(8);
  });
});

describe('monthChange', () => {
  it('measures first close to last', () => {
    expect(monthChange([100, 90, 110])).toBeCloseTo(10);
  });
  it('has no reading without two usable closes', () => {
    expect(monthChange(undefined)).toBeNull();
    expect(monthChange([5])).toBeNull();
    expect(monthChange([0, 5])).toBeNull();
  });
});

describe('heat', () => {
  it('colours direction and saturates at the cap', () => {
    expect(heat(1).background).toContain('0,230,118');
    expect(heat(-1).background).toContain('255,61,61');
    expect(heat(3)).toEqual(heat(12));
    expect(heat(0.1).background).not.toEqual(heat(2).background);
  });
  it('treats a missing reading as flat', () => {
    expect(heat(NaN).background).toContain('0.050');
  });
});

describe('formatMove', () => {
  it('signs moves with a real minus and has no negative zero', () => {
    expect(formatMove(1.234)).toBe('+1.23%');
    expect(formatMove(-0.4)).toBe('−0.40%');
    expect(formatMove(-0.001)).toBe('0.00%');
    expect(formatMove(null)).toBe('—');
  });
});

describe('watchlist', () => {
  it('survives missing, corrupt and foreign stored values', () => {
    expect(parseWatchlist(null)).toEqual([]);
    expect(parseWatchlist('nope')).toEqual([]);
    expect(parseWatchlist('{"a":1}')).toEqual([]);
    expect(parseWatchlist(JSON.stringify(['^VIX', 'ES=F', '<script>', 'ES=F', 7]))).toEqual(['^VIX', 'ES=F']);
  });

  it('toggles, keeps order, and caps the list', () => {
    expect(toggleWatch(['A'], 'B')).toEqual(['A', 'B']);
    expect(toggleWatch(['A', 'B'], 'A')).toEqual(['B']);
    expect(toggleWatch([], 'bad symbol!')).toEqual([]);
    const full = Array.from({ length: WATCHLIST_CAP }, (_, i) => `S${i}`);
    expect(toggleWatch(full, 'NEW')).toHaveLength(WATCHLIST_CAP);
  });
});

describe('the command line', () => {
  it('runs a function by code, alias or key number', () => {
    expect(parseCommand('wei', FEED)).toEqual({ kind: 'function', code: 'WEI' });
    expect(parseCommand('energy', FEED)).toEqual({ kind: 'function', code: 'NRG' });
    expect(parseCommand('5', FEED)).toEqual({ kind: 'function', code: 'FX' });
    expect(parseCommand('donbot <GO>', FEED)).toEqual({ kind: 'function', code: 'DON' });
  });

  it('loads a security by ticker, bare symbol or name', () => {
    expect(parseCommand('LMT', FEED)).toEqual({ kind: 'security', symbol: 'LMT' });
    expect(parseCommand('btc', FEED)).toEqual({ kind: 'security', symbol: 'BTC-USD' });
    expect(parseCommand('gdaxi', FEED)).toEqual({ kind: 'security', symbol: '^GDAXI' });
    expect(parseCommand('eurusd', FEED)).toEqual({ kind: 'security', symbol: 'EURUSD=X' });
    expect(parseCommand('gold', FEED)).toEqual({ kind: 'security', symbol: 'GC=F' });
    expect(parseCommand('nikkei', FEED)).toEqual({ kind: 'security', symbol: '^N225' });
    expect(parseCommand('lockheed', FEED)).toEqual({ kind: 'security', symbol: 'LMT' });
  });

  // How a terminal hand types it: ticker, country, sector key, GO.
  it('reads a ticker typed with its country, sector key and GO', () => {
    expect(parseCommand('lmt us equity <go>', FEED)).toEqual({ kind: 'security', symbol: 'LMT' });
    expect(parseCommand('gold comdty go', FEED)).toEqual({ kind: 'security', symbol: 'GC=F' });
  });

  it('keeps a function code that is also a sector key', () => {
    expect(parseCommand('cmdty', FEED)).toEqual({ kind: 'function', code: 'CMDTY' });
  });

  it('says so when nothing matches, and offers help', () => {
    expect(parseCommand('zzzz', FEED)).toEqual({ kind: 'none' });
    expect(parseCommand('   ', FEED)).toEqual({ kind: 'none' });
    expect(parseCommand('help', FEED)).toEqual({ kind: 'help' });
  });

  it('suggests functions first, then securities, up to a limit', () => {
    const s = suggest('c', FEED);
    expect(s[0]).toMatchObject({ kind: 'function', value: 'CMDTY' });
    expect(s.some(x => x.kind === 'security' && x.value === 'CL=F')).toBe(true);
    expect(suggest('', FEED)).toEqual([]);
    expect(suggest('e', FEED, 3)).toHaveLength(3);
  });

  it('names a ticker-named security by its issuer', () => {
    expect(longName({ name: 'LMT', symbol: 'LMT', description: 'Lockheed Martin Corporation' })).toBe('Lockheed Martin Corporation');
    expect(longName({ name: 'Gold', symbol: 'GC=F', description: 'Gold Dec 26' })).toBe('Gold');
    expect(suggest('lmt', FEED)[0]).toMatchObject({ value: 'LMT', label: 'Lockheed Martin Corporation' });
  });

  it('puts every function on its own key', () => {
    expect(new Set(FUNCTIONS.map(f => f.key)).size).toBe(FUNCTIONS.length);
    expect(new Set(FUNCTIONS.map(f => f.code)).size).toBe(FUNCTIONS.length);
  });
});

describe('WEI regions', () => {
  it('lists each index once', () => {
    const all = WEI_REGIONS.flatMap(r => r.symbols);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('prices', () => {
  it('shows currencies to four decimals and the yen to three', () => {
    expect(priceDecimals({ symbol: 'EURUSD=X', price: 1.0834, group: 'fx' })).toBe(4);
    expect(priceDecimals({ symbol: 'USDJPY=X', price: 150.23, group: 'fx' })).toBe(3);
    expect(formatPrice({ symbol: 'EURUSD=X', price: 1.0834, group: 'fx' })).toBe('1.0834');
  });

  it('groups thousands and keeps two decimals elsewhere', () => {
    expect(formatPrice({ symbol: 'ES=F', price: 7734.25, group: 'indices' })).toBe('7,734.25');
    expect(priceDecimals({ symbol: '^TNX', price: 4.123, group: 'indices' })).toBe(3);
  });

  it('measures the net change from the previous close, or backs it out of the move', () => {
    expect(netChange({ price: 110, change_percent: 10, prev_close: 100 })).toBeCloseTo(10);
    expect(netChange({ price: 110, change_percent: 10 })).toBeCloseTo(10);
    expect(netChange({ price: 1, change_percent: NaN })).toBeNull();
  });

  it('signs a net change with a real minus, at the quote’s precision', () => {
    expect(formatNet({ symbol: 'EURUSD=X', price: 1.08, group: 'fx' }, -0.0041)).toBe('−0.0041');
    expect(formatNet({ symbol: 'ES=F', price: 7700, group: 'indices' }, 12.5)).toBe('+12.50');
    expect(formatNet({ symbol: 'ES=F', price: 7700, group: 'indices' }, null)).toBe('—');
  });

  it('places a price within its range, and has no place without one', () => {
    expect(rangePosition(105, 100, 110)).toBeCloseTo(0.5);
    expect(rangePosition(120, 100, 110)).toBe(1);
    expect(rangePosition(105, undefined, 110)).toBeNull();
    expect(rangePosition(105, 110, 110)).toBeNull();
  });

  it('abbreviates volume', () => {
    expect(formatVolume(892732)).toBe('893K');
    expect(formatVolume(1.24e9)).toBe('1.2B');
    expect(formatVolume(undefined)).toBe('—');
  });
});

describe('time', () => {
  const now = Date.parse('2026-10-01T15:00:00Z');

  it('gives a trade from today as its UTC time, and an older one as its date', () => {
    expect(tradeTime(Date.parse('2026-10-01T14:32:00Z') / 1000, now)).toBe('14:32');
    expect(tradeTime(Date.parse('2026-09-29T20:00:00Z') / 1000, now)).toBe('09/29');
    expect(tradeTime(undefined, now)).toBe('—');
  });

  it('opens New York and London together on a weekday afternoon in London', () => {
    // 15:00 UTC on a Thursday: 11:00 in New York, 16:00 in London, midnight in Tokyo.
    const clocks = Object.fromEntries(exchangeClocks(new Date(now)).map(c => [c.code, c]));
    expect(clocks.NY).toMatchObject({ time: '11:00', open: true });
    expect(clocks.LDN).toMatchObject({ time: '16:00', open: true });
    expect(clocks.TKY.open).toBe(false);
  });

  it('closes everything at the weekend', () => {
    expect(exchangeClocks(new Date('2026-10-03T15:00:00Z')).every(c => !c.open)).toBe(true);
  });
});

describe('sorting', () => {
  const rows = [q('A', 1, { name: 'Bravo' }), q('B', -2, { name: 'Alpha' }), q('C', 3, { name: 'Charlie' })];

  it('puts the biggest move first, or the smallest when ascending', () => {
    expect(sortQuotes(rows, 'move').map(r => r.symbol)).toEqual(['C', 'A', 'B']);
    expect(sortQuotes(rows, 'move', true).map(r => r.symbol)).toEqual(['B', 'A', 'C']);
  });

  it('reads names A to Z when ascending', () => {
    expect(sortQuotes(rows, 'name', true).map(r => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('leaves feed order alone', () => {
    expect(sortQuotes(rows, 'feed').map(r => r.symbol)).toEqual(['A', 'B', 'C']);
  });
});

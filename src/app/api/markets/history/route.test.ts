import { describe, it, expect } from 'vitest';
import { parseCandles, RANGES } from './route';

describe('RANGES', () => {
  /* The whole reason the route stopped upper-casing its query parameter:
     case-folding would turn one-minute bars into one-month bars. */
  it('keeps one-minute and one-month as separate ranges', () => {
    expect(RANGES['1m'].interval).toBe('1m');
    expect(RANGES['1M'].interval).toBe('1d');
    expect(RANGES['1m']).not.toEqual(RANGES['1M']);
  });

  it('serves every intraday range at a sub-daily bar size', () => {
    for (const key of ['1m', '15m', '24H', '1W']) {
      expect(RANGES[key].interval).toMatch(/m$/);
    }
  });

  it('offers the ranges the selector renders', () => {
    expect(Object.keys(RANGES)).toEqual(['1m', '15m', '24H', '1W', '1M', '6M', '1Y']);
  });
});

/** A chart result shaped the way Yahoo returns it. */
function result(over: Record<string, unknown> = {}) {
  return {
    timestamp: [100, 200, 300],
    indicators: {
      quote: [{
        open: [1, 2, 3],
        high: [2, 3, 4],
        low: [0.5, 1.5, 2.5],
        close: [1.5, 2.5, 3.5],
        volume: [10, 20, 30],
      }],
    },
    ...over,
  };
}

describe('parseCandles', () => {
  it('maps a clean series into candles', () => {
    const out = parseCandles(result());
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
  });

  // A bar missing any leg cannot be drawn, and interpolating one would be
  // inventing a price that never traded.
  it('drops a bar with a null leg rather than guessing it', () => {
    const out = parseCandles(result({
      indicators: { quote: [{ open: [1, null, 3], high: [2, 3, 4], low: [0.5, 1.5, 2.5], close: [1.5, 2.5, 3.5], volume: [10, 20, 30] }] },
    }));
    expect(out.map(c => c.time)).toEqual([100, 300]);
  });

  it('keeps a bar whose volume is missing, defaulting it to zero', () => {
    const out = parseCandles(result({
      indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [null] }] },
      timestamp: [100],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].volume).toBe(0);
  });

  it('returns nothing when the payload has no series', () => {
    expect(parseCandles(null)).toEqual([]);
    expect(parseCandles({})).toEqual([]);
    expect(parseCandles({ timestamp: [1, 2] })).toEqual([]);
  });

  it('ignores a bar with a non-finite timestamp', () => {
    const out = parseCandles(result({ timestamp: [100, null, 300] }));
    expect(out.map(c => c.time)).toEqual([100, 300]);
  });
});

import { describe, it, expect } from 'vitest';
import { backtest, baseline, chanceOf, demean, fanOf, logReturns, pricedWorlds, recordSentence, resample, rng, seedOf, seriesStats, tradingDays, worldCourses, type Series } from './quant';

/** A year and a half of daily closes from a fixed walk: up 1%, down 1%, in a repeating pattern, every calendar day like a coin. */
function walk(days: number, start = 100, moves = [0.01, -0.01, 0.02, -0.015, 0.005, -0.012]): Series {
  const dates: string[] = [];
  const closes: number[] = [];
  let p = start;
  for (let i = 0; i < days; i++) {
    dates.push(new Date(Date.UTC(2025, 3, 1) + i * 86_400_000).toISOString().slice(0, 10));
    closes.push(p);
    p *= 1 + moves[i % moves.length];
  }
  return { symbol: 'TST-USD', name: 'Test coin', currency: 'USD', dates, closes };
}

describe('reading a price history', () => {
  it('says where the price is, its year range, its moves and its volatility', () => {
    const s = walk(550);
    const st = seriesStats(s)!;
    expect(st.price).toBe(s.closes[549]);
    expect(st.asOf).toBe(s.dates[549]);
    expect(st.perYear).toBe(365);
    expect(st.high).toBeGreaterThanOrEqual(st.low);
    expect(st.change30).toBeCloseTo(st.price / s.closes[519] - 1, 6);
    // Daily moves of about 1.3% are about 25% a year over 365 trading days.
    expect(st.vol).toBeGreaterThan(0.2);
    expect(st.vol).toBeLessThan(0.3);
    expect(seriesStats(walk(20))).toBeNull();
  });

  it('counts a share’s trading days, not the calendar’s', () => {
    // Weekdays only: about 252 a year.
    const s = walk(700);
    const keep = s.dates.map((d, i) => ({ d, c: s.closes[i] })).filter(x => ![0, 6].includes(new Date(`${x.d}T00:00:00Z`).getUTCDay()));
    const st = seriesStats({ ...s, dates: keep.map(x => x.d), closes: keep.map(x => x.c) })!;
    expect(st.perYear).toBeGreaterThan(245);
    expect(st.perYear).toBeLessThan(265);
    expect(tradingDays(365, st.perYear)).toBe(st.perYear);
  });

  it('reads returns from adjusted closes, and takes the trend out', () => {
    const s = { ...walk(40), adjusted: walk(40, 50).closes };
    expect(logReturns(s)[0]).toBeCloseTo(Math.log(1.01), 9);
    const r = demean([0.02, 0.04, 0.06]);
    expect(r.reduce((t, x) => t + x, 0)).toBeCloseTo(0, 12);
  });
});

describe('resampling the future', () => {
  it('is repeatable: the same seed draws the same paths', () => {
    const r = demean(logReturns(walk(400)));
    const a = resample(r, 60, 50, 7), b = resample(r, 60, 50, 7);
    expect([...a.final]).toEqual([...b.final]);
    expect(rng(1)()).toBe(rng(1)());
    expect(seedOf('SOL-USD')).toBe(seedOf('SOL-USD'));
    expect(seedOf('SOL-USD')).not.toBe(seedOf('BTC-USD'));
  });

  it('keeps every path between its own lowest and highest point', () => {
    const p = resample(demean(logReturns(walk(400))), 90, 200, 3);
    for (let i = 0; i < 200; i++) {
      expect(p.min[i]).toBeLessThanOrEqual(Math.min(1, p.final[i]) + 1e-12);
      expect(p.max[i]).toBeGreaterThanOrEqual(Math.max(1, p.final[i]) - 1e-12);
    }
  });

  it('touches a level more often than it ends beyond it, and a far level less often than a near one', () => {
    const r = demean(logReturns(walk(500)));
    const touch = chanceOf({ symbol: 'T', threshold: 110, direction: 'above', touch: true }, 100, r, 90, 1);
    const close = chanceOf({ symbol: 'T', threshold: 110, direction: 'above', touch: false }, 100, r, 90, 1);
    const far = chanceOf({ symbol: 'T', threshold: 150, direction: 'above', touch: true }, 100, r, 90, 1);
    expect(touch).toBeGreaterThan(close);
    expect(far).toBeLessThan(touch);
    expect(chanceOf({ symbol: 'T', threshold: 90, direction: 'below', touch: true }, 100, r, 90, 1)).toBeGreaterThan(0.2);
    // Already there: a touch has happened.
    expect(chanceOf({ symbol: 'T', threshold: 90, direction: 'above', touch: true }, 100, r, 90, 1)).toBe(1);
    expect(chanceOf({ symbol: 'T' }, 100, r, 90, 1)).toBeNaN();
  });
});

describe('the baseline', () => {
  const s = walk(550);
  const price = s.closes[549];

  it('says how often the paths reach a level by the horizon, and where the price ends', () => {
    const q = baseline(s, { symbol: 'TST-USD', threshold: price * 1.3, direction: 'above', touch: true }, s.dates[549], '2026-12-31')!;
    expect(q.price).toBe(price);
    expect(q.days).toBeGreaterThan(0);
    expect(q.probability).toBeGreaterThan(0);
    expect(q.probability).toBeLessThan(0.5);
    expect(q.p10).toBeLessThan(q.p50);
    expect(q.p50).toBeLessThan(q.p90);
    // Driftless: the middle path ends near where it started.
    expect(Math.abs(q.p50 / price - 1)).toBeLessThan(0.08);
    expect(q.method).toMatch(/4,000 paths to 2026-12-31/);
    expect(q.method).toMatch(/reach \$/);
  });

  it('gives a range without a level, and nothing for a horizon already past', () => {
    const q = baseline(s, { symbol: 'TST-USD' }, s.dates[549], '2026-12-31')!;
    expect(q.probability).toBeUndefined();
    expect(baseline(s, { symbol: 'TST-USD' }, '2027-01-01', '2026-12-31')).toBeNull();
  });
});

describe('the simulation, priced', () => {
  const r = demean(logReturns(walk(500)));
  const m = { symbol: 'T', threshold: 120, direction: 'above' as const, touch: true };

  it('matches the plain chance when no world pushed the price', () => {
    const flat = pricedWorlds(m, 100, r, [30, 30, 30], [[1, 1, 1], [1, 1, 1]], 5);
    const plain = chanceOf(m, 100, r, 90, 5, 4000);
    expect(Math.abs(flat.probability! - plain)).toBeLessThan(0.04);
  });

  it('rises when the worlds’ events lift the price, falls when they sink it, and ranges the end price', () => {
    const base = pricedWorlds(m, 100, r, [30, 30, 30], [[1, 1, 1]], 5).probability!;
    const lifted = pricedWorlds(m, 100, r, [30, 30, 30], [[1.1, 1, 1], [1.05, 1.05, 1]], 5);
    const sunk = pricedWorlds(m, 100, r, [30, 30, 30], [[0.9, 1, 1]], 5).probability!;
    expect(lifted.probability!).toBeGreaterThan(base);
    expect(sunk).toBeLessThan(base);
    expect(lifted.p10).toBeLessThan(lifted.p50);
    expect(lifted.p50).toBeLessThan(lifted.p90);
    // A push of 30% at the open of the first period meets a level 20% up at once.
    expect(pricedWorlds(m, 100, r, [30], [[1.3]], 5).probability).toBe(1);
    expect(pricedWorlds({ symbol: 'T' }, 100, r, [30], [[1]], 5).probability).toBeUndefined();
  });
});

describe('the baseline’s record', () => {
  it('scores forecasts made on past days against what then happened, in bands of what it said', () => {
    const s = walk(900);
    const b = backtest(s, 60)!;
    expect(b.starts).toBeGreaterThan(30);
    expect(b.n).toBe(b.starts * 11);
    expect(b.bins.reduce((t, x) => t + x.n, 0)).toBe(b.n);
    for (const x of b.bins) {
      expect(x.said).toBeGreaterThanOrEqual(x.lo - 1e-9);
      expect(x.said).toBeLessThanOrEqual(x.hi + 1e-9);
      expect(x.happened).toBeGreaterThanOrEqual(0);
      expect(x.happened).toBeLessThanOrEqual(1);
    }
    expect(b.gap).toBeGreaterThanOrEqual(0);
    expect(b.brier).toBeGreaterThan(0);
    expect(b.from < b.to).toBe(true);
    // Each forecast is made from the year before its day, so the first is a year in.
    expect(Date.parse(b.from) - Date.parse(s.dates[0])).toBeGreaterThanOrEqual(364 * 86_400_000);
    expect(recordSentence(b, 'TST-USD', 0.15)).toMatch(/^Tested on [\d,]+ past forecasts of TST-USD .* points from what happened, on average\./);
    expect(backtest(walk(300), 60)).toBeNull();
  });
});

describe('the cone', () => {
  it('widens with time around a middle that stays near today’s price', () => {
    const s = walk(550);
    const fan = fanOf(s, s.dates[549], ['2026-11-15', '2027-01-15', '2027-06-15']);
    expect(fan.map(f => f.date)).toEqual(['2026-11-15', '2027-01-15', '2027-06-15']);
    const width = fan.map(f => f.p90 - f.p10);
    expect(width[1]).toBeGreaterThan(width[0]);
    expect(width[2]).toBeGreaterThan(width[1]);
    for (const f of fan) expect(Math.abs(f.p50 / s.closes[549] - 1)).toBeLessThan(0.1);
    expect(fanOf(s, s.dates[549], [])).toEqual([]);
  });
});

describe('each world’s course', () => {
  it('spreads the worlds across the range, the likeliest course first', () => {
    const r = demean(logReturns(walk(500)));
    const c = worldCourses(r, [20, 20, 20], 3, 9);
    expect(c).toHaveLength(3);
    for (const course of c) {
      expect(course).toHaveLength(3);
      for (const p of course) {
        expect(p.low).toBeLessThanOrEqual(p.close + 1e-12);
        expect(p.high).toBeGreaterThanOrEqual(p.close - 1e-12);
      }
    }
    const end = c.map(course => course[2].close);
    // World A is the middle; B below it, C above it.
    expect(end[1]).toBeLessThan(end[0]);
    expect(end[2]).toBeGreaterThan(end[0]);
  });
});

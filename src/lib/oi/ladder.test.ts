import { describe, it, expect } from 'vitest';
import { curveAt, ladderGaps, ladderSentence, readLadder } from './ladder';
import { levelOf, ladderOf, type MarketFind } from './markets';
import { curveLevels, demean, logReturns, pricedWorlds, touchCurve, resample } from './quant';

const curve = [
  { level: 50, probability: 0.04 }, { level: 80, probability: 0.2 }, { level: 120, probability: 1 },
  { level: 160, probability: 0.3 }, { level: 200, probability: 0.15 }, { level: 300, probability: 0.03 },
];

describe('reading a ladder', () => {
  it('reads the level and the way of a rung', () => {
    expect(levelOf('Will Solana reach $200 by December 31, 2026?')).toEqual({ level: 200, direction: 'above' });
    expect(levelOf('Will Solana dip to $50 by December 31, 2026?')).toEqual({ level: 50, direction: 'below' });
    expect(levelOf('Will Bitcoin hit $150k by December 31, 2026?')).toEqual({ level: 150000, direction: 'above' });
    expect(levelOf('Will the Fed cut rates?')).toBeNull();
  });

  it('gathers a market’s ladder from its event: open rungs, one per level and way, the most traded', () => {
    const at = (q: string, p: number, volume = 1000, url = 'https://polymarket.com/event/sol'): MarketFind => ({ platform: 'Polymarket', question: q, probability: p, volume, closes: '2027-01-01T05:00:00Z', url });
    const found = [
      at('Will Solana reach $200 by December 31, 2026?', 0.105),
      at('Will Solana reach $180 by December 31, 2026?', 0.17),
      at('Will Solana dip to $80 by December 31, 2026?', 0.175, 8000),
      at('Will Solana dip to $80 by December 31, 2026?', 0.3, 10),
      at('Will Solana dip to $50 by December 31, 2026?', 0.055),
      at('Will Solana reach $200 in October?', 0.005, 1000, 'https://polymarket.com/event/oct'),
    ];
    const ladder = ladderOf(found[0], found);
    expect(ladder).toEqual([
      { level: 50, direction: 'below', probability: 0.055 },
      { level: 80, direction: 'below', probability: 0.175 },
      { level: 180, direction: 'above', probability: 0.17 },
      { level: 200, direction: 'above', probability: 0.105 },
    ]);
    expect(ladderOf(found[5], found)).toEqual([]);
  });
});

describe('the model against the crowd', () => {
  it('reads the curve at a level, between its points on a log scale', () => {
    expect(curveAt(curve, 200)).toBe(0.15);
    expect(curveAt(curve, 180)).toBeGreaterThan(0.15);
    expect(curveAt(curve, 180)).toBeLessThan(0.3);
    expect(curveAt(curve, 1000)).toBe(0.03);
    expect(curveAt([], 100)).toBeNaN();
  });

  it('sets each rung beside the curve, leaving out rungs already behind today’s price, and says where they part', () => {
    const gaps = ladderGaps(curve, [
      { level: 50, direction: 'below', probability: 0.06 },
      { level: 80, direction: 'below', probability: 0.17 },
      { level: 100, direction: 'above', probability: 1 },
      { level: 200, direction: 'above', probability: 0.105 },
      { level: 300, direction: 'above', probability: 0.015 },
    ], 120);
    expect(gaps.map(g => g.level)).toEqual([50, 80, 200, 300]);
    const r = readLadder(gaps);
    expect(r.upside).toBeCloseTo(((0.15 - 0.105) + (0.03 - 0.015)) / 2, 6);
    expect(r.downside).toBeCloseTo(((0.04 - 0.06) + (0.2 - 0.17)) / 2, 6);
    expect(r.widest?.level).toBe(200);
    expect(ladderSentence(r, n => `$${n}`, 'Polymarket'))
      .toBe('Across 4 rungs of Polymarket\'s ladder, the model is above Polymarket (+3 pts on average) on the upside and level with Polymarket on the downside; they differ most at $200: model 15%, Polymarket 11%.');
  });
});

describe('touch curves', () => {
  const s = (() => {
    const closes: number[] = []; const dates: string[] = []; let p = 100;
    for (let i = 0; i < 500; i++) { dates.push(new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)); closes.push(p); p *= [1.03, 0.97, 1.04, 0.965, 1.01, 0.99][i % 6]; }
    return { symbol: 'T', name: 'T', currency: 'USD', dates, closes };
  })();
  const r = demean(logReturns(s));

  it('is certain at today’s price and falls away on both sides', () => {
    const p = resample(r, 60, 1000, 3);
    const levels = curveLevels(100, [150, 70]);
    expect(levels).toContain(150);
    expect(levels).toContain(70);
    const c = touchCurve(100, p.max, p.min, levels);
    expect(curveAt(c, 100)).toBeCloseTo(1, 1);
    expect(curveAt(c, 150)).toBeLessThan(curveAt(c, 120));
    expect(curveAt(c, 70)).toBeLessThan(curveAt(c, 85));
  });

  it('lifts the upside when the worlds’ events lift the price', () => {
    const levels = [130, 70];
    const flat = pricedWorlds({ symbol: 'T', threshold: 130, direction: 'above', touch: true }, 100, r, [30, 30], [[1, 1]], 5, 1500, levels);
    const up = pricedWorlds({ symbol: 'T', threshold: 130, direction: 'above', touch: true }, 100, r, [30, 30], [[1.1, 1]], 5, 1500, levels);
    expect(curveAt(up.curve!, 130)).toBeGreaterThan(curveAt(flat.curve!, 130));
    expect(curveAt(up.curve!, 70)).toBeLessThan(curveAt(flat.curve!, 70));
    expect(up.probability).toBeCloseTo(curveAt(up.curve!, 130), 6);
  });
});

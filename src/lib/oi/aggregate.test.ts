import { describe, it, expect } from 'vitest';
import { mixture, quantile, roundStat } from './aggregate';

describe('mixture', () => {
  it('is the mean of the worlds, each as likely as the next', () => {
    expect(mixture([{ probability: 0.2 }, { probability: 0.8 }])).toBeCloseTo(0.5);
    // One world that settled YES does not outvote two that stayed near 30%.
    expect(mixture([{ probability: 1 }, { probability: 0.31 }, { probability: 0.24 }])).toBeCloseTo(0.517, 3);
  });

  it('copes with certainty and with no worlds', () => {
    expect(mixture([{ probability: 1 }, { probability: 0 }])).toBeCloseTo(0.5);
    expect(mixture([{ probability: 1.4 }])).toBe(1);
    expect(mixture([])).toBeNaN();
  });
});

describe('roundStat', () => {
  it('reports the middle and the spread', () => {
    const s = roundStat(2, [0.1, 0.2, 0.3, 0.4, 0.95].map(probability => ({ probability, confidence: 0.5 })));
    expect(s).toMatchObject({ round: 2, n: 5, median: 0.3, p25: 0.2, p75: 0.4, min: 0.1, max: 0.95, consensus: 0.39 });
    expect(s.spread).toBeCloseTo(0.2);
    expect(s.histogram).toEqual([0, 1, 1, 1, 1, 0, 0, 0, 0, 1]);
  });

  it('interpolates quantiles', () => {
    expect(quantile([0, 1], 0.25)).toBeCloseTo(0.25);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

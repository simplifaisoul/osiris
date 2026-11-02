import { describe, it, expect } from 'vitest';
import { amount, answerText, directionWord, formatAmount, leader, normalizeShares, orderEstimate, pointView, positionIn } from './forecast';
import { parseKind, parseReport, parseStep } from './parse';
import { roundStatFor } from './aggregate';
import type { Frame, Period, WorldPoint } from './types';

const frame = (over: Partial<Frame>): Frame => ({
  question: 'q', kind: 'binary', proposition: 'p', resolution: '', horizon: '', outcomes: [], unit: '',
  baseRate: 0.5, prior: [], anchor: null, baseRateReason: '', focus: null, ...over,
});

const period: Period = { index: 2, label: '1 Nov – 30 Nov 2026', start: '2026-11-01', end: '2026-11-30' };
const point = (over: Partial<WorldPoint>): WorldPoint => ({ world: 'A', period: 1, probability: 0.5, resolved: null, note: '', ...over });

describe('reading figures', () => {
  it('reads amounts however they are written', () => {
    expect(amount(86.4)).toBe(86.4);
    expect(amount('86.4')).toBe(86.4);
    expect(amount('$1,234.50')).toBe(1234.5);
    expect(amount('about')).toBeNull();
    expect(amount(Infinity)).toBeNull();
  });

  it('turns shares into a distribution, from an array or by label', () => {
    expect(normalizeShares([2, 1, 1], ['a', 'b', 'c'], [])).toEqual([0.5, 0.25, 0.25]);
    expect(normalizeShares({ B: 60, a: 40 }, ['A', 'B'], [])).toEqual([0.4, 0.6]);
    expect(normalizeShares('nonsense', ['A', 'B'], [0.7, 0.3])).toEqual([0.7, 0.3]);
    expect(normalizeShares([0, 0], ['A', 'B'], [])).toEqual([0.5, 0.5]);
    expect(leader([0.2, 0.5, 0.3])).toBe(1);
  });

  it('keeps a range around its value', () => {
    expect(orderEstimate(10, 12, 8)).toEqual({ value: 10, low: 8, high: 12 });
    expect(orderEstimate(10, 11, 14)).toEqual({ value: 10, low: 10, high: 14 });
    expect(orderEstimate(10, null, null)).toEqual({ value: 10, low: 10, high: 10 });
  });

  it('formats figures the way a desk reads them', () => {
    expect(formatAmount(86.43)).toBe('86.4');
    expect(formatAmount(4.256)).toBe('4.26');
    expect(formatAmount(12345)).toBe('12,345');
    expect(formatAmount(3_400_000)).toBe('3.4M');
    expect(formatAmount(2.1e9)).toBe('2.1B');
    expect(formatAmount(0.0123)).toBe('0.0123');
  });

  it('places a value in a spread', () => {
    expect(positionIn(5, 0, 10)).toBe(0.5);
    expect(positionIn(20, 0, 10)).toBe(1);
    expect(positionIn(5, 3, 3)).toBe(0.5);
  });
});

describe('the kind of question', () => {
  it('reads a choice, and falls back to yes or no without two outcomes', () => {
    expect(parseKind({ kind: 'choice', outcomes: ['Lula', 'Bolsonaro', 'lula', ''], prior: [3, 1] }))
      .toEqual({ kind: 'choice', outcomes: ['Lula', 'Bolsonaro'], unit: '', prior: [0.75, 0.25], anchor: null });
    expect(parseKind({ kind: 'choice', outcomes: ['Only one'] }).kind).toBe('binary');
    expect(parseKind({ kind: 'nonsense' }).kind).toBe('binary');
  });

  it('reads a number with its unit and anchor', () => {
    expect(parseKind({ kind: 'number', unit: 'USD per barrel', anchor: '$84.20' }))
      .toEqual({ kind: 'number', outcomes: [], unit: 'USD per barrel', prior: [], anchor: 84.2 });
  });
});

describe('a world\'s step on a choice or a number', () => {
  const choice = frame({ kind: 'choice', outcomes: ['A', 'B', 'C'], prior: [0.5, 0.3, 0.2] });
  const number = frame({ kind: 'number', unit: 'USD', anchor: 80 });

  it('reads shares and makes the leading share its probability', () => {
    const { point: p } = parseStep({ state: { shares: [1, 3, 0] } }, 'A', period, new Set(), choice, null);
    expect(p.shares).toEqual([0.25, 0.75, 0]);
    expect(p.probability).toBe(0.75);
    expect(pointView(p, choice)).toBe('B 75%');
  });

  it('keeps the world\'s earlier shares when a reply has none, and reads an outcome that came about', () => {
    const kept = parseStep({}, 'A', period, new Set(), choice, point({ shares: [0.6, 0.3, 0.1] }));
    expect(kept.point.shares).toEqual([0.6, 0.3, 0.1]);
    const won = parseStep({ state: { resolved: 'c' } }, 'A', period, new Set(), choice, null);
    expect(won.point).toMatchObject({ resolved: 'C', shares: [0, 0, 1], probability: 1 });
    expect(pointView(won.point, choice)).toBe('C');
  });

  it('reads a value, falling back on the world\'s last one, then the anchor', () => {
    expect(parseStep({ state: { value: '92.5' } }, 'A', period, new Set(), number, null).point.value).toBe(92.5);
    expect(parseStep({ state: { value: 'soon' } }, 'A', period, new Set(), number, point({ value: 81 })).point.value).toBe(81);
    expect(parseStep({}, 'A', period, new Set(), number, null).point.value).toBe(80);
    expect(() => parseStep({}, 'A', period, new Set(), frame({ kind: 'number' }), null)).toThrow();
  });

  it('keeps events inside their period, in date order, with one surprise at most', () => {
    const { events } = parseStep({
      events: [
        { date: '2027-03-01', title: 'Late', kind: 'event' },
        { date: '2026-11-05', title: 'First shock', kind: 'shock' },
        { date: '2026-11-06', title: 'Second shock', kind: 'shock' },
        { title: '' },
      ],
    }, 'A', period, new Set(), frame({}), null);
    expect(events.map(e => [e.title, e.date])).toEqual([['First shock', '2026-11-05'], ['Late', '2026-11-30']]);
  });
});

describe('pooling', () => {
  const post = (over: Partial<{ probability: number; confidence: number; shares: number[]; estimate: { value: number; low: number; high: number } }>) => ({ probability: 0.5, confidence: 0.5, ...over });

  it('pools a choice and counts first picks', () => {
    const stat = roundStatFor(1, [
      post({ shares: [0.6, 0.4], probability: 0.6 }),
      post({ shares: [0.2, 0.8], probability: 0.8 }),
      post({ shares: [0.7, 0.3], probability: 0.7 }),
    ], 'choice', 2);
    expect(stat.shares![0]).toBeCloseTo(0.5, 2);
    expect(stat.votes).toEqual([2, 1]);
    expect(stat.consensus).toBe(Math.max(...stat.shares!));
  });

  it('takes the median of estimates and of their ranges', () => {
    const stat = roundStatFor(1, [
      post({ estimate: { value: 80, low: 70, high: 90 } }),
      post({ estimate: { value: 100, low: 90, high: 110 } }),
      post({ estimate: { value: 90, low: 85, high: 95 } }),
    ], 'number');
    expect(stat.value).toMatchObject({ median: 90, min: 80, max: 100, low: 85, high: 95 });
    expect(stat.n).toBe(3);
  });
});

describe('the answer', () => {
  it('is said in the terms of the question', () => {
    const choice = frame({ kind: 'choice', outcomes: ['Lula', 'Bolsonaro'] });
    const report = parseReport({ shares: [0.62, 0.38] }, { probability: 0.6, shares: [0.6, 0.4] }, new Set(), choice);
    expect(report.answer).toBe('Lula (62%)');
    expect(report.probability).toBe(0.62);

    const number = frame({ kind: 'number', unit: 'USD per barrel' });
    const est = parseReport({ estimate: { value: 86.4, low: 80, high: 92 } }, { probability: 0.5 }, new Set(), number);
    expect(est.answer).toBe('86.4 USD per barrel (80–92)');

    const binary = parseReport({ probability: 0.62 }, { probability: 0.5 }, new Set(), frame({}));
    expect(binary.answer).toBe('62% YES');
  });

  it('falls back to the simulation when the report gives no figure', () => {
    const number = frame({ kind: 'number', unit: 'USD' });
    const r = parseReport({}, { probability: 0.5, estimate: { value: 81, low: 75, high: 88 } }, new Set(), number);
    expect(r.estimate).toEqual({ value: 81, low: 75, high: 88 });
    expect(answerText(number, null, null)).toBe('');
  });

  it('reads directions for each kind', () => {
    expect(directionWord(frame({}), 'yes', '')).toBe('YES');
    expect(directionWord(frame({ kind: 'number' }), 'no', '')).toBe('lower');
    expect(directionWord(frame({ kind: 'choice', outcomes: ['A'] }), 'yes', 'A')).toBe('A');
  });
});

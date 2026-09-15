import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { resetDbForTests } from './client';
import { getBaseline, getDeviation, insertSnapshot } from './maritime';

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe('insertSnapshot / getBaseline', () => {
  it('throttles inserts within the 15-minute bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    vi.setSystemTime(5 * 60 * 1000); // 5 min later, still inside the bucket
    insertSnapshot('strait-of-hormuz', 20, 'HIGH');

    const baseline = getBaseline('strait-of-hormuz', 90);
    vi.useRealTimers();

    expect(baseline).toBe(10);
  });

  it('inserts again once the bucket has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    vi.setSystemTime(16 * 60 * 1000); // past the 15-minute bucket
    insertSnapshot('strait-of-hormuz', 20, 'HIGH');

    const baseline = getBaseline('strait-of-hormuz', 90);
    vi.useRealTimers();

    expect(baseline).toBe(15); // avg(10, 20)
  });

  it('keeps chokepoints independent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 10, 'HIGH');
    insertSnapshot('suez-canal', 99, 'ELEVATED');

    const hormuz = getBaseline('strait-of-hormuz', 90);
    const suez = getBaseline('suez-canal', 90);
    vi.useRealTimers();

    expect(hormuz).toBe(10);
    expect(suez).toBe(99);
  });

  it('returns 0 when there is no history yet', () => {
    expect(getBaseline('lombok-strait', 90)).toBe(0);
  });
});

describe('getDeviation', () => {
  it('returns 0 when there is no baseline yet', () => {
    expect(getDeviation('strait-of-hormuz', 10)).toBe(0);
  });

  it('computes signed percentage deviation from the 90-day baseline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('strait-of-hormuz', 100, 'HIGH');
    vi.setSystemTime(20 * 60 * 1000); // past the bucket, second point recorded
    insertSnapshot('strait-of-hormuz', 50, 'HIGH');

    const deviation = getDeviation('strait-of-hormuz', 80);
    vi.useRealTimers();

    // baseline = avg(100, 50) = 75
    expect(deviation).toBeCloseTo((80 - 75) / 75, 5);
  });
});

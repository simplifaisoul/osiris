import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { resetDbForTests } from './client';
import { getExposureTrend, insertSnapshot } from './sanctions';

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe('insertSnapshot / getExposureTrend', () => {
  it('throttles inserts within the 24h bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('entity-1', 1_000_000, true, 0.8);
    vi.setSystemTime(60 * 60 * 1000); // 1h later, still inside the bucket
    insertSnapshot('entity-1', 2_000_000, true, 0.9);

    const trend = getExposureTrend('entity-1', 90);
    vi.useRealTimers();

    expect(trend).toHaveLength(1);
    expect(trend[0].exposure_score).toBe(0.8);
  });

  it('inserts again once the 24h bucket has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    insertSnapshot('entity-1', 1_000_000, true, 0.8);
    vi.setSystemTime(25 * 60 * 60 * 1000); // past the 24h bucket
    insertSnapshot('entity-1', 2_000_000, false, 0.3);

    const trend = getExposureTrend('entity-1', 90);
    vi.useRealTimers();

    expect(trend).toHaveLength(2);
    expect(trend[1].exposure_score).toBe(0.3);
  });

  it('accepts a null trade_volume', () => {
    insertSnapshot('entity-2', null, false, 0.1);
    const trend = getExposureTrend('entity-2', 90);
    expect(trend).toHaveLength(1);
    expect(trend[0].exposure_score).toBe(0.1);
  });

  it('returns an empty trend for an entity with no history', () => {
    expect(getExposureTrend('unknown-entity', 90)).toEqual([]);
  });
});

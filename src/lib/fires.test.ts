import { describe, it, expect } from 'vitest';
import { expandFires } from './fires';

/**
 * The column order is a contract between /api/fires and this expander. A
 * mismatch does not throw — it quietly reads longitude as latitude and puts
 * every detection somewhere it never burned, which is the kind of bug that
 * looks like a data problem for a long time before anyone suspects the parser.
 */
const row = (over: Partial<Record<number, unknown>> = {}) => {
  const base: unknown[] = [27.9886, 22.3247, 5, 367, 2, 0, '0109', 0];
  for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
  return base;
};

describe('expandFires', () => {
  it('maps columns to the fields the map reads', () => {
    const [f] = expandFires({ rows: [row()], dates: ['2026-09-08'] });
    expect(f).toEqual({
      lat: 27.9886,
      lng: 22.3247,
      frp: 5,
      brightness: 367,
      confidence: 'high',
      date: '2026-09-08',
      time: '0109',
      type: 'fire',
    });
  });

  it('resolves the confidence code, defaulting to nominal', () => {
    const codes = [0, 1, 2, 9].map(c => expandFires({ rows: [row({ 4: c })], dates: [''] })[0].confidence);
    expect(codes).toEqual(['low', 'nominal', 'high', 'nominal']);
  });

  it('resolves dates through the dictionary rather than by value', () => {
    const out = expandFires({ rows: [row({ 5: 1 })], dates: ['2026-09-08', '2026-09-09'] });
    expect(out[0].date).toBe('2026-09-09');
  });

  it('marks volcanoes apart from fire detections', () => {
    const out = expandFires({ rows: [row({ 7: 1 })], dates: [''] });
    expect(out[0].type).toBe('volcano');
  });

  it('drops rows that are malformed rather than emitting NaN coordinates', () => {
    const out = expandFires({
      rows: [row(), row({ 0: 'not-a-number' }), [1, 2], 'nonsense'],
      dates: [''],
    });
    expect(out).toHaveLength(1);
  });

  it('survives an empty or missing payload', () => {
    expect(expandFires(null)).toEqual([]);
    expect(expandFires(undefined)).toEqual([]);
    expect(expandFires({})).toEqual([]);
    expect(expandFires({ rows: [], dates: [] })).toEqual([]);
  });

  it('tolerates a date index the dictionary does not contain', () => {
    const out = expandFires({ rows: [row({ 5: 99 })], dates: ['2026-09-08'] });
    expect(out[0].date).toBe('');
  });
});

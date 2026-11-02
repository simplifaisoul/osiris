import { describe, expect, it } from 'vitest';
import { decodeGrib2, frameSource, gfsRuns, gfsUrl, windTimes, type WindField } from './wind-field';
import { blendWind, bracketTime, sampleWind } from './wind-layer';

const at = (s: string) => Date.parse(s);
const HOUR = 3600_000;

describe('gfsRuns', () => {
  it('starts with the newest run that has had five hours to land', () => {
    expect(gfsRuns(at('2026-10-15T10:30:00Z')).map(t => new Date(t).toISOString())).toEqual([
      '2026-10-15T00:00:00.000Z', '2026-10-14T18:00:00.000Z', '2026-10-14T12:00:00.000Z',
    ]);
  });
  it('asks NOMADS for the 10 m wind of one forecast hour', () => {
    expect(gfsUrl(at('2026-10-15T00:00:00Z'), 0)).toContain('dir=%2Fgfs.20261015%2F00%2Fatmos&file=gfs.t00z.pgrb2.1p00.f000');
    expect(gfsUrl(at('2026-10-14T18:00:00Z'), 120)).toContain('dir=%2Fgfs.20261014%2F18%2Fatmos&file=gfs.t18z.pgrb2.1p00.f120');
  });
});

describe('windTimes', () => {
  it('runs three-hourly from three days before the run to five days after', () => {
    const run = at('2026-10-15T00:00:00Z');
    const times = windTimes(run);
    expect(times[0]).toBe(run - 72 * HOUR);
    expect(times.at(-1)).toBe(run + 120 * HOUR);
    expect(times).toHaveLength(65);
    expect(times).toContain(run);
  });
});

describe('frameSource', () => {
  const run = at('2026-10-15T00:00:00Z');
  it('reads the past from the analysis of the run at that time', () => {
    expect(frameSource(at('2026-10-13T12:00:00Z'), run)).toEqual({ cycle: at('2026-10-13T12:00:00Z'), fh: 0 });
  });
  it('fills the hours between runs with the earlier run\'s three-hour step', () => {
    expect(frameSource(at('2026-10-14T21:00:00Z'), run)).toEqual({ cycle: at('2026-10-14T18:00:00Z'), fh: 3 });
  });
  it('reads now and the future from the newest run\'s forecast', () => {
    expect(frameSource(run, run)).toEqual({ cycle: run, fh: 0 });
    expect(frameSource(at('2026-10-17T06:00:00Z'), run)).toEqual({ cycle: run, fh: 54 });
  });
});

describe('decodeGrib2', () => {
  it('refuses what is not GRIB', () => {
    expect(() => decodeGrib2(new Uint8Array(32))).toThrow(/no message/);
  });
});

// A 4×3 grid from 90N at lon 0, 90° apart: u is the column, v the row.
const field: WindField = {
  refTime: '', ni: 4, nj: 3, la1: 90, lo1: 0, dx: 90, dy: 90,
  u: [0, 10, 20, 30, 0, 10, 20, 30, 0, 10, 20, 30],
  v: [0, 0, 0, 0, 10, 10, 10, 10, 20, 20, 20, 20],
};

describe('sampleWind', () => {
  it('interpolates between grid points', () => {
    expect(sampleWind(field, 45, 45)).toEqual([5, 5]);
  });
  it('wraps across the antimeridian', () => {
    expect(sampleWind(field, -45, 0)![0]).toBeCloseTo(15);
  });
  it('has nothing beyond the poles', () => {
    expect(sampleWind(field, 0, 95)).toBeNull();
  });
});

describe('bracketTime', () => {
  const times = [0, 10, 20, 30];
  it('finds the frames either side and how far between them', () => {
    expect(bracketTime(times, 15)).toEqual([1, 2, 0.5]);
    expect(bracketTime(times, 20)).toEqual([2, 3, 0]);
  });
  it('holds at the ends', () => {
    expect(bracketTime(times, -5)).toEqual([0, 1, 0]);
    expect(bracketTime(times, 30)).toEqual([2, 3, 1]);
    expect(bracketTime(times, 99)).toEqual([2, 3, 1]);
  });
});

describe('blendWind', () => {
  it('mixes two frames and turns tenths into m/s', () => {
    const calm = { ...field, u: field.u.map(() => 0), v: field.v.map(() => 0) };
    const half = blendWind(calm, field, 0.5);
    expect(half.u[3]).toBeCloseTo(1.5);
    expect(half.v[11]).toBeCloseTo(1);
    expect(blendWind(calm, field, 1).u[1]).toBeCloseTo(1);
  });
  it('reuses the arrays it is handed back', () => {
    const first = blendWind(field, field, 0);
    expect(blendWind(field, field, 1, first).u).toBe(first.u);
  });
});

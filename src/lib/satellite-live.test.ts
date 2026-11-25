import { describe, it, expect } from 'vitest';
import { orbitUrl, readEphemeris, stateAt, type Ephemeris } from './satellite-live';

const T0 = Date.parse('2026-11-24T12:00:00Z');
const eph = (points: Ephemeris['points']): Ephemeris => ({ from: T0, stepS: 10, points });

describe('orbitUrl', () => {
  it('asks around the current minute, so a minute of visitors share one answer', () => {
    expect(orbitUrl('25544', T0 + 59_999)).toBe(`/api/satellites/orbit?id=25544&t=${T0}`);
    expect(orbitUrl('25544', T0 + 60_000)).toBe(`/api/satellites/orbit?id=25544&t=${T0 + 60_000}`);
  });
});

describe('readEphemeris', () => {
  it('accepts the route shape', () => {
    const raw = { from: T0, stepS: 10, points: [[0, 0, 420, 7.66, 51], [0.6, 0.4, 420, 7.66, null]] };
    expect(readEphemeris(raw)).toEqual(raw);
  });

  it('rejects anything malformed rather than following it', () => {
    expect(readEphemeris(null)).toBeNull();
    expect(readEphemeris({ from: T0, stepS: 10, points: [[0, 0, 420, 7.66, 51]] })).toBeNull();
    expect(readEphemeris({ from: T0, stepS: 0, points: [[0, 0, 1, 1, 1], [0, 0, 1, 1, 1]] })).toBeNull();
    expect(readEphemeris({ from: T0, stepS: 10, points: [[0, 0, 1, 1, 1], [0, 'x', 1, 1, 1]] })).toBeNull();
  });
});

describe('stateAt', () => {
  it('glides between the samples either side', () => {
    const s = stateAt(eph([[10, 20, 400, 7.6, 40], [11, 21, 410, 7.7, 50]]), T0 + 5000)!;
    expect(s.lng).toBeCloseTo(10.5, 9);
    expect(s.lat).toBeCloseTo(20.5, 9);
    expect(s.altKm).toBeCloseTo(405, 9);
    expect(s.speedKmS).toBeCloseTo(7.65, 9);
    expect(s.headingDeg).toBeCloseTo(45, 9);
  });

  it('crosses the antimeridian the short way', () => {
    const s = stateAt(eph([[179.5, 0, 400, 7.6, 90], [-179.5, 0, 400, 7.6, 90]]), T0 + 5000)!;
    expect(Math.abs(s.lng)).toBeCloseTo(180, 6);
  });

  it('turns the heading through north, not all the way round', () => {
    const s = stateAt(eph([[0, 0, 400, 7.6, 350], [0, 1, 400, 7.6, 10]]), T0 + 5000)!;
    expect(s.headingDeg).toBeCloseTo(0, 6);
  });

  it('keeps no heading for a satellite that holds station', () => {
    expect(stateAt(eph([[0, 0, 35786, 3.07, null], [0, 0, 35786, 3.07, null]]), T0 + 5000)!.headingDeg).toBeNull();
  });

  it('has nothing to say outside the sampled stretch', () => {
    const e = eph([[0, 0, 400, 7.6, 0], [0, 1, 400, 7.6, 0]]);
    expect(stateAt(e, T0 - 1)).toBeNull();
    expect(stateAt(e, T0 + 10_001)).toBeNull();
    expect(stateAt(e, T0 + 10_000)!.lat).toBeCloseTo(1, 9);
  });
});

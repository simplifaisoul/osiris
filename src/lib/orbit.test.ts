import { describe, it, expect } from 'vitest';
import { propagateTLE, orbitalPeriodMinutes, orbitPath, splitAtAntimeridian, wrapLongitude } from './orbit';

/**
 * A real ISS TLE. Epoch is fixed, so every assertion below is reproducible:
 * propagating a fixed element set to a fixed instant is deterministic.
 */
const ISS_1 = '1 25544U 98067A   24001.50000000  .00016717  00000-0  30777-3 0  9993';
const ISS_2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49309239 43458';
const AT = new Date('2024-01-01T12:00:00Z');

describe('wrapLongitude', () => {
  it('leaves an in-range longitude alone', () => {
    expect(wrapLongitude(0)).toBe(0);
    expect(wrapLongitude(179.9)).toBeCloseTo(179.9, 6);
    expect(wrapLongitude(-179.9)).toBeCloseTo(-179.9, 6);
  });

  it('wraps past the antimeridian rather than clamping', () => {
    expect(wrapLongitude(181)).toBeCloseTo(-179, 6);
    expect(wrapLongitude(-181)).toBeCloseTo(179, 6);
    // 540 is the antimeridian, which normalises to -180. Same meridian as
    // +180; -180 is the canonical end of a half-open [-180, 180) range.
    expect(wrapLongitude(540)).toBeCloseTo(-180, 6);
  });
});

describe('propagateTLE', () => {
  it('puts the ISS in a plausible orbit', () => {
    const p = propagateTLE(ISS_1, ISS_2, AT)!;
    expect(p).not.toBeNull();
    // The ISS sits near 400 km and its inclination bounds latitude at 51.6.
    expect(p.altKm).toBeGreaterThan(300);
    expect(p.altKm).toBeLessThan(500);
    expect(Math.abs(p.lat)).toBeLessThanOrEqual(51.7);
    expect(p.lng).toBeGreaterThanOrEqual(-180);
    expect(p.lng).toBeLessThanOrEqual(180);
  });

  it('is deterministic for a fixed instant', () => {
    const a = propagateTLE(ISS_1, ISS_2, AT)!;
    const b = propagateTLE(ISS_1, ISS_2, AT)!;
    expect(a).toEqual(b);
  });

  it('moves the satellite forward in time', () => {
    const a = propagateTLE(ISS_1, ISS_2, AT)!;
    const b = propagateTLE(ISS_1, ISS_2, new Date(AT.getTime() + 60_000))!;
    // ~7.66 km/s, so a minute is several degrees of arc — never the same point.
    expect(Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)).toBeGreaterThan(1);
  });

  it('never reports latitude beyond the orbit inclination', () => {
    // The old two-body solve returned geocentric latitude, which is a
    // different number from the geodetic latitude a map draws with.
    for (let m = 0; m < 90; m += 7) {
      const p = propagateTLE(ISS_1, ISS_2, new Date(AT.getTime() + m * 60_000));
      if (p) expect(Math.abs(p.lat), `minute ${m}`).toBeLessThanOrEqual(51.8);
    }
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(propagateTLE('', '')).toBeNull();
    expect(propagateTLE('not a tle', 'not a tle')).toBeNull();
    expect(propagateTLE(ISS_1, '2 25544  bad line')).toBeNull();
  });
});

describe('orbitalPeriodMinutes', () => {
  it('reads the ISS period off the mean motion', () => {
    // 15.49 rev/day -> ~93 minutes.
    expect(orbitalPeriodMinutes(ISS_2)).toBeCloseTo(1440 / 15.49309239, 4);
  });

  it('rejects a line with no usable mean motion', () => {
    expect(orbitalPeriodMinutes('2 25544  51.6416 247.4627 0006703 130.5360 325.0288 00000000000000')).toBeNull();
    expect(orbitalPeriodMinutes('')).toBeNull();
  });
});

describe('orbitPath', () => {
  it('samples a full revolution and comes back near the start', () => {
    const path = orbitPath(ISS_1, ISS_2, 180, AT);
    expect(path.length).toBeGreaterThan(150);
    // One period later the satellite is back at the same point in its orbit,
    // so latitude closes even though longitude has shifted with Earth's spin.
    expect(Math.abs(path[0].lat - path[path.length - 1].lat)).toBeLessThan(1);
  });

  it('carries Earth rotation, so the track is not a closed ring', () => {
    // ~93 min of rotation is ~23 degrees of longitude. A propagator that
    // ignored it would return to the same longitude, and the ground track
    // would draw as a ring rather than a track.
    const path = orbitPath(ISS_1, ISS_2, 180, AT);
    const drift = Math.abs(wrapLongitude(path[path.length - 1].lng - path[0].lng));
    expect(drift).toBeGreaterThan(15);
    expect(drift).toBeLessThan(35);
  });

  it('holds altitude within the orbit eccentricity, not wildly', () => {
    const alts = orbitPath(ISS_1, ISS_2, 90, AT).map(p => p.altKm);
    expect(Math.max(...alts) - Math.min(...alts)).toBeLessThan(60);
  });

  it('returns nothing for a TLE it cannot read', () => {
    expect(orbitPath('', '', 10, AT)).toEqual([]);
  });
});

describe('splitAtAntimeridian', () => {
  const p = (lng: number, lat = 0): { lat: number; lng: number; altKm: number } => ({ lat, lng, altKm: 400 });

  it('leaves a path that never crosses in one piece', () => {
    const runs = splitAtAntimeridian([p(0), p(10), p(20)]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(3);
  });

  it('cuts the path where it wraps', () => {
    // Drawn unsplit, this segment sweeps backwards across every meridian.
    const runs = splitAtAntimeridian([p(170), p(179), p(-179), p(-170)]);
    expect(runs).toHaveLength(2);
    expect(runs[0].map(x => x.lng)).toEqual([170, 179]);
    expect(runs[1].map(x => x.lng)).toEqual([-179, -170]);
  });

  it('drops a run too short to draw', () => {
    // A single orphaned point either side of a crossing is not a line.
    expect(splitAtAntimeridian([p(179), p(-179)])).toEqual([]);
  });

  it('handles an empty path', () => {
    expect(splitAtAntimeridian([])).toEqual([]);
  });

  it('splits a real ISS orbit into drawable runs', () => {
    const runs = splitAtAntimeridian(orbitPath(ISS_1, ISS_2, 180, AT));
    expect(runs.length).toBeGreaterThanOrEqual(1);
    for (const run of runs) {
      for (let i = 1; i < run.length; i++) {
        expect(Math.abs(run[i].lng - run[i - 1].lng)).toBeLessThanOrEqual(180);
      }
    }
  });
});

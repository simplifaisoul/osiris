import { describe, it, expect } from 'vitest';
import { deadReckon, fixFromFeed, MAX_DEAD_RECKON_S, readLiveFix, travel, type LiveFix } from './aircraft-live';
import { fixFromReadsb } from '@/app/api/aircraft/live/route';

const T0 = Date.parse('2026-11-25T01:00:00Z');
const fix = (over: Partial<LiveFix> = {}): LiveFix => ({
  icao24: '4bc88a', callsign: 'PGT58UJ', registration: null, typeCode: 'A21N',
  lat: 47.17, lng: 17.99, altFt: 33_000, onGround: false, gsKt: 480, trackDeg: 90, vertRateFpm: 0,
  squawk: null, at: T0, source: 'test', ...over,
});

describe('travel', () => {
  it('goes a degree of longitude east along the equator in about 111 km', () => {
    const p = travel(0, 0, 90, 111_195);
    expect(p.lat).toBeCloseTo(0, 6);
    expect(p.lng).toBeCloseTo(1, 3);
  });

  it('wraps across the antimeridian', () => {
    expect(travel(0, 179.9, 90, 30_000).lng).toBeLessThan(-179);
  });
});

describe('deadReckon', () => {
  it('moves an aircraft on along its track at its ground speed', () => {
    // 480 kt for 60 s is 14.8 km, about 0.196 degrees of longitude at 47 N.
    const s = deadReckon(fix(), T0 + 60_000);
    expect(s.lat).toBeCloseTo(47.17, 1);
    expect(s.lng - 17.99).toBeGreaterThan(0.18);
    expect(s.lng - 17.99).toBeLessThan(0.21);
    expect(s.ageS).toBe(60);
  });

  it('climbs and descends by the reported rate', () => {
    expect(deadReckon(fix({ vertRateFpm: 1200 }), T0 + 30_000).altFt).toBeCloseTo(33_600, 6);
    expect(deadReckon(fix({ altFt: 300, vertRateFpm: -1200 }), T0 + 30_000).altFt).toBe(0);
  });

  it('holds an old fix where it was rather than guessing past it', () => {
    const far = deadReckon(fix(), T0 + 10 * 60_000);
    const cap = deadReckon(fix(), T0 + MAX_DEAD_RECKON_S * 1000);
    expect(far.lng).toBeCloseTo(cap.lng, 9);
    expect(far.ageS).toBe(600);
  });

  it('leaves an aircraft on the ground where it is', () => {
    const s = deadReckon(fix({ onGround: true, altFt: null, gsKt: 12 }), T0 + 30_000);
    expect(s.lat).toBe(47.17);
    expect(s.lng).toBe(17.99);
  });
});

describe('readLiveFix', () => {
  it('accepts the route answer and rejects what cannot be placed', () => {
    expect(readLiveFix(fix())).toEqual(fix());
    expect(readLiveFix({ ...fix(), lat: 'x' })).toBeNull();
    expect(readLiveFix({ ...fix(), lng: 200 })).toBeNull();
    expect(readLiveFix(null)).toBeNull();
  });
});

describe('fixFromReadsb', () => {
  it('reads a readsb record, feet and knots as reported', () => {
    const f = fixFromReadsb({ hex: '4BC88A', flight: 'PGT58UJ ', t: 'A21N', lat: 47.169, lon: 17.988, alt_baro: 33000, gs: 556.5, track: 120.8, baro_rate: -64, seen_pos: 2 }, T0, 'adsb.lol')!;
    expect(f).toMatchObject({ icao24: '4bc88a', callsign: 'PGT58UJ', typeCode: 'A21N', altFt: 33000, gsKt: 556.5, trackDeg: 120.8, vertRateFpm: -64, onGround: false, at: T0 - 2000 });
  });

  it('falls back to the last known position out of coverage', () => {
    const f = fixFromReadsb({ hex: 'e8027b', lastPosition: { lat: 38.09, lon: -11.68, seen_pos: 124 } }, T0, 'adsb.lol')!;
    expect(f.lat).toBe(38.09);
    expect(f.at).toBe(T0 - 124_000);
  });

  it('knows an aircraft on the ground', () => {
    expect(fixFromReadsb({ hex: 'abc123', lat: 1, lon: 2, alt_baro: 'ground' }, T0, 'x')!).toMatchObject({ onGround: true, altFt: null });
  });

  it('has no fix without a position', () => {
    expect(fixFromReadsb({ hex: 'abc123' }, T0, 'x')).toBeNull();
  });
});

describe('fixFromFeed', () => {
  it('turns the feed metres into feet', () => {
    expect(fixFromFeed({ icao24: 'e8027b', lat: 38, lng: -11.9, alt: 10973, heading: 248, speed_knots: 497.9 }, T0).altFt).toBeCloseTo(36_001, 0);
  });
});

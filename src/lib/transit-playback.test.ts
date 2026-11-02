import { describe, it, expect } from 'vitest';
import {
  createPlayback, courseBetween, displayTimeFor, forgetFeedsOtherThan, ingest, metresBetween, motionOf, sampleAt,
  trailOf, tripStats, turnBetween, updateCourse, MISSED_POLLS_TO_DROP, NO_FIX_AFTER_MS,
} from './transit-playback';
import type { TransitVehicle } from './transit';

const T0 = 1_792_200_000_000;
const bus = (o: Partial<TransitVehicle> & { lat: number; lng: number; t: number }): TransitVehicle =>
  ({ f: 'mbta', id: 'y1', mode: 'bus', ...o });

describe('geometry', () => {
  it('measures and orients short hops', () => {
    // 0.001° of latitude is ~111 m, due north.
    expect(metresBetween({ lat: 42, lng: -71 }, { lat: 42.001, lng: -71 })).toBeCloseTo(111.3, 0);
    expect(courseBetween({ lat: 42, lng: -71 }, { lat: 42.001, lng: -71 })).toBeCloseTo(0, 5);
    expect(courseBetween({ lat: 42, lng: -71 }, { lat: 42, lng: -70.999 })).toBeCloseTo(90, 5);
  });

  it('turns the short way round', () => {
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
    expect(turnBetween(0, 180)).toBe(180);
  });
});

describe('playback', () => {
  it('glides between two real fixes instead of jumping', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42.0, lng: -71, t: T0 / 1000 })], T0 + 5_000);
    ingest(pb, [bus({ lat: 42.002, lng: -71, t: T0 / 1000 + 20 })], T0 + 25_000);
    const track = pb.tracks.get('mbta:y1')!;
    const half = sampleAt(track, T0 + 10_000);
    expect(half.lat).toBeCloseTo(42.001, 6);
    expect(half.moving).toBe(true);
    expect(half.segmentCourse).toBeCloseTo(0, 3);
    // Before the first fix it waits there; after the last it holds there. It never runs ahead.
    expect(sampleAt(track, T0 - 1_000).lat).toBe(42.0);
    expect(sampleAt(track, T0 + 60_000).lat).toBeCloseTo(42.002, 6);
  });

  it('plays each vehicle behind by how old its fixes arrive and how often it reports', () => {
    const pb = createPlayback();
    // Reports every 10 s, each fix arriving 3 s old.
    ingest(pb, [bus({ lat: 42, lng: -71, t: (T0 - 3_000) / 1000 })], T0);
    ingest(pb, [bus({ lat: 42.0005, lng: -71, t: (T0 + 7_000) / 1000 })], T0 + 10_000);
    const lag = pb.tracks.get('mbta:y1')!.lag!;
    expect(lag).toBeGreaterThan(15_000);
    expect(lag).toBeLessThan(40_000);
  });

  it('does not let a parked vehicle with an old fix freeze a moving one in the same feed', () => {
    const pb = createPlayback();
    ingest(pb, [
      bus({ id: 'parked', lat: 42, lng: -71, t: (T0 - 600_000) / 1000 }),
      bus({ id: 'moving', lat: 42, lng: -71, t: (T0 - 5_000) / 1000 }),
    ], T0);
    ingest(pb, [
      bus({ id: 'parked', lat: 42, lng: -71, t: (T0 - 600_000) / 1000 }),
      bus({ id: 'moving', lat: 42.001, lng: -71, t: (T0 + 15_000) / 1000 }),
    ], T0 + 20_000);
    const moving = pb.tracks.get('mbta:moving')!;
    // Its lag is set by its own fixes (about 35 s), so twenty seconds after the
    // second fix lands it is on its way between the two.
    const s = sampleAt(moving, displayTimeFor(moving, T0 + 40_000));
    expect(s.moving).toBe(true);
    expect(pb.tracks.get('mbta:parked')!.lag).toBeGreaterThan(moving.lag!);
  });

  it('starts moving on the first poll when the server sends recent fixes', () => {
    const pb = createPlayback();
    const t = T0 / 1000;
    ingest(pb, [bus({ lat: 42.002, lng: -71, t, h: [[t - 40, 42.0, -71], [t - 20, 42.001, -71]] })], T0 + 3_000);
    const track = pb.tracks.get('mbta:y1')!;
    expect(track.fixes).toHaveLength(3);
    expect(sampleAt(track, displayTimeFor(track, T0 + 3_000)).moving).toBe(true);
  });

  it('never runs a vehicle backwards when its lag grows', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000 })], T0);
    const track = pb.tracks.get('mbta:y1')!;
    const first = displayTimeFor(track, T0 + 30_000);
    track.lag = track.lag! + 20_000;
    expect(displayTimeFor(track, T0 + 31_000)).toBe(first);
  });

  it('cuts instead of gliding across an impossible jump or a new trip', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42.0, lng: -71, t: T0 / 1000, trip: 'a' })], T0);
    // 11 km in 20 s is 550 m/s.
    ingest(pb, [bus({ lat: 42.1, lng: -71, t: T0 / 1000 + 20, trip: 'a' })], T0 + 20_000);
    ingest(pb, [bus({ lat: 42.1001, lng: -71, t: T0 / 1000 + 40, trip: 'b' })], T0 + 40_000);
    const track = pb.tracks.get('mbta:y1')!;
    expect(track.fixes.map(f => !!f.cut)).toEqual([false, true, true]);
    // Mid-jump it stays where it was rather than flying over the city.
    expect(sampleAt(track, T0 + 10_000).lat).toBe(42.0);
    // The trail starts again after a cut.
    expect(trailOf(track, sampleAt(track, T0 + 45_000))[0]).toEqual([-71, 42.1001]);
  });

  it('skips repeated and out-of-order reports', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000 + 20 })], T0 + 20_000);
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000 + 20 })], T0 + 40_000);
    ingest(pb, [bus({ lat: 42.5, lng: -71, t: T0 / 1000 })], T0 + 60_000);
    expect(pb.tracks.get('mbta:y1')!.fixes).toHaveLength(1);
  });

  it('drops a vehicle the feed stops mentioning, and the feeds the view left', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000 }), bus({ id: 'y2', lat: 42, lng: -71, t: T0 / 1000 })], T0);
    for (let i = 0; i < MISSED_POLLS_TO_DROP; i++) ingest(pb, [bus({ id: 'y2', lat: 42, lng: -71, t: T0 / 1000 + 20 * (i + 1) })], T0 + 20_000 * (i + 1));
    expect([...pb.tracks.keys()]).toEqual(['mbta:y2']);
    forgetFeedsOtherThan(pb, new Set(['hsl']));
    expect(pb.tracks.size).toBe(0);
  });
});

describe('heading and motion', () => {
  it('swings toward a new direction at a limited rate', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000, b: 0 })], T0);
    const track = pb.tracks.get('mbta:y1')!;
    expect(updateCourse(track, { lat: 42, lng: -71, moving: true, index: 0, segmentCourse: 0 }, T0)).toBe(0);
    // A right-angle turn seen a quarter second later moves at most 30°.
    expect(updateCourse(track, { lat: 42, lng: -71, moving: true, index: 0, segmentCourse: 90 }, T0 + 250)).toBe(30);
    // A long pause is not banked into a snap.
    expect(updateCourse(track, { lat: 42, lng: -71, moving: true, index: 0, segmentCourse: 90 }, T0 + 60_000)).toBe(60);
  });

  it('falls back to the reported heading when the vehicle has not travelled', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000, b: 135 })], T0);
    expect(updateCourse(pb.tracks.get('mbta:y1')!, { lat: 42, lng: -71, moving: false, index: 0 }, T0)).toBe(135);
  });

  it('says en route, stopped, or that it has no recent fix', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000 })], T0);
    ingest(pb, [bus({ lat: 42.001, lng: -71, t: T0 / 1000 + 20 })], T0 + 20_000);
    ingest(pb, [bus({ lat: 42.001, lng: -71, t: T0 / 1000 + 40 })], T0 + 40_000);
    const track = pb.tracks.get('mbta:y1')!;
    expect(motionOf(track, sampleAt(track, T0 + 10_000), T0 + 40_000, T0 + 10_000)).toBe('en route');
    expect(motionOf(track, sampleAt(track, T0 + 45_000), T0 + 45_000, T0 + 45_000)).toBe('stopped');
    const later = T0 + 40_000 + NO_FIX_AFTER_MS + 1;
    expect(motionOf(track, sampleAt(track, later), later, later)).toBe('no recent fix');
  });
});

describe('tripStats', () => {
  // Due north in 0.001° hops (~111 m), 20 s apart: about 5.6 m/s.
  const drive = (fixes: [number, number][]) => {
    const pb = createPlayback();
    for (const [s, lat] of fixes) ingest(pb, [bus({ lat, lng: -71, t: T0 / 1000 + s, trip: 'a' })], T0 + s * 1000);
    return pb.tracks.get('mbta:y1')!;
  };

  it('measures the speed it is drawn at, the distance so far, and the time tracked', () => {
    const track = drive([[0, 42], [20, 42.001], [40, 42.002], [60, 42.003], [80, 42.004]]);
    const at = T0 + 70_000; // halfway along the fourth hop
    const stats = tripStats(track, sampleAt(track, at), at);
    expect(stats.speed).toBeCloseTo(111.3 / 20, 1);
    expect(stats.distance).toBeCloseTo(111.3 * 3.5, -1);
    expect(stats.tracked).toBe(70_000);
    expect(stats.avgSpeed).toBeCloseTo(111.3 / 20, 1);
    expect(stats.topSpeed).toBeCloseTo(111.3 / 20, 1);
  });

  it('reads zero when it reported twice in one place, and holds no average over a few seconds', () => {
    const track = drive([[0, 42], [20, 42.001], [40, 42.001]]);
    const at = T0 + 50_000;
    const stats = tripStats(track, sampleAt(track, at), at);
    expect(stats.speed).toBe(0);
    expect(stats.tracked).toBe(40_000);
    expect(stats.avgSpeed).toBeUndefined(); // under a minute tracked
  });

  it('counts only this trip: a new trip starts the numbers again', () => {
    const pb = createPlayback();
    ingest(pb, [bus({ lat: 42, lng: -71, t: T0 / 1000, trip: 'a' })], T0);
    ingest(pb, [bus({ lat: 42.001, lng: -71, t: T0 / 1000 + 20, trip: 'a' })], T0 + 20_000);
    ingest(pb, [bus({ lat: 42.0011, lng: -71, t: T0 / 1000 + 40, trip: 'b' })], T0 + 40_000);
    ingest(pb, [bus({ lat: 42.0021, lng: -71, t: T0 / 1000 + 60, trip: 'b' })], T0 + 60_000);
    const track = pb.tracks.get('mbta:y1')!;
    const at = T0 + 60_000;
    const stats = tripStats(track, sampleAt(track, at), at);
    expect(stats.distance).toBeCloseTo(111.3, 0);
    expect(stats.tracked).toBe(20_000);
  });

  it('never shows a top speed below the speed it is doing now', () => {
    // Waits at a stop, then pulls away: the hop it is on is the fastest yet.
    const track = drive([[0, 42], [20, 42], [40, 42.002]]);
    const at = T0 + 30_000;
    const stats = tripStats(track, sampleAt(track, at), at);
    expect(stats.speed).toBeCloseTo(222.6 / 20, 1);
    expect(stats.topSpeed).toBe(stats.speed);
  });

  it('held at its last fix, waiting for the next, gives the speed of the hop that brought it there', () => {
    const track = drive([[0, 42], [20, 42.001], [40, 42.003]]);
    const at = T0 + 55_000; // past the last fix: drawn there, waiting
    expect(sampleAt(track, at).moving).toBe(false);
    expect(tripStats(track, sampleAt(track, at), at).speed).toBeCloseTo(222.6 / 20, 1);
  });

  it('does not call a hop of a second or two a speed', () => {
    const track = drive([[0, 42], [2, 42.0005]]);
    const at = T0 + 1_000;
    expect(tripStats(track, sampleAt(track, at), at).speed).toBeUndefined();
  });
});

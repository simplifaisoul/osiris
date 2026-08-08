import { describe, it, expect } from 'vitest';
import {
  distanceM,
  cumulativeDistances,
  snapToRoute,
  stepPositions,
  computeProgress,
  announcementBand,
  announcementText,
  shouldAnnounce,
  OFF_ROUTE_M,
  type NavStep,
} from './navigation';

// A ~1 km straight run east along a constant latitude, sparsely sampled.
const line: [number, number][] = [
  [13.3777, 52.5163],
  [13.3850, 52.5163],
  [13.3924, 52.5163],
];

const steps: NavStep[] = [
  { instruction: 'Drive east.', distance: 500, duration: 60, location: [13.3777, 52.5163], type: 'depart' },
  { instruction: 'Turn right onto Friedrichstraße.', distance: 500, duration: 60, location: [13.385, 52.5163], type: 'right' },
  { instruction: 'You have arrived.', distance: 0, duration: 0, location: [13.3924, 52.5163], type: 'arrive' },
];

describe('distanceM', () => {
  it('measures a known short distance', () => {
    // 0.0073° of longitude at 52.5°N is roughly 495 m
    const d = distanceM(52.5163, 13.3777, 52.5163, 13.385);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(600);
  });

  it('is zero for the same point', () => {
    expect(distanceM(52.5163, 13.3777, 52.5163, 13.3777)).toBe(0);
  });
});

describe('cumulativeDistances', () => {
  it('accumulates monotonically from zero', () => {
    const cum = cumulativeDistances(line);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    expect(cum[2]).toBeGreaterThan(cum[1]);
  });
});

describe('snapToRoute', () => {
  // The reason this projects onto segments rather than vertices: mid-segment,
  // the nearest vertex can be hundreds of metres away while deviation is ~0.
  it('reports near-zero deviation mid-segment, far from any vertex', () => {
    const snap = snapToRoute(line, 52.5163, 13.3813);
    expect(snap.deviation).toBeLessThan(5);
    expect(snap.along).toBeGreaterThan(200);
  });

  it('measures perpendicular offset when off the line', () => {
    // ~0.0009° of latitude ≈ 100 m north of the route
    const snap = snapToRoute(line, 52.5172, 13.3813);
    expect(snap.deviation).toBeGreaterThan(70);
    expect(snap.deviation).toBeLessThan(130);
  });

  it('clamps to the ends rather than extrapolating past them', () => {
    const before = snapToRoute(line, 52.5163, 13.3700);
    expect(before.along).toBe(0);
  });

  it('handles degenerate routes', () => {
    expect(snapToRoute([], 52.5, 13.4).along).toBe(0);
    expect(snapToRoute([[13.3777, 52.5163]], 52.5163, 13.3777).deviation).toBe(0);
  });
});

describe('computeProgress', () => {
  const along = stepPositions(line, steps);
  const total = cumulativeDistances(line).at(-1)!;

  it('targets the maneuver ahead and counts down to it', () => {
    const p = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3800 });
    expect(steps[p.stepIndex].instruction).toContain('Turn right');
    expect(p.distanceToStep).toBeGreaterThan(0);
    expect(p.distanceToStep).toBeLessThan(400);
  });

  it('shrinks the remaining distance and time as it advances', () => {
    const early = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3790 });
    const later = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3900 });
    expect(later.distanceRemaining).toBeLessThan(early.distanceRemaining);
    expect(later.durationRemaining).toBeLessThan(early.durationRemaining);
    expect(later.fraction).toBeGreaterThan(early.fraction);
  });

  it('flags off-route past the deviation threshold, not before', () => {
    const on = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3813 });
    expect(on.offRoute).toBe(false);
    const off = computeProgress(line, steps, along, 120, { lat: 52.5200, lng: 13.3813 });
    expect(off.deviation).toBeGreaterThan(OFF_ROUTE_M);
    expect(off.offRoute).toBe(true);
  });

  it('declares arrival at the destination', () => {
    const p = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3924 });
    expect(p.arrived).toBe(true);
    expect(p.distanceRemaining).toBeLessThan(30);
  });

  it('does not declare arrival mid-route', () => {
    expect(computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.3800 }).arrived).toBe(false);
  });

  it('caps fraction at 1 rather than overshooting past the end', () => {
    const p = computeProgress(line, steps, along, 120, { lat: 52.5163, lng: 13.4000 });
    expect(p.fraction).toBeLessThanOrEqual(1);
  });
});

describe('announcements', () => {
  it('picks the nearest band the distance has entered', () => {
    expect(announcementBand(1500)).toBeNull();
    expect(announcementBand(900)).toBe(1000);
    expect(announcementBand(380)).toBe(400);
    expect(announcementBand(20)).toBe(30);
  });

  it('phrases the call differently far out versus at the junction', () => {
    expect(announcementText('Turn right onto Main St.', 400)).toBe('In 400 meters, turn right onto Main St');
    expect(announcementText('Turn right onto Main St.', 30)).toBe('Turn right onto Main St');
    expect(announcementText('Turn left.', 1000)).toBe('In 1 kilometer, turn left');
  });

  it('speaks once per band and never repeats it', () => {
    const spoken: Record<number, number> = {};
    const first = shouldAnnounce(1, 900, spoken);
    expect(first).toBe(1000);
    spoken[1] = first!;
    expect(shouldAnnounce(1, 850, spoken)).toBeNull();
  });

  it('speaks again once a nearer band is crossed', () => {
    const spoken: Record<number, number> = { 1: 1000 };
    expect(shouldAnnounce(1, 380, spoken)).toBe(400);
  });

  it('keeps each step independent', () => {
    const spoken: Record<number, number> = { 1: 30 };
    expect(shouldAnnounce(2, 900, spoken)).toBe(1000);
  });

  it('stays quiet while the maneuver is still far off', () => {
    expect(shouldAnnounce(0, 5000, {})).toBeNull();
  });
});

/**
 * OSIRIS — Live transit playback: vehicles that move the way they moved.
 *
 * A feed reports each vehicle every 10 to 60 seconds. Drawn as reported, a bus
 * jumps from fix to fix. Guessed forward from its speed and heading, it drives
 * through buildings and past its stop. So each vehicle is played slightly in
 * the past instead: its display time runs behind real time by how old its
 * fixes arrive plus how long it takes between them, which means there is
 * always a real fix ahead of it, and it glides between two places it actually
 * reported. It never extrapolates.
 *
 * The lag is per vehicle, not per city. In one feed a bus reporting every ten
 * seconds sits beside one parked with a fix from ten minutes ago; a lag set by
 * the city's median would freeze the first behind the second.
 *
 * Fixes that cannot be travelled between at the mode's top speed (a GPS jump,
 * a vehicle reassigned across town) and a change of trip are drawn as a cut,
 * not a glide.
 */
import type { TransitMode, TransitVehicle } from './transit';

/** Fixes kept per vehicle: enough for a trail of the last several minutes. */
export const HISTORY_MAX = 40;
/** Least a vehicle is played behind real time. */
export const MIN_LAG_MS = 15_000;
/** Most: past this its fixes are too old to be worth smoothing, and it is shown as it last stood. */
export const MAX_LAG_MS = 240_000;
/** Assumed time between fixes until a vehicle has shown its own. */
export const DEFAULT_INTERVAL_MS = 30_000;
/** Margin on top, for a fix that comes in a little late. */
const LAG_MARGIN_MS = 5_000;
/** A vehicle missing from this many polls in a row is gone (out of service, or off the feed). */
export const MISSED_POLLS_TO_DROP = 2;
/** Travel (m) a segment needs before its direction is believed. */
export const COURSE_MIN_TRAVEL_M = 12;
/** How fast the drawn heading may swing, degrees per second. A bus is not a gyroscope. */
export const COURSE_MAX_RATE_DEG_S = 120;
/** Most time one heading update may spend, so a long pause is not banked into a snap. */
const COURSE_STEP_MAX_S = 0.25;
/** No new fix for this long after the display has caught up: we do not know what it is doing. */
export const NO_FIX_AFTER_MS = 90_000;
/** Two fixes this close are the same place. */
const SAME_PLACE_M = 4;

/** Top speeds, m/s, beyond which a displacement is a cut rather than travel. */
export const MODE_MAX_SPEED: Record<TransitMode, number> = {
  bus: 36, tram: 28, metro: 42, rail: 111, ferry: 25, cable: 15, unknown: 56,
};

export interface Fix {
  /** Position time, ms. */
  t: number;
  lat: number;
  lng: number;
  /** The vehicle cannot have travelled here from the fix before: draw a cut, not a glide. */
  cut?: boolean;
  trip?: string;
}

export interface Track {
  key: string;
  feed: string;
  fixes: Fix[];
  /** The latest record as the feed sent it. */
  record: TransitVehicle;
  mode: TransitMode;
  /** When a fix newer than the last was last received (wall clock, ms). */
  receivedAt: number;
  /** The poll that last mentioned it. */
  seenInPoll: number;
  /** How far behind real time it is played, ms. */
  lag?: number;
  /** Its usual time between fixes, ms. */
  interval?: number;
  /** The display time last drawn, so a growing lag slows it rather than sending it back. */
  shownAt?: number;
  /** Heading as drawn, and when it was last evaluated. */
  course?: number;
  courseAt?: number;
}

export interface Playback {
  tracks: Map<string, Track>;
  polls: number;
}

export function createPlayback(): Playback {
  return { tracks: new Map(), polls: 0 };
}

const M_PER_DEG = 111_320;

/** Metres between two points, flat-earth: exact enough over the distances between fixes. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * M_PER_DEG;
  const dLng = (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Direction of travel from one point to another, degrees clockwise from north. */
export function courseBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * M_PER_DEG;
  const dLng = (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
}

/** Shortest signed turn from one heading to another, in (-180, 180]. */
export function turnBetween(from: number, to: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Adds one fix after the track's last, marking it a cut when it cannot have been travelled to. */
function addFix(track: Track, fix: Fix): boolean {
  const last = track.fixes[track.fixes.length - 1];
  // A repeated report, or one older than what is already held, adds nothing.
  if (last && fix.t <= last.t) return false;
  if (last) {
    const seconds = (fix.t - last.t) / 1000;
    const newTrip = !!(last.trip && fix.trip && last.trip !== fix.trip);
    if (newTrip || metresBetween(last, fix) > MODE_MAX_SPEED[track.mode] * Math.max(1, seconds)) fix.cut = true;
    // Its own reporting rhythm, smoothed; a cut says nothing about it.
    if (!fix.cut) {
      const gap = fix.t - last.t;
      track.interval = track.interval === undefined ? gap : track.interval + (gap - track.interval) * 0.4;
    }
  }
  track.fixes.push(fix);
  if (track.fixes.length > HISTORY_MAX) track.fixes.splice(0, track.fixes.length - HISTORY_MAX);
  return true;
}

/**
 * Takes in one poll's vehicles. `nowMs` is the wall clock when they arrived.
 * A vehicle may bring its recent earlier fixes (`h`), which the server keeps,
 * so playback can start at once instead of after the second poll. Vehicles
 * without a position time are stamped with the arrival time.
 */
export function ingest(pb: Playback, vehicles: TransitVehicle[], nowMs: number): void {
  pb.polls++;

  for (const v of vehicles) {
    const key = `${v.f}:${v.id}`;
    const t = v.t ? v.t * 1000 : nowMs;
    const mode = v.mode ?? 'unknown';
    let track = pb.tracks.get(key);
    if (!track) {
      track = { key, feed: v.f, fixes: [], record: v, mode, receivedAt: nowMs, seenInPoll: pb.polls };
      pb.tracks.set(key, track);
    }
    track.record = v;
    track.mode = mode;
    track.seenInPoll = pb.polls;

    for (const [ht, lat, lng] of v.h ?? []) addFix(track, { t: ht * 1000, lat, lng, ...(v.trip ? { trip: v.trip } : {}) });
    if (!addFix(track, { t, lat: v.lat, lng: v.lng, ...(v.trip ? { trip: v.trip } : {}) })) continue;
    track.receivedAt = nowMs;

    // Behind by how old this fix arrived plus its usual gap to the next, so the
    // next fix is in hand by the time playback reaches this one.
    const target = Math.min(MAX_LAG_MS, Math.max(MIN_LAG_MS, nowMs - t + (track.interval ?? DEFAULT_INTERVAL_MS) + LAG_MARGIN_MS));
    track.lag = track.lag === undefined ? target : track.lag + (target - track.lag) * 0.5;
  }

  for (const [key, track] of pb.tracks) {
    if (pb.polls - track.seenInPoll >= MISSED_POLLS_TO_DROP) pb.tracks.delete(key);
  }
}

/** Forgets the vehicles of the feeds a poll no longer covers (the view moved away). */
export function forgetFeedsOtherThan(pb: Playback, feeds: Set<string>): void {
  for (const [key, track] of pb.tracks) if (!feeds.has(track.feed)) pb.tracks.delete(key);
}

/**
 * The moment a vehicle is shown at: real time minus its lag. It only moves
 * forward, so when the lag grows the vehicle slows rather than reversing.
 */
export function displayTimeFor(track: Track, nowMs: number): number {
  const t = nowMs - (track.lag ?? MIN_LAG_MS);
  track.shownAt = track.shownAt === undefined ? t : Math.max(track.shownAt, t);
  return track.shownAt;
}

export interface Sample {
  lat: number;
  lng: number;
  /** Direction of the segment being travelled, when it is long enough to believe. */
  segmentCourse?: number;
  /** Gliding between two different places. */
  moving: boolean;
  /** Index of the fix the vehicle is at or has just left. */
  index: number;
}

/** Where a vehicle is at display time `displayT`, from its fixes. */
export function sampleAt(track: Track, displayT: number): Sample {
  const f = track.fixes;
  if (displayT <= f[0].t) return { lat: f[0].lat, lng: f[0].lng, moving: false, index: 0 };
  for (let i = 0; i < f.length - 1; i++) {
    const a = f[i], b = f[i + 1];
    if (displayT >= b.t) continue;
    // A cut is held at the fix before it, then taken in one step.
    if (b.cut) return { lat: a.lat, lng: a.lng, moving: false, index: i };
    const k = (displayT - a.t) / (b.t - a.t);
    const travel = metresBetween(a, b);
    return {
      lat: a.lat + (b.lat - a.lat) * k,
      lng: a.lng + (b.lng - a.lng) * k,
      ...(travel >= COURSE_MIN_TRAVEL_M ? { segmentCourse: courseBetween(a, b) } : {}),
      moving: travel > SAME_PLACE_M,
      index: i,
    };
  }
  const z = f[f.length - 1];
  return { lat: z.lat, lng: z.lng, moving: false, index: f.length - 1 };
}

/**
 * The heading to draw, swung toward the segment's direction no faster than
 * COURSE_MAX_RATE_DEG_S, so a vehicle turns a corner instead of flicking.
 * Falls back to the heading the feed reported when the segment says nothing.
 */
export function updateCourse(track: Track, sample: Sample, nowMs: number): number | undefined {
  const target = sample.segmentCourse ?? track.course ?? track.record.b;
  if (target === undefined) return undefined;
  if (track.course === undefined || track.courseAt === undefined) {
    track.course = target;
    track.courseAt = nowMs;
    return target;
  }
  const step = COURSE_MAX_RATE_DEG_S * Math.min(COURSE_STEP_MAX_S, Math.max(0, (nowMs - track.courseAt) / 1000));
  const turn = turnBetween(track.course, target);
  track.course = Math.abs(turn) <= step ? target : (track.course + Math.sign(turn) * step + 360) % 360;
  track.courseAt = nowMs;
  return track.course;
}

export type Motion = 'en route' | 'stopped' | 'waiting' | 'no recent fix';

/** What the vehicle is doing on screen, judged by what is being drawn, not by the feed's claim. */
export function motionOf(track: Track, sample: Sample, nowMs: number, displayT: number): Motion {
  const last = track.fixes[track.fixes.length - 1];
  if (displayT >= last.t && nowMs - track.receivedAt > NO_FIX_AFTER_MS) return 'no recent fix';
  if (sample.moving) return 'en route';
  const prev = track.fixes[sample.index - 1];
  const here = track.fixes[sample.index];
  if (prev && here && metresBetween(prev, here) <= SAME_PLACE_M) return 'stopped';
  return 'waiting';
}

/** A hop shorter than this (s) says too little about speed: GPS jitter over a few seconds reads as a sprint. */
const MIN_SPEED_HOP_S = 5;

export interface TripStats {
  /** Speed where it is drawn, m/s: of the hop it is gliding along, or, held at a fix, of the hop that brought it there. */
  speed?: number;
  /** Fastest hop between two fixes this trip, m/s. */
  topSpeed?: number;
  /** Average over the stretch tracked, m/s, once there is enough of it to mean something. */
  avgSpeed?: number;
  /** Metres travelled this trip in the stretch tracked, up to where it is drawn. */
  distance: number;
  /** How long that stretch covers, ms. */
  tracked: number;
}

/**
 * The vehicle's numbers this trip, worked out from its own fixes, up to where it
 * is drawn now. Only the fixes held count (the last HISTORY_MAX, back to the
 * last cut), so these cover the stretch tracked, not the whole trip.
 */
export function tripStats(track: Track, sample: Sample, displayT: number): TripStats {
  const f = track.fixes;
  let start = 0;
  for (let i = sample.index; i > 0; i--) if (f[i].cut) { start = i; break; }
  let distance = 0;
  let topSpeed: number | undefined;
  for (let i = start; i < sample.index; i++) {
    const metres = metresBetween(f[i], f[i + 1]);
    distance += metres;
    const seconds = (f[i + 1].t - f[i].t) / 1000;
    if (seconds >= MIN_SPEED_HOP_S) topSpeed = Math.max(topSpeed ?? 0, metres / seconds);
  }
  distance += metresBetween(f[sample.index], sample);
  const tracked = Math.max(0, Math.min(displayT, f[f.length - 1].t) - f[start].t);

  // Gliding: the hop it is on. Held at a fix: the hop that brought it there, which is
  // zero when it reported twice in one place. A hop across a cut is no speed at all.
  const hopSpeed = (from: Fix, to: Fix | undefined): number | undefined => {
    if (!to || to.cut) return undefined;
    const seconds = (to.t - from.t) / 1000;
    if (metresBetween(from, to) <= SAME_PLACE_M) return 0;
    return seconds >= MIN_SPEED_HOP_S ? metresBetween(from, to) / seconds : undefined;
  };
  const a = f[sample.index];
  const speed = sample.moving
    ? hopSpeed(a, f[sample.index + 1])
    : sample.index > 0 ? hopSpeed(f[sample.index - 1], a) : undefined;
  // The hop it is on counts towards the top speed too.
  if (speed !== undefined) topSpeed = Math.max(topSpeed ?? 0, speed);
  // Under a minute, or under a hundred metres, an average is mostly noise.
  const avgSpeed = tracked >= 60_000 && distance >= 100 ? distance / (tracked / 1000) : undefined;
  return { speed, topSpeed, avgSpeed, distance, tracked };
}

/** The line it has travelled in this trip, up to where it is drawn now. */
export function trailOf(track: Track, sample: Sample): [number, number][] {
  const f = track.fixes;
  let start = 0;
  for (let i = sample.index; i > 0; i--) if (f[i].cut) { start = i; break; }
  const line = f.slice(start, sample.index + 1).map(x => [x.lng, x.lat] as [number, number]);
  line.push([sample.lng, sample.lat]);
  return line;
}

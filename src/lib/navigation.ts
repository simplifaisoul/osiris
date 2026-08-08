/**
 * OSIRIS — live navigation engine.
 *
 * Pure geometry and state transitions for turn-by-turn guidance, kept out of
 * the component so the parts that decide "where am I on this route, what do I
 * say next, and have I gone wrong" can be tested without a browser or a GPS.
 *
 * Everything works in metres via a local equirectangular approximation, which
 * is accurate well past the scale of a single road segment.
 */

export interface NavStep {
  instruction: string;
  distance: number;
  duration: number;
  location: [number, number]; // [lng, lat]
  type: string;
}

export interface NavFix {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
}

export interface NavProgress {
  /** Index of the maneuver being approached. */
  stepIndex: number;
  /** Metres to that maneuver, measured along the route. */
  distanceToStep: number;
  /** Metres from here to the destination, along the route. */
  distanceRemaining: number;
  /** Seconds remaining, scaled from the route's own estimate. */
  durationRemaining: number;
  /** Perpendicular metres between the fix and the route line. */
  deviation: number;
  offRoute: boolean;
  arrived: boolean;
  /** The fix projected onto the route — what the map should draw. */
  snapped: [number, number];
  /** Fraction of the route completed, 0..1. */
  fraction: number;
}

const R = 6371000;

/** Local metres-per-degree, valid near `lat`. */
function scale(lat: number): { mx: number; my: number } {
  const p = Math.PI / 180;
  return { mx: Math.cos(lat * p) * R * p, my: R * p };
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const { mx, my } = scale((aLat + bLat) / 2);
  const dx = (bLng - aLng) * mx;
  const dy = (bLat - aLat) * my;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Along-route distance at every vertex, so progress is a lookup not a scan. */
export function cumulativeDistances(coords: [number, number][]): number[] {
  const out = new Array(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    out[i] = out[i - 1] + distanceM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return out;
}

/**
 * Project a fix onto the route.
 *
 * Perpendicular distance to the nearest *segment*, not the nearest vertex —
 * on a long straight with sparse vertices, vertex distance would report you
 * hundreds of metres off-route while you sit exactly on the line.
 */
export function snapToRoute(
  coords: [number, number][],
  lat: number,
  lng: number,
  /** Precomputed cumulative distances; pass them in a navigation loop. */
  cum?: number[],
): { index: number; deviation: number; along: number; point: [number, number] } {
  if (coords.length === 0) return { index: 0, deviation: 0, along: 0, point: [lng, lat] };
  if (coords.length === 1) {
    return { index: 0, deviation: distanceM(lat, lng, coords[0][1], coords[0][0]), along: 0, point: coords[0] };
  }

  const { mx, my } = scale(lat);
  const px = lng * mx;
  const py = lat * my;

  let best = { index: 0, deviation: Infinity, t: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0] * mx, ay = coords[i][1] * my;
    const bx = coords[i + 1][0] * mx, by = coords[i + 1][1] * my;
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
    const cx = ax + t * vx, cy = ay + t * vy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best.deviation) best = { index: i, deviation: d, t };
  }

  const a = coords[best.index];
  const b = coords[best.index + 1];
  const point: [number, number] = [
    a[0] + (b[0] - a[0]) * best.t,
    a[1] + (b[1] - a[1]) * best.t,
  ];
  const c = cum ?? cumulativeDistances(coords);
  const segLen = c[best.index + 1] - c[best.index];
  return { index: best.index, deviation: best.deviation, along: c[best.index] + segLen * best.t, point };
}

/** Along-route position of each maneuver, so steps can be compared to progress. */
export function stepPositions(coords: [number, number][], steps: NavStep[], cum?: number[]): number[] {
  const c = cum ?? cumulativeDistances(coords);
  return steps.map((s) => snapToRoute(coords, s.location[1], s.location[0], c).along);
}

/** Beyond this from the line, treat the driver as having left the route. */
export const OFF_ROUTE_M = 45;
/** Within this of the destination, the trip is done. */
export const ARRIVAL_M = 30;

export function computeProgress(
  coords: [number, number][],
  steps: NavStep[],
  stepAlong: number[],
  totalDuration: number,
  fix: NavFix,
  /**
   * Precomputed cumulative distances. The navigation loop runs on every
   * position fix, and rebuilding this for a route with thousands of vertices
   * each time is wasted work — the caller memoises it per route.
   */
  cum?: number[],
): NavProgress {
  const c = cum ?? cumulativeDistances(coords);
  const snap = snapToRoute(coords, fix.lat, fix.lng, c);
  const total = c[c.length - 1] || 0;
  const remaining = Math.max(0, total - snap.along);

  // First maneuver still ahead of us; falls back to the last one at the end.
  let stepIndex = stepAlong.findIndex((a) => a > snap.along + 1);
  if (stepIndex === -1) stepIndex = Math.max(0, steps.length - 1);

  const distanceToStep = Math.max(0, (stepAlong[stepIndex] ?? total) - snap.along);
  const fraction = total > 0 ? Math.min(1, snap.along / total) : 0;

  const destination = coords[coords.length - 1];
  const toDestination = distanceM(fix.lat, fix.lng, destination[1], destination[0]);

  return {
    stepIndex,
    distanceToStep,
    distanceRemaining: remaining,
    // Scale the engine's own estimate by what's left rather than inventing a speed.
    durationRemaining: total > 0 ? Math.round(totalDuration * (remaining / total)) : 0,
    deviation: snap.deviation,
    offRoute: snap.deviation > OFF_ROUTE_M,
    arrived: toDestination <= ARRIVAL_M || remaining <= ARRIVAL_M,
    snapped: snap.point,
    fraction,
  };
}

/**
 * Distance bands at which a maneuver is announced, far to near.
 *
 * Matching how a driver actually needs it: early warning to change lane, a
 * reminder, then the call at the junction itself.
 */
export const ANNOUNCE_BANDS = [1000, 400, 150, 30] as const;

/**
 * The tightest band the distance has entered, or null if nothing to say yet.
 *
 * Tightest, not widest: at 380 m the driver is inside both the 1 km and the
 * 400 m band, and the useful call is "in 400 meters" — announcing the kilometre
 * again would be stale by the time it finished speaking.
 */
export function announcementBand(distance: number): number | null {
  let match: number | null = null;
  for (const b of ANNOUNCE_BANDS) {
    if (distance <= b && (match === null || b < match)) match = b;
  }
  return match;
}

/** Spoken phrasing for a maneuver at a given band. */
export function announcementText(instruction: string, band: number): string {
  const clean = instruction.replace(/\.$/, '');
  if (band <= 30) return clean;
  if (band < 1000) return `In ${band} meters, ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  return `In 1 kilometer, ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

/**
 * Decide whether to speak, given what has already been said for this step.
 * Returns the band to record, or null to stay quiet.
 */
export function shouldAnnounce(
  stepIndex: number,
  distance: number,
  spoken: Record<number, number>,
): number | null {
  const band = announcementBand(distance);
  if (band === null) return null;
  const last = spoken[stepIndex];
  // Bands descend, so only speak when we've crossed into a nearer one.
  if (last !== undefined && last <= band) return null;
  return band;
}

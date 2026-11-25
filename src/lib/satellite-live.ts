import type { SatState } from './orbit';

/**
 * OSIRIS — following the selected satellite in the page
 *
 * The orbit route samples where the satellite will be every few seconds for
 * the next stretch of time, and the page glides between those samples once a
 * second. SGP4 itself stays on the server: satellite.js ships a threaded
 * WebAssembly build that the browser bundle cannot take, and one request per
 * ten minutes is lighter on the server than one per second.
 *
 * Types only from ./orbit, so nothing of satellite.js reaches the page.
 */

/** One sample: [lng, lat, altKm, speedKmS, headingDeg or null]. */
export type EphemerisPoint = [number, number, number, number, number | null];

export interface Ephemeris {
  /** Epoch of the first sample, ms. */
  from: number;
  /** Seconds between samples. */
  stepS: number;
  points: EphemerisPoint[];
}

/**
 * The orbit route for one satellite, centred on the current minute: close to
 * now, and the same address for everyone asking within that minute, so they
 * share one cached answer.
 */
export function orbitUrl(noradId: string, nowMs = Date.now()): string {
  const minute = Math.floor(nowMs / 60_000) * 60_000;
  return `/api/satellites/orbit?id=${encodeURIComponent(noradId)}&t=${minute}`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The route's `live` field, checked; null if it is missing or malformed. */
export function readEphemeris(raw: unknown): Ephemeris | null {
  const e = raw as Partial<Ephemeris> | null;
  if (!e || !isNum(e.from) || !isNum(e.stepS) || e.stepS <= 0 || !Array.isArray(e.points)) return null;
  const points = e.points.filter((p): p is EphemerisPoint =>
    Array.isArray(p) && isNum(p[0]) && isNum(p[1]) && isNum(p[2]) && isNum(p[3]) && (p[4] === null || isNum(p[4])));
  // Two samples at least: one alone has nothing to glide toward.
  return points.length === e.points.length && points.length >= 2 ? { from: e.from, stepS: e.stepS, points } : null;
}

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Where the satellite is at `ms`, between the two samples around it; null outside the stretch. */
export function stateAt(e: Ephemeris, ms: number): SatState | null {
  const x = (ms - e.from) / (e.stepS * 1000);
  if (!(x >= 0) || x > e.points.length - 1) return null;
  const i = Math.min(Math.floor(x), e.points.length - 2);
  const f = x - i;
  const [lng0, lat0, alt0, v0, h0] = e.points[i];
  const [lng1, lat1, alt1, v1, h1] = e.points[i + 1];
  const mix = (a: number, b: number) => a + (b - a) * f;
  return {
    // The short way round, across the antimeridian when that is shorter.
    lng: wrap(lng0 + wrap(lng1 - lng0) * f),
    lat: mix(lat0, lat1),
    altKm: mix(alt0, alt1),
    speedKmS: mix(v0, v1),
    headingDeg: h0 === null || h1 === null ? (f < 0.5 ? h0 : h1) : (h0 + wrap(h1 - h0) * f + 360) % 360,
  };
}

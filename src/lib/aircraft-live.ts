/**
 * OSIRIS — following one aircraft live
 *
 * The flights layer is a snapshot refreshed every few minutes, which is fine
 * for a map of thousands of aircraft and no good for following one. The card
 * asks /api/aircraft/live for the selected aircraft's latest fix every ten
 * seconds and moves it between fixes from its reported ground speed, track and
 * climb rate, so it glides instead of jumping.
 */

/** One position report for one aircraft, as /api/aircraft/live answers it. */
export interface LiveFix {
  icao24: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  lat: number;
  lng: number;
  /** Barometric altitude, feet; null on the ground. */
  altFt: number | null;
  onGround: boolean;
  /** Ground speed, knots. */
  gsKt: number | null;
  /** Track over the ground, degrees from true north. */
  trackDeg: number | null;
  /** Climb (+) or descent (−), feet per minute. */
  vertRateFpm: number | null;
  squawk: string | null;
  /** When the position was received, ms since epoch. */
  at: number;
  source: string;
}

/** Where the aircraft is now, by the last fix and how it was moving. */
export interface AircraftState {
  lat: number;
  lng: number;
  altFt: number | null;
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  vertRateFpm: number | null;
  /** Seconds since the fix this was moved on from. */
  ageS: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const KT_TO_MS = 1852 / 3600;
/** Past this, a fix is too old to move on from: a turn or a landing would have been missed. */
export const MAX_DEAD_RECKON_S = 90;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => (isNum(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** The route's answer, checked; null if it is not a usable fix. */
export function readLiveFix(raw: unknown): LiveFix | null {
  const f = raw as Partial<LiveFix> | null;
  if (!f || typeof f.icao24 !== 'string' || !isNum(f.lat) || !isNum(f.lng) || !isNum(f.at)) return null;
  if (Math.abs(f.lat) > 90 || Math.abs(f.lng) > 180) return null;
  return {
    icao24: f.icao24,
    callsign: strOrNull(f.callsign),
    registration: strOrNull(f.registration),
    typeCode: strOrNull(f.typeCode),
    lat: f.lat,
    lng: f.lng,
    altFt: numOrNull(f.altFt),
    onGround: f.onGround === true,
    gsKt: numOrNull(f.gsKt),
    trackDeg: numOrNull(f.trackDeg),
    vertRateFpm: numOrNull(f.vertRateFpm),
    squawk: strOrNull(f.squawk),
    at: f.at,
    source: typeof f.source === 'string' ? f.source : '',
  };
}

/** The point `distM` along a great circle from (lat, lng) on bearing `deg`. */
export function travel(lat: number, lng: number, deg: number, distM: number): { lat: number; lng: number } {
  const toRad = Math.PI / 180;
  const δ = distM / EARTH_RADIUS_M, θ = deg * toRad, φ1 = lat * toRad, λ1 = lng * toRad;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / toRad, lng: wrap(λ2 / toRad) };
}

/**
 * The aircraft at `ms`, moved on from its fix along its track. A fix older
 * than MAX_DEAD_RECKON_S is held where it was reported rather than moved on
 * into a guess; an aircraft on the ground is not moved at all.
 */
export function deadReckon(fix: LiveFix, ms: number): AircraftState {
  const ageS = Math.max(0, (ms - fix.at) / 1000);
  const dt = Math.min(ageS, MAX_DEAD_RECKON_S);
  let { lat, lng } = fix;
  let altFt = fix.altFt;
  if (!fix.onGround && isNum(fix.gsKt) && isNum(fix.trackDeg) && fix.gsKt > 0) {
    ({ lat, lng } = travel(fix.lat, fix.lng, fix.trackDeg, fix.gsKt * KT_TO_MS * dt));
    if (isNum(altFt) && isNum(fix.vertRateFpm)) altFt = Math.max(0, altFt + (fix.vertRateFpm * dt) / 60);
  }
  return {
    lat, lng, altFt,
    onGround: fix.onGround,
    gsKt: fix.gsKt,
    trackDeg: fix.trackDeg,
    vertRateFpm: fix.vertRateFpm,
    ageS,
  };
}

/** The flights feed's own fields for an aircraft, as the first fix before a live one lands. */
export function fixFromFeed(p: { icao24?: string; callsign?: string; lat: number; lng: number; alt?: number; heading?: number; speed_knots?: number; squawk?: string; grounded?: boolean }, at: number): LiveFix {
  return {
    icao24: p.icao24 ?? '',
    callsign: strOrNull(p.callsign),
    registration: null,
    typeCode: null,
    lat: p.lat,
    lng: p.lng,
    altFt: isNum(p.alt) ? p.alt / 0.3048 : null,
    onGround: p.grounded === true,
    gsKt: numOrNull(p.speed_knots),
    trackDeg: numOrNull(p.heading),
    vertRateFpm: null,
    squawk: strOrNull(p.squawk),
    at,
    source: 'feed',
  };
}

/**
 * OSIRIS — geodesic primitives
 *
 * The measurement floor for the AOI tools. Everything here is spherical rather
 * than ellipsoidal: on WGS84 that costs up to ~0.5% on distance, which is well
 * inside the error of the positions being measured (an ADS-B fix is good to
 * tens of metres at best) and buys formulas that are exact, cheap, and easy to
 * check against a closed form.
 *
 * Every function takes and returns [lng, lat] in degrees, matching GeoJSON
 * axis order, because that is what the map and the exports speak. Getting this
 * backwards is the single most common bug in geospatial code, so the order is
 * never varied — not even for "convenience" helpers.
 */

/** Mean Earth radius (IUGG), km. */
export const EARTH_RADIUS_KM = 6371;

export type LngLat = [number, number];

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in km. */
export function haversine(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Initial bearing from `a` to `b`, degrees clockwise from north, 0–360.
 *
 * "Initial" matters: a great circle changes heading along its length, so this
 * is the course you leave on, not one you can hold.
 */
export function bearing(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `distKm` from `origin` along `bearingDeg`. Inverse of the pair above. */
export function destination(origin: LngLat, bearingDeg: number, distKm: number): LngLat {
  const [lng, lat] = origin;
  const δ = distKm / EARTH_RADIUS_KM;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * sinφ2,
    );

  // Normalise longitude to -180..180 so the ring never carries a 190° vertex.
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/**
 * Spherical polygon area in km², by the Chamberlain–Duquette formula.
 *
 * Verified against the closed form for a lat/lon cell,
 * R²·Δλ·(sin φ₂ − sin φ₁): a 1° cell on the equator is 12,363.7 km² by both.
 * The ring may be open or closed, and winding order does not matter — the
 * result is absolute.
 */
export function polygonArea(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRad(ring[i][1]);
    const lat2 = toRad(ring[j][1]);
    const dLng = toRad(ring[j][0] - ring[i][0]);
    sum += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** Perimeter of a closed ring in km. Closes the ring implicitly. */
export function ringPerimeter(ring: number[][]): number {
  const n = ring.length;
  if (n < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    total += haversine(ring[i] as LngLat, ring[j] as LngLat);
  }
  return total;
}

/** Length of an open path in km. Unlike a ring, the ends are not joined. */
export function pathLength(coords: number[][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1] as LngLat, coords[i] as LngLat);
  }
  return total;
}

/**
 * A circle of true geodesic radius, as a closed ring.
 *
 * Built by walking `steps` bearings from the centre rather than by scaling
 * degrees, so it stays a real circle at high latitude where a naive
 * degree-radius becomes an ellipse — over Svalbard the difference is not
 * subtle.
 *
 * With 64 steps the inscribed polygon under-measures a true circle's area by
 * about 0.16%; the returned ring is the authoritative geometry, so reported
 * area and the contents sweep agree with what is drawn on screen.
 */
export function circleToRing(center: LngLat, radiusKm: number, steps = 64): number[][] {
  const ring: number[][] = [];
  for (let i = 0; i < steps; i++) {
    ring.push(destination(center, (360 / steps) * i, radiusKm));
  }
  ring.push(ring[0]);
  return ring;
}

/**
 * Axis-aligned rectangle from two opposite corners, as a closed ring.
 * Corners may be given in any order.
 */
export function rectToRing(a: LngLat, b: LngLat): number[][] {
  const west = Math.min(a[0], b[0]);
  const east = Math.max(a[0], b[0]);
  const south = Math.min(a[1], b[1]);
  const north = Math.max(a[1], b[1]);
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/** Compact distance for a readout: metres under 1 km, then km. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/** Compact area for a readout: m² under a hectare, then km². */
export function formatArea(km2: number): string {
  if (km2 < 0.01) return `${Math.round(km2 * 1_000_000).toLocaleString()} m²`;
  if (km2 < 100) return `${km2.toFixed(2)} km²`;
  return `${Math.round(km2).toLocaleString()} km²`;
}

/** 0–360 to a 16-point compass label, for bearing readouts. */
export function compassPoint(deg: number): string {
  const points = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return points[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

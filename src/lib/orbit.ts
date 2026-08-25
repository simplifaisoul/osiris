import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';

/**
 * OSIRIS — orbital propagation
 *
 * The satellites route carried a hand-rolled propagator: a two-body Kepler
 * solve with no J2 term and no drag, reporting geocentric latitude as if it
 * were geodetic and altitude above a sphere of radius 6371 km. That is fine
 * for a dot on a flat map and wrong the moment altitude is drawn — an orbit
 * placed by it sits visibly off the satellite it belongs to.
 *
 * satellite.js was already a dependency and unused. This wraps its SGP4/SDP4,
 * which carries the perturbations the old solve dropped and returns geodetic
 * latitude and height above the WGS84 ellipsoid.
 */

/** A propagated position. `altKm` is height above the WGS84 ellipsoid. */
export interface SatPosition {
  lat: number;
  lng: number;
  altKm: number;
}

/** Longitude wrapped to [-180, 180]. */
export function wrapLongitude(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Propagates one TLE to a moment in time.
 *
 * Returns null rather than throwing, and null for a decayed or nonsensical
 * result: SGP4 reports an error code for orbits it can no longer model, and a
 * satellite that has re-entered still has a TLE in the catalog for a while.
 */
export function propagateTLE(line1: string, line2: string, when: Date = new Date()): SatPosition | null {
  let satrec;
  try {
    satrec = twoline2satrec(line1, line2);
  } catch {
    return null;
  }
  // satrec.error is SGP4's own status; non-zero means it declined to model this.
  if (!satrec || (satrec as { error?: number }).error) return null;

  let eci;
  try {
    eci = propagate(satrec, when);
  } catch {
    return null;
  }
  const position = eci?.position;
  if (!position || typeof position === 'boolean') return null;

  const geodetic = eciToGeodetic(position, gstime(when));
  const lat = degreesLat(geodetic.latitude);
  const lng = wrapLongitude(degreesLong(geodetic.longitude));
  const altKm = geodetic.height;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(altKm)) return null;
  // Below this it has re-entered; above it is not an Earth orbit we draw.
  if (altKm < 80 || altKm > 60000) return null;
  return { lat, lng, altKm };
}

/** Orbital period in minutes, from the TLE's mean motion (revolutions/day). */
export function orbitalPeriodMinutes(line2: string): number | null {
  const meanMotion = parseFloat(line2.substring(52, 63));
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return null;
  return 1440 / meanMotion;
}

/**
 * Samples one full revolution, starting now.
 *
 * Sampled in time rather than in true anomaly so the spacing is even along the
 * path for any eccentricity, and so the ground track carries Earth's rotation
 * under the orbit — that westward drift between successive passes is most of
 * what makes a track read as an orbit rather than a ring.
 */
export function orbitPath(
  line1: string,
  line2: string,
  steps = 180,
  from: Date = new Date(),
): SatPosition[] {
  const period = orbitalPeriodMinutes(line2);
  if (!period) return [];
  const out: SatPosition[] = [];
  for (let i = 0; i <= steps; i++) {
    const when = new Date(from.getTime() + (period * 60_000 * i) / steps);
    const p = propagateTLE(line1, line2, when);
    // A gap is better than a fabricated point: skipping keeps the rest of the
    // path truthful, where interpolating across would invent a position.
    if (p) out.push(p);
  }
  return out;
}

/**
 * Splits a path wherever it crosses the antimeridian.
 *
 * A polyline drawn straight from +179° to -179° sweeps the whole way back
 * around the world, which on a flat map is a stripe across every orbit and on
 * the globe is a chord through the planet. Each returned run is safe to draw
 * as one LineString.
 */
export function splitAtAntimeridian(path: SatPosition[]): SatPosition[][] {
  if (path.length === 0) return [];
  const runs: SatPosition[][] = [];
  let run: SatPosition[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (Math.abs(path[i].lng - path[i - 1].lng) > 180) {
      runs.push(run);
      run = [];
    }
    run.push(path[i]);
  }
  if (run.length) runs.push(run);
  return runs.filter(r => r.length > 1);
}

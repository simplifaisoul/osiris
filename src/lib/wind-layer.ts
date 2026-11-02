import type { WindField } from './wind-field';

/**
 * OSIRIS — the wind data the Wind layer draws: the grid it reads from, and
 * how to read it. It is drawn as streamlines (wind-gl-layer, whose curves are
 * made in wind-streamlines) or, with the layer's Particles option, as
 * particles (wind-particles).
 */

export const WIND_ATTRIBUTION = 'Wind: <a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" target="_blank" rel="noopener">NOAA GFS</a>';

/** A wind grid: rows north to south, `u` east and `v` north. */
export type WindGrid = Pick<WindField, 'ni' | 'nj' | 'la1' | 'lo1' | 'dx' | 'dy'> & { u: ArrayLike<number>; v: ArrayLike<number> };

/**
 * Speed bands, on the Beaufort scale's boundaries (m/s where each starts), the
 * name each goes by, and the colour a particle's tail takes in it (the
 * Particles look; streamlines are one colour). Every tail is a one-pixel line:
 * that is the canvas's fast hairline path, several times cheaper than anything wider.
 */
export const WIND_BANDS: { from: number; name: string; rgb: [number, number, number]; alpha: number }[] = [
  { from: 0, name: 'Calm to light breeze', rgb: [255, 255, 255], alpha: 0.3 },
  { from: 3.4, name: 'Gentle breeze', rgb: [255, 255, 255], alpha: 0.55 },
  { from: 5.5, name: 'Moderate breeze', rgb: [242, 232, 205], alpha: 0.72 },
  { from: 8, name: 'Fresh breeze', rgb: [230, 211, 163], alpha: 0.82 },
  { from: 10.8, name: 'Strong breeze', rgb: [224, 192, 100], alpha: 0.9 },
  { from: 13.9, name: 'Near gale', rgb: [212, 175, 55], alpha: 0.95 },
  { from: 17.2, name: 'Gale', rgb: [235, 135, 45], alpha: 1 },
  { from: 24.5, name: 'Storm', rgb: [228, 80, 50], alpha: 1 },
];

export interface WindStyle {
  /** Multiplies how fast the highlights run along the curves, or the particles travel. */
  speed: number;
  /** How long a highlight's tail is, or a particle's, in frames at 60 fps. */
  trail: number;
  /** Multiplies how many curves, or particles, there are. */
  density: number;
}
export const WIND_STYLE: WindStyle = { speed: 1, trail: 28, density: 1 };

/** Wind at a point, read bilinearly off the grid, in the grid's units. */
export function sampleWind(field: WindGrid, lng: number, lat: number): [number, number] | null {
  const x = ((((lng - field.lo1) % 360) + 360) % 360) / field.dx;
  const y = (field.la1 - lat) / field.dy;
  if (y < 0 || y > field.nj - 1) return null;
  const i0 = Math.floor(x);
  const j0 = Math.min(Math.floor(y), field.nj - 2);
  const i1 = (i0 + 1) % field.ni;
  const fx = x - i0;
  const fy = y - j0;
  const at = (arr: ArrayLike<number>, i: number, j: number) => arr[j * field.ni + i];
  const mix = (arr: ArrayLike<number>) =>
    (at(arr, i0, j0) * (1 - fx) + at(arr, i1, j0) * fx) * (1 - fy) +
    (at(arr, i0, j0 + 1) * (1 - fx) + at(arr, i1, j0 + 1) * fx) * fy;
  return [mix(field.u), mix(field.v)];
}

/** The two frames either side of `t`, and how far it is from the first to the second. */
export function bracketTime(times: number[], t: number): [number, number, number] {
  if (times.length < 2) return [0, 0, 0];
  let i = 0;
  while (i < times.length - 2 && times[i + 1] <= t) i++;
  const w = (t - times[i]) / (times[i + 1] - times[i]);
  return [i, i + 1, Math.min(1, Math.max(0, w))];
}

/**
 * The wind `w` of the way from frame `a` to frame `b`, in m/s. The frames are
 * in tenths, as /api/wind sends them. Pass the last result back as `into` to
 * reuse its arrays.
 */
export function blendWind(a: WindGrid, b: WindGrid, w: number, into?: WindGrid): WindGrid {
  const n = a.u.length;
  const reuse = into && into.u.length === n && into.u instanceof Float32Array && into.v instanceof Float32Array;
  const u = reuse ? into.u as Float32Array : new Float32Array(n);
  const v = reuse ? into.v as Float32Array : new Float32Array(n);
  const to = b.u.length === n ? b : a;
  for (let i = 0; i < n; i++) {
    u[i] = (a.u[i] + (to.u[i] - a.u[i]) * w) / 10;
    v[i] = (a.v[i] + (to.v[i] - a.v[i]) * w) / 10;
  }
  return { ni: a.ni, nj: a.nj, la1: a.la1, lo1: a.lo1, dx: a.dx, dy: a.dy, u, v };
}

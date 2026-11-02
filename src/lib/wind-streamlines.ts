import { sampleWind, type WindGrid } from './wind-layer';

/**
 * OSIRIS — wind as streamlines.
 *
 * The wind is drawn the way God's Eye View (MIT, github.com/bilawalsidhu/gods-eye-view)
 * draws it: not particles that wander, but a fixed set of fine curves that
 * follow the wind, baked once from the forecast. Each curve is the path an air
 * parcel takes through eight hours of the field either side of its seed, and a
 * bright comet runs along it. Seeds are spread evenly over the sphere, so the
 * map reads the same everywhere and nothing piles up at the poles.
 *
 * The curves are evenly spaced, after Jobard and Lefer: none starts near one
 * already made, and each stops where it comes up against another. Left to
 * run, curves in converging air pile onto the same path, which cannot be seen
 * on the whole globe but, zoomed in, is two and three comets on one line.
 *
 * Zoomed in, one set for the globe leaves a handful of lines on the screen, so
 * the curves come in detail levels. Each level halves the spacing and the
 * step, for a map zoomed in one step further, and is made only for the part
 * of the globe in view. A level's seeds sit on a fixed lattice, so a set made
 * again after the map pans keeps the curves it had.
 *
 * This file only makes the curves; wind-gl-layer draws them.
 */

/** Curves on a desktop screen, and on a narrow one: how far apart they are, as if that many covered the globe. */
export const WIND_PATH_LIMIT = 7200;
export const WIND_NARROW_PATH_LIMIT = 1200;
/** Steps either side of a seed, and the field time each one covers, at level 0. */
export const WIND_PATH_STEPS = 16;
export const WIND_STEP_SECONDS = 1800;
/** Floats per vertex: mercator x, mercator y, how far along its curve (0..1), the curve's phase. */
export const WIND_STRIDE = 4;
/** The finest detail level, for zoom 12.5: by then the streamlines have faded out (windHeightFade). */
export const WIND_MAX_LEVEL = 9;
/**
 * The globe's own set is drawn up to a zoom step past this, and each step
 * after is one more detail level. Half a step on, so a zoomed-in view looks
 * like the globe's set between zoom 3.5 and 4.5, its curves long and well apart.
 */
const LEVEL_ZOOM = 3.5;

const DEGREE_METERS = 111320;
/** Below this the air is called still, and a curve stops. */
const CALM = 0.15;
/** The map ends here (web mercator's edge), so the curves do too. */
const MAX_LAT = 85.0511;
/** Seeds stay a little inside that edge. */
const SEED_LAT = 85;
/** Square degrees of sphere between the seed latitudes. */
const SEED_AREA = ((360 * 360) / Math.PI) * Math.sin((SEED_LAT * Math.PI) / 180);
/** Curves keep this share of the distance between `count` points spread evenly over the globe. */
const SPACING_SHARE = 0.5;
/** The longest step, in degrees at level 0, so a fast wind near a pole cannot leap. */
const MAX_STEP = 0.75;
/** Fewer vertices than this is a stub left in a gap, not a line. */
const MIN_VERTICES = 5;
/** Lattice columns per row, at most: a seed's id is its row times this, plus its column. */
const SEED_COLS = 2 ** 20;
/** Cells a set may keep in a flat array, a byte each: the globe's sets, not the finer ones made again and again as the map moves. */
const FLAT_CELLS = 1_000_000;

/** A box on the globe, [west, south, east, north] in degrees; east runs past 180 for a box across the seam. */
export type WindBounds = [number, number, number, number];

const normalizeLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
const metersPerDegreeLng = (lat: number) => DEGREE_METERS * Math.cos((lat * Math.PI) / 180);
const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

function mercatorX(lng: number): number {
  return (lng + 180) / 360;
}
function mercatorY(lat: number): number {
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
}

/** Two integers to [0, 1), well mixed: the lattice's jitter, order and phases. */
function hash(a: number, b: number, salt: number): number {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(salt, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** How far apart curves are, in degrees: as if `count` covered the globe, halved for each detail level. */
export function windSpacing(count: number, level = 0): number {
  return (SPACING_SHARE * Math.sqrt(SEED_AREA / Math.max(1, count))) / 2 ** level;
}

/** The detail level for a zoom: 0, the globe's own set, below zoom 4.5, then one more for each zoom step. */
export function windLevel(zoom: number): number {
  return Math.max(0, Math.min(WIND_MAX_LEVEL, Math.floor(zoom - LEVEL_ZOOM)));
}

/** About how many seeds a set tries in `bounds` at this spacing. */
export function windSeedCount([west, south, east, north]: WindBounds, spacing: number): number {
  const s = Math.max(-SEED_LAT, south);
  const n = Math.min(SEED_LAT, north);
  if (n <= s) return 0;
  const area = Math.min(360, east - west) * (180 / Math.PI) * (Math.sin((n * Math.PI) / 180) - Math.sin((s * Math.PI) / 180));
  return area / (spacing * spacing);
}

/** Is box `inner` wholly inside box `outer`? Either may cross the seam. */
export function boundsContain(outer: WindBounds, inner: WindBounds): boolean {
  if (inner[1] < outer[1] || inner[3] > outer[3]) return false;
  if (outer[2] - outer[0] >= 360) return true;
  const west = ((((inner[0] - outer[0]) % 360) + 360) % 360) + outer[0];
  return west + (inner[2] - inner[0]) <= outer[2];
}

/** A box grown by `share` of its size on every side, and kept on the globe. */
export function padBounds([west, south, east, north]: WindBounds, share: number): WindBounds {
  const dx = (east - west) * share;
  const dy = (north - south) * share;
  const s = Math.max(-90, south - dy);
  const n = Math.min(90, north + dy);
  if (east - west + 2 * dx >= 360) return [-180, s, 180, n];
  return [west - dx, s, east + dx, n];
}

/**
 * Where curves have passed, patch by patch over the globe. Cells are `size`
 * degrees of latitude tall and as wide on the ground in every row, so a test
 * means the same distance at the equator as near a pole.
 */
class Taken {
  private size: number;
  private stride: number;
  /** A flat array when the whole globe's cells fit in one, as a set's for the globe do; else only the cells used. */
  private flat: Uint8Array | null;
  private sparse = new Set<number>();
  /** Columns in each row, worked out once. */
  private widths = new Map<number, number>();
  constructor(size: number) {
    this.size = size;
    this.stride = Math.ceil(360 / size) + 1;
    const cells = Math.ceil(180 / size) * this.stride;
    this.flat = cells <= FLAT_CELLS ? new Uint8Array(cells) : null;
  }

  private row(lat: number): number {
    return Math.floor((lat + 90) / this.size);
  }

  private columns(row: number): number {
    let n = this.widths.get(row);
    if (n === undefined) {
      n = Math.max(1, Math.floor((360 * cosDeg((row + 0.5) * this.size - 90)) / this.size));
      this.widths.set(row, n);
    }
    return n;
  }

  private has(cell: number): boolean {
    return this.flat ? this.flat[cell] === 1 : this.sparse.has(cell);
  }

  private set(cell: number): void {
    if (this.flat) this.flat[cell] = 1;
    else this.sparse.add(cell);
  }

  private column(lng: number, columns: number): number {
    return Math.floor(((((lng + 180) % 360) + 360) % 360) * columns / 360);
  }

  /** Has another curve been within `reach` cells of this point? */
  near(lng: number, lat: number, reach: number): boolean {
    const r0 = this.row(lat);
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      if (r < 0 || r * this.size >= 180) continue;
      const n = this.columns(r);
      const c0 = this.column(lng, n);
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (this.has(r * this.stride + (((c % n) + n) % n))) return true;
      }
    }
    return false;
  }

  /** Mark the cells a curve passes through, a segment at a time. */
  mark(lngs: number[], lats: number[]): void {
    for (let i = 0; i < lngs.length; i++) {
      const pieces = i ? Math.max(1, Math.ceil(Math.hypot((lngs[i] - lngs[i - 1]) * cosDeg(lats[i]), lats[i] - lats[i - 1]) / (this.size / 2))) : 1;
      for (let k = 1; k <= pieces; k++) {
        const lng = i ? lngs[i - 1] + ((lngs[i] - lngs[i - 1]) * k) / pieces : lngs[i];
        const lat = i ? lats[i - 1] + ((lats[i] - lats[i - 1]) * k) / pieces : lats[i];
        const r = this.row(lat);
        this.set(r * this.stride + this.column(lng, this.columns(r)));
      }
    }
  }
}

/** One midpoint step along the wind, no longer than `maxStep` degrees either way. Null where the curve must end. */
function advance(field: WindGrid, lng: number, lat: number, seconds: number, maxStep: number): [number, number] | null {
  const here = sampleWind(field, lng, lat);
  if (!here || !(Math.hypot(here[0], here[1]) >= CALM)) return null;
  const lngRate = here[0] / metersPerDegreeLng(lat);
  const latRate = here[1] / DEGREE_METERS;
  const dt = Math.sign(seconds) * Math.min(Math.abs(seconds), maxStep / Math.max(Math.abs(lngRate), Math.abs(latRate), 1e-12));
  const midLat = lat + latRate * dt * 0.5;
  if (Math.abs(midLat) > MAX_LAT) return null;
  const mid = sampleWind(field, lng + lngRate * dt * 0.5, midLat);
  if (!mid || !Number.isFinite(mid[0] + mid[1])) return null;
  const nextLng = normalizeLng(lng + (mid[0] * dt) / metersPerDegreeLng(midLat));
  const nextLat = lat + (mid[1] * dt) / DEGREE_METERS;
  // A curve ends at the map's seam, the poles and still air rather than wrap round.
  if (Math.abs(nextLat) > MAX_LAT || Math.abs(nextLng - lng) > 180) return null;
  if (Math.abs(nextLng - lng) + Math.abs(nextLat - lat) < 1e-8) return null;
  return [nextLng, nextLat];
}

/**
 * The seeds a set tries, in the order it tries them: the ones that made a
 * curve last time, then a coarse lattice, so the first curves claim the space
 * evenly, then finer and finer ones to fill the gaps.
 */
function seedsFor(spacing: number, bounds: WindBounds | undefined, prefer: ReadonlySet<number> | undefined) {
  const rows = Math.max(1, Math.floor((2 * SEED_LAT) / spacing));
  const [west, south, east, north] = bounds ?? [-180, -90, 180, 90];
  const r0 = Math.max(0, Math.floor((south + SEED_LAT) / spacing));
  const r1 = Math.min(rows - 1, Math.floor((north + SEED_LAT) / spacing));
  const ids: number[] = [];
  const lngs: number[] = [];
  const lats: number[] = [];
  const ranks: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const n = Math.max(1, Math.round((360 * cosDeg(-SEED_LAT + (r + 0.5) * spacing)) / spacing));
    const width = 360 / n;
    let c0 = 0;
    let c1 = n - 1;
    if (bounds && east - west < 360) {
      c0 = Math.floor((west + 180) / width);
      c1 = Math.floor((east + 180) / width);
      if (c1 - c0 >= n) { c0 = 0; c1 = n - 1; }
    }
    for (let cc = c0; cc <= c1; cc++) {
      const c = ((cc % n) + n) % n;
      const lat = -SEED_LAT + (r + 0.2 + 0.6 * hash(r, c, 1)) * spacing;
      const lng = -180 + (c + 0.2 + 0.6 * hash(r, c, 2)) * width;
      if (bounds && !boundsContain(bounds, [lng, lat, lng, lat])) continue;
      const id = r * SEED_COLS + c;
      const coarse = r % 8 === 0 && c % 8 === 0 ? 0 : r % 4 === 0 && c % 4 === 0 ? 1 : r % 2 === 0 && c % 2 === 0 ? 2 : 3;
      ids.push(id);
      lats.push(lat);
      lngs.push(lng);
      ranks.push((prefer?.has(id) ? coarse - 4 : coarse) + hash(r, c, 3));
    }
  }
  const order = Array.from(ids.keys()).sort((a, b) => ranks[a] - ranks[b]);
  return { order, ids, lngs, lats };
}

export interface WindStreamlines {
  /** WIND_STRIDE floats per vertex, curve after curve. A curve's last vertex is followed by the next one's first, whose `along` is lower. */
  vertices: Float32Array;
  /** Vertices in use. */
  count: number;
  /** Curves. */
  paths: number;
  /** The seeds that made a curve, to try first next time (see createWindBaker). */
  seeds: Float64Array;
}

export interface WindBakeOptions {
  /** Sets the spacing: curves as far apart as this many spread over the globe. */
  count?: number;
  steps?: number;
  stepSeconds?: number;
  /** Detail level: each halves the spacing and the step, for a view zoomed in a step further. */
  level?: number;
  /** Seed only in this box; curves run out of it freely. Omitted, the whole globe. */
  bounds?: WindBounds;
  /** Seeds that made a curve in the last set of this kind: tried first, so the set keeps its curves. */
  prefer?: ReadonlySet<number>;
}

/**
 * Evenly spaced curves through the wind field. Increasing position along a
 * curve always follows the wind.
 */
export function bakeWindStreamlines(
  field: WindGrid,
  { count = WIND_PATH_LIMIT, steps = WIND_PATH_STEPS, stepSeconds = WIND_STEP_SECONDS, level = 0, bounds, prefer }: WindBakeOptions = {},
): WindStreamlines {
  const budget = Number.isFinite(count) ? Math.floor(count) : WIND_PATH_LIMIT;
  if (budget <= 0) return { vertices: new Float32Array(0), count: 0, paths: 0, seeds: new Float64Array(0) };
  const scale = 2 ** -level;
  const spacing = windSpacing(budget, level);
  const half = Math.min(WIND_PATH_STEPS, Math.max(1, Math.floor(steps)));
  const seeds = seedsFor(spacing, bounds, prefer);
  // Curves stop half a spacing from one another, and start no nearer than a whole one.
  const taken = new Taken(spacing / 2);
  let out = new Float32Array(Math.max(64, seeds.order.length * 8) * WIND_STRIDE);
  const made: number[] = [];
  const lngs: number[] = [];
  const lats: number[] = [];
  let n = 0;
  for (const s of seeds.order) {
    const lng = seeds.lngs[s];
    const lat = seeds.lats[s];
    if (taken.near(lng, lat, 2)) continue;
    const wind = sampleWind(field, lng, lat);
    if (!wind || !(Math.hypot(wind[0], wind[1]) >= CALM)) continue;

    // Backwards from the seed, then forwards, so the curve runs with the wind.
    const back: [number, number][] = [];
    const ahead: [number, number][] = [];
    for (const [direction, into] of [[-1, back], [1, ahead]] as const) {
      let at: [number, number] = [lng, lat];
      for (let step = 0; step < half; step++) {
        const next = advance(field, at[0], at[1], direction * stepSeconds * scale, MAX_STEP * scale);
        if (!next || taken.near(next[0], next[1], 1)) break;
        into.push(next);
        at = next;
      }
    }
    if (back.length + ahead.length + 1 < MIN_VERTICES) continue;
    lngs.length = lats.length = 0;
    for (let i = back.length - 1; i >= 0; i--) { lngs.push(back[i][0]); lats.push(back[i][1]); }
    lngs.push(lng); lats.push(lat);
    for (const p of ahead) { lngs.push(p[0]); lats.push(p[1]); }
    taken.mark(lngs, lats);

    const m = lngs.length;
    if ((n + m) * WIND_STRIDE > out.length) {
      const grown = new Float32Array(Math.max(out.length * 2, (n + m) * WIND_STRIDE));
      grown.set(out.subarray(0, n * WIND_STRIDE));
      out = grown;
    }
    // How far along each vertex is, by distance, so a comet crosses a long curve and a short one in the same time.
    const start = n;
    let length = 0;
    for (let i = 0; i < m; i++) {
      const x = mercatorX(lngs[i]);
      const y = mercatorY(lats[i]);
      if (i) length += Math.hypot(x - out[(n - 1) * WIND_STRIDE], y - out[(n - 1) * WIND_STRIDE + 1]);
      const o = n * WIND_STRIDE;
      out[o] = x;
      out[o + 1] = y;
      out[o + 2] = length; // made a fraction below
      n++;
    }
    const id = seeds.ids[s];
    const phase = hash(Math.floor(id / SEED_COLS), id % SEED_COLS, 4);
    for (let i = start; i < n; i++) {
      const o = i * WIND_STRIDE;
      out[o + 2] = length > 0 ? out[o + 2] / length : 0;
      out[o + 3] = phase;
    }
    made.push(id);
  }
  return { vertices: out, count: n, paths: made.length, seeds: Float64Array.from(made) };
}

/** A set to make: the globe's own, or a finer one for the part of it in view. */
export interface WindBakeRequest {
  kind: 'globe' | 'detail';
  count: number;
  level: number;
  bounds?: WindBounds;
}

/**
 * Makes sets one after another, each kind trying first the seeds that made
 * its last set's curves. As the wind changes under them, or the map pans, the
 * curves then bend and grow and shrink rather than give way to new ones.
 */
export function createWindBaker(): (field: WindGrid, request: WindBakeRequest) => WindStreamlines {
  const last = new Map<WindBakeRequest['kind'], { count: number; level: number; seeds: Set<number> }>();
  return (field, { kind, count, level, bounds }) => {
    const before = last.get(kind);
    const prefer = before && before.count === count && before.level === level ? before.seeds : undefined;
    const lines = bakeWindStreamlines(field, { count, level, bounds, prefer });
    last.set(kind, { count, level, seeds: new Set(lines.seeds) });
    return lines;
  };
}

/** Where the camera is above the ground, in metres: MapLibre's camera sits 1.5 screen-heights from the centre. */
export function cameraHeight(zoom: number, lat: number, screenHeight: number): number {
  return 1.5 * screenHeight * 78271.517 * Math.cos((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180) / 2 ** zoom;
}

const FADE_LOW_METERS = 15000;
const FADE_HIGH_METERS = 60000;

/** Streamlines fade out as the camera comes down to the ground: gone under 15 km, full from 60 km. */
export function windHeightFade(height: number): number {
  return Math.max(0, Math.min(1, (height - FADE_LOW_METERS) / (FADE_HIGH_METERS - FADE_LOW_METERS)));
}

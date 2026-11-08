/**
 * A cut-out: a box of the map opened on its own page, in 3D, with the
 * cameras and network hosts that stand inside it. The box travels in the
 * link (`/cutout?bbox=west,south,east,north`), so a cut-out can be reloaded,
 * bookmarked or sent on like any other page.
 */

/** West, south, east, north in degrees. */
export type LngLatBox = [number, number, number, number];

/** Longest side a cut-out may have: past this the pins crowd and the imagery thins out. */
export const CUTOUT_MAX_KM = 50;
/** Shortest side: below this there is nothing to stand in 3D. */
export const CUTOUT_MIN_M = 60;

const M_PER_DEG = 111_320;

export function parseBox(text: string | null | undefined): LngLatBox | null {
  if (!text) return null;
  const parts = text.split(',').map(s => Number(s.trim()));
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null;
  const [w, s, e, n] = parts;
  if (w < -180 || e > 180 || s < -85 || n > 85 || w >= e || s >= n) return null;
  return [w, s, e, n];
}

export function formatBox(b: LngLatBox): string {
  return b.map(v => +v.toFixed(5)).join(',');
}

/** The box around a set of [lng, lat] points. */
export function boxAround(points: [number, number][]): LngLatBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of points) {
    w = Math.min(w, lng); e = Math.max(e, lng);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/** A square `sizeM` metres a side around a point. */
export function boxAt(lng: number, lat: number, sizeM: number): LngLatBox {
  const dLat = sizeM / 2 / M_PER_DEG;
  const dLng = sizeM / 2 / (M_PER_DEG * Math.cos(lat * Math.PI / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** Ground size in metres, measured across the middle of the box. */
export function boxSizeM(b: LngLatBox): { widthM: number; heightM: number } {
  const mid = ((b[1] + b[3]) / 2) * Math.PI / 180;
  return { widthM: (b[2] - b[0]) * M_PER_DEG * Math.cos(mid), heightM: (b[3] - b[1]) * M_PER_DEG };
}

/** Why a box cannot be cut out, or null when it can. */
export function boxProblem(b: LngLatBox): string | null {
  const { widthM, heightM } = boxSizeM(b);
  if (Math.max(widthM, heightM) > CUTOUT_MAX_KM * 1000) {
    return `That box is ${formatKm(Math.max(widthM, heightM))} across. Cut-outs go up to ${CUTOUT_MAX_KM} km, so draw a smaller one.`;
  }
  if (Math.min(widthM, heightM) < CUTOUT_MIN_M) return `That box is too thin. Make each side at least ${CUTOUT_MIN_M} m.`;
  return null;
}

export function inBox(lng: number, lat: number, b: LngLatBox): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Water shown when a cut-out opens: a rain storm, the flow paths, or a water level. */
export type CutoutWater = 'rain' | 'flow' | 'flood';
const WATER: readonly CutoutWater[] = ['rain', 'flow', 'flood'];
export function parseWater(v: unknown): CutoutWater | null {
  return WATER.includes(v as CutoutWater) ? (v as CutoutWater) : null;
}

export function cutoutPath(b: LngLatBox, water?: CutoutWater | null): string {
  return `/cutout?bbox=${formatBox(b)}${water ? `&water=${water}` : ''}`;
}

/**
 * Open a cut-out in a new tab. Called from the click that finished drawing it,
 * so the browser counts it as the user's own; false when a blocker refused.
 */
export function openCutoutTab(b: LngLatBox, water?: CutoutWater | null): boolean {
  if (typeof window === 'undefined') return false;
  const tab = window.open(cutoutPath(b, water), '_blank');
  if (!tab) return false;
  try { tab.opener = null; } catch { /* cross-origin already */ }
  return true;
}

export function formatKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

/** "2.4 × 1.6 km" */
export function describeBox(b: LngLatBox): string {
  const { widthM, heightM } = boxSizeM(b);
  if (Math.max(widthM, heightM) < 1000) return `${Math.round(widthM)} × ${Math.round(heightM)} m`;
  const d = Math.max(widthM, heightM) >= 10_000 ? 0 : 1;
  return `${(widthM / 1000).toFixed(d)} × ${(heightM / 1000).toFixed(d)} km`;
}

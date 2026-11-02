/**
 * The geometry of OI's arcs: great circles between two points on
 * Earth, lifted into the sky in proportion to their length, and packed into
 * the ribbon vertices the WebGL layer draws. Pure maths, so it is tested
 * without a GPU.
 */

export type LngLat = [number, number];

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

/** Great-circle distance in km. */
export function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How high an arc of this length peaks, in metres: long arcs climb higher, all stay inside the camera's reach. */
export function arcPeakM(km: number): number {
  return Math.min(1_400_000, 60_000 + km * 110);
}

/**
 * Points along the great circle from a to b, with the longitude unwrapped
 * (it may run past ±180) so a path over the date line stays continuous: the
 * globe's projection wraps it, and the flat map draws it into the next copy
 * of the world rather than back across the whole map.
 */
export function greatCircle(a: LngLat, b: LngLat, segments: number): LngLat[] {
  const toVec = ([lng, lat]: LngLat) => [Math.cos(lat * RAD) * Math.cos(lng * RAD), Math.cos(lat * RAD) * Math.sin(lng * RAD), Math.sin(lat * RAD)];
  const va = toVec(a);
  const vb = toVec(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const out: LngLat[] = [];
  let prevLng = a[0];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let v: number[];
    if (omega < 1e-6) v = va;
    else {
      const s = Math.sin(omega);
      const wa = Math.sin((1 - t) * omega) / s;
      const wb = Math.sin(t * omega) / s;
      v = [wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]];
    }
    const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD;
    let lng = Math.atan2(v[1], v[0]) / RAD;
    // Unwrap: never jump more than half the world from the last point.
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

/** Web Mercator, 0..1 on both axes, as MapLibre's projection expects. Longitude may run past ±180. */
export function mercator([lng, lat]: LngLat): [number, number] {
  const clamped = Math.max(-85.05, Math.min(85.05, lat));
  const x = (lng + 180) / 360;
  const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * RAD) / 2))) / 360;
  return [x, y];
}

export interface ArcSpec {
  from: LngLat;
  to: LngLat;
  /** 0 support, 1 oppose, 2 neutral: drawn as solid, dashed and dotted. */
  tone: number;
  /** Its index, written out by the picking pass. */
  id: number;
  /** 1 when it belongs to what is selected. */
  highlight: number;
  strength: number;
  /** When it starts drawing, in the layer's clock (seconds). */
  birth: number;
  /** 0 relation, 1 evidence, 2 reply, 3 focus. */
  kind: number;
}

/** Floats per vertex: pos(3) prev(3) next(3) side t (2) tone id highlight (3) strength birth kind (3) length (1). */
export const ARC_STRIDE = 18;

export const ARC_SEGMENTS = 40;

/**
 * Ribbon vertices for a set of arcs: two per point along each arc (one per
 * side), with the neighbouring points so the shader can turn the centre line
 * into a band of constant pixel width, and indices for two triangles per step.
 */
export function packArcs(arcs: ArcSpec[], segments = ARC_SEGMENTS): { vertices: Float32Array; indices: Uint32Array } {
  const perArc = (segments + 1) * 2;
  const vertices = new Float32Array(arcs.length * perArc * ARC_STRIDE);
  const indices = new Uint32Array(arcs.length * segments * 6);
  let v = 0;
  let ix = 0;
  arcs.forEach((arc, n) => {
    const km = distanceKm(arc.from, arc.to);
    const peak = arcPeakM(km);
    const path = greatCircle(arc.from, arc.to, segments);
    const pts = path.map((p, i) => {
      const [x, y] = mercator(p);
      return [x, y, peak * Math.sin((Math.PI * i) / segments)];
    });
    const base = n * perArc;
    for (let i = 0; i <= segments; i++) {
      const cur = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(segments, i + 1)];
      for (const side of [-1, 1]) {
        vertices.set([
          cur[0], cur[1], cur[2],
          prev[0], prev[1], prev[2],
          next[0], next[1], next[2],
          side, i / segments,
          arc.tone, arc.id, arc.highlight,
          arc.strength, arc.birth, arc.kind,
          // Length in km, so dashes keep their spacing whatever the arc's span.
          km,
        ], v);
        v += ARC_STRIDE;
      }
      if (i < segments) {
        const a = base + i * 2;
        indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ix);
        ix += 6;
      }
    }
  });
  return { vertices, indices };
}

/** "#B388FF" → [0.70, 0.53, 1]. */
export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xb388ff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Marching-squares contours over a masked raster. Corners of each square are
 * cell centres; a square with any corner outside the field is skipped, so
 * lines stop at the field edge instead of diving to the nodata value.
 *
 * Output is raw two-point segments in cell coordinates, grouped by level —
 * MapLibre draws a level's segments as one MultiLineString, and round caps
 * close the joins.
 */

export interface ContourLevel { level: number; segments: number[][][] }

export function contourSegments(
  v: Float32Array, w: number, h: number, mask: Uint8Array, interval: number, stride = 1,
): ContourLevel[] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < v.length; i++) if (mask[i] && Number.isFinite(v[i])) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  if (!(hi > lo) || !(interval > 0)) return [];
  // Levels strictly between the lowest and highest cell: one equal to either
  // would trace the field edge rather than a contour.
  const first = (Math.floor(lo / interval) + 1) * interval;
  const levels: number[] = [];
  for (let L = first; L < hi && levels.length < 400; L += interval) levels.push(+L.toFixed(6));
  const out: ContourLevel[] = levels.map(level => ({ level, segments: [] }));
  const byLevel = new Map(levels.map((l, k) => [l, out[k]]));

  const at = (c: number, r: number) => {
    const i = r * w + c;
    return mask[i] ? v[i] : NaN;
  };
  for (let r = 0; r + stride < h; r += stride) {
    for (let c = 0; c + stride < w; c += stride) {
      const a = at(c, r), b = at(c + stride, r), d = at(c, r + stride), e = at(c + stride, r + stride);
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(d) && Number.isFinite(e))) continue;
      const mn = Math.min(a, b, d, e), mx = Math.max(a, b, d, e);
      if (mx < first) continue;
      const x0 = c + 0.5, y0 = r + 0.5, s = stride;
      for (let L = Math.ceil(mn / interval) * interval; L <= mx; L += interval) {
        const key = +L.toFixed(6);
        const bucket = byLevel.get(key);
        if (!bucket) continue;
        // Corner order: tl(a) tr(b) br(e) bl(d)
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (e > L ? 2 : 0) | (d > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const top = (): number[] => [x0 + s * (L - a) / (b - a), y0];
        const right = (): number[] => [x0 + s, y0 + s * (L - b) / (e - b)];
        const bottom = (): number[] => [x0 + s * (L - d) / (e - d), y0 + s];
        const left = (): number[] => [x0, y0 + s * (L - a) / (d - a)];
        const seg = (p: number[], q: number[]) => bucket.segments.push([p, q]);
        switch (idx) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 5: case 10: {
            const centre = (a + b + d + e) / 4 > L;
            if ((idx === 5) === centre) { seg(left(), top()); seg(bottom(), right()); }
            else { seg(left(), bottom()); seg(top(), right()); }
            break;
          }
        }
      }
    }
  }
  return out.filter(l => l.segments.length);
}

/** 3×3 mean over field cells only — lidar noise makes 0.1 ft contours fizz otherwise. */
export function smoothMasked(v: Float32Array, w: number, h: number, mask: Uint8Array): Float32Array {
  const out = new Float32Array(v.length).fill(NaN);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!mask[i]) continue;
    let s = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= w || rr >= h) continue;
      const j = rr * w + cc;
      if (mask[j] && Number.isFinite(v[j])) { s += v[j]; n++; }
    }
    out[i] = n ? s / n : v[i];
  }
  return out;
}

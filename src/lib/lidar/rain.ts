/**
 * Rain over a field: a shallow-water "virtual pipes" model (O'Brien & Hodgins
 * 1995; Mei, Decaudin & Hu 2007). Each cell holds a water depth; water moves
 * to the four neighbours through pipes whose flow builds with the difference
 * in water-surface height and decays with friction. Water reaching a cell
 * outside the field has run off and is counted, not kept — so at any moment
 * rain fallen = water on the field + water run off, exactly.
 *
 * It is a picture of where water goes and stands, not a hydrology study: no
 * infiltration, no crop roughness, one storm intensity throughout.
 */

const G = 9.81;

export interface RainSim {
  w: number;
  h: number;
  /** Cell size, ground metres. */
  l: number;
  /** Surface the water runs on, metres. */
  z: Float32Array;
  /** 1 for field cells. Water entering any other cell has run off. */
  inside: Uint8Array;
  water: Float32Array;
  fl: Float32Array; fr: Float32Array; ft: Float32Array; fb: Float32Array;
  vx: Float32Array; vy: Float32Array;
  /** Simulated seconds. */
  time: number;
  /** Depth of rain fallen so far, metres. */
  rainedM: number;
  ranOffM3: number;
  fieldAreaM2: number;
}

export function createRainSim(z: Float32Array, inside: Uint8Array, w: number, h: number, l: number): RainSim {
  const n = w * h;
  let cells = 0;
  for (let i = 0; i < n; i++) if (inside[i] && Number.isFinite(z[i])) cells++; else inside[i] = 0;
  return {
    w, h, l, z, inside,
    water: new Float32Array(n),
    fl: new Float32Array(n), fr: new Float32Array(n), ft: new Float32Array(n), fb: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n),
    time: 0, rainedM: 0, ranOffM3: 0, fieldAreaM2: cells * l * l,
  };
}

export function resetRainSim(s: RainSim): void {
  s.water.fill(0); s.fl.fill(0); s.fr.fill(0); s.ft.fill(0); s.fb.fill(0); s.vx.fill(0); s.vy.fill(0);
  s.time = 0; s.rainedM = 0; s.ranOffM3 = 0;
}

/**
 * Largest step the pipes stay stable at for the deepest water present, and
 * no more than `maxStep` seconds (coarse grids over big areas can take more).
 */
export function stableStep(s: RainSim, maxStep = 2): number {
  let dmax = 0.001;
  const { water } = s;
  for (let i = 0; i < water.length; i++) if (water[i] > dmax) dmax = water[i];
  return Math.min(maxStep, 0.35 * s.l / Math.sqrt(G * dmax));
}

/** Advance `dt` seconds with rain falling at `rainMps` metres per second. */
export function stepRain(s: RainSim, dt: number, rainMps: number): void {
  const { w, h, l, z, inside, water, fl, fr, ft, fb, vx, vy } = s;
  const area = l * l;
  // Friction: a pipe loses most of its momentum in a few seconds, as sheet
  // flow over a rough field does; without it water sloshes like a bathtub.
  const damp = Math.exp(-dt * 0.6);
  // A pipe's cross-section is the cell width times the depth of the water
  // feeding it. A fixed cross-section (l²) makes shallow pools ring in a
  // checkerboard unless the step is tiny; scaling with depth keeps the model
  // stable at the shallow-water wave limit, sqrt(g·d).
  const k = dt * G;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (!inside[i]) continue;
      const d = water[i];
      const H = z[i] + d;
      const flowTo = (j: number, f: number) => {
        if (j < 0) return 0;
        const zj = z[j];
        if (!Number.isFinite(zj)) return 0;
        const Hj = inside[j] ? zj + water[j] : zj;
        return Math.max(0, f * damp + k * d * (H - Hj));
      };
      let a = flowTo(c > 0 ? i - 1 : -1, fl[i]);
      let b = flowTo(c < w - 1 ? i + 1 : -1, fr[i]);
      let e = flowTo(r > 0 ? i - w : -1, ft[i]);
      let f = flowTo(r < h - 1 ? i + w : -1, fb[i]);
      const out = (a + b + e + f) * dt;
      if (out > d * area) {
        const scale = out > 0 ? (d * area) / out : 0;
        a *= scale; b *= scale; e *= scale; f *= scale;
      }
      fl[i] = a; fr[i] = b; ft[i] = e; fb[i] = f;
    }
  }

  let ranOff = 0;
  const rain = rainMps * dt;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const fromLeft = c > 0 && inside[i - 1] ? fr[i - 1] : 0;
      const fromRight = c < w - 1 && inside[i + 1] ? fl[i + 1] : 0;
      const fromTop = r > 0 && inside[i - w] ? fb[i - w] : 0;
      const fromBottom = r < h - 1 && inside[i + w] ? ft[i + w] : 0;
      const inflow = fromLeft + fromRight + fromTop + fromBottom;
      if (!inside[i]) { ranOff += inflow * dt; continue; }
      const outflow = fl[i] + fr[i] + ft[i] + fb[i];
      const before = water[i];
      const after = Math.max(0, before + (inflow - outflow) * dt / area + rain);
      water[i] = after;
      const mean = Math.max(1e-4, (before + after) / 2);
      vx[i] = ((fromLeft - fl[i]) + (fr[i] - fromRight)) / 2 / (l * mean);
      vy[i] = ((fromTop - ft[i]) + (fb[i] - fromBottom)) / 2 / (l * mean);
    }
  }
  s.ranOffM3 += ranOff;
  s.rainedM += rain;
  s.time += dt;
}

export interface RainStats {
  time: number;
  fellM: number;
  onFieldM: number;
  ranOffM: number;
  deepestM: number;
  overInchM2: number;
}

export function rainStats(s: RainSim): RainStats {
  let vol = 0, deepest = 0, over = 0;
  const area = s.l * s.l;
  for (let i = 0; i < s.water.length; i++) {
    if (!s.inside[i]) continue;
    const d = s.water[i];
    vol += d;
    if (d > deepest) deepest = d;
    if (d > 0.0254) over++;
  }
  const field = s.fieldAreaM2 || 1;
  return {
    time: s.time, fellM: s.rainedM, onFieldM: vol * area / field,
    ranOffM: s.ranOffM3 / field, deepestM: deepest, overInchM2: over * area,
  };
}

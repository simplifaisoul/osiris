import type * as T from 'three';
import { rainStats, resetRainSim, stableStep, stepRain, type RainSim, type RainStats } from './lidar/rain';
import {
  cellGroundM, cutoutRainSim, floodSummary, flowNetwork, landRange, rainPace, seaMask,
  type FloodSummary, type FlowDetail, type FlowNetwork,
} from './cutout-hydro';
import type { CutoutTerrain } from './cutout-terrain';

/**
 * Water on the cut-out block, three ways:
 * - rain: a storm over the ground, run by the shallow-water model the field
 *   view uses, with the water drawn by depth and streaks along its flow;
 * - flow: the paths rain takes downhill, wider where more ground drains
 *   into them, with water moving along them, and where it would stand;
 * - flood: a flat water level, raised or lowered over the whole block.
 */

export type WaterMode = 'off' | 'rain' | 'flow' | 'flood';
export const RAIN_SPEEDS = { slow: 60, normal: 180, fast: 600 } as const;
export type RainSpeed = keyof typeof RAIN_SPEEDS;
export interface RainSettings { rainInHr: number; stormMin: number; speed: RainSpeed }
/** `pondKnown` is false on the 30 m tiles, where standing water cannot be told from noise. */
export interface FlowSummary { paths: number; biggestM2: number; pondM2: number; pondM3: number; pondKnown: boolean; outlets: number }

const M_TO_IN = 39.3700787;

export interface WaterContext {
  THREE: typeof import('three');
  scene: T.Scene;
  t: CutoutTerrain;
  size: number;
  /** The block's top surface: one vertex per cell, kept up to date with the height stretch. */
  top: T.BufferGeometry;
  X: (c: number) => number;
  Y: (z: number) => number;
  Z: (r: number) => number;
  sides: { cells: [number, number][]; normal: [number, number, number] }[];
  onRain?: (stats: RainStats, running: boolean) => void;
}

export interface WaterLayer {
  setMode(m: WaterMode): void;
  setRain(s: RainSettings): void;
  play(on: boolean): void;
  resetRain(): void;
  flow(detail: FlowDetail): FlowSummary;
  flood(levelM: number): FloodSummary;
  /** Lowest and highest land, metres. */
  landRange(): [number, number];
  /** Water depth at a vertex (column, row) in the current mode, metres; null when there is none to tell. */
  depthAt(c: number, r: number): number | null;
  restretch(): void;
  frame(realSec: number): void;
  dispose(): void;
}

export function createWater(ctx: WaterContext): WaterLayer {
  const { THREE, scene, t, size, top, X, Y, Z } = ctx;
  const W = t.w, H = t.h, n = W * H;
  const pos = (top.getAttribute('position') as T.BufferAttribute).array as Float32Array;
  const sea = seaMask(t);
  const cellM = cellGroundM(t);
  const disposers: (() => void)[] = [];
  let mode: WaterMode = 'off';

  /** Height of the drawn surface at vertex coordinates, by bilinear lookup. */
  const surfaceY = (c: number, r: number) => {
    const c0 = Math.max(0, Math.min(W - 1, Math.floor(c))), r0 = Math.max(0, Math.min(H - 1, Math.floor(r)));
    const c1 = Math.min(W - 1, c0 + 1), r1 = Math.min(H - 1, r0 + 1);
    const ac = Math.max(0, Math.min(1, c - c0)), ar = Math.max(0, Math.min(1, r - r0));
    const y = (cc: number, rr: number) => pos[(rr * W + cc) * 3 + 1];
    return (y(c0, r0) * (1 - ac) + y(c1, r0) * ac) * (1 - ar) + (y(c0, r1) * (1 - ac) + y(c1, r1) * ac) * ar;
  };

  /* ─────────────────────────────── Rain ─────────────────────────────── */

  const rainGroup = new THREE.Group();
  rainGroup.visible = false;
  scene.add(rainGroup);
  let settings: RainSettings = { rainInHr: 2, stormMin: 60, speed: 'normal' };
  let running = false;
  const pace = rainPace(cellM);

  type Rain = ReturnType<typeof buildRain>;
  let rain: Rain | null = null;

  function buildRain() {
    const sim: RainSim = cutoutRainSim(t, sea);

    // The water: the top surface lifted by its depth, blue by how deep.
    const wpos = new Float32Array(pos);
    const wcol = new Float32Array(n * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute((top.getAttribute('normal') as T.BufferAttribute).array, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(wcol, 4));
    geo.setIndex(top.getIndex()!.clone());
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, shininess: 90, specular: 0x88aaff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    rainGroup.add(mesh);

    // Depth blurred over the eight neighbours, for drawing only, so shorelines fade across a cell.
    const shown = new Float32Array(n);
    const lift = size * 0.0003;
    const draw = () => {
      const d = sim.water, inside = sim.inside, stretch = Y(1) - Y(0);
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        let sum = 0, cnt = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
          const k = rr * W + cc;
          if (inside[k]) { sum += d[k]; cnt++; }
        }
        const j = r * W + c;
        shown[j] = inside[j] && cnt ? (sum / cnt + d[j]) / 2 : 0;
      }
      for (let j = 0; j < n; j++) {
        const depth = shown[j];
        wpos[j * 3 + 1] = pos[j * 3 + 1] + depth * stretch + lift;
        const k = Math.min(1, Math.max(0, (depth - 0.0005) / 0.012));
        const deep = Math.min(1, depth / 0.3);
        wcol[j * 4] = 0.42 - 0.32 * deep; wcol[j * 4 + 1] = 0.72 - 0.3 * deep; wcol[j * 4 + 2] = 1; wcol[j * 4 + 3] = 0.9 * k * k * (3 - 2 * k);
      }
      geo.getAttribute('position').needsUpdate = true;
      geo.getAttribute('normal').needsUpdate = true;
      geo.getAttribute('color').needsUpdate = true;
      geo.computeBoundingSphere();
    };

    // Streaks: short white lines carried along by the water.
    const P = 3000;
    const px = new Float32Array(P).fill(-1), py = new Float32Array(P), age = new Float32Array(P);
    const lpos = new Float32Array(P * 6), lcol = new Float32Array(P * 8);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 4));
    const lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const lines = new THREE.LineSegments(lgeo, lmat);
    lines.renderOrder = 2;
    lines.frustumCulled = false;
    rainGroup.add(lines);
    const hide = (p: number) => { lcol[p * 8 + 3] = 0; lcol[p * 8 + 7] = 0; };
    const spawn = (p: number) => {
      for (let tries = 0; tries < 12; tries++) {
        const c = Math.random() * (W - 1), r = Math.random() * (H - 1);
        const j = Math.floor(r) * W + Math.floor(c);
        if (sim.inside[j] && sim.water[j] > 0.002) { px[p] = c; py[p] = r; age[p] = Math.random() * 60; return; }
      }
      px[p] = -1;
    };
    const streaks = (simMin: number) => {
      const { vx, vy, water: d } = sim;
      for (let p = 0; p < P; p++) {
        let c = px[p], r = py[p];
        if (c < 0) { spawn(p); hide(p); continue; }
        const j = Math.floor(r) * W + Math.floor(c);
        const u = vx[j], v = vy[j], sp = Math.hypot(u, v);
        age[p] += simMin;
        if (!sim.inside[j] || d[j] < 0.001 || age[p] > 90) { spawn(p); hide(p); continue; }
        c += (u * simMin * 6) / cellM; r += (v * simMin * 6) / cellM;
        if (c < 0 || r < 0 || c >= W - 1 || r >= H - 1) { px[p] = -1; hide(p); continue; }
        px[p] = c; py[p] = r;
        const len = sp > 0 ? Math.min(2.2, sp / 0.02) / sp : 0;
        const y = wpos[(Math.floor(r) * W + Math.floor(c)) * 3 + 1] + size * 0.0008;
        const o = p * 6, oc = p * 8;
        lpos[o] = X(c - u * len); lpos[o + 1] = y; lpos[o + 2] = Z(r - v * len);
        lpos[o + 3] = X(c); lpos[o + 4] = y; lpos[o + 5] = Z(r);
        lcol.set([1, 1, 1, 0, 1, 1, 1, sp > 0.004 ? Math.min(0.85, sp / 0.04) : 0], oc);
      }
      lgeo.getAttribute('position').needsUpdate = true;
      lgeo.getAttribute('color').needsUpdate = true;
    };

    // Rain in the air while the storm lasts.
    const D = 1400;
    const dpos = new Float32Array(D * 6);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    const dmat = new THREE.LineBasicMaterial({ color: 0x9fd2ff, transparent: true, opacity: 0.32, depthWrite: false });
    const drops = new THREE.LineSegments(dgeo, dmat);
    drops.frustumCulled = false;
    drops.visible = false;
    rainGroup.add(drops);
    const sky = () => Y(t.maxZ) + size * 0.3;
    const dropLen = size * 0.014;
    const dropAt = (k: number, y: number) => {
      const c = Math.random() * (W - 1), r = Math.random() * (H - 1);
      dpos.set([X(c), y + dropLen, Z(r), X(c), y, Z(r)], k * 6);
    };
    for (let k = 0; k < D; k++) dropAt(k, Y(t.minZ) + Math.random() * (sky() - Y(t.minZ)));
    const fall = (real: number) => {
      const dy = size * 0.45 * real;
      for (let k = 0; k < D; k++) {
        const o = k * 6;
        dpos[o + 1] -= dy; dpos[o + 4] -= dy;
        const c = (dpos[o] / t.widthM + 0.5) * (W - 1), r = (dpos[o + 2] / t.heightM + 0.5) * (H - 1);
        if (dpos[o + 4] <= surfaceY(c, r)) dropAt(k, sky() - Math.random() * size * 0.05);
      }
      dgeo.getAttribute('position').needsUpdate = true;
    };

    disposers.push(() => { geo.dispose(); mat.dispose(); lgeo.dispose(); lmat.dispose(); dgeo.dispose(); dmat.dispose(); });
    draw();
    return { sim, draw, streaks, drops, fall, clear: () => { for (let p = 0; p < P; p++) { px[p] = -1; hide(p); } lgeo.getAttribute('color').needsUpdate = true; } };
  }

  let hud = 0;
  const report = () => { if (rain) ctx.onRain?.(rainStats(rain.sim), running); };

  /* ─────────────────────────────── Flow ─────────────────────────────── */

  const flowGroup = new THREE.Group();
  flowGroup.visible = false;
  scene.add(flowGroup);
  let net: FlowNetwork | null = null;
  let netDetail: FlowDetail | null = null;
  let flowSummary: FlowSummary | null = null;

  // Paths and standing water are painted onto a sheet draped over the top surface.
  const long = 2048;
  const sheet = document.createElement('canvas');
  sheet.width = W >= H ? long : Math.round(long * (W - 1) / (H - 1));
  sheet.height = W >= H ? Math.round(long * (H - 1) / (W - 1)) : long;
  const sheetTex = new THREE.CanvasTexture(sheet);
  sheetTex.colorSpace = THREE.SRGBColorSpace;
  sheetTex.anisotropy = 8;
  const sheetMat = new THREE.MeshBasicMaterial({ map: sheetTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const sheetMesh = new THREE.Mesh(top, sheetMat);
  sheetMesh.renderOrder = 1;
  flowGroup.add(sheetMesh);
  disposers.push(() => { sheetTex.dispose(); sheetMat.dispose(); });

  // Water moving down the paths.
  const PN = 2400;
  const fpos = new Float32Array(PN * 3), fcol = new Float32Array(PN * 4);
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 4));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d')!;
  const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.85)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, 32, 32);
  const dotTex = new THREE.CanvasTexture(dot);
  const fmat = new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthWrite: false });
  const movers = new THREE.Points(fgeo, fmat);
  movers.renderOrder = 2;
  movers.frustumCulled = false;
  flowGroup.add(movers);
  disposers.push(() => { fgeo.dispose(); fmat.dispose(); dotTex.dispose(); });
  const mPath = new Int32Array(PN).fill(-1), mSeg = new Int32Array(PN), mT = new Float32Array(PN), mAge = new Float32Array(PN);
  let cum: Float32Array[] = [];
  let pathPick: Float32Array = new Float32Array(0);
  let active = 0;

  const paintFlow = (fn: FlowNetwork) => {
    const g = sheet.getContext('2d')!;
    const CW = sheet.width, CH = sheet.height;
    g.clearRect(0, 0, CW, CH);
    // Standing water, cell by cell, smoothed by the scale-up.
    const small = document.createElement('canvas');
    small.width = W; small.height = H;
    const sg = small.getContext('2d')!;
    const img = sg.createImageData(W, H);
    const deepM = t.source === 'lidar' ? 0.3 : 2;
    const pond = fn.drainage.pond;
    for (let i = 0; i < n; i++) {
      if (!(pond[i] > 0)) continue;
      img.data.set([70, 170, 255, Math.round(255 * Math.min(0.8, 0.35 + pond[i] / deepM))], i * 4);
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0.5, 0.5, W - 1, H - 1, 0, 0, CW, CH);
    // Paths, smallest first so the big ones read on top, each over a dark edge.
    const perCell = CW / (W - 1);
    const sx = (c: number) => ((c - 0.5) / (W - 1)) * CW, sy = (r: number) => ((r - 0.5) / (H - 1)) * CH;
    const order = fn.paths.map((_, k) => k).sort((a, b) => fn.paths[a].areaM2 - fn.paths[b].areaM2);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const k of order) {
        const p = fn.paths[k];
        const grow = Math.log2(1 + p.areaM2 / fn.minAreaM2);
        const width = Math.max(1.2, Math.min(perCell * 1.4, perCell * (0.16 + 0.2 * grow)));
        const big = Math.min(1, grow / 7);
        g.beginPath();
        p.pts.forEach(([c, r], i) => (i ? g.lineTo(sx(c), sy(r)) : g.moveTo(sx(c), sy(r))));
        if (pass === 0) { g.strokeStyle = 'rgba(0,18,40,0.55)'; g.lineWidth = width + Math.max(2, width * 0.6); }
        else { g.strokeStyle = `rgb(${Math.round(150 - 105 * big)},${Math.round(225 - 85 * big)},255)`; g.lineWidth = width; }
        g.stroke();
      }
    }
    sheetTex.needsUpdate = true;

    // Movers spread along the paths by length.
    cum = fn.paths.map(p => {
      const out = new Float32Array(p.pts.length);
      for (let i = 1; i < p.pts.length; i++) out[i] = out[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
      return out;
    });
    pathPick = new Float32Array(fn.paths.length);
    let total = 0;
    cum.forEach((c, k) => { total += c[c.length - 1]; pathPick[k] = total; });
    active = Math.min(PN, Math.round(total * 1.5));
    mPath.fill(-1);
    fcol.fill(0);
  };

  const spawnMover = (m: number) => {
    const total = pathPick[pathPick.length - 1] ?? 0;
    if (!net || total <= 0) { mPath[m] = -1; return; }
    const at = Math.random() * total;
    let lo = 0, hi = pathPick.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pathPick[mid] < at) lo = mid + 1; else hi = mid; }
    const c = cum[lo], d = Math.random() * c[c.length - 1];
    let s = 0;
    while (s < c.length - 2 && c[s + 1] < d) s++;
    mPath[m] = lo; mSeg[m] = s; mT[m] = d - c[s]; mAge[m] = 0;
  };

  const moveFlow = (real: number) => {
    if (!net) return;
    const paths = net.paths;
    for (let m = 0; m < PN; m++) {
      const o = m * 3, oc = m * 4;
      if (m >= active) { fcol[oc + 3] = 0; continue; }
      if (mPath[m] < 0) spawnMover(m);
      let p = mPath[m];
      if (p < 0) { fcol[oc + 3] = 0; continue; }
      const grow = Math.log2(1 + paths[p].areaM2 / net.minAreaM2);
      const step = (2.5 + 1.6 * grow) * real;
      mAge[m] += real;
      let seg = mSeg[m], along = mT[m] + step;
      for (;;) {
        const c = cum[p];
        const segLen = c[seg + 1] - c[seg];
        if (along <= segLen) break;
        along -= segLen;
        seg++;
        if (seg >= c.length - 1) {
          const next = paths[p].next;
          if (next < 0) { p = -1; break; }
          p = next; seg = 0;
        }
      }
      if (p < 0) { mPath[m] = -1; fcol[oc + 3] = 0; continue; }
      mPath[m] = p; mSeg[m] = seg; mT[m] = along;
      const pts = paths[p].pts, c = cum[p];
      const segLen = Math.max(1e-6, c[seg + 1] - c[seg]);
      const k = along / segLen;
      const cc = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * k - 0.5;
      const rr = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * k - 0.5;
      fpos[o] = X(cc); fpos[o + 1] = surfaceY(cc, rr) + size * 0.0015; fpos[o + 2] = Z(rr);
      fcol.set([0.82, 0.94, 1, Math.min(1, mAge[m] / 0.6) * 0.95], oc);
    }
    fgeo.getAttribute('position').needsUpdate = true;
    fgeo.getAttribute('color').needsUpdate = true;
  };

  /* ─────────────────────────────── Flood ─────────────────────────────── */

  const floodGroup = new THREE.Group();
  floodGroup.visible = false;
  scene.add(floodGroup);
  const floodMat = new THREE.MeshPhongMaterial({
    color: 0x1f6fd1, transparent: true, opacity: 0.62, shininess: 100, specular: 0x9fc4ff, depthWrite: false, side: THREE.DoubleSide,
  });
  const planeGeo = new THREE.PlaneGeometry(t.widthM, t.heightM);
  planeGeo.rotateX(-Math.PI / 2);
  const plane = new THREE.Mesh(planeGeo, floodMat);
  plane.renderOrder = 1;
  floodGroup.add(plane);
  // Water against the cut faces, from the ground at the edge up to the level.
  const floodWalls = ctx.sides.map(({ cells, normal }) => {
    const m = cells.length;
    const p = new Float32Array(m * 6), nrm = new Float32Array(m * 6);
    for (let k = 0; k < m; k++) nrm.set([...normal, ...normal], k * 6);
    const idx: number[] = [];
    for (let k = 0; k < m - 1; k++) { const a = k * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, floodMat);
    mesh.renderOrder = 1;
    floodGroup.add(mesh);
    return { g, cells };
  });
  disposers.push(() => { planeGeo.dispose(); floodMat.dispose(); floodWalls.forEach(w => w.g.dispose()); });
  let level: number | null = null;
  const placeFlood = () => {
    if (level === null) return;
    const yl = Y(level);
    plane.position.y = yl;
    for (const { g, cells } of floodWalls) {
      const p = g.getAttribute('position') as T.BufferAttribute;
      cells.forEach(([c, r], k) => {
        const yg = Y(t.z[r * W + c]);
        p.setXYZ(k * 2, X(c), Math.max(yg, yl), Z(r));
        p.setXYZ(k * 2 + 1, X(c), yg, Z(r));
      });
      p.needsUpdate = true;
      g.computeBoundingSphere();
    }
  };

  /* ─────────────────────────────── Shared ─────────────────────────────── */

  const show = () => {
    rainGroup.visible = mode === 'rain';
    flowGroup.visible = mode === 'flow';
    floodGroup.visible = mode === 'flood';
  };

  return {
    setMode(m) {
      if (m !== 'rain' && running) { running = false; report(); }
      mode = m;
      if (m === 'rain' && !rain) { rain = buildRain(); report(); }
      show();
    },
    setRain(s) { settings = s; },
    play(on) {
      if (on && !rain) rain = buildRain();
      running = on;
      report();
    },
    resetRain() {
      if (!rain) return;
      running = false;
      resetRainSim(rain.sim);
      rain.draw();
      rain.clear();
      rain.drops.visible = false;
      report();
    },
    flow(detail) {
      if (!net || netDetail !== detail) {
        net = flowNetwork(t, sea, detail);
        netDetail = detail;
        paintFlow(net);
        const d = net.drainage;
        flowSummary = {
          paths: net.paths.length,
          biggestM2: d.outlets[0]?.areaM2 ?? 0,
          pondM2: d.pondAreaM2, pondM3: d.pondVolumeM3, pondKnown: t.source === 'lidar',
          outlets: d.outlets.length,
        };
      }
      return flowSummary!;
    },
    flood(levelM) {
      level = levelM;
      placeFlood();
      return floodSummary(t, sea, levelM);
    },
    landRange: () => landRange(t, sea),
    depthAt(c, r) {
      const i = Math.max(0, Math.min(H - 1, Math.round(r))) * W + Math.max(0, Math.min(W - 1, Math.round(c)));
      if (mode === 'rain' && rain) return rain.sim.inside[i] ? rain.sim.water[i] : null;
      if (mode === 'flood' && level !== null) return sea[i] ? null : Math.max(0, level - t.z[i]);
      if (mode === 'flow' && net) return net.drainage.pond[i] || 0;
      return null;
    },
    restretch() {
      rain?.draw();
      placeFlood();
    },
    frame(real) {
      if (mode === 'rain' && rain) {
        const raining = running && rain.sim.time < settings.stormMin * 60;
        rain.drops.visible = raining;
        if (raining) rain.fall(real);
        if (running) {
          const sim = rain.sim;
          let budget = real * RAIN_SPEEDS[settings.speed] * pace.speedScale;
          const rate = settings.rainInHr / M_TO_IN / 3600;
          for (let k = 0; k < 14 && budget > 1e-6; k++) {
            const dt = Math.min(budget, stableStep(sim, pace.maxStep));
            stepRain(sim, dt, sim.time < settings.stormMin * 60 ? rate : 0);
            budget -= dt;
          }
          rain.draw();
          rain.streaks(real * RAIN_SPEEDS[settings.speed] * pace.speedScale / 60);
          hud += real;
          if (hud > 0.25) { hud = 0; report(); }
        }
      }
      if (mode === 'flow') moveFlow(real);
    },
    dispose() {
      disposers.reverse().forEach(fn => { try { fn(); } catch { /* already gone */ } });
      scene.remove(rainGroup, flowGroup, floodGroup);
    },
  };
}

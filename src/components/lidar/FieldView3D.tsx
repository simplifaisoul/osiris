'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Play, Pause, RotateCcw, SlidersHorizontal, Info, Loader2 } from 'lucide-react';
import { useLidar, close3d, designSurface, acres, takeAutoRain, type FieldState } from '@/lib/lidar/store';
import { createRainSim, resetRainSim, stableStep, stepRain, rainStats, type RainSim, type RainStats } from '@/lib/lidar/rain';
import { describeFlight } from '@/lib/lidar/usgs';

/**
 * The field on its own screen, in 3D: lidar terrain under satellite imagery,
 * with a storm you can run over it — on the ground as it is, or as graded to
 * the cut/fill design — to watch where water runs, where it stands, and how
 * much leaves the field.
 */

const SIM_MAX = 256;
const SPEEDS = { slow: 60, normal: 180, fast: 600 } as const;
type Speed = keyof typeof SPEEDS;
const M_TO_IN = 39.3700787;
const GOLD = '#D4AF37';

interface Settings { surface: 'existing' | 'design'; rainInHr: number; stormMin: number; stretch: number; speed: Speed }

function clock(sec: number) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

/** The field raster reduced to at most SIM_MAX cells a side for the simulation and mesh. */
function sample(f: FieldState, surface: 'existing' | 'design') {
  const g = f.grid!, mask = f.mask!;
  const k = Math.max(1, Math.ceil(Math.max(g.w, g.h) / SIM_MAX));
  const W = Math.ceil(g.w / k), H = Math.ceil(g.h / k);
  const design = surface === 'design' ? designSurface(f) : null;
  const ground = new Float32Array(W * H);
  const surf = new Float32Array(W * H);
  const inside = new Uint8Array(W * H);
  let zmin = Infinity, zmax = -Infinity;
  for (let R = 0; R < H; R++) for (let C = 0; C < W; C++) {
    let s = 0, n = 0, sd = 0, nd = 0, m = 0, cells = 0;
    for (let r = R * k; r < Math.min(g.h, R * k + k); r++) for (let c = C * k; c < Math.min(g.w, C * k + k); c++) {
      const i = r * g.w + c;
      cells++;
      if (mask[i]) m++;
      const z = g.z[i];
      if (Number.isFinite(z)) { s += z; n++; }
      if (design && Number.isFinite(design[i])) { sd += design[i]; nd++; }
    }
    const j = R * W + C;
    ground[j] = n ? s / n : NaN;
    surf[j] = nd ? sd / nd : ground[j];
    inside[j] = m * 2 > cells ? 1 : 0;
    if (inside[j] && Number.isFinite(surf[j])) { zmin = Math.min(zmin, surf[j]); zmax = Math.max(zmax, surf[j]); }
  }
  // Holes in the survey: borrow the field's low point so the mesh stays whole.
  for (let j = 0; j < W * H; j++) { if (!Number.isFinite(ground[j])) ground[j] = zmin; if (!Number.isFinite(surf[j])) surf[j] = ground[j]; }
  return { W, H, l: g.ground * k, ground, surf, inside, zmin, zmax, widthM: g.w * g.ground, heightM: g.h * g.ground };
}

export default function FieldView3D() {
  const { field } = useLidar();
  const host = useRef<HTMLDivElement>(null);
  const simRef = useRef<RainSim | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<RainStats | null>(null);
  const [panel, setPanel] = useState<'settings' | 'info' | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relief = field?.stats ? field.stats.maxZ - field.stats.minZ : 1;
  const sizeM = field?.grid ? Math.min(field.grid.w, field.grid.h) * field.grid.ground : 500;
  const [settings, setSettings] = useState<Settings>(() => ({
    surface: 'existing', rainInHr: 2, stormMin: 60, speed: 'normal',
    stretch: Math.max(2, Math.min(100, Math.round((0.04 * sizeM) / Math.max(0.15, relief)))),
  }));
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const hasDesign = !!field?.cutfill;

  useEffect(() => { runningRef.current = running; }, [running]);

  // Escape returns to the map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close3d(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!field?.grid || !host.current) return;
    let disposed = false;
    let raf = 0;
    const el = host.current;
    const cleanups: (() => void)[] = [];
    setReady(false);
    setRunning(false);

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;
      const S = sample(field, settings.surface);
      const { W, H } = S;
      const sim = createRainSim(S.surf, S.inside, W, H, S.l);
      simRef.current = sim;
      setStats(rainStats(sim));

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      el.appendChild(renderer.domElement);
      cleanups.push(() => { renderer.dispose(); renderer.domElement.remove(); });

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#050607');
      const size = Math.max(S.widthM, S.heightM);
      scene.fog = new THREE.Fog('#050607', size * 2.2, size * 5);
      const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, size / 1000, size * 20);
      camera.position.set(-size * 0.55, size * 0.42, size * 0.75);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = size * 0.05;
      controls.maxDistance = size * 4;
      cleanups.push(() => controls.dispose());

      // A low sun from the north-west with real terrain shadows, the way relief
      // reads in a printed shaded-relief map: every furrow and bank casts.
      scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3038, 0.85));
      const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
      const sunAlt = 28 * Math.PI / 180, sunAz = 315 * Math.PI / 180;
      sun.position.set(Math.sin(sunAz) * Math.cos(sunAlt) * size, Math.sin(sunAlt) * size, -Math.cos(sunAz) * Math.cos(sunAlt) * size);
      sun.castShadow = true;
      sun.shadow.mapSize.set(4096, 4096);
      const reach = size * 0.75;
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: size * 0.05, far: size * 3 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = size * 0.0006;
      scene.add(sun);

      // Terrain mesh, one vertex per simulation cell.
      const stretch = settings.stretch;
      const n = W * H;
      const pos = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      const tint = new Float32Array(n * 3);
      const yAt = (j: number) => (S.surf[j] - S.zmin) * stretch;
      for (let R = 0; R < H; R++) for (let C = 0; C < W; C++) {
        const j = R * W + C;
        pos[j * 3] = (C / (W - 1) - 0.5) * S.widthM;
        pos[j * 3 + 1] = yAt(j);
        pos[j * 3 + 2] = (R / (H - 1) - 0.5) * S.heightM;
        uv[j * 2] = C / (W - 1); uv[j * 2 + 1] = 1 - R / (H - 1);
        const k = S.inside[j] ? 1 : 0.42;
        tint[j * 3] = k; tint[j * 3 + 1] = k; tint[j * 3 + 2] = k;
      }
      const index: number[] = [];
      for (let R = 0; R < H - 1; R++) for (let C = 0; C < W - 1; C++) {
        const a = R * W + C, b = a + 1, c = a + W, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const g = field.grid!;
      const aspect = g.w / g.h;
      const tw = aspect >= 1 ? 2048 : Math.round(2048 * aspect), th = aspect >= 1 ? Math.round(2048 / aspect) : 2048;
      const imgUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${g.bbox.map(v => v.toFixed(2)).join(',')}&bboxSR=3857&imageSR=3857&size=${tw},${th}&format=jpg&f=image`;
      const tex = await new Promise<import('three').Texture | null>(resolve => {
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(imgUrl, t => resolve(t), undefined, () => resolve(null));
      });
      if (disposed) { tex?.dispose(); return; }
      if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
      const terrainMat = new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : 0x6f7d5a, vertexColors: true });
      const terrain = new THREE.Mesh(geo, terrainMat);
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      scene.add(terrain);
      cleanups.push(() => { geo.dispose(); terrainMat.dispose(); tex?.dispose(); });

      // Water: the same grid lifted by its depth, blue by how deep.
      const wpos = new Float32Array(pos);
      const wcol = new Float32Array(n * 4);
      const wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
      wgeo.setAttribute('normal', geo.getAttribute('normal').clone());
      wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 4));
      wgeo.setIndex(index);
      const waterMat = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, shininess: 90, specular: 0x88aaff });
      const water = new THREE.Mesh(wgeo, waterMat);
      water.receiveShadow = true;
      water.renderOrder = 1;
      scene.add(water);
      cleanups.push(() => { wgeo.dispose(); waterMat.dispose(); });

      // Flow streaks: short white lines carried by the water's velocity.
      const P = 3500;
      const px = new Float32Array(P), py = new Float32Array(P), age = new Float32Array(P);
      const lpos = new Float32Array(P * 6);
      const lcol = new Float32Array(P * 8);
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
      lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 4));
      const lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      const lines = new THREE.LineSegments(lgeo, lmat);
      lines.renderOrder = 2;
      scene.add(lines);
      cleanups.push(() => { lgeo.dispose(); lmat.dispose(); });
      const spawn = (p: number) => {
        for (let tries = 0; tries < 12; tries++) {
          const c = Math.random() * (W - 1), r = Math.random() * (H - 1);
          const j = Math.floor(r) * W + Math.floor(c);
          if (S.inside[j] && sim.water[j] > 0.002) { px[p] = c; py[p] = r; age[p] = Math.random() * 60; return; }
        }
        px[p] = -1;
      };
      for (let p = 0; p < P; p++) spawn(p);

      // Depth blurred over the eight neighbours, for drawing only: shorelines
      // then fade across a cell instead of stepping from cell to cell.
      const shown = new Float32Array(n);
      const updateWater = () => {
        const { water: d } = sim;
        for (let R = 0; R < H; R++) for (let C = 0; C < W; C++) {
          let sum = 0, cnt = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = R + dr, cc = C + dc;
            if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
            const k = rr * W + cc;
            if (S.inside[k]) { sum += d[k]; cnt++; }
          }
          const j = R * W + C;
          shown[j] = S.inside[j] && cnt ? (sum / cnt + d[j]) / 2 : 0;
        }
        for (let j = 0; j < n; j++) {
          const depth = shown[j];
          // Always just above the ground, fading in with depth: a hard wet/dry
          // cut-off draws every shoreline as a staircase of cells.
          wpos[j * 3 + 1] = pos[j * 3 + 1] + depth * stretch + size * 0.0003;
          const t = Math.min(1, Math.max(0, (depth - 0.0005) / 0.012));
          const a = 0.9 * t * t * (3 - 2 * t);
          const deep = Math.min(1, depth / 0.15);
          wcol[j * 4] = 0.42 - 0.3 * deep; wcol[j * 4 + 1] = 0.7 - 0.25 * deep; wcol[j * 4 + 2] = 1; wcol[j * 4 + 3] = a;
        }
        wgeo.getAttribute('position').needsUpdate = true;
        wgeo.getAttribute('color').needsUpdate = true;
      };

      const updateLines = (frameSec: number) => {
        const { vx, vy, water: d } = sim;
        for (let p = 0; p < P; p++) {
          let c = px[p], r = py[p];
          const o = p * 6, oc = p * 8;
          if (c < 0) { spawn(p); lcol[oc + 3] = 0; lcol[oc + 7] = 0; continue; }
          const j = Math.floor(r) * W + Math.floor(c);
          const u = vx[j], v = vy[j];
          const sp = Math.hypot(u, v);
          age[p] += frameSec;
          if (!S.inside[j] || d[j] < 0.001 || age[p] > 90) { spawn(p); lcol[oc + 3] = 0; lcol[oc + 7] = 0; continue; }
          // Advance in cells; streaks are drawn along the flow, longer when faster.
          c += (u * frameSec * 6) / S.l; r += (v * frameSec * 6) / S.l;
          if (c < 0 || r < 0 || c >= W - 1 || r >= H - 1) { spawn(p); continue; }
          px[p] = c; py[p] = r;
          const len = Math.min(2.2, sp / 0.02) * (sp > 0 ? 1 / sp : 0);
          const c0 = c - u * len, r0 = r - v * len;
          const X = (cc: number) => (cc / (W - 1) - 0.5) * S.widthM;
          const Z = (rr: number) => (rr / (H - 1) - 0.5) * S.heightM;
          const y = wpos[(Math.floor(r) * W + Math.floor(c)) * 3 + 1] + size * 0.0008;
          lpos[o] = X(c0); lpos[o + 1] = y; lpos[o + 2] = Z(r0);
          lpos[o + 3] = X(c); lpos[o + 4] = y; lpos[o + 5] = Z(r);
          const a = sp > 0.004 ? Math.min(0.85, sp / 0.04) : 0;
          lcol[oc] = 1; lcol[oc + 1] = 1; lcol[oc + 2] = 1; lcol[oc + 3] = 0;
          lcol[oc + 4] = 1; lcol[oc + 5] = 1; lcol[oc + 6] = 1; lcol[oc + 7] = a;
        }
        lgeo.getAttribute('position').needsUpdate = true;
        lgeo.getAttribute('color').needsUpdate = true;
      };

      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      };
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));

      updateWater();
      setReady(true);
      if (takeAutoRain()) setRunning(true);
      let last = performance.now();
      let hud = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const real = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (runningRef.current) {
          const st = settingsRef.current;
          let budget = real * SPEEDS[st.speed];
          const rate = st.rainInHr / M_TO_IN / 3600;
          for (let k = 0; k < 14 && budget > 1e-6; k++) {
            const dt = Math.min(budget, stableStep(sim));
            stepRain(sim, dt, sim.time < st.stormMin * 60 ? rate : 0);
            budget -= dt;
          }
          updateWater();
          updateLines(real * SPEEDS[st.speed] / 60);
          hud += real;
          if (hud > 0.25) { hud = 0; setStats(rainStats(sim)); }
        }
        controls.update();
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);
      cleanups.push(() => cancelAnimationFrame(raf));
      // Reset clears the water in place.
      (simRef as React.MutableRefObject<RainSim | null> & { redraw?: () => void }).redraw = () => {
        updateWater();
        for (let p = 0; p < P; p++) { lcol[p * 8 + 3] = 0; lcol[p * 8 + 7] = 0; px[p] = -1; }
        lgeo.getAttribute('color').needsUpdate = true;
      };
    })().catch(e => { if (!disposed) setError(e instanceof Error ? e.message : '3D view failed to start'); });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.reverse().forEach(fn => { try { fn(); } catch { /* already gone */ } });
      simRef.current = null;
    };
    // The scene is rebuilt when the surface or the vertical stretch changes; rain settings apply live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.grid, settings.surface, settings.stretch]);

  const reset = () => {
    const sim = simRef.current;
    if (!sim) return;
    resetRainSim(sim);
    (simRef as unknown as { redraw?: () => void }).redraw?.();
    setStats(rainStats(sim));
    setRunning(false);
  };

  if (!field?.grid) return null;
  const storm = settings.stormMin * 60;
  const raining = !!stats && stats.time < storm;
  const totalIn = settings.rainInHr * settings.stormMin / 60;

  return (
    <div className="fixed inset-0 z-[1000] bg-[#050607]" role="dialog" aria-label="Field in 3D">
      <div ref={host} className="absolute inset-0" />

      <button onClick={close3d} className="absolute left-4 top-4 flex items-center gap-1 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-white/85 backdrop-blur hover:border-[#D4AF37]/50 hover:text-[#D4AF37]">
        <ChevronLeft className="h-4 w-4" /> Map
      </button>

      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-[#D4AF37]">Field · {acres(field.stats!.areaM2).toFixed(1)} ac</div>
        <div className="mt-0.5 text-[10px] font-mono text-white/45">
          {field.flight ? describeFlight(field.flight) : 'USGS 3DEP lidar'} · {settings.surface === 'design' ? 'graded to design' : 'existing ground'} · {settings.stretch}× height
        </div>
      </div>

      {stats && (
        <div className="absolute right-4 top-4 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-right font-mono text-[11px] leading-relaxed text-white/80 backdrop-blur tabular-nums">
          <div>
            {stats.time === 0 ? <span className="text-white/50">Ready</span> : raining ? <span className="text-[#6FB7FF]">Raining {clock(stats.time)}</span> : <span className="text-[#D4AF37]">Running off {clock(stats.time)}</span>}
            {' · '}<span className="font-bold text-white">{(stats.fellM * M_TO_IN).toFixed(2)} in</span> fell
          </div>
          <div>Over 1 in: <span className="font-bold text-[#6FB7FF]">{acres(stats.overInchM2).toFixed(1)} ac</span> · deepest <span className="font-bold text-white">{(stats.deepestM * M_TO_IN).toFixed(1)} in</span></div>
          <div>Ran off: <span className="font-bold text-white">{(stats.ranOffM * M_TO_IN).toFixed(2)} in</span> · on field <span className="font-bold text-white">{(stats.onFieldM * M_TO_IN).toFixed(2)} in</span></div>
        </div>
      )}

      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] font-mono text-[#D4AF37]"><Loader2 className="h-4 w-4 animate-spin" />Building the field in 3D…</div>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-red-400">{error}</div>}

      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        {panel === 'settings' && (
          <div className="w-72 rounded-lg border border-white/10 bg-black/85 p-3 backdrop-blur">
            <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/50 p-0.5">
              {(['existing', 'design'] as const).map(sf => (
                <button key={sf} disabled={sf === 'design' && !hasDesign}
                  onClick={() => setSettings(st => ({ ...st, surface: sf }))}
                  title={sf === 'design' && !hasDesign ? 'Open Cut / Fill first to make a design' : undefined}
                  className={`rounded py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest disabled:opacity-30 ${settings.surface === sf ? 'bg-[#1554D6]/60 text-white' : 'text-white/60 hover:text-white'}`}>
                  {sf === 'existing' ? 'Existing' : 'Design'}
                </button>
              ))}
            </div>
            <Range name="Rain" value={settings.rainInHr} min={0.25} max={4} step={0.25} text={`${settings.rainInHr.toFixed(2)} in/hr`} onChange={v => setSettings(st => ({ ...st, rainInHr: v }))} />
            <Range name="Storm length" value={settings.stormMin} min={15} max={360} step={15} text={`${clock(settings.stormMin * 60)} (${totalIn.toFixed(2)} in total)`} onChange={v => setSettings(st => ({ ...st, stormMin: v }))} />
            <Range name="Height stretch" value={settings.stretch} min={1} max={100} step={1} text={`${settings.stretch}×`} onChange={v => setSettings(st => ({ ...st, stretch: v }))} />
            <div className="mt-2.5 grid grid-cols-3 gap-1">
              {(Object.keys(SPEEDS) as Speed[]).map(sp => (
                <button key={sp} onClick={() => setSettings(st => ({ ...st, speed: sp }))}
                  className={`rounded py-1 text-[10px] font-mono font-bold uppercase tracking-widest ${settings.speed === sp ? 'bg-[#1554D6]/60 text-white' : 'text-white/55 hover:text-white'}`}>
                  {sp}
                </button>
              ))}
            </div>
          </div>
        )}
        {panel === 'info' && (
          <div className="w-80 rounded-lg border border-white/10 bg-black/85 p-3 text-[10px] font-mono leading-relaxed text-white/70 backdrop-blur">
            Rain falls evenly on the field and moves over the lidar surface by a shallow-water model. Water that reaches the field edge has run off; the rest is on the field. No soak-in, so it shows where water goes and stands, not a hydrology study. Drag to orbit, scroll to zoom, right-drag to pan.
          </div>
        )}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1.5 backdrop-blur">
          <button onClick={() => setRunning(r => !r)} disabled={!ready}
            className="flex items-center gap-1.5 rounded-md bg-[#1554D6] px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-white hover:bg-[#1E66F0] disabled:opacity-40">
            {running ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />{stats && stats.time > 0 ? 'Resume' : 'Start rain'}</>}
          </button>
          <button onClick={reset} className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white" title="Reset"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setPanel(p => (p === 'settings' ? null : 'settings'))} className={`rounded-md p-2 hover:bg-white/10 ${panel === 'settings' ? 'text-[#D4AF37]' : 'text-white/70 hover:text-white'}`} title="Storm settings"><SlidersHorizontal className="h-4 w-4" /></button>
          <button onClick={() => setPanel(p => (p === 'info' ? null : 'info'))} className={`rounded-md p-2 hover:bg-white/10 ${panel === 'info' ? 'text-[#D4AF37]' : 'text-white/70 hover:text-white'}`} title="About the model"><Info className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 text-[9px] font-mono text-white/35">Imagery © Esri, Maxar, Earthstar Geographics · Elevation: USGS 3DEP</div>
      <span className="sr-only" style={{ color: GOLD }} />
    </div>
  );
}

function Range({ name, value, min, max, step, text, onChange }: { name: string; value: number; min: number; max: number; step: number; text: string; onChange: (v: number) => void }) {
  return (
    <label className="mt-2.5 block">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="uppercase tracking-wider text-white/55">{name}</span>
        <span className="tabular-nums text-white/85">{text}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="mt-1 h-1 w-full cursor-pointer" style={{ accentColor: '#1E66F0' }} />
    </label>
  );
}

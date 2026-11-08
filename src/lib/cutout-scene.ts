import { boxFraction, heightAt, type CutoutTerrain } from './cutout-terrain';
import { loadImagery } from './cutout-imagery';
import { createWater, type WaterLayer } from './cutout-water';
import { fromMerc } from './lidar/usgs';
import type { RainStats } from './lidar/rain';

/**
 * The cut-out in 3D: the piece of ground lifted out of the map as a solid
 * block, satellite imagery on top and earth-coloured walls, standing on a
 * faint grid. Cameras and network hosts stand on it as pins at their real
 * positions, with labels that can be clicked.
 */

export interface Pin {
  id: string;
  kind: 'cctv' | 'net';
  lng: number;
  lat: number;
  label: string;
  live?: boolean;
}

export interface CutoutScene {
  setStretch(stretch: number): void;
  setPins(pins: Pin[]): void;
  setSelected(id: string | null): void;
  focus(id: string): void;
  resetView(): void;
  water: WaterLayer;
  dispose(): void;
}

/** What is under the pointer: the ground, and the water on it in the current water mode. */
export interface Hover { lng: number; lat: number; z: number; water: number | null }

const GOLD = '#D4AF37';
const COLOR = { cctv: '#00E676', net: '#FF3B6B' } as const;

const ICON = {
  cctv: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  net: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>',
};

/** A vertical stretch that makes the ground's shape readable without turning hills into spikes. */
export function autoStretch(t: Pick<CutoutTerrain, 'widthM' | 'heightM' | 'minZ' | 'maxZ'>): number {
  const size = Math.max(t.widthM, t.heightM);
  return Math.max(1, Math.min(30, Math.round((0.04 * size) / Math.max(1, t.maxZ - t.minZ))));
}

export async function createCutoutScene(
  el: HTMLElement,
  t: CutoutTerrain,
  opts: {
    stretch: number;
    onPick: (id: string) => void;
    onImagery?: (ok: boolean) => void;
    onRain?: (stats: RainStats, running: boolean) => void;
    onHover?: (h: Hover | null) => void;
  },
): Promise<CutoutScene> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const { CSS2DRenderer, CSS2DObject } = await import('three/examples/jsm/renderers/CSS2DRenderer.js');

  const disposers: (() => void)[] = [];
  const W = t.w, H = t.h;
  const size = Math.max(t.widthM, t.heightM);
  const base = size * 0.04;
  let stretch = opts.stretch;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.appendChild(renderer.domElement);
  disposers.push(() => { renderer.dispose(); renderer.domElement.remove(); });

  const labels = new CSS2DRenderer();
  labels.setSize(el.clientWidth, el.clientHeight);
  // zIndex 0 keeps the pins' own stacking inside this layer, under the page's panels.
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0' });
  el.appendChild(labels.domElement);
  disposers.push(() => labels.domElement.remove());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');
  scene.fog = new THREE.Fog('#050607', size * 2.5, size * 7);
  const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, size / 2000, size * 30);
  const home = { pos: new THREE.Vector3(-size * 0.62, size * 0.55, size * 0.82), target: new THREE.Vector3(0, 0, 0) };
  camera.position.copy(home.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = size * 0.02;
  controls.maxDistance = size * 5;
  disposers.push(() => controls.dispose());

  // Low sun from the north-west, so relief reads the way a shaded-relief map does.
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3038, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
  const alt = 32 * Math.PI / 180, az = 315 * Math.PI / 180;
  sun.position.set(Math.sin(az) * Math.cos(alt) * size, Math.sin(alt) * size, -Math.cos(az) * Math.cos(alt) * size);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const reach = size * 0.9;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: size * 0.05, far: size * 3.5 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = size * 0.0006;
  scene.add(sun);

  const X = (c: number) => (c / (W - 1) - 0.5) * t.widthM;
  const Z = (r: number) => (r / (H - 1) - 0.5) * t.heightM;
  const Y = (z: number) => (z - t.minZ) * stretch;

  // Top surface: one vertex per cell, imagery draped over it.
  const n = W * H;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const j = r * W + c;
    pos[j * 3] = X(c); pos[j * 3 + 1] = Y(t.z[j]); pos[j * 3 + 2] = Z(r);
    uv[j * 2] = c / (W - 1); uv[j * 2 + 1] = 1 - r / (H - 1);
  }
  const index: number[] = [];
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
    const a = r * W + c, b = a + 1, d = a + W, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setIndex(index);
  top.computeVertexNormals();
  const topMat = new THREE.MeshLambertMaterial({ color: 0x5d6a52 });
  const surface = new THREE.Mesh(top, topMat);
  surface.castShadow = true;
  surface.receiveShadow = true;
  scene.add(surface);
  disposers.push(() => { top.dispose(); topMat.dispose(); topMat.map?.dispose(); });

  const imageryAbort = new AbortController();
  disposers.push(() => imageryAbort.abort());
  loadImagery(t.merc, Math.min(4096, renderer.capabilities.maxTextureSize), 180, imageryAbort.signal).then(canvas => {
    if (imageryAbort.signal.aborted) return;
    if (!canvas) { opts.onImagery?.(false); return; }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    topMat.map = tex;
    topMat.color.set(0xffffff);
    topMat.needsUpdate = true;
    opts.onImagery?.(true);
  }, () => opts.onImagery?.(false));

  // Walls: four strips from the top edge down to the base, earth at the top fading to dark.
  const sides: { cells: [number, number][]; normal: [number, number, number] }[] = [
    { cells: Array.from({ length: W }, (_, c) => [c, 0]), normal: [0, 0, -1] },
    { cells: Array.from({ length: H }, (_, r) => [W - 1, r]), normal: [1, 0, 0] },
    { cells: Array.from({ length: W }, (_, c) => [W - 1 - c, H - 1]), normal: [0, 0, 1] },
    { cells: Array.from({ length: H }, (_, r) => [0, H - 1 - r]), normal: [-1, 0, 0] },
  ];
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const walls = sides.map(({ cells, normal }) => {
    const m = cells.length;
    const p = new Float32Array(m * 6), nrm = new Float32Array(m * 6), col = new Float32Array(m * 6);
    for (let k = 0; k < m; k++) {
      const [c, r] = cells[k];
      p.set([X(c), Y(t.z[r * W + c]), Z(r), X(c), -base, Z(r)], k * 6);
      nrm.set([...normal, ...normal], k * 6);
      col.set([0.36, 0.28, 0.2, 0.05, 0.05, 0.06], k * 6);
    }
    const idx: number[] = [];
    for (let k = 0; k < m - 1; k++) { const a = k * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, wallMat);
    mesh.castShadow = true;
    scene.add(mesh);
    return { g, cells };
  });
  disposers.push(() => { walls.forEach(w => w.g.dispose()); wallMat.dispose(); });

  const bottomGeo = new THREE.PlaneGeometry(t.widthM, t.heightM);
  bottomGeo.rotateX(Math.PI / 2);
  bottomGeo.translate(0, -base, 0);
  const bottomMat = new THREE.MeshBasicMaterial({ color: 0x07080a });
  scene.add(new THREE.Mesh(bottomGeo, bottomMat));
  disposers.push(() => { bottomGeo.dispose(); bottomMat.dispose(); });

  // Gold edge round the cut, and a fainter one round the base.
  const rim = sides.flatMap(s => s.cells);
  const rimPos = new Float32Array(rim.length * 3);
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimPos, 3));
  const rimMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85 });
  scene.add(new THREE.LineLoop(rimGeo, rimMat));
  const footGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-t.widthM / 2, -base, -t.heightM / 2), new THREE.Vector3(t.widthM / 2, -base, -t.heightM / 2),
    new THREE.Vector3(t.widthM / 2, -base, t.heightM / 2), new THREE.Vector3(-t.widthM / 2, -base, t.heightM / 2),
  ]);
  const footMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.3 });
  scene.add(new THREE.LineLoop(footGeo, footMat));
  disposers.push(() => { rimGeo.dispose(); rimMat.dispose(); footGeo.dispose(); footMat.dispose(); });

  // The table it stands on: a faint grid and the block's shadow.
  const grid = new THREE.GridHelper(size * 8, 64, 0x6b5a22, 0x1d2126);
  (grid.material as import('three').Material).transparent = true;
  (grid.material as import('three').Material).opacity = 0.35;
  grid.position.y = -base - size * 0.001;
  scene.add(grid);
  const floorGeo = new THREE.PlaneGeometry(size * 8, size * 8);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.45 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -base - size * 0.002;
  floor.receiveShadow = true;
  scene.add(floor);
  disposers.push(() => { grid.geometry.dispose(); (grid.material as import('three').Material).dispose(); floorGeo.dispose(); floorMat.dispose(); });

  // North, on the edge it faces.
  const north = document.createElement('div');
  north.textContent = 'N';
  Object.assign(north.style, { font: '700 11px ui-monospace, monospace', color: GOLD, letterSpacing: '0.2em', textShadow: '0 0 6px #000' });
  const northLabel = new CSS2DObject(north);
  scene.add(northLabel);

  const redrawEdges = () => {
    rim.forEach(([c, r], k) => rimPos.set([X(c), Y(t.z[r * W + c]) + size * 0.0005, Z(r)], k * 3));
    rimGeo.getAttribute('position').needsUpdate = true;
    rimGeo.computeBoundingSphere();
    walls.forEach(({ g, cells }) => {
      const p = g.getAttribute('position') as import('three').BufferAttribute;
      cells.forEach(([c, r], k) => p.setY(k * 2, Y(t.z[r * W + c])));
      p.needsUpdate = true;
      g.computeBoundingSphere();
    });
    northLabel.position.set(0, Y(t.z[Math.floor(W / 2)]) + size * 0.02, -t.heightM / 2 - size * 0.04);
  };
  redrawEdges();

  const water = createWater({ THREE, scene, t, size, top, X, Y, Z, sides, onRain: opts.onRain });
  disposers.push(() => water.dispose());

  // The ground under the pointer, read once a frame at most.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer: { x: number; y: number } | null = null;
  let pointerDirty = false;
  const canvas = renderer.domElement;
  const onMove = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    pointer = { x: ((e.clientX - b.left) / b.width) * 2 - 1, y: -((e.clientY - b.top) / b.height) * 2 + 1 };
    pointerDirty = true;
  };
  const onLeave = () => { pointer = null; pointerDirty = true; };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  disposers.push(() => { canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); });
  const groundAt = (c: number, r: number) => {
    const c0 = Math.max(0, Math.min(W - 1, Math.floor(c))), r0 = Math.max(0, Math.min(H - 1, Math.floor(r)));
    const c1 = Math.min(W - 1, c0 + 1), r1 = Math.min(H - 1, r0 + 1);
    const ac = Math.max(0, Math.min(1, c - c0)), ar = Math.max(0, Math.min(1, r - r0));
    const z = (cc: number, rr: number) => t.z[rr * W + cc];
    return (z(c0, r0) * (1 - ac) + z(c1, r0) * ac) * (1 - ar) + (z(c0, r1) * (1 - ac) + z(c1, r1) * ac) * ar;
  };
  const readPointer = () => {
    if (!opts.onHover) return;
    if (!pointer) { opts.onHover(null); return; }
    ndc.set(pointer.x, pointer.y);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(surface, false)[0];
    if (!hit) { opts.onHover(null); return; }
    const c = (hit.point.x / t.widthM + 0.5) * (W - 1), r = (hit.point.z / t.heightM + 0.5) * (H - 1);
    const [lng, lat] = fromMerc(
      t.merc[0] + ((c + 0.5) / W) * (t.merc[2] - t.merc[0]),
      t.merc[3] - ((r + 0.5) / H) * (t.merc[3] - t.merc[1]),
    );
    opts.onHover({ lng, lat, z: groundAt(c, r), water: water.depthAt(c, r) });
  };

  // Pins.
  type PinObj = { pin: Pin; group: import('three').Group; stem: import('three').Line; el: HTMLDivElement; ground: number };
  const pins = new Map<string, PinObj>();
  const pinGroup = new THREE.Group();
  scene.add(pinGroup);
  let selected: string | null = null;
  const stemMats = { cctv: new THREE.LineBasicMaterial({ color: COLOR.cctv }), net: new THREE.LineBasicMaterial({ color: COLOR.net }) };
  const dotGeo = new THREE.CircleGeometry(size * 0.0035, 20).rotateX(-Math.PI / 2);
  const dotMats = { cctv: new THREE.MeshBasicMaterial({ color: COLOR.cctv }), net: new THREE.MeshBasicMaterial({ color: COLOR.net }) };
  disposers.push(() => { Object.values(stemMats).forEach(m => m.dispose()); Object.values(dotMats).forEach(m => m.dispose()); dotGeo.dispose(); });
  const stemH = (kind: Pin['kind']) => size * (kind === 'net' ? 0.075 : 0.055);

  const placePin = (o: PinObj) => {
    const [fx, fy] = boxFraction(t, o.pin.lng, o.pin.lat);
    o.group.position.set((fx - 0.5) * t.widthM, Y(o.ground), (fy - 0.5) * t.heightM);
  };

  const styleEl = (o: PinObj) => {
    const on = o.pin.id === selected;
    const c = COLOR[o.pin.kind];
    const badge = o.el.firstElementChild as HTMLElement;
    Object.assign(badge.style, {
      background: on ? c : 'rgba(5,6,7,0.88)', color: on ? '#000' : c,
      transform: on ? 'scale(1.25)' : '', boxShadow: on ? `0 0 14px ${c}` : '0 2px 8px rgba(0,0,0,0.7)',
    });
    (o.el.lastElementChild as HTMLElement).style.display = on ? 'block' : 'none';
    o.el.style.zIndex = on ? '2' : '';
  };

  const makeEl = (pin: Pin) => {
    const c = COLOR[pin.kind];
    const el = document.createElement('div');
    Object.assign(el.style, { pointerEvents: 'auto', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' });
    el.className = 'cutout-pin';
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'relative', width: '24px', height: '24px', borderRadius: pin.kind === 'net' ? '5px' : '999px', display: 'flex',
      alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${c}`, transition: 'transform 120ms, background 120ms',
    });
    badge.innerHTML = ICON[pin.kind] + (pin.live ? '<span style="position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:9px;background:#FF3B30;box-shadow:0 0 6px #FF3B30"></span>' : '');
    const name = document.createElement('div');
    name.textContent = pin.label;
    Object.assign(name.style, {
      display: 'none', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 6px',
      font: '600 10px ui-monospace, SFMono-Regular, monospace', color: '#fff', background: 'rgba(5,6,7,0.9)', border: `1px solid ${c}66`, borderRadius: '4px',
      order: '-1',
    });
    el.append(badge, name);
    el.addEventListener('pointerenter', () => { name.style.display = 'block'; el.style.zIndex = '3'; });
    el.addEventListener('pointerleave', () => { if (pin.id !== selected) { name.style.display = 'none'; el.style.zIndex = ''; } });
    el.addEventListener('click', e => { e.stopPropagation(); opts.onPick(pin.id); });
    // The label sits over the canvas: let the wheel still zoom the view.
    el.addEventListener('wheel', e => { e.preventDefault(); renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
    return el;
  };

  const setPins = (list: Pin[]) => {
    const keep = new Set(list.map(p => p.id));
    for (const [id, o] of pins) {
      if (keep.has(id)) continue;
      pinGroup.remove(o.group);
      o.group.traverse(obj => { if (obj instanceof CSS2DObject) obj.element.remove(); });
      o.stem.geometry.dispose();
      pins.delete(id);
    }
    for (const pin of list) {
      if (pins.has(pin.id)) continue;
      const group = new THREE.Group();
      const h = stemH(pin.kind);
      const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]), stemMats[pin.kind]);
      const dot = new THREE.Mesh(dotGeo, dotMats[pin.kind]);
      dot.position.y = size * 0.0006;
      const el = makeEl(pin);
      const label = new CSS2DObject(el);
      label.position.y = h;
      label.center.set(0.5, 1);
      group.add(stem, dot, label);
      const o: PinObj = { pin, group, stem, el, ground: heightAt(t, pin.lng, pin.lat) ?? t.minZ };
      placePin(o);
      styleEl(o);
      pinGroup.add(group);
      pins.set(pin.id, o);
    }
  };

  // Camera moves, eased in the render loop.
  let tween: { from: [import('three').Vector3, import('three').Vector3]; to: [import('three').Vector3, import('three').Vector3]; t0: number; ms: number } | null = null;
  const flyTo = (pos: import('three').Vector3, target: import('three').Vector3) => {
    tween = { from: [camera.position.clone(), controls.target.clone()], to: [pos, target], t0: performance.now(), ms: 800 };
  };

  const onResize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(el);
  disposers.push(() => ro.disconnect());

  let raf = 0;
  let last = performance.now();
  let frames = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    water.frame(real);
    // Water moves under a still pointer too, so read it again now and then.
    if (pointer && ++frames % 15 === 0) pointerDirty = true;
    if (pointerDirty) { pointerDirty = false; readPointer(); }
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from[0], tween.to[0], e);
      controls.target.lerpVectors(tween.from[1], tween.to[1], e);
      if (k >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  disposers.push(() => cancelAnimationFrame(raf));

  return {
    setStretch(s: number) {
      stretch = s;
      for (let j = 0; j < n; j++) pos[j * 3 + 1] = Y(t.z[j]);
      top.getAttribute('position').needsUpdate = true;
      top.computeVertexNormals();
      top.computeBoundingSphere();
      redrawEdges();
      pins.forEach(placePin);
      water.restretch();
    },
    setPins,
    setSelected(id: string | null) {
      const prev = selected;
      selected = id;
      if (prev && pins.has(prev)) styleEl(pins.get(prev)!);
      if (id && pins.has(id)) styleEl(pins.get(id)!);
    },
    focus(id: string) {
      const o = pins.get(id);
      if (!o) return;
      const target = o.group.position.clone();
      target.y += stemH(o.pin.kind) * 0.4;
      const dir = camera.position.clone().sub(controls.target).normalize();
      flyTo(target.clone().add(dir.multiplyScalar(size * 0.32)), target);
    },
    resetView() { flyTo(home.pos.clone(), home.target.clone()); },
    water,
    dispose() {
      disposers.reverse().forEach(fn => { try { fn(); } catch { /* already gone */ } });
    },
  };
}

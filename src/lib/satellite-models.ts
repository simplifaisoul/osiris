import type * as ThreeNS from 'three';

/**
 * OSIRIS — what a satellite looks like
 *
 * Nineteen thousand satellites have no published 3D model each, but they come
 * in a handful of recognisable shapes: a Starlink is a flat panel with its
 * arrays, a navigation satellite a gold box with two wings and an antenna
 * array, a geostationary bird a big bus with long wings and dish reflectors.
 * Each kind here is built from simple shapes at roughly its real size, in
 * metres, so the card can show what the selected satellite looks like. They
 * are illustrations of the kind, made for OSIRIS, not scans of one satellite.
 *
 * Frame: −Y faces the Earth, wings run along X, array cells face ±Z.
 * three.js is passed in, so this file adds nothing to the page until the
 * model view is opened.
 */

type Three = typeof ThreeNS;

export type SatModelKind =
  | 'starlink-v2' | 'starlink-v1' | 'iss' | 'tiangong' | 'hubble' | 'gnss' | 'cubesat'
  | 'imaging' | 'geo' | 'comms' | 'rocket-body' | 'debris' | 'generic';

export interface SatModelChoice {
  kind: SatModelKind;
  /** What the model shows, for the card. */
  label: string;
}

/**
 * Kinds that stand for one design, built to its real size, so their span can
 * be shown. The rest stand for many satellites of different sizes.
 */
export const TRUE_SIZE_KINDS: ReadonlySet<SatModelKind> = new Set(['iss', 'tiangong', 'hubble', 'starlink-v2', 'starlink-v1']);

/** Which model draws a satellite, from its catalogue name, mission and height. */
export function satelliteModelKind(s: { name: string; mission?: string; category?: string; altKm: number }): SatModelChoice {
  const n = s.name.toUpperCase();
  const m = s.mission ?? '';
  if (/\bR\/B\b|ROCKET BODY/.test(n)) return { kind: 'rocket-body', label: 'Spent rocket stage' };
  if (/\bDEB\b|DEBRIS/.test(n)) return { kind: 'debris', label: 'Debris fragment' };
  if (/^ISS\b/.test(n)) return { kind: 'iss', label: 'International Space Station' };
  if (/^CSS\b|TIANGONG|TIANHE/.test(n)) return { kind: 'tiangong', label: 'Tiangong space station' };
  if (/^HST\b|^HUBBLE\b/.test(n)) return { kind: 'hubble', label: 'Hubble Space Telescope' };
  // Starlink V2 Mini satellites are numbered from 30000; the earlier ones are V1.0 and V1.5.
  const starlink = /^STARLINK-(\d+)/.exec(n);
  if (starlink) {
    return Number(starlink[1]) >= 30000
      ? { kind: 'starlink-v2', label: 'Starlink V2 Mini' }
      : { kind: 'starlink-v1', label: 'Starlink V1.5' };
  }
  if (/FLOCK|LEMUR|CUBESAT|\bDOVE\b/.test(n)) return { kind: 'cubesat', label: 'CubeSat' };
  if (m === 'Navigation' || /NAVSTAR|^GPS\b|GLONASS|GALILEO|BEIDOU|^QZS|IRNSS/.test(n)) {
    return { kind: 'gnss', label: 'Navigation satellite' };
  }
  if (/Weather|Observation|Science|Imaging|Recon|Classified/.test(m)) {
    return { kind: 'imaging', label: 'Earth-observation satellite' };
  }
  if (s.altKm > 30_000) return { kind: 'geo', label: 'Geostationary satellite' };
  if (s.category === 'comms' || /Comms/.test(m)) return { kind: 'comms', label: 'Communications satellite' };
  return { kind: 'generic', label: 'Satellite' };
}

/** A solar cell texture: cells shading from `a` to `b` on a thin grid, one cell per tile. */
function cellTexture(THREE: Three, a: string, b: string, line: string): ThreeNS.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = line;
  g.fillRect(0, 0, 64, 64);
  const cell = g.createLinearGradient(0, 0, 64, 64);
  cell.addColorStop(0, a);
  cell.addColorStop(1, b);
  g.fillStyle = cell;
  g.fillRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Crumpled foil: blotches of light and shade, used as a bump map so the gold catches the light unevenly. */
function crinkleTexture(THREE: Three): ThreeNS.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 128, 128);
  let s = 7;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const v = Math.round(60 + rand() * 140);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.moveTo(rand() * 128, rand() * 128);
    for (let j = 0; j < 3; j++) g.lineTo(rand() * 128, rand() * 128);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The shapes and surfaces every model is built from. */
function kit(THREE: Three) {
  const cells = cellTexture(THREE, '#203a73', '#0d1834', '#4a5262');
  const bronzeCells = cellTexture(THREE, '#b9772e', '#6e3f14', '#3b2a1c');
  const crinkle = crinkleTexture(THREE);
  const mats = {
    gold: new THREE.MeshStandardMaterial({ color: 0xf0bf55, metalness: 1, roughness: 0.26, bumpMap: crinkle, bumpScale: 3 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 1, roughness: 0.28 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, metalness: 0.05, roughness: 0.55 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.5, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24272d, metalness: 0.4, roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0, roughness: 0.9 }),
    cells: new THREE.MeshStandardMaterial({ map: cells, metalness: 0.55, roughness: 0.28 }),
    // The ISS's array blankets read bronze-orange in photographs.
    bronzeCells: new THREE.MeshStandardMaterial({ map: bronzeCells, metalness: 0.5, roughness: 0.35 }),
    cellBack: new THREE.MeshStandardMaterial({ color: 0x7d838b, metalness: 0.15, roughness: 0.75 }),
    dish: new THREE.MeshStandardMaterial({ color: 0xeeeeea, metalness: 0.05, roughness: 0.5, side: THREE.DoubleSide }),
  };
  type Mat = ThreeNS.Material;
  const place = <T extends ThreeNS.Object3D>(o: T, x = 0, y = 0, z = 0): T => { o.position.set(x, y, z); return o; };

  const box = (w: number, h: number, d: number, mat: Mat | Mat[], x = 0, y = 0, z = 0) =>
    place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);

  /** A cylinder along `axis`. */
  const cyl = (r: number, len: number, mat: Mat, axis: 'x' | 'y' | 'z' = 'y', x = 0, y = 0, z = 0, r2 = r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 28), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return place(m, x, y, z);
  };

  /** A flat array panel w (X) by h (Y), cells on +Z and the bare back on −Z, cells about 0.5 m. */
  const panel = (w: number, h: number, x = 0, y = 0, z = 0, cell = 0.5, face: Mat = mats.cells) => {
    const geo = new THREE.BoxGeometry(w, h, 0.05);
    const uv = geo.getAttribute('uv') as ThreeNS.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / cell), uv.getY(i) * (h / cell));
    const edge = mats.grey;
    return place(new THREE.Mesh(geo, [edge, edge, edge, edge, face, mats.cellBack]), x, y, z);
  };

  /**
   * A solar wing out along +X from x = 0: a yoke, then `n` panels of
   * `len` / `n` each, `width` tall.
   */
  const wing = (len: number, width: number, n: number, yoke = 0.6, cell = 0.5) => {
    const g = new THREE.Group();
    g.add(cyl(0.05, yoke, mats.silver, 'x', yoke / 2));
    const seg = len / n;
    for (let i = 0; i < n; i++) g.add(panel(seg - 0.06, width, yoke + seg * i + seg / 2, 0, 0, cell));
    return g;
  };

  /** A parabolic dish of radius r opening toward +Y, its rim at y = 0. */
  const dish = (r: number) => {
    const pts: ThreeNS.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = (r * i) / 12;
      pts.push(new THREE.Vector2(x, (x * x) / (4 * r * 1.1) - r / 4.4));
    }
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mats.dish);
  };

  /** A box whose faces carry array cells about `cell` metres across. */
  const cellBox = (w: number, h: number, d: number, cell: number) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.getAttribute('uv') as ThreeNS.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / cell), uv.getY(i) * (h / cell));
    return new THREE.Mesh(geo, [mats.cells, mats.cells, mats.grey, mats.grey, mats.cells, mats.cells]);
  };

  // add() with no arguments logs an error, so an empty group skips it.
  const group = (...parts: ThreeNS.Object3D[]) => { const g = new THREE.Group(); if (parts.length) g.add(...parts); return g; };
  const turn = <T extends ThreeNS.Object3D>(o: T, x = 0, y = 0, z = 0): T => { o.rotation.set(x, y, z); return o; };

  return { mats, box, cyl, panel, wing, dish, cellBox, group, turn, place, textures: [cells, bronzeCells, crinkle] };
}

type Kit = ReturnType<typeof kit>;

/** Two wings either side of a bus of half-width `half`, cells on the same side. */
function wings(k: Kit, half: number, len: number, width: number, n: number, yoke = 0.6, cell = 0.5) {
  const right = k.place(k.wing(len, width, n, yoke, cell), half);
  const left = k.place(k.turn(k.wing(len, width, n, yoke, cell), 0, 0, Math.PI), -half);
  return [right, left];
}

const BUILDERS: Record<SatModelKind, (k: Kit, THREE: Three, seed: number) => ThreeNS.Object3D> = {
  // Flat chassis with phased arrays underneath; two long arrays on a mast above.
  'starlink-v2': k => k.group(
    k.box(4.1, 0.3, 2.7, k.mats.dark),
    k.box(3.9, 0.06, 2.5, k.mats.white, 0, -0.18, 0),
    k.box(0.9, 0.04, 0.9, k.mats.grey, -1.2, -0.23, 0.6),
    k.box(0.9, 0.04, 0.9, k.mats.grey, 1.2, -0.23, -0.6),
    k.cyl(0.08, 1.2, k.mats.silver, 'y', 0, 0.75, 0),
    ...wings(k, 0.1, 12.5, 4.2, 6, 0.4).map(w => k.place(w, w.position.x, 3.45, 0)),
  ),
  // Flat chassis and a single array off one end.
  'starlink-v1': k => k.group(
    k.box(2.8, 0.25, 1.4, k.mats.dark),
    k.box(2.6, 0.05, 1.2, k.mats.white, 0, -0.15, 0),
    k.place(k.wing(8.1, 2.8, 4, 0.5), 1.4, 0, 0),
  ),
  iss: k => {
    const g = k.group();
    // The integrated truss, port to starboard: 109 m with the outer arrays at its ends.
    g.add(k.box(109, 2.2, 2.2, k.mats.silver, 0, 2.5, 0));
    // Eight array wings: one up and one down at four places along the truss.
    for (const x of [-48.6, -35, 35, 48.6]) {
      for (const dir of [1, -1]) {
        g.add(k.place(k.group(
          k.panel(4.6, 34, -3.5, 0, 0, 0.8, k.mats.bronzeCells),
          k.panel(4.6, 34, 3.5, 0, 0, 0.8, k.mats.bronzeCells),
          k.box(0.5, 34, 0.5, k.mats.silver),
        ), x, 2.5 + dir * 19, 0));
      }
    }
    // Radiators, white, off the middle of the truss.
    for (const x of [-22, 22]) g.add(k.box(3.2, 0.15, 22, k.mats.white, x, 1.2, -12));
    // Pressurised modules fore and aft beneath the truss, and the labs off the forward node.
    g.add(k.cyl(2.2, 22, k.mats.white, 'z', 0, 0, 10));
    g.add(k.cyl(2.1, 36, k.mats.white, 'z', 0, 0, -18));
    g.add(k.cyl(2.2, 8, k.mats.white, 'x', 5.5, 0, 18));
    g.add(k.cyl(2.2, 11, k.mats.white, 'x', -7, 0, 18));
    // The Russian segment's own arrays.
    g.add(...wings(k, 2.2, 13, 3, 3).map(w => k.place(w, w.position.x, 0, -32)));
    return g;
  },
  tiangong: k => {
    const g = k.group();
    // Tianhe, the core, with its node forward.
    g.add(k.cyl(2.1, 16.6, k.mats.white, 'z', 0, 0, -4));
    g.add(k.cyl(1.6, 3, k.mats.white, 'z', 0, 0, 5.6));
    // Wentian and Mengtian off the node, port and starboard.
    g.add(k.cyl(2.1, 17.9, k.mats.white, 'x', 10.4, 0, 5.6));
    g.add(k.cyl(2.1, 17.9, k.mats.white, 'x', -10.4, 0, 5.6));
    // Their long flexible arrays, up and down from the outer ends.
    for (const x of [16, -16]) {
      for (const dir of [1, -1]) {
        g.add(k.panel(4.2, 26, x, dir * 15.5, 5.6, 0.7));
        g.add(k.box(0.3, 26, 0.3, k.mats.silver, x, dir * 15.5, 5.5));
      }
    }
    // The core module's own wings, aft.
    g.add(...wings(k, 2.1, 11, 3, 3).map(w => k.place(w, w.position.x, 0, -10)));
    return g;
  },
  hubble: k => k.group(
    // Tube along X with the aperture at +X and its door open; the aft shroud wider.
    k.cyl(2.1, 9.6, k.mats.silver, 'x', 1.8),
    k.cyl(2.2, 3.6, k.mats.silver, 'x', -4.8),
    k.cyl(2.0, 0.05, k.mats.black, 'x', 6.62),
    k.place(k.turn(k.cyl(2.1, 0.12, k.mats.silver, 'x'), 0, 0, Math.PI / 2 + 0.9), 7.2, 2.0, 0),
    // Two 7.1 x 2.6 m arrays on masts either side, running along the tube, cells up.
    ...[1, -1].map(dir => k.group(
      k.cyl(0.06, 1.2, k.mats.silver, 'z', -0.8, 0, dir * 2.7),
      k.place(k.turn(k.panel(7.1, 2.6), -Math.PI / 2, 0, 0), -0.8, 0, dir * 4.6),
    )),
    // High-gain antennas on booms, above and below.
    ...[1, -1].map(dir => k.group(
      k.cyl(0.05, 2.4, k.mats.silver, 'y', 0.5, dir * 3.2, 0),
      k.place(k.turn(k.dish(0.65), dir === 1 ? 0 : Math.PI, 0, 0), 0.5, dir * 4.4, 0),
    )),
  ),
  gnss: k => {
    const g = k.group(
      k.box(2.0, 2.3, 1.9, k.mats.gold),
      // The navigation antenna array on the Earth face: a ring of helices.
      k.box(1.5, 0.08, 1.5, k.mats.white, 0, -1.19, 0),
      ...wings(k, 1.0, 5.2, 2.0, 2, 1.0),
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(k.cyl(0.09, 0.5, k.mats.white, 'y', Math.cos(a) * 0.55, -1.48, Math.sin(a) * 0.55));
    }
    return g;
  },
  // 3U: 10 x 10 x 34 cm, two deployed panels and a whip antenna.
  cubesat: k => k.group(
    k.cellBox(0.1, 0.34, 0.1, 0.05),
    k.place(k.panel(0.2, 0.32, 0, 0, 0, 0.05), 0.16, 0, 0),
    k.place(k.panel(0.2, 0.32, 0, 0, 0, 0.05), -0.16, 0, 0),
    k.cyl(0.004, 0.45, k.mats.silver, 'z', 0, 0.16, 0.27),
  ),
  imaging: k => k.group(
    k.box(2.2, 2.6, 2.0, k.mats.gold),
    // The camera, looking down, and a downlink dish.
    k.cyl(0.6, 1.4, k.mats.silver, 'y', 0.3, -1.9, 0),
    k.cyl(0.52, 0.04, k.mats.black, 'y', 0.3, -2.61, 0),
    k.place(k.turn(k.dish(0.35), Math.PI, 0, 0), -0.7, -1.5, 0.6),
    // One wing, off the shaded side.
    k.place(k.wing(7.5, 2.2, 3, 0.8), 1.1, 0.4, 0),
  ),
  geo: k => k.group(
    k.box(2.6, 3.4, 2.4, k.mats.gold),
    // Reflectors off the east and west faces, tipped toward the Earth, with
    // their feed horns on the Earth deck.
    k.place(k.turn(k.dish(1.2), Math.PI / 2 + 0.35, 0, 0), 0, -0.6, 2.2),
    k.place(k.turn(k.dish(1.2), -Math.PI / 2 - 0.35, 0, 0), 0, -0.6, -2.2),
    k.box(0.5, 0.6, 0.5, k.mats.white, 0, -2.0, 0.6),
    k.box(0.5, 0.6, 0.5, k.mats.white, 0, -2.0, -0.6),
    // A smaller dish on the Earth deck.
    k.place(k.turn(k.dish(0.45), Math.PI, 0, 0), 0.7, -1.8, 0),
    ...wings(k, 1.3, 14, 2.4, 4, 1.4),
  ),
  comms: k => k.group(
    k.box(1.0, 1.3, 1.0, k.mats.gold),
    k.box(0.7, 0.05, 0.7, k.mats.white, 0, -0.68, 0),
    k.place(k.turn(k.dish(0.3), Math.PI, 0, 0), 0, -0.85, 0),
    ...wings(k, 0.5, 4.2, 1.2, 3, 0.4, 0.3),
  ),
  // A spent stage: the tank, a dark band, the thrust structure and the engine bell.
  'rocket-body': k => k.group(
    k.cyl(1.5, 9, k.mats.white, 'x'),
    k.cyl(1.52, 1.2, k.mats.dark, 'x', 3.2),
    k.cyl(1.5, 0.6, k.mats.grey, 'x', -4.8, 0, 0, 1.2),
    k.cyl(0.45, 1.6, k.mats.dark, 'x', -5.9, 0, 0, 0.9),
  ),
  debris: (k, THREE, seed) => {
    // An irregular scrap of structure and foil, shaped by the NORAD number so
    // each piece keeps its own shape.
    let s = seed % 2147483646 || 1;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const geo = new THREE.IcosahedronGeometry(0.35, 1);
    const p = geo.getAttribute('position') as ThreeNS.BufferAttribute;
    const moved = new Map<string, [number, number, number]>();
    for (let i = 0; i < p.count; i++) {
      // Vertices shared between faces must move together, or the shape tears.
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!moved.has(key)) {
        const f = 0.55 + rand() * 0.9;
        moved.set(key, [p.getX(i) * f * 1.6, p.getY(i) * f * 0.6, p.getZ(i) * f]);
      }
      const [x, y, z] = moved.get(key)!;
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    const shard = k.turn(k.panel(0.5, 0.3, 0, 0, 0, 0.1), rand(), rand() * 3, rand());
    return k.group(new THREE.Mesh(geo, k.mats.gold), k.place(shard, 0.35, 0.12, 0.1));
  },
  generic: k => k.group(
    k.box(1.6, 1.8, 1.5, k.mats.gold),
    k.place(k.turn(k.dish(0.5), Math.PI, 0, 0), 0, -1.1, 0),
    ...wings(k, 0.8, 5, 1.6, 3, 0.6),
  ),
};

export interface BuiltModel {
  object: ThreeNS.Object3D;
  /** The longest extent, metres. */
  spanM: number;
  /** Frees the geometries, materials and textures. */
  dispose: () => void;
}

/** Builds one kind's model, centred on its bounding box. */
export function buildSatelliteModel(THREE: Three, kind: SatModelKind, seed = 1): BuiltModel {
  const k = kit(THREE);
  const inner = BUILDERS[kind](k, THREE, seed);
  const root = new THREE.Group();
  root.add(inner);
  const box = new THREE.Box3().setFromObject(inner);
  const centre = box.getCenter(new THREE.Vector3());
  inner.position.sub(centre);
  const size = box.getSize(new THREE.Vector3());
  return {
    object: root,
    spanM: Math.max(size.x, size.y, size.z),
    dispose: () => {
      root.traverse(o => { if ((o as ThreeNS.Mesh).isMesh) (o as ThreeNS.Mesh).geometry.dispose(); });
      for (const m of Object.values(k.mats)) m.dispose();
      for (const t of k.textures) t.dispose();
    },
  };
}

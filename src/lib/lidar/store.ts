'use client';

import { useSyncExternalStore } from 'react';
import type { DrawResult } from '@/lib/draw';
import {
  describeFlight, fetchElevationTiled, fromMerc, lidarFlightAt, M2_PER_ACRE, M3_TO_YD3, M_TO_FT, sampleProfile, usgsErrorText,
  type Bbox, type LidarFlight, type ProfileSample,
} from './usgs';
import {
  CUTFILL_RAMP, ELEVATION_RAMP, cellToLngLat, fieldStats, gridCorners, hillshade, lngLatToCell, MAX_FIELD_ACRES,
  planGrid, ramp, rasterizeRing, robustRange, type DemGrid, type FieldStats,
} from './grid';
import { analyseDrainage, chaikin, type Drainage } from './drainage';
import {
  designFor, designHeight, evaluate, fitPlane, labelSections, makeSection, sectionCells,
  type CutFill, type Design, type Section,
} from './cutfill';
import { contourSegments, smoothMasked } from './contours';
import { cachedElevationAt, reliefTileUrl, viewRange, type ReliefMode } from './relief-tiles';
import { boxAround, boxProblem, cutoutPath, describeBox, openCutoutTab, type CutoutWater, type LngLatBox } from '@/lib/cutout';

/**
 * State for the ArcGIS panel's terrain tools: map-wide lidar relief, the
 * elevation profile, and the field workbench (elevation, drainage, cut/fill)
 * with its 3D rain view. A module store rather than component state, because
 * the panel unmounts when it closes and the field on the map must not.
 */

export type FieldMode = 'elevation' | 'drainage' | 'cutfill';
export type Detail = 'fine' | 'normal' | 'main';
export const DETAIL_ACRES: Record<Detail, number> = { fine: 0.25, normal: 1, main: 5 };
export const CONTOUR_STEPS_FT = [0.1, 0.2, 0.25, 0.5, 1];

export interface SectionState { section: Section; design: Design; result: CutFill }

export interface CutFillState {
  ratio: number;
  splits: [number, number][][];
  labels: Int32Array | null;
  sections: SectionState[];
  selected: number;
  intervalFt: number;
  showExisting: boolean;
  showDesign: boolean;
  /** Earlier designs, newest last, for the undo button. */
  history: Design[][];
}

export interface FieldState {
  ring: [number, number][];
  status: 'loading' | 'ready' | 'error';
  progress: [number, number];
  error?: string;
  grid?: DemGrid;
  mask?: Uint8Array;
  stats?: FieldStats;
  flight?: LidarFlight | null;
  mode: FieldMode;
  opacity: number;
  detail: Detail;
  drainage?: Drainage;
  cutfill?: CutFillState;
  busy?: string;
  /** Elevation colour stretch, metres. */
  range?: [number, number];
}

export interface ProfileState {
  coords: [number, number][];
  status: 'loading' | 'ready' | 'error';
  error?: string;
  samples: ProfileSample[];
  hover: number | null;
}

export interface ReliefState {
  mode: ReliefMode;
  /** 0 hides the layer. */
  opacity: number;
  az: number;
  alt: number;
  ex: number;
  stretch: [number, number] | null;
  /** Colour modes wait for the view's stretch; this says how that is going. */
  fitting: 'loading' | 'failed' | null;
}

export type DrawPurpose = 'field' | 'profile' | 'split' | 'cutout';

/** A box lifted out of the map onto its own page (see /cutout). */
export interface CutoutState {
  box: LngLatBox;
  /** "2.4 × 1.6 km" */
  label: string;
  /** The page's address, or '' when the box cannot be cut out. */
  path: string;
  /** Whether the browser let us open the tab; a blocked pop-up leaves the button. */
  opened: boolean;
  error?: string;
}

export interface LidarState {
  /** Which tab the ArcGIS panel shows; terrain work switches it to terrain. */
  tab: 'layers' | 'terrain';
  relief: ReliefState;
  coverage: { text: string; covered: boolean } | null;
  drawing: DrawPurpose | null;
  profile: ProfileState | null;
  field: FieldState | null;
  cutout: CutoutState | null;
  view3d: boolean;
  overlay: LidarMapOverlay;
}

export interface LidarMapOverlay {
  relief: { url: string; opacity: number } | null;
  image: { url: string; coordinates: [number, number][]; opacity: number } | null;
  /** Field outline, corners, flow paths, outlets, contours, splits, slope arrows. */
  field: GeoJSON.FeatureCollection;
  /** Profile line and the point under the chart cursor — changes on every hover. */
  profile: GeoJSON.FeatureCollection;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

let state: LidarState = {
  tab: 'layers',
  relief: { mode: 'hillshade', opacity: 0, az: 315, alt: 45, ex: 3, stretch: null, fitting: null },
  coverage: null,
  drawing: null,
  profile: null,
  field: null,
  cutout: null,
  view3d: false,
  overlay: { relief: null, image: null, field: EMPTY, profile: EMPTY },
};

const listeners = new Set<() => void>();
let fieldImage: { key: string; url: string } | null = null;
let fieldVectors: { key: string; features: GeoJSON.Feature[] } | null = null;

function set(patch: Partial<LidarState>) {
  state = { ...state, ...patch };
  state.overlay = buildOverlay(state);
  listeners.forEach(l => l());
}

function setField(patch: Partial<FieldState>) {
  if (!state.field) return;
  set({ field: { ...state.field, ...patch } });
}

export const lidarStore = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useLidar(): LidarState {
  return useSyncExternalStore(lidarStore.subscribe, lidarStore.get, lidarStore.get);
}

const yield0 = () => new Promise(r => setTimeout(r, 0));
export const ft = (m: number) => m * M_TO_FT;
export const acres = (m2: number) => m2 / M2_PER_ACRE;
export const yd3 = (m3: number) => m3 * M3_TO_YD3;

export function setTab(tab: LidarState['tab']) { if (state.tab !== tab) set({ tab }); }

/* ───────────────────────────── Relief ───────────────────────────── */

export function setRelief(patch: Partial<ReliefState>) {
  set({ relief: { ...state.relief, ...patch }, ...(patch.opacity ? { tab: 'terrain' as const } : {}) });
  if (patch.mode || patch.opacity) void refreshStretch();
}

let viewBox: Bbox | null = null;
let viewTimer: ReturnType<typeof setTimeout> | null = null;
let viewAbort: AbortController | null = null;

/** The panel reports the map view; relief colours and the coverage line follow it. */
export function setView(bounds: { west: number; south: number; east: number; north: number } | null) {
  if (!bounds) return;
  const R = 6378137;
  const mx = (lng: number) => (lng * Math.PI / 180) * R;
  const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI / 180) / 2)) * R;
  viewBox = [mx(bounds.west), my(bounds.south), mx(bounds.east), my(bounds.north)];
  if (viewTimer) clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    void refreshStretch();
    void refreshCoverage((bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2);
  }, 600);
}

async function refreshStretch() {
  const { relief } = state;
  if (!viewBox || relief.opacity <= 0 || (relief.mode !== 'color' && relief.mode !== 'tinted')) return;
  viewAbort?.abort();
  const ctl = (viewAbort = new AbortController());
  if (!state.relief.stretch) set({ relief: { ...state.relief, fitting: 'loading' } });
  try {
    const range = await viewRange(viewBox, ctl.signal);
    if (ctl.signal.aborted) return;
    if (!range) { set({ relief: { ...state.relief, fitting: state.relief.stretch ? null : 'failed' } }); return; }
    const old = state.relief.stretch;
    // Only re-render when the stretch actually moves, or tiles flicker on every pan.
    const span = range[1] - range[0];
    if (old && Math.abs(old[0] - range[0]) < span * 0.08 && Math.abs(old[1] - range[1]) < span * 0.08) {
      if (state.relief.fitting) set({ relief: { ...state.relief, fitting: null } });
      return;
    }
    set({ relief: { ...state.relief, stretch: range, fitting: null } });
  } catch {
    // Keep the last stretch if there is one; without one, say so and try again on the next move.
    if (!ctl.signal.aborted) set({ relief: { ...state.relief, fitting: state.relief.stretch ? null : 'failed' } });
  }
}

/** Try the view's colour stretch again after it failed. */
export function retryStretch() { void refreshStretch(); }

let coverageAbort: AbortController | null = null;
async function refreshCoverage(lng: number, lat: number) {
  coverageAbort?.abort();
  const ctl = (coverageAbort = new AbortController());
  try {
    const f = await lidarFlightAt(lng, lat, ctl.signal);
    if (ctl.signal.aborted) return;
    set({ coverage: f ? { text: `Lidar ${describeFlight(f).replace(/^Flown/, 'flown')}`, covered: true } : { text: 'No USGS lidar flight here', covered: false } });
  } catch { /* leave the last line up */ }
}

/* ───────────────────────────── Drawing ───────────────────────────── */

export function startDraw(purpose: DrawPurpose) { set({ drawing: purpose }); }
export function cancelDraw() { if (state.drawing) set({ drawing: null }); }

/** Page routes a finished map drawing here while one of our tools armed it. */
export function completeDraw(result: DrawResult) {
  const purpose = state.drawing;
  set({ drawing: null });
  const coords = result.coords.map(([lng, lat]) => [lng, lat] as [number, number]);
  if (purpose === 'field') void loadField(coords);
  else if (purpose === 'profile') void loadProfile(coords);
  else if (purpose === 'split') addSplit(coords);
  else if (purpose === 'cutout') makeCutout(boxAround(coords));
}

/* ───────────────────────────── Cut-out ───────────────────────────── */

/**
 * Lift a box out of the map into its own tab; `open` false only records it.
 * `water` opens it with rain running, the flow paths, or a water level.
 */
export function makeCutout(box: LngLatBox, open = true, water: CutoutWater | null = null): CutoutState {
  const label = describeBox(box);
  const error = boxProblem(box);
  const cutout: CutoutState = error
    ? { box, label, path: '', opened: false, error }
    : { box, label, path: cutoutPath(box, water), opened: open && openCutoutTab(box, water) };
  set({ cutout, tab: 'terrain' });
  return cutout;
}
export function reopenCutout(water: CutoutWater | null = null) {
  const c = state.cutout;
  if (c?.path) set({ cutout: { ...c, opened: openCutoutTab(c.box, water) } });
}
export function clearCutout() { if (state.cutout) set({ cutout: null }); }

/* ───────────────────────────── Profile ───────────────────────────── */

/** Run the last profile or field again after USGS failed it. */
export function retryProfile() { if (state.profile) void loadProfile(state.profile.coords); }
export function retryField() { if (state.field) void loadField(state.field.ring); }

async function loadProfile(coords: [number, number][]) {
  set({ profile: { coords, status: 'loading', samples: [], hover: null }, tab: 'terrain' });
  try {
    const samples = await sampleProfile(coords, 500);
    if (state.profile?.coords !== coords) return;
    if (!samples.some(s => s.z !== null)) throw new Error('No USGS elevation along this line');
    set({ profile: { coords, status: 'ready', samples, hover: null } });
  } catch (e) {
    if (state.profile?.coords !== coords) return;
    set({ profile: { coords, status: 'error', error: usgsErrorText(e, 'Profile failed'), samples: [], hover: null } });
  }
}

export function setProfileHover(i: number | null) {
  if (state.profile && state.profile.hover !== i) set({ profile: { ...state.profile, hover: i } });
}
export function clearProfile() { set({ profile: null }); }

/* ───────────────────────────── Field ───────────────────────────── */

let fieldSeq = 0;
let fieldAbort: AbortController | null = null;

async function loadField(ring: [number, number][]) {
  fieldAbort?.abort();
  const ctl = (fieldAbort = new AbortController());
  const seq = ++fieldSeq;
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
  set({ field: { ring: closed, status: 'loading', progress: [0, 1], mode: 'elevation', opacity: 0.75, detail: 'normal' }, view3d: false, tab: 'terrain' });
  try {
    const plan = planGrid(closed);
    const ringCells = closed.map(([lng, lat]) => lngLatToCell(plan, lng, lat));
    const mask0 = rasterizeRing(plan.w, plan.h, ringCells);
    let n = 0; for (const m of mask0) n += m;
    if (acres(n * plan.ground ** 2) > MAX_FIELD_ACRES) throw new Error(`Area is ${Math.round(acres(n * plan.ground ** 2)).toLocaleString()} ac — draw ${MAX_FIELD_ACRES.toLocaleString()} ac or less`);
    if (n < 16) throw new Error('Area is too small — draw at least a few corners around a field');
    const flightP = (() => { const [lng, lat] = cellToLngLat(plan, plan.w / 2, plan.h / 2); return lidarFlightAt(lng, lat, ctl.signal).catch(() => null); })();
    const z = await fetchElevationTiled(plan.bbox, plan.w, plan.h, (d, t) => { if (seq === fieldSeq) setField({ progress: [d, t] }); }, ctl.signal);
    if (seq !== fieldSeq) return;
    const grid: DemGrid = { ...plan, z };
    const mask = mask0;
    const stats = fieldStats(grid, mask);
    if (stats.cells < 16) throw new Error('No USGS lidar under this area');
    const flight = await flightP;
    if (seq !== fieldSeq) return;
    setField({ status: 'ready', grid, mask, stats, flight, range: robustRange(z, mask) });
  } catch (e) {
    if (seq !== fieldSeq || ctl.signal.aborted) return;
    setField({ status: 'error', error: usgsErrorText(e, 'Lidar download failed') });
  }
}

export function clearField() {
  fieldAbort?.abort();
  fieldSeq++;
  set({ field: null, view3d: false, drawing: state.drawing === 'split' ? null : state.drawing });
}

export function setFieldOpacity(opacity: number) { setField({ opacity }); }

export async function setFieldMode(mode: FieldMode) {
  const f = state.field;
  if (!f || f.status !== 'ready') return;
  setField({ mode });
  if (mode === 'drainage' && !f.drainage) await runDrainage(f.detail);
  if (mode === 'cutfill' && !f.cutfill) await initCutFill();
}

export async function setDetail(detail: Detail) {
  setField({ detail });
  await runDrainage(detail);
}

async function runDrainage(detail: Detail) {
  const f = state.field;
  if (!f?.grid || !f.mask) return;
  setField({ busy: 'Tracing drainage…' });
  await yield0();
  const g = f.grid;
  const drainage = analyseDrainage(g, f.mask, {
    streamCells: Math.max(8, Math.round(DETAIL_ACRES[detail] * M2_PER_ACRE / (g.ground * g.ground))),
    outletMinCells: Math.max(8, Math.round(Math.max(0.25 * M2_PER_ACRE, (f.stats?.areaM2 ?? 0) * 0.02) / (g.ground * g.ground))),
  });
  if (state.field?.grid !== g) return;
  setField({ drainage, busy: undefined });
}

/* ───────────────────────────── Cut / fill ───────────────────────────── */

function buildSections(f: FieldState, splits: [number, number][][], ratio: number): { labels: Int32Array | null; sections: SectionState[] } {
  const g = f.grid!, mask = f.mask!;
  let groups: Int32Array[];
  let labels: Int32Array | null = null;
  if (splits.length) {
    const lines = splits.map(line => line.map(([lng, lat]) => lngLatToCell(g, lng, lat)));
    const res = labelSections(g, mask, lines);
    labels = res.labels;
    groups = sectionCells(res.labels, res.count);
  } else {
    let n = 0; for (const m of mask) n += m;
    const all = new Int32Array(n);
    let k = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) all[k++] = i;
    groups = [all];
  }
  const sections = groups.filter(c => c.length).map(cells => {
    const section = makeSection(g, cells);
    const fit = fitPlane(g, section);
    const design = designFor(g, section, round3(fit.slopePct), round1(fit.headingDeg), ratio);
    return { section, design, result: evaluate(g, section, design) };
  });
  return { labels, sections };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round1 = (v: number) => Math.round(v * 10) / 10;

async function initCutFill() {
  const f = state.field;
  if (!f?.grid) return;
  setField({ busy: 'Fitting the best plane…' });
  await yield0();
  const ratio = 1.2;
  const { labels, sections } = buildSections(f, [], ratio);
  setField({ busy: undefined, cutfill: { ratio, splits: [], labels, sections, selected: 0, intervalFt: 0.2, showExisting: true, showDesign: true, history: [] } });
}

function updateCutFill(patch: Partial<CutFillState>) {
  const f = state.field;
  if (!f?.cutfill) return;
  setField({ cutfill: { ...f.cutfill, ...patch } });
}

function withHistory(cf: CutFillState): Design[][] {
  return [...cf.history.slice(-19), cf.sections.map(s => s.design)];
}

/** Re-fit one section (or all, with -1) to its own least-squares plane. */
export function bestFit(index: number) {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf) return;
  const g = f.grid;
  const sections = cf.sections.map((s, k) => {
    if (index >= 0 && k !== index) return s;
    const fit = fitPlane(g, s.section);
    const design = designFor(g, s.section, round3(fit.slopePct), round1(fit.headingDeg), cf.ratio);
    return { ...s, design, result: evaluate(g, s.section, design) };
  });
  updateCutFill({ sections, history: withHistory(cf) });
}

export function setDesign(index: number, slopePct: number, headingDeg: number) {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf || !cf.sections[index]) return;
  if (!(slopePct >= 0 && slopePct < 100) || !Number.isFinite(headingDeg)) return;
  const g = f.grid;
  const s = cf.sections[index];
  const design = designFor(g, s.section, slopePct, ((headingDeg % 360) + 360) % 360, cf.ratio);
  const sections = cf.sections.map((x, k) => k === index ? { ...x, design, result: evaluate(g, x.section, design) } : x);
  updateCutFill({ sections, history: withHistory(cf) });
}

export function undoDesign() {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf || !cf.history.length) return;
  const prev = cf.history[cf.history.length - 1];
  if (prev.length !== cf.sections.length) { updateCutFill({ history: cf.history.slice(0, -1) }); return; }
  const g = f.grid;
  const sections = cf.sections.map((s, k) => ({ ...s, design: prev[k], result: evaluate(g, s.section, prev[k]) }));
  updateCutFill({ sections, history: cf.history.slice(0, -1) });
}

export function setRatio(ratio: number) {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf || !(ratio >= 0.5 && ratio <= 3)) return;
  const g = f.grid;
  const sections = cf.sections.map(s => {
    const design = designFor(g, s.section, s.design.slopePct, s.design.headingDeg, ratio);
    return { ...s, design, result: evaluate(g, s.section, design) };
  });
  updateCutFill({ ratio, sections });
}

export function selectSection(selected: number) { updateCutFill({ selected }); }
export function setContours(patch: Partial<Pick<CutFillState, 'intervalFt' | 'showExisting' | 'showDesign'>>) { updateCutFill(patch); }

function addSplit(line: [number, number][]) {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf || line.length < 2) return;
  const splits = [...cf.splits, line];
  const { labels, sections } = buildSections(f, splits, cf.ratio);
  updateCutFill({ splits, labels, sections, selected: Math.min(cf.selected, sections.length - 1), history: [] });
}

export function removeSplits() {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf) return;
  const { labels, sections } = buildSections(f, [], cf.ratio);
  updateCutFill({ splits: [], labels, sections, selected: 0, history: [] });
}

export interface CutFillTotals { cutYd3: number; fillYd3: number; acres: number; cutPerAcre: number; ratio: number; maxCutFt: number; maxFillFt: number }

export function totals(cf: CutFillState): CutFillTotals {
  let cut = 0, fill = 0, area = 0, maxCut = 0, maxFill = 0;
  for (const s of cf.sections) {
    cut += s.result.cutM3; fill += s.result.fillM3; area += s.section.areaM2;
    maxCut = Math.max(maxCut, s.result.maxCutM); maxFill = Math.max(maxFill, s.result.maxFillM);
  }
  const ac = acres(area);
  return { cutYd3: yd3(cut), fillYd3: yd3(fill), acres: ac, cutPerAcre: ac ? yd3(cut) / ac : 0, ratio: fill ? cut / fill : 0, maxCutFt: ft(maxCut), maxFillFt: ft(maxFill) };
}

/** Design surface in metres for every field cell (NaN elsewhere). */
export function designSurface(f: FieldState): Float32Array | null {
  const g = f.grid, cf = f.cutfill;
  if (!g || !cf) return null;
  const out = new Float32Array(g.w * g.h).fill(NaN);
  for (const s of cf.sections) {
    for (let k = 0; k < s.section.cells.length; k++) {
      const i = s.section.cells[k];
      out[i] = designHeight(g, s.section, s.design, i);
    }
  }
  return out;
}

/* ───────────────────────────── 3D ───────────────────────────── */

export function open3d() { if (state.field?.status === 'ready') set({ view3d: true }); }
export function close3d() { set({ view3d: false }); }

/* ───────────────────────────── Map overlay ───────────────────────────── */

function buildOverlay(s: LidarState): LidarMapOverlay {
  // Colour modes wait for the view's stretch rather than colouring each tile on its own.
  const colour = s.relief.mode === 'tinted' || s.relief.mode === 'color';
  const relief = s.relief.opacity > 0 && !(colour && !s.relief.stretch)
    ? { url: reliefTileUrl({ mode: s.relief.mode, az: s.relief.az, alt: s.relief.alt, ex: s.relief.ex, lo: s.relief.stretch?.[0], hi: s.relief.stretch?.[1] }), opacity: s.relief.opacity }
    : null;
  const features: GeoJSON.Feature[] = [];
  const profile: GeoJSON.Feature[] = [];
  let image: LidarMapOverlay['image'] = null;
  const f = s.field;
  if (f) {
    const ring = f.ring;
    features.push({ type: 'Feature', properties: { kind: 'outline' }, geometry: { type: 'LineString', coordinates: ring } });
    ring.slice(0, -1).forEach((p, k) => features.push({ type: 'Feature', properties: { kind: 'vertex', label: String(k + 1) }, geometry: { type: 'Point', coordinates: p } }));
    if (f.status === 'ready' && f.grid && f.mask) {
      const img = fieldOverlayImage(f);
      if (img) image = { url: img, coordinates: gridCorners(f.grid), opacity: f.opacity };
      features.push(...fieldVectorFeatures(f));
    }
  }
  if (s.cutout && !s.cutout.error) {
    const [w, so, e, n] = s.cutout.box;
    features.push({ type: 'Feature', properties: { kind: 'cutout' }, geometry: { type: 'LineString', coordinates: [[w, so], [e, so], [e, n], [w, n], [w, so]] } });
  }
  const p = s.profile;
  if (p) {
    profile.push({ type: 'Feature', properties: { kind: 'profile' }, geometry: { type: 'LineString', coordinates: p.coords } });
    if (p.hover !== null && p.samples[p.hover]) {
      const h = p.samples[p.hover];
      profile.push({ type: 'Feature', properties: { kind: 'profile-cursor', label: h.z !== null ? `${ft(h.z).toFixed(1)} ft` : '' }, geometry: { type: 'Point', coordinates: [h.lng, h.lat] } });
    }
  }
  // Keep each part's identity when it has not changed, so the map only
  // redraws what did: a chart hover must not re-upload a field's contours.
  const prev = state?.overlay;
  const same = <T,>(a: T | null | undefined, b: T | null, eq: (x: T, y: T) => boolean) => (a && b && eq(a, b) ? a : b);
  const next: LidarMapOverlay = {
    relief: same(prev?.relief, relief, (a, b) => a.url === b.url && a.opacity === b.opacity),
    image: same(prev?.image, image, (a, b) => a.url === b.url && a.opacity === b.opacity),
    field: prev && sameFeatures(prev.field.features, features) ? prev.field : { type: 'FeatureCollection', features },
    profile: prev && sameFeatures(prev.profile.features, profile) ? prev.profile : { type: 'FeatureCollection', features: profile },
  };
  if (prev && next.relief === prev.relief && next.image === prev.image && next.field === prev.field && next.profile === prev.profile) return prev;
  return next;
}

function sameFeatures(a: GeoJSON.Feature[], b: GeoJSON.Feature[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  return true;
}

function imageKey(f: FieldState): string {
  const cf = f.cutfill;
  return [f.mode, f.grid?.bbox.join(','), f.drainage ? f.detail : '', cf && f.mode === 'cutfill' ? cf.sections.map(s => `${s.design.slopePct},${s.design.headingDeg},${s.design.base.toFixed(4)}`).join(';') : ''].join('|');
}

function fieldOverlayImage(f: FieldState): string | null {
  if (typeof document === 'undefined') return null;
  const key = imageKey(f);
  if (fieldImage?.key === key) return fieldImage.url;
  const g = f.grid!, mask = f.mask!;
  const canvas = document.createElement('canvas');
  canvas.width = g.w; canvas.height = g.h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(g.w, g.h);
  const px = img.data;
  const [lo, hi] = f.range ?? [0, 1];
  let design: Float32Array | null = null;
  let span = 1;
  if (f.mode === 'cutfill' && f.cutfill) {
    design = designSurface(f);
    const diffs: number[] = [];
    for (let i = 0; i < mask.length; i += 7) if (mask[i] && design && Number.isFinite(design[i])) diffs.push(Math.abs(g.z[i] - design[i]));
    diffs.sort((a, b) => a - b);
    span = Math.max(0.02, diffs[Math.floor(diffs.length * 0.99)] ?? 0.3);
  }
  const pond = f.mode === 'drainage' ? f.drainage?.pond : undefined;
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    if (!mask[i]) continue;
    let rgb: [number, number, number];
    if (design) {
      rgb = ramp(CUTFILL_RAMP, 0.5 + (g.z[i] - design[i]) / (2 * span));
    } else {
      const base = ramp(ELEVATION_RAMP, (g.z[i] - lo) / (hi - lo));
      const k = 0.72 + 0.28 * hillshade(g, i, 6);
      rgb = [base[0] * k, base[1] * k, base[2] * k];
      if (pond && pond[i] > 0) {
        const a = Math.min(0.85, 0.35 + pond[i] / 0.15);
        rgb = [rgb[0] * (1 - a) + 90 * a, rgb[1] * (1 - a) + 200 * a, rgb[2] * (1 - a) + 255 * a];
      }
    }
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  fieldImage = { key, url };
  return url;
}

function vectorKey(f: FieldState): string {
  const cf = f.cutfill;
  return [imageKey(f), cf ? `${cf.intervalFt},${cf.showExisting},${cf.showDesign},${cf.selected},${cf.splits.length}` : '', f.drainage?.streams.length ?? ''].join('|');
}

function fieldVectorFeatures(f: FieldState): GeoJSON.Feature[] {
  const key = vectorKey(f);
  if (fieldVectors?.key === key) return fieldVectors.features;
  const g = f.grid!, mask = f.mask!;
  const out: GeoJSON.Feature[] = [];
  const toLL = (c: number, r: number) => cellToLngLat(g, c, r);
  if (f.mode === 'drainage' && f.drainage) {
    const d = f.drainage;
    const cellAc = acres(g.ground * g.ground);
    for (const s of d.streams) {
      out.push({ type: 'Feature', properties: { kind: 'stream', ac: +(s.acc * cellAc).toFixed(2) }, geometry: { type: 'LineString', coordinates: chaikin(s.cells).map(([c, r]) => toLL(c, r)) } });
    }
    for (const o of d.outlets) {
      out.push({ type: 'Feature', properties: { kind: 'outlet', label: `${acres(o.areaM2).toFixed(1)} ac` }, geometry: { type: 'Point', coordinates: toLL(o.c, o.r) } });
    }
  }
  if (f.mode === 'cutfill' && f.cutfill) {
    const cf = f.cutfill;
    const big = g.w * g.h > 700_000 ? 2 : 1;
    if (cf.showExisting) {
      const zft = new Float32Array(g.z.length);
      for (let i = 0; i < zft.length; i++) zft[i] = g.z[i] * M_TO_FT;
      const smooth = smoothMasked(zft, g.w, g.h, mask);
      for (const lvl of contourSegments(smooth, g.w, g.h, mask, cf.intervalFt, big)) {
        out.push({ type: 'Feature', properties: { kind: 'contour-existing', level: lvl.level }, geometry: { type: 'MultiLineString', coordinates: lvl.segments.map(sg => sg.map(([c, r]) => toLL(c, r))) } });
      }
    }
    if (cf.showDesign) {
      const d = designSurface(f);
      if (d) {
        for (let i = 0; i < d.length; i++) d[i] *= M_TO_FT;
        for (const lvl of contourSegments(d, g.w, g.h, mask, cf.intervalFt, big)) {
          out.push({ type: 'Feature', properties: { kind: 'contour-design', level: lvl.level }, geometry: { type: 'MultiLineString', coordinates: lvl.segments.map(sg => sg.map(([c, r]) => toLL(c, r))) } });
        }
      }
    }
    for (const line of cf.splits) out.push({ type: 'Feature', properties: { kind: 'split' }, geometry: { type: 'LineString', coordinates: line } });
    cf.sections.forEach((s, k) => {
      const { oc, or } = s.section;
      const hr = s.design.headingDeg * Math.PI / 180;
      const len = Math.sqrt(s.section.cells.length) * 0.18;
      const tail: [number, number] = [oc - Math.sin(hr) * len / 2, or + Math.cos(hr) * len / 2];
      const tip: [number, number] = [oc + Math.sin(hr) * len / 2, or - Math.cos(hr) * len / 2];
      const wing = len * 0.28;
      const back = (a: number): [number, number] => [tip[0] - Math.sin(hr + a) * wing, tip[1] + Math.cos(hr + a) * wing];
      const name = cf.sections.length > 1 ? `S${k + 1} · ` : '';
      out.push({ type: 'Feature', properties: { kind: 'arrow', selected: k === cf.selected }, geometry: { type: 'MultiLineString', coordinates: [[toLL(...tail), toLL(...tip)], [toLL(...back(0.5)), toLL(...tip), toLL(...back(-0.5))]] } });
      out.push({ type: 'Feature', properties: { kind: 'arrow-label', label: `${name}${s.design.slopePct.toFixed(2)}%`, selected: k === cf.selected }, geometry: { type: 'Point', coordinates: toLL(oc, or) } });
    });
  }
  fieldVectors = { key, features: out };
  return out;
}

/* ───────────────────────────── Exports ───────────────────────────── */

function download(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Points about 10 ft apart: dense enough for a land-levelling job, small enough to open. */
export function exportCsv(kind: 'existing' | 'design') {
  const f = state.field;
  if (!f?.grid || !f.mask) return;
  const g = f.grid, mask = f.mask;
  const design = kind === 'design' ? designSurface(f) : null;
  if (kind === 'design' && !design) return;
  const step = Math.max(1, Math.round(3.048 / g.ground));
  const rows = [kind === 'design' ? 'point,latitude,longitude,existing_ft,design_ft,cut_fill_ft' : 'point,latitude,longitude,elevation_ft'];
  let n = 0;
  for (let r = 0; r < g.h; r += step) for (let c = 0; c < g.w; c += step) {
    const i = r * g.w + c;
    if (!mask[i]) continue;
    const [lng, lat] = cellToLngLat(g, c + 0.5, r + 0.5);
    const e = ft(g.z[i]);
    n++;
    if (design) {
      const d = ft(design[i]);
      rows.push(`${n},${lat.toFixed(7)},${lng.toFixed(7)},${e.toFixed(2)},${d.toFixed(2)},${(e - d).toFixed(2)}`);
    } else rows.push(`${n},${lat.toFixed(7)},${lng.toFixed(7)},${e.toFixed(2)}`);
  }
  download(`osiris-field-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, rows.join('\n'), 'text/csv');
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/** A printable report in a new window; the browser's Save as PDF does the rest. */
export function openReport() {
  const f = state.field;
  const cf = f?.cutfill;
  if (!f?.grid || !cf || !f.stats) return;
  const t = totals(cf);
  const g = f.grid;
  const [lng, lat] = cellToLngLat(g, g.w / 2, g.h / 2);
  const map = fieldImage?.url ?? '';
  const rows = cf.sections.map((s, k) => {
    const ac = acres(s.section.areaM2);
    return `<tr><td>S${k + 1}</td><td>${ac.toFixed(1)}</td><td>${Math.round(yd3(s.result.cutM3)).toLocaleString()}</td><td>${Math.round(yd3(s.result.fillM3)).toLocaleString()}</td><td>${ac ? Math.round(yd3(s.result.cutM3) / ac) : 0}</td><td>${s.design.slopePct.toFixed(3)}%</td><td>${s.design.headingDeg.toFixed(1)}°</td><td>${ft(s.design.base).toFixed(2)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>OSIRIS — Field cut/fill report</title><style>
  @page{size:letter;margin:14mm}body{font:12px/1.45 "JetBrains Mono",ui-monospace,Menlo,monospace;color:#111;margin:0}
  h1{font:600 22px Georgia,"Times New Roman",serif;margin:0 0 2px}.sub{color:#555;margin-bottom:14px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#777}.v{font-size:16px;font-weight:700}
  .cut{color:#b21e1e}.fill{color:#1c4fb0}table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border-bottom:1px solid #ddd;padding:5px 6px;text-align:right}th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#666}td:first-child,th:first-child{text-align:left}
  img{width:100%;max-height:420px;object-fit:contain;border:1px solid #ccc;background:#f4f4f4;margin-top:12px}.foot{margin-top:16px;color:#777;font-size:10px}</style></head><body>
  <h1>Field cut &amp; fill</h1><div class="sub">${lat.toFixed(5)}, ${lng.toFixed(5)} · ${new Date().toLocaleDateString()} · ${esc(f.flight ? `${describeFlight(f.flight)} · ${f.flight.project}` : 'USGS 3DEP')}</div>
  <div class="grid"><div><div class="k">Area</div><div class="v">${t.acres.toFixed(2)} ac</div></div><div><div class="k">Cut</div><div class="v cut">${Math.round(t.cutYd3).toLocaleString()} yd³</div></div><div><div class="k">Fill</div><div class="v fill">${Math.round(t.fillYd3).toLocaleString()} yd³</div></div><div><div class="k">Cut : fill</div><div class="v">${t.ratio.toFixed(2)}</div></div>
  <div><div class="k">Cut per acre</div><div class="v">${Math.round(t.cutPerAcre)} yd³/ac</div></div><div><div class="k">Max cut</div><div class="v cut">${t.maxCutFt.toFixed(2)} ft</div></div><div><div class="k">Max fill</div><div class="v fill">${t.maxFillFt.toFixed(2)} ft</div></div><div><div class="k">Relief</div><div class="v">${ft(f.stats.maxZ - f.stats.minZ).toFixed(2)} ft</div></div></div>
  <table><thead><tr><th>Section</th><th>Acres</th><th>Cut yd³</th><th>Fill yd³</th><th>yd³/ac</th><th>Slope</th><th>Heading</th><th>Centre ft</th></tr></thead><tbody>${rows}</tbody></table>
  ${map ? `<img src="${map}" alt="Cut and fill map: red is cut, blue is fill">` : ''}
  <div class="foot">Elevation: USGS 3D Elevation Program, ${g.ground.toFixed(2)} m cells. Target cut:fill ${cf.ratio.toFixed(2)}. Red is cut, blue is fill. Generated by OSIRIS.</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/** Centre of the field, for the 3D view's caption and the report. */
export function fieldCentre(f: FieldState): [number, number] | null {
  if (!f.grid) return null;
  const [minx, miny, maxx, maxy] = f.grid.bbox;
  return fromMerc((minx + maxx) / 2, (miny + maxy) / 2);
}

/* ───────────────────────────── Cursor elevation ───────────────────────────── */

/* Kept out of the main state: it changes on every mouse move, and only the
   one readout that shows it should re-render. */
let cursor: { lng: number; lat: number; m: number } | null = null;
const cursorListeners = new Set<() => void>();

export function setCursor(lng: number, lat: number) {
  const s = state;
  if (!s.field && s.relief.opacity <= 0) { if (cursor) { cursor = null; cursorListeners.forEach(l => l()); } return; }
  let m: number | null = null;
  const g = s.field?.grid;
  if (g) {
    const [c, r] = lngLatToCell(g, lng, lat);
    const ci = Math.floor(c), ri = Math.floor(r);
    if (ci >= 0 && ri >= 0 && ci < g.w && ri < g.h) { const v = g.z[ri * g.w + ci]; if (Number.isFinite(v)) m = v; }
  }
  if (m === null) m = cachedElevationAt(lng, lat);
  const next = m === null ? null : { lng, lat, m };
  if (next?.m === cursor?.m && !!next === !!cursor) return;
  cursor = next;
  cursorListeners.forEach(l => l());
}

export function useCursorElevation() {
  return useSyncExternalStore(
    l => { cursorListeners.add(l); return () => { cursorListeners.delete(l); }; },
    () => cursor, () => null,
  );
}

/* ───────────────────────────── For OI ───────────────────────────── */

/* OI Assist drives the same tools by calling these, and gets back the figures
   a reader would read off the panel, in the units the panel shows them. */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface FieldSummary {
  acres: number; lowFt: number; highFt: number; reliefFt: number; cellM: number; lidar: string;
  drainage?: { outlets: { acres: number; lat: number; lng: number }[]; standingWaterAcres: number; standingWaterYd3: number; sheetFlowAcres: number };
  cutfill?: { cutYd3: number; fillYd3: number; cutToFill: number; cutPerAcreYd3: number; maxCutFt: number; maxFillFt: number; sections: { acres: number; slopePct: number; headingDeg: number; cutYd3: number; fillYd3: number }[] };
}

export function fieldSummary(): FieldSummary | null {
  const f = state.field;
  if (!f || f.status !== 'ready' || !f.stats || !f.grid) return null;
  const g = f.grid;
  const out: FieldSummary = {
    acres: r2(acres(f.stats.areaM2)), lowFt: r2(ft(f.stats.minZ)), highFt: r2(ft(f.stats.maxZ)), reliefFt: r2(ft(f.stats.maxZ - f.stats.minZ)),
    cellM: g.ground, lidar: f.flight ? `${describeFlight(f.flight)} (${f.flight.project})` : 'USGS 3DEP',
  };
  if (f.drainage) {
    const d = f.drainage;
    out.drainage = {
      outlets: d.outlets.slice(0, 10).map(o => { const [lng, lat] = cellToLngLat(g, o.c, o.r); return { acres: r1(acres(o.areaM2)), lat: +lat.toFixed(5), lng: +lng.toFixed(5) }; }),
      standingWaterAcres: r1(acres(d.pondAreaM2)), standingWaterYd3: Math.round(yd3(d.pondVolumeM3)), sheetFlowAcres: r1(acres(d.edgeAreaM2)),
    };
  }
  if (f.cutfill) {
    const t = totals(f.cutfill);
    out.cutfill = {
      cutYd3: Math.round(t.cutYd3), fillYd3: Math.round(t.fillYd3), cutToFill: r2(t.ratio), cutPerAcreYd3: Math.round(t.cutPerAcre),
      maxCutFt: r2(t.maxCutFt), maxFillFt: r2(t.maxFillFt),
      sections: f.cutfill.sections.map(x => ({ acres: r1(acres(x.section.areaM2)), slopePct: +x.design.slopePct.toFixed(3), headingDeg: r1(x.design.headingDeg), cutYd3: Math.round(yd3(x.result.cutM3)), fillYd3: Math.round(yd3(x.result.fillM3)) })),
    };
  }
  return out;
}

/** Outline an area, download its lidar and run the analysis asked for. */
export async function analyseArea(ring: [number, number][], analysis: FieldMode = 'elevation', ratio?: number): Promise<FieldSummary> {
  await loadField(ring);
  const f = state.field;
  if (!f || f.status !== 'ready') throw new Error(f?.error ?? 'Lidar download failed');
  if (analysis !== 'elevation') await setFieldMode(analysis);
  if (analysis === 'cutfill' && ratio && ratio !== state.field?.cutfill?.ratio) setRatio(ratio);
  const out = fieldSummary();
  if (!out) throw new Error('The field analysis did not finish');
  return out;
}

export interface ProfileSummary { lengthFt: number; lengthMi: number; startFt: number; endFt: number; lowFt: number; highFt: number; climbFt: number; dropFt: number; gradePct: number }

export async function profileAlong(coords: [number, number][]): Promise<ProfileSummary> {
  await loadProfile(coords);
  const p = state.profile;
  if (!p || p.status !== 'ready') throw new Error(p?.error ?? 'Profile failed');
  const pts = p.samples.filter(x => x.z !== null) as { distM: number; z: number }[];
  let lo = Infinity, hi = -Infinity, climb = 0, drop = 0;
  pts.forEach((x, k) => { lo = Math.min(lo, x.z); hi = Math.max(hi, x.z); if (k) { const d = x.z - pts[k - 1].z; if (d > 0) climb += d; else drop -= d; } });
  const len = p.samples[p.samples.length - 1]?.distM ?? 0;
  return {
    lengthFt: Math.round(ft(len)), lengthMi: r2(len / 1609.344), startFt: r2(ft(pts[0].z)), endFt: r2(ft(pts[pts.length - 1].z)),
    lowFt: r2(ft(lo)), highFt: r2(ft(hi)), climbFt: r1(ft(climb)), dropFt: r1(ft(drop)), gradePct: len ? r2(((pts[pts.length - 1].z - pts[0].z) / len) * 100) : 0,
  };
}

/** Run the storm in the 3D view straight away when OI opens it. */
let autoRain = false;
export function open3dWithRain() { autoRain = true; open3d(); }
export function takeAutoRain(): boolean { const v = autoRain; autoRain = false; return v; }

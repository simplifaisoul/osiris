import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createSatelliteProgramCache } from './satellite-programs';
import { WIND_STYLE, type WindGrid, type WindStyle } from './wind-layer';
import {
  boundsContain,
  cameraHeight,
  createWindBaker,
  padBounds,
  windHeightFade,
  windLevel,
  windSeedCount,
  windSpacing,
  WIND_NARROW_PATH_LIMIT,
  WIND_PATH_LIMIT,
  WIND_STRIDE,
  type WindBakeRequest,
  type WindBounds,
  type WindStreamlines,
} from './wind-streamlines';

/**
 * OSIRIS — wind drawn on the GPU, as streamlines.
 *
 * Every curve is a fine, steady line in pale blue. A bright comet runs along
 * each one, tapering away behind it, so the whole map reads as the air moving
 * without a single thing wandering off. Curves are made once from the forecast
 * (wind-streamlines); the GPU only moves the comets, so a frame costs one
 * instanced draw whatever the wind is doing.
 *
 * Positions go through MapLibre's own projection prelude, so one shader is right
 * on the flat map and on the globe; on the globe a curve fades out as it turns
 * to the horizon and is gone on the far side, and the whole layer fades as the
 * camera comes down to the ground (see windHeightFade).
 *
 * Zoomed in, a finer set made for the view is drawn instead of the globe's,
 * never alongside it: one set of curves is on the screen at a time.
 */

const LAYER_ID = 'wind-streamlines';
/** Line width, in CSS pixels. */
const WIDTH = 2.4;
/** Comets travel this many curve-lengths a second, at speed 1. */
const FLOW = 0.16;
/** How much of a curve a comet's tail covers at the default tail length. */
const TAIL_AT_DEFAULT = 0.32;
const DEFAULT_TRAIL = WIND_STYLE.trail;
/** The least time between repaints: wind is drawn at 30 Hz. */
const FRAME_MS = 33;
/** Fewest ms between rebuilds of the curves while the wind is changing under them. */
const BAKE_GAP_MS = 120;
const MAX_DENSITY = 2;
const MIN_DENSITY = 0.25;
/** A view's set reaches this share of the view again past every side, so a short pan stays inside it. */
const DETAIL_PAD = 0.25;
/** The set is made again once the view comes this near its edge. */
const DETAIL_MARGIN = 0.08;
/**
 * Most seeds a view's set may try, a little over what the globe's own tries: a
 * tilted view out to the horizon takes a coarser level rather than more time.
 */
const MAX_DETAIL_SEEDS = 40000;

const VERT = `
layout(location = 0) in vec2 a_corner;  // along 0|1 and across -1..1: one corner of a segment's quad
layout(location = 1) in vec4 a_p0;      // this vertex: mercator x, y, how far along the curve, its phase
layout(location = 2) in vec4 a_p1;      // the next vertex
uniform vec2 u_viewport;
uniform float u_width;   // line width, px
out float v_along;
out float v_across;
out float v_phase;
out float v_facing;

// How squarely the surface faces the camera: 1 straight on, 0 at the horizon, negative on the far side.
float windFacing(vec2 merc) {
#ifdef GLOBE
  vec4 plane = u_projection_clipping_plane;
  // Kept while the globe flattens into the map (zoom 11 to 12): the far side still shows through it then.
  if (plane.w > -1e-6) return 1.0;
  // The horizon plane is (unit normal toward the camera, -1 / camera distance): the camera, in Earth radii.
  vec3 cam = plane.xyz * (-1.0 / plane.w);
  vec3 p = projectToSphere(merc, merc);
  return dot(normalize(p), normalize(cam - p));
#else
  return 1.0;
#endif
}
vec2 screen(vec4 c) { return c.xy / c.w * u_viewport * 0.5; }

void main() {
  float f0 = windFacing(a_p0.xy);
  float f1 = windFacing(a_p1.xy);
  vec4 c0 = projectTileFor3D(a_p0.xy, 0.0);
  vec4 c1 = projectTileFor3D(a_p1.xy, 0.0);
  // The step from one curve's last vertex to the next curve's first is not a segment; nor is anything round the back.
  if (a_p1.z < a_p0.z || (f0 <= 0.0 && f1 <= 0.0) || c0.w <= 0.0 || c1.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_along = 0.0; v_across = 0.0; v_phase = 0.0; v_facing = 0.0;
    return;
  }
  vec2 d = screen(c1) - screen(c0);
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  bool end = a_corner.x > 0.5;
  vec4 c = end ? c1 : c0;
  // Multiplying by w cancels the perspective divide: a constant width on screen.
  c.xy += normal * a_corner.y * u_width / u_viewport * c.w;
  gl_Position = c;
  v_along = end ? a_p1.z : a_p0.z;
  v_across = a_corner.y * 0.5 + 0.5;
  v_phase = a_p0.w;
  v_facing = end ? f1 : f0;
}`;

// A steady fine curve, and a bright comet that runs along it, tapering behind its tip.
const FRAG = `
precision highp float;
in float v_along;
in float v_across;
in float v_phase;
in float v_facing;
uniform float u_time;   // comet clock, seconds
uniform float u_ghost;  // opacity of the curve itself
uniform float u_fade;   // 0..1, with the camera's height
uniform float u_tail;   // how far back a comet's tail reaches, as a share of the curve
out vec4 fragColor;
void main() {
  float behind = fract(u_time * ${FLOW.toFixed(2)} + v_phase - v_along);
  float tail = 1.0 - smoothstep(0.0, u_tail, behind);
  float tip = 1.0 - smoothstep(0.0, 0.045, behind);
  float ends = smoothstep(0.0, 0.055, v_along) * (1.0 - smoothstep(0.945, 1.0, v_along));
  float edge = 1.0 - smoothstep(0.26, 0.5, abs(v_across - 0.5));
  // Curves foreshortened towards the limb would bunch into a bright rim; they fade out on the way there instead.
  float horizon = smoothstep(0.0, 0.3, v_facing);
  vec3 col = mix(vec3(0.50, 0.79, 0.90), vec3(0.91, 0.99, 1.0), tip);
  float a = (u_ghost + 0.64 * tail + 0.16 * tip) * ends * edge * horizon * u_fade;
  if (a < 0.004) discard;
  fragColor = vec4(col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`wind layer shader failed: ${log}`);
  }
  return sh;
}

/** What a view's set was made for: the detail level of the view, and the box it covers. */
export interface WindCover {
  level: number;
  bounds: WindBounds;
}

export interface WindGlLayer extends CustomLayerInterface {
  /** The globe's curves; null drops them. */
  setStreamlines(lines: WindStreamlines | null): void;
  /** Finer curves for part of the globe, drawn instead of the globe's while the view is zoomed in on them; null drops them. */
  setDetail(lines: WindStreamlines | null, cover?: WindCover): void;
  /** How the comets move: their speed and tail length. */
  setLook(look: { speed: number; trail: number }): void;
}

/** The part of the globe in view, as a box. */
export function viewBounds(map: MlMap): WindBounds {
  const box = map.getBounds();
  const west = box.getWest();
  let east = box.getEast();
  if (east < west) east += 360;
  const south = Math.max(-90, box.getSouth());
  const north = Math.min(90, box.getNorth());
  return east - west >= 360 ? [-180, south, 180, north] : [west, south, east, north];
}

/** Is a view's set right for the map as it is now: zoomed in about as far, and over all of the view? */
function covers(cover: WindCover, map: MlMap): boolean {
  const level = windLevel(map.getZoom());
  return level > 0 && Math.abs(level - cover.level) <= 1 && boundsContain(cover.bounds, viewBounds(map));
}

/** One set of curves on the GPU. */
interface Curves {
  vao: WebGLVertexArrayObject | null;
  buffer: WebGLBuffer | null;
  lines: WindStreamlines | null;
  instances: number;
  dirty: boolean;
}
const noCurves = (): Curves => ({ vao: null, buffer: null, lines: null, instances: 0, dirty: false });

export function createWindGlLayer(): WindGlLayer {
  let gl: WebGL2RenderingContext | null = null;
  let map: MlMap | null = null;
  let corners: WebGLBuffer | null = null;
  const globe = noCurves();
  const detail = noCurves();
  let cover: WindCover | null = null;
  let speed = WIND_STYLE.speed;
  let trail = WIND_STYLE.trail;
  let clock = 0;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const link = (prelude: string, define: string): WebGLProgram => {
    const vs = compile(gl!, gl!.VERTEX_SHADER, `#version 300 es\n${prelude}\n${define}\n${VERT}`);
    const fs = compile(gl!, gl!.FRAGMENT_SHADER, `#version 300 es\n${FRAG}`);
    const pr = gl!.createProgram()!;
    gl!.attachShader(pr, vs);
    gl!.attachShader(pr, fs);
    gl!.linkProgram(pr);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(pr, gl!.LINK_STATUS)) {
      const log = gl!.getProgramInfoLog(pr);
      gl!.deleteProgram(pr);
      throw new Error(`wind layer link failed: ${log}`);
    }
    return pr;
  };
  // One program per projection variant: the prelude changes between flat and globe.
  const programs = createSatelliteProgramCache<WebGLProgram>((_kind, prelude, define) => link(prelude, define), pr => gl?.deleteProgram(pr));

  const attach = (curves: Curves) => {
    curves.buffer = gl!.createBuffer();
    curves.vao = gl!.createVertexArray();
    gl!.bindVertexArray(curves.vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, corners);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
    gl!.vertexAttribDivisor(0, 0);
    // A segment is one vertex and the next, so the same buffer is bound twice, a vertex apart.
    gl!.bindBuffer(gl!.ARRAY_BUFFER, curves.buffer);
    const stride = WIND_STRIDE * 4;
    gl!.enableVertexAttribArray(1);
    gl!.vertexAttribPointer(1, 4, gl!.FLOAT, false, stride, 0);
    gl!.vertexAttribDivisor(1, 1);
    gl!.enableVertexAttribArray(2);
    gl!.vertexAttribPointer(2, 4, gl!.FLOAT, false, stride, stride);
    gl!.vertexAttribDivisor(2, 1);
    gl!.bindVertexArray(null);
    curves.dirty = true;
  };
  const detach = (curves: Curves) => {
    if (gl) {
      if (curves.vao) gl.deleteVertexArray(curves.vao);
      if (curves.buffer) gl.deleteBuffer(curves.buffer);
    }
    curves.vao = curves.buffer = null;
  };
  const load = (curves: Curves, next: WindStreamlines | null) => {
    curves.lines = next;
    curves.instances = next ? Math.max(0, next.count - 1) : 0;
    curves.dirty = true;
    map?.triggerRepaint();
  };

  return {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '2d',

    onAdd(m: MlMap, context: WebGL2RenderingContext) {
      map = m;
      gl = context;
      corners = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, corners);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      attach(globe);
      attach(detail);
    },

    onRemove() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (gl) {
        programs.clear();
        detach(globe);
        detach(detail);
        if (corners) gl.deleteBuffer(corners);
      }
      corners = null;
      gl = null;
      map = null;
    },

    setStreamlines(next) {
      load(globe, next);
    },

    setDetail(next, at) {
      cover = next && at ? at : null;
      load(detail, cover ? next : null);
    },

    setLook(look) {
      speed = look.speed;
      trail = look.trail;
      map?.triggerRepaint();
    },

    render(_context: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      if (!gl || !map) return;
      const shader = args?.shaderData;
      const proj = args?.defaultProjectionData;
      if (!shader?.vertexShaderPrelude || !proj) return;
      // The view's own set when it fits the view, else the globe's; never both.
      const curves = detail.instances > 0 && cover && covers(cover, map) ? detail : globe;
      if (!curves.vao || !curves.buffer) return;
      if (curves.dirty) {
        const { lines } = curves;
        gl.bindBuffer(gl.ARRAY_BUFFER, curves.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, lines ? lines.vertices.subarray(0, lines.count * WIND_STRIDE) : new Float32Array(0), gl.DYNAMIC_DRAW);
        curves.dirty = false;
      }
      if (curves.instances <= 0) return;
      const fade = windHeightFade(cameraHeight(map.getZoom(), map.getCenter().lat, map.getCanvas().clientHeight));
      if (fade <= 0) return;
      let program: WebGLProgram;
      try { program = programs.get(shader, 'marker'); } catch (err) {
        console.error('[OSIRIS] wind layer:', err instanceof Error ? err.message : err);
        return;
      }

      const now = performance.now();
      if (!reduced) clock += Math.min(0.1, last ? (now - last) / 1000 : 0) * speed;
      last = now;

      gl.useProgram(program);
      const u = (name: string) => gl!.getUniformLocation(program, name);
      // The prelude declares these but leaves a custom layer to set them, every one.
      gl.uniformMatrix4fv(u('u_projection_matrix'), false, proj.mainMatrix as Float32List);
      gl.uniform4fv(u('u_projection_tile_mercator_coords'), proj.tileMercatorCoords as Float32List);
      gl.uniform4fv(u('u_projection_clipping_plane'), proj.clippingPlane as Float32List);
      gl.uniform1f(u('u_projection_transition'), proj.projectionTransition);
      gl.uniformMatrix4fv(u('u_projection_fallback_matrix'), false, proj.fallbackMatrix as Float32List);
      gl.uniform2f(u('u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u('u_width'), WIDTH * (gl.drawingBufferWidth / Math.max(1, map.getCanvas().clientWidth)));
      gl.uniform1f(u('u_time'), clock % 10000);
      gl.uniform1f(u('u_ghost'), reduced ? 0.34 : 0.25);
      gl.uniform1f(u('u_fade'), fade);
      gl.uniform1f(u('u_tail'), Math.max(0.04, Math.min(0.9, TAIL_AT_DEFAULT * trail / DEFAULT_TRAIL)));

      // Fade by premultiplied alpha; no depth, so nothing fights the globe at its surface.
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(curves.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, curves.instances);
      gl.bindVertexArray(null);

      // The comets move, so another frame is due; the map does not otherwise know.
      if (!reduced && !timer) {
        timer = setTimeout(() => { timer = null; map?.triggerRepaint(); }, FRAME_MS);
      }
    },
  };
}

/** A set asked of the baker, and the wind and view it was asked for. */
type Job = WindBakeRequest & { version: number; cover?: WindCover };

/**
 * The Wind layer's drawing: curves from the wind field, on a custom layer that
 * puts itself back after a style change. Make one for a map, give it fields as
 * the slider moves, and remove it when the layer goes off. The curves are made
 * in a worker; one set is made at a time, and only for the newest wind.
 *
 * Zoomed in, the set for the view comes first and is made again when the map
 * zooms a step or pans near its edge; the globe's set is then only remade when
 * the map comes back out to it.
 */
export class WindOverlay {
  private map: MlMap;
  private layer = createWindGlLayer();
  private field: WindGrid | null = null;
  /** Bumped with every new wind, so a set made from older wind is known to be out of date. */
  private version = 0;
  private style: WindStyle = { ...WIND_STYLE };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastBake = 0;
  private narrow: boolean;
  private worker: Worker | null = null;
  /** No worker to be had: curves are made here instead. */
  private inline = false;
  private bakeHere = createWindBaker();
  /** The set being made, if one is, and which request it answers. */
  private pending: Job | null = null;
  private request = 0;
  /** What the sets on the layer were made from. */
  private globe: Job | null = null;
  private detail: Job | null = null;

  constructor(map: MlMap) {
    this.map = map;
    this.narrow = this.isNarrow();
    this.ensure();
    map.on('style.load', this.ensure);
    map.on('resize', this.onResize);
    map.on('moveend', this.onMoveEnd);
  }

  /** The wind to draw, in m/s; null draws nothing. */
  setField(field: WindGrid | null): void {
    this.field = field;
    this.version++;
    if (!field) {
      this.layer.setStreamlines(null);
      this.layer.setDetail(null);
      this.globe = this.detail = null;
      this.request++; // whatever is being made is for wind that is gone
      return;
    }
    this.schedule();
  }

  setStyle(style: Partial<WindStyle>): void {
    const recount = style.density !== undefined && style.density !== this.style.density;
    Object.assign(this.style, style);
    this.layer.setLook({ speed: this.style.speed, trail: this.style.trail });
    if (recount && this.field) this.schedule();
  }

  remove(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.worker?.terminate();
    this.worker = null;
    this.map.off('style.load', this.ensure);
    this.map.off('resize', this.onResize);
    this.map.off('moveend', this.onMoveEnd);
    if (this.map.getStyle() && this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
  }

  private ensure = () => {
    if (!this.map.getStyle() || this.map.getLayer(LAYER_ID)) return;
    this.map.addLayer(this.layer);
  };

  private isNarrow(): boolean {
    return this.map.getContainer().clientWidth < 700;
  }

  private onResize = () => {
    const narrow = this.isNarrow();
    if (narrow === this.narrow) return;
    this.narrow = narrow;
    if (this.field) this.schedule();
  };

  private onMoveEnd = () => {
    if (this.field) this.schedule();
  };

  /** How far apart the curves are, as a count over the globe: fewer on a phone, and as the tuning has it. */
  private count(): number {
    const density = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, this.style.density));
    return Math.round((this.narrow ? WIND_NARROW_PATH_LIMIT : WIND_PATH_LIMIT) * density);
  }

  /**
   * The set to make next, if any: zoomed in, the view's own; then the globe's,
   * which stands in while a view's set is being made.
   */
  private next(): Job | null {
    const count = this.count();
    const version = this.version;
    const level = windLevel(this.map.getZoom());
    const globe = this.globe;
    const globeJob: Job = { kind: 'globe', count, level: 0, version };
    if (level > 0) {
      const view = viewBounds(this.map);
      const detail = this.detail;
      const fits = detail?.cover && detail.version === version && detail.count === count
        && detail.cover.level === level && boundsContain(detail.cover.bounds, padBounds(view, DETAIL_MARGIN));
      // The globe's set is out of sight; it is kept only to stand in.
      if (fits) return globe && globe.count === count ? null : globeJob;
      const bounds = padBounds(view, DETAIL_PAD);
      let bake = level;
      while (bake > 0 && windSeedCount(bounds, windSpacing(count, bake)) > MAX_DETAIL_SEEDS) bake--;
      if (bake > 0) return { kind: 'detail', count, level: bake, bounds, version, cover: { level, bounds } };
    }
    return globe && globe.version === version && globe.count === count ? null : globeJob;
  }

  /** Make the next set soon, but not more often than the wind can usefully change under it. */
  private schedule(): void {
    if (this.timer || this.pending) return; // a set being made schedules the next when it is done
    const wait = this.lastBake ? Math.max(0, BAKE_GAP_MS - (performance.now() - this.lastBake)) : 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.bake();
    }, wait);
  }

  private bake(): void {
    if (!this.field || this.pending) return;
    const job = this.next();
    if (!job) return;
    const { kind, count, level, bounds } = job;
    const worker = this.getWorker();
    if (!worker) {
      this.done(job, this.bakeHere(this.field, { kind, count, level, bounds }));
      this.schedule();
      return;
    }
    this.pending = job;
    // Copied, not transferred: the slider blends the next wind into these same arrays.
    worker.postMessage({ id: ++this.request, field: this.field, kind, count, level, bounds });
  }

  private done(job: Job, lines: WindStreamlines): void {
    if (job.kind === 'globe') {
      this.layer.setStreamlines(lines);
      this.globe = job;
    } else {
      this.layer.setDetail(lines, job.cover);
      this.detail = job;
    }
    this.lastBake = performance.now();
  }

  private getWorker(): Worker | null {
    if (this.worker || this.inline) return this.worker;
    try {
      const worker = new Worker(new URL('./wind-streamlines.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<WindStreamlines & { id: number }>) => {
        const job = this.pending;
        this.pending = null;
        if (job && data.id === this.request && this.field) this.done(job, data);
        this.schedule();
      };
      worker.onerror = () => {
        // The worker would not run: make the curves here from now on.
        worker.terminate();
        this.worker = null;
        this.inline = true;
        this.pending = null;
        this.schedule();
      };
      this.worker = worker;
    } catch {
      this.inline = true;
    }
    return this.worker;
  }
}

/**
 * OSIRIS OI on the globe.
 *
 * While a run thinks, its analysis draws itself on the map: the actors land
 * where they act, their relations rise as arcs through the sky, evidence from
 * the live feed strikes in, and once the simulation starts every move an actor
 * makes against another fires a new arc, in the colour of its stance, while
 * the events of the simulated worlds land where they happen. Actors deciding
 * their next move ripple; each takes the colour of the way it pushes.
 * Every arc and every point can be hovered and clicked: a click selects that
 * piece of the research, lights it and what it touches, and dims the rest.
 *
 * The arcs are a WebGL custom layer: ribbons of constant pixel width lifted
 * along great circles through MapLibre's own projectTileFor3D, so they curve
 * with the globe and flatten with the 2D map. That function does not clip
 * against the horizon the way MapLibre's surface layers do, so each point is
 * tested here against the planet itself: the camera is recovered from the
 * horizon plane MapLibre hands every custom layer, and a point is hidden when
 * the line of sight to it passes through the Earth. The same vertex shader
 * drives an offscreen picking pass, so what can be clicked is exactly what is
 * drawn. Nodes and labels are ordinary GeoJSON layers.
 */
import type {
  CustomLayerInterface, CustomRenderMethodInput, FilterSpecification, GeoJSONSource, Map as MlMap, MapMouseEvent, PaddingOptions,
} from 'maplibre-gl';
import { ARC_STRIDE, mercator, packArcs, rgb, type ArcSpec, type LngLat } from './arcs';
import { createDirector } from './camera';
import { outcomeColor, shortAnswer } from './forecast';
import { brief, relatedLinks } from './research';
import type { RunState } from './state';
import type { Link, Move } from './types';

export const OI_ARCS = 'oi-arcs';
const NODES = 'oi-nodes';
const LAYERS = ['oi-node-halo', 'oi-node-core', 'oi-label-actor', 'oi-label-agent', 'oi-label-forecast'] as const;

/**
 * OI's palette: violet where actors align or work together, magenta where
 * they oppose or dispute, indigo for everything in between. The Style Studio
 * can change all three (see map-palette); these are the defaults.
 */
export interface ToneColors { support: string; oppose: string; neutral: string }
export const DEFAULT_TONES: ToneColors = { support: '#b388ff', oppose: '#ff5ccb', neutral: '#8c7cff' };

/** A colour lifted toward white: actors read as the brightest points of the web. */
function lift(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map(v => Math.round((v + (1 - v) * amount) * 255));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Quotes are not drawn on the globe (the graph follows them); they would share evidence's look if they were. */
const KIND: Record<Link['kind'], number> = { relation: 0, evidence: 1, move: 2, cite: 1 };
const TONE: Record<Link['tone'], number> = { support: 0, oppose: 1, neutral: 2 };

/* ───────────────────────────── Colours ───────────────────────────── */

const LEAN_STOPS: [number, number, number][] = [[0x6e, 0x8b, 0xff], [0xb3, 0x88, 0xff], [0xff, 0x5c, 0xcb]];

/** OI's lean: indigo toward NO (or lower), magenta toward YES (or higher), violet between. */
export function leanColor(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '#b388ff';
  const x = Math.min(1, Math.max(0, p));
  const [a, b] = x <= 0.5 ? [LEAN_STOPS[0], LEAN_STOPS[1]] : [LEAN_STOPS[1], LEAN_STOPS[2]];
  const t = x <= 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A cast actor's colour: the way its latest move pushes (magenta toward YES
 * or higher, indigo toward NO or lower, violet when it holds), or on a choice
 * question the outcome it works for.
 */
export function actorTint(s: RunState, move: Move | undefined): string {
  if (!move) return '#b388ff';
  if (s.frame?.kind === 'choice' && move.favors) return outcomeColor(Math.max(0, s.frame.outcomes.indexOf(move.favors)));
  return leanColor(move.push === 'yes' ? 0.88 : move.push === 'no' ? 0.12 : 0.5);
}

/* ───────────────────────────── Shaders ───────────────────────────── */

/** Hidden behind the planet? Shared by every vertex shader here. */
const IN_SIGHT = `
float inSight(vec2 merc, float elevation) {
#ifdef GLOBE
  vec4 plane = u_projection_clipping_plane;
  if (plane.w > -1e-6 || u_projection_transition < 0.999) return 1.0;
  // The horizon plane is (unit normal toward the camera, -1 / camera distance): the camera, in Earth radii.
  vec3 cam = plane.xyz * (-1.0 / plane.w);
  vec3 p = projectToSphere(merc, merc) * (1.0 + (elevation + 2000.0) / GLOBE_RADIUS);
  vec3 ray = p - cam;
  float a = dot(ray, ray);
  float b = 2.0 * dot(cam, ray);
  float c = dot(cam, cam) - 1.0;
  float disc = b * b - 4.0 * a * c;
  if (disc <= 0.0) return 1.0;
  float t = (-b - sqrt(disc)) / (2.0 * a);
  return (t > 0.0 && t < 0.9995) ? 0.0 : 1.0;
#else
  return 1.0;
#endif
}`;

const ARC_VERT = `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_prev;
layout(location = 2) in vec3 a_next;
layout(location = 3) in vec2 a_meta;   // side, t along the arc
layout(location = 4) in vec3 a_style;  // tone, id, highlight
layout(location = 5) in vec3 a_info;   // strength, birth, kind
layout(location = 6) in float a_len;   // km
uniform vec2 u_viewport;
uniform float u_ratio;
uniform float u_lift;
uniform float u_now;
uniform float u_dim;
uniform float u_hover;
uniform float u_widen;
out float v_side;
out float v_t;
out float v_strength;
out float v_age;
out float v_kind;
out float v_tone;
out float v_id;
out float v_hl;
out float v_len;
out float v_vis;
${IN_SIGHT}
vec2 screen(vec4 c) { return c.xy / c.w * u_viewport * 0.5; }
void main() {
  float elevation = a_pos.z * u_lift;
  vec4 cur = projectTileFor3D(a_pos.xy, elevation);
  vec4 prv = projectTileFor3D(a_prev.xy, a_prev.z * u_lift);
  vec4 nxt = projectTileFor3D(a_next.xy, a_next.z * u_lift);
  vec2 d = screen(nxt) - screen(prv);
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float kind = a_info.z;
  float hovered = abs(a_style.y - u_hover) < 0.5 ? 1.0 : 0.0;
  // Band width in pixels: room for a soft glow either side of the line.
  float width = (kind > 2.5 ? 6.0 : kind > 1.5 ? 8.0 : kind > 0.5 ? 6.0 : 7.0 + 5.0 * a_info.x);
  width *= 1.0 + 0.6 * max(a_style.z * u_dim, hovered);
  width = width * u_ratio + u_widen;
  // Multiplying by w cancels the perspective divide: constant width on screen.
  cur.xy += normal * a_meta.x * width / u_viewport * cur.w;
  gl_Position = cur;
  v_side = a_meta.x;
  v_t = a_meta.y;
  v_strength = a_info.x;
  v_age = u_now - a_info.y;
  v_kind = kind;
  v_tone = a_style.x;
  v_id = a_style.y;
  v_hl = max(a_style.z, hovered);
  v_len = a_len;
  v_vis = inSight(a_pos.xy, elevation);
}`;

const ARC_FRAG = `
precision highp float;
in float v_side;
in float v_t;
in float v_strength;
in float v_age;
in float v_kind;
in float v_tone;
in float v_id;
in float v_hl;
in float v_len;
in float v_vis;
uniform vec3 u_support;
uniform vec3 u_oppose;
uniform vec3 u_neutral;
uniform float u_now;
uniform float u_motion; // 0 when the viewer asked for reduced motion
uniform float u_flow;   // 1 while the run is live: pulses travel, dashes march
uniform float u_dim;    // 1 while something is selected
out vec4 fragColor;

/** Soft-edged on/off along the arc: duty is the share that is on. */
float dashes(float s, float duty) {
  float f = fract(s);
  return smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(duty, duty + 0.06, f));
}

void main() {
  if (v_vis < 0.5 || v_age < 0.0) discard;
  // The arc draws itself from speaker to target.
  float reveal = u_motion > 0.5 ? clamp(v_age / 1.1, 0.0, 1.0) : 1.0;
  reveal = 1.0 - pow(1.0 - reveal, 3.0);
  if (v_t > reveal) discard;

#ifdef PICK
  float id = v_id + 1.0;
  fragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0);
#else
  float d = abs(v_side);
  float core = exp(-d * d * 18.0);
  float halo = exp(-d * d * 3.0) * 0.3;
  float head = reveal < 1.0 ? smoothstep(0.1, 0.0, reveal - v_t) * 1.4 : 0.0;

  // Colour says how things stand: violet aligned or agreeing, magenta opposed or disputing, indigo between.
  vec3 tone = v_tone < 0.5 ? u_support : v_tone < 1.5 ? u_oppose : u_neutral;
  // Evidence from the feeds is quieter, a pale wash of its tone.
  if (v_kind > 0.5 && v_kind < 1.5) tone = mix(tone, vec3(0.86, 0.83, 0.96), 0.35);
  // "Weighing an actor" marches toward the actor; every other arc is a solid line. Spacing is in km along the arc.
  float s = v_t * v_len;
  float pattern = v_kind > 2.5 ? mix(0.18, 1.0, dashes(s / 140.0 - u_now * 0.9 * u_flow * u_motion, 0.5)) : 1.0;

  float speed = v_kind > 1.5 ? 0.5 : 0.22;
  float phase = fract(v_t - u_now * speed + v_strength * 3.7);
  float pulse = u_flow * u_motion * smoothstep(0.9, 1.0, phase) * 1.2;

  float base = v_kind > 0.5 && v_kind < 1.5 ? 0.55 : 0.9;
  float flash = 1.0 + 1.2 * exp(-v_age * 1.4) * u_motion;
  // Interactions from earlier rounds settle back, never out.
  float settle = v_kind > 1.5 ? mix(1.0, 0.45, clamp((v_age - 30.0) / 40.0, 0.0, 1.0)) : 1.0;
  float ends = mix(0.35, 1.0, smoothstep(0.0, 0.05, v_t) * smoothstep(1.0, 0.95, v_t));
  // A selection lights what belongs to it and lets the rest recede.
  float focus = mix(1.0, mix(0.13, 1.35, v_hl), u_dim) * mix(1.0, 1.35, v_hl * (1.0 - u_dim));

  // The drawing tip glows along the line itself, not across the whole ribbon.
  float alpha = clamp(((core + halo) * pattern * base * (0.55 + 0.45 * v_strength) + head * (core + halo * 0.5) + pulse * core) * flash * settle * ends * focus, 0.0, 1.0);
  vec3 col = mix(tone, vec3(1.0), clamp(core * 0.3 + head * 0.5 + pulse * 0.6, 0.0, 1.0));
  fragColor = vec4(col * alpha, alpha);
#endif
}`;

const PING_VERT = `
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in vec4 a_ping;   // rgb, size in px
layout(location = 3) in vec3 a_time;   // start, period, once
uniform vec2 u_viewport;
uniform float u_ratio;
uniform float u_now;
uniform float u_motion;
out vec2 v_corner;
out vec3 v_color;
out float v_phase;
out float v_alive;
${IN_SIGHT}
void main() {
  vec4 c = projectTileFor3D(a_pos, 0.0);
  float px = a_ping.w * u_ratio;
  gl_Position = c + vec4(a_corner * px / u_viewport * 2.0 * c.w, 0.0, 0.0);
  float age = u_now - a_time.x;
  float ph = age / a_time.y;
  v_alive = (age < 0.0 || (a_time.z > 0.5 && ph > 1.0) || u_motion < 0.5 || inSight(a_pos, 0.0) < 0.5) ? 0.0 : 1.0;
  v_phase = fract(ph);
  v_corner = a_corner;
  v_color = a_ping.rgb;
}`;

const PING_FRAG = `
precision mediump float;
in vec2 v_corner;
in vec3 v_color;
in float v_phase;
in float v_alive;
out vec4 fragColor;
void main() {
  if (v_alive < 0.5) discard;
  float r = length(v_corner);
  float ring = smoothstep(0.14, 0.0, abs(r - v_phase)) * (1.0 - v_phase);
  float a = ring * 0.8;
  if (a < 0.01) discard;
  fragColor = vec4(v_color * a, a);
}`;

/* ───────────────────────────── The arc layer ───────────────────────────── */

interface Ping { pos: [number, number]; color: [number, number, number]; size: number; start: number; period: number; once: boolean }

const clock = () => performance.now() / 1000;

type Programs = { arc: WebGLProgram; pick: WebGLProgram; ping: WebGLProgram };

function createArcLayer(): CustomLayerInterface & {
  setArcs(arcs: ArcSpec[], dim: boolean): void;
  setPings(pings: Ping[]): void;
  setLive(live: boolean): void;
  setTones(tones: [number, number, number][]): void;
  setHover(id: number): void;
  pick(x: number, y: number): number | null;
} {
  let gl: WebGL2RenderingContext | null = null;
  let map: MlMap | null = null;
  const programs = new Map<string, Programs>();
  let arcs: ArcSpec[] = [];
  let pings: Ping[] = [];
  let arcBuf: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; count: number } | null = null;
  let pingBuf: { vao: WebGLVertexArrayObject; quad: WebGLBuffer; inst: WebGLBuffer; count: number } | null = null;
  let arcsDirty = false;
  let pingsDirty = false;
  let live = false;
  let dim = false;
  let hover = -1;
  let tones: [number, number, number][] = [DEFAULT_TONES.support, DEFAULT_TONES.oppose, DEFAULT_TONES.neutral].map(rgb);
  let lastBirth = 0;
  // A pick happens on a pointer event, between frames: it reuses the last frame's projection and shaders.
  let lastProjection: CustomRenderMethodInput['defaultProjectionData'] | null = null;
  let lastShader: CustomRenderMethodInput['shaderData'] | null = null;
  let pickTarget: { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number } | null = null;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const compile = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      const log = gl!.getShaderInfoLog(s);
      gl!.deleteShader(s);
      throw new Error(`OI layer shader failed: ${log}`);
    }
    return s;
  };
  const link = (vertSrc: string, fragSrc: string) => {
    const p = gl!.createProgram()!;
    const vs = compile(gl!.VERTEX_SHADER, vertSrc);
    const fs = compile(gl!.FRAGMENT_SHADER, fragSrc);
    gl!.attachShader(p, vs);
    gl!.attachShader(p, fs);
    gl!.linkProgram(p);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      const log = gl!.getProgramInfoLog(p);
      gl!.deleteProgram(p);
      throw new Error(`OI layer link failed: ${log}`);
    }
    return p;
  };
  /** One set of programs per projection variant: the prelude changes with the projection. */
  const programsFor = (shader: CustomRenderMethodInput['shaderData']): Programs => {
    const key = `${shader.variantName}\0${shader.define}`;
    let set = programs.get(key);
    if (!set) {
      const head = `#version 300 es\n${shader.vertexShaderPrelude}\n${shader.define}\n`;
      set = {
        arc: link(head + ARC_VERT, `#version 300 es\n${ARC_FRAG}`),
        pick: link(head + ARC_VERT, `#version 300 es\n#define PICK\n${ARC_FRAG}`),
        ping: link(head + PING_VERT, `#version 300 es\n${PING_FRAG}`),
      };
      programs.set(key, set);
    }
    return set;
  };

  // Attribute slots are fixed in the shaders (layout locations), so one VAO serves the drawing and the picking programs.
  const attrib = (loc: number, size: number, stride: number, offset: number, divisor = 0) => {
    gl!.enableVertexAttribArray(loc);
    gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, stride, offset);
    gl!.vertexAttribDivisor(loc, divisor);
  };

  const freeArcs = () => {
    if (!gl || !arcBuf) return;
    gl.deleteVertexArray(arcBuf.vao); gl.deleteBuffer(arcBuf.vbo); gl.deleteBuffer(arcBuf.ibo);
    arcBuf = null;
  };
  const freePings = () => {
    if (!gl || !pingBuf) return;
    gl.deleteVertexArray(pingBuf.vao); gl.deleteBuffer(pingBuf.quad); gl.deleteBuffer(pingBuf.inst);
    pingBuf = null;
  };

  const buildArcs = () => {
    const g = gl!;
    freeArcs();
    if (!arcs.length) return;
    const { vertices, indices } = packArcs(arcs);
    const vao = g.createVertexArray()!;
    g.bindVertexArray(vao);
    const vbo = g.createBuffer()!;
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, vertices, g.STATIC_DRAW);
    const S = ARC_STRIDE * 4;
    attrib(0, 3, S, 0);
    attrib(1, 3, S, 12);
    attrib(2, 3, S, 24);
    attrib(3, 2, S, 36);
    attrib(4, 3, S, 44);
    attrib(5, 3, S, 56);
    attrib(6, 1, S, 68);
    const ibo = g.createBuffer()!;
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo);
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, indices, g.STATIC_DRAW);
    g.bindVertexArray(null);
    arcBuf = { vao, vbo, ibo, count: indices.length };
  };

  const buildPings = () => {
    const g = gl!;
    freePings();
    if (!pings.length) return;
    const vao = g.createVertexArray()!;
    g.bindVertexArray(vao);
    const quad = g.createBuffer()!;
    g.bindBuffer(g.ARRAY_BUFFER, quad);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), g.STATIC_DRAW);
    attrib(0, 2, 8, 0);
    const data = new Float32Array(pings.length * 9);
    pings.forEach((p, i) => data.set([p.pos[0], p.pos[1], ...p.color, p.size, p.start, p.period, p.once ? 1 : 0], i * 9));
    const inst = g.createBuffer()!;
    g.bindBuffer(g.ARRAY_BUFFER, inst);
    g.bufferData(g.ARRAY_BUFFER, data, g.STATIC_DRAW);
    attrib(1, 2, 36, 0, 1);
    attrib(2, 4, 36, 8, 1);
    attrib(3, 3, 36, 24, 1);
    g.bindVertexArray(null);
    pingBuf = { vao, quad, inst, count: pings.length };
  };

  const setProjection = (program: WebGLProgram, proj: NonNullable<CustomRenderMethodInput['defaultProjectionData']>) => {
    const u = (n: string) => gl!.getUniformLocation(program, n);
    gl!.uniformMatrix4fv(u('u_projection_matrix'), false, proj.mainMatrix as Float32List);
    gl!.uniform4fv(u('u_projection_tile_mercator_coords'), proj.tileMercatorCoords as Float32List);
    gl!.uniform4fv(u('u_projection_clipping_plane'), proj.clippingPlane as Float32List);
    gl!.uniform1f(u('u_projection_transition'), proj.projectionTransition);
    gl!.uniformMatrix4fv(u('u_projection_fallback_matrix'), false, proj.fallbackMatrix as Float32List);
  };

  /** Arcs a thousand kilometres high mean nothing over a city: they settle as the view closes in. */
  const liftFor = (zoom: number) => (zoom <= 3.5 ? 1 : Math.max(0.12, 1 - (zoom - 3.5) * 0.22));

  const arcUniforms = (program: WebGLProgram, proj: NonNullable<CustomRenderMethodInput['defaultProjectionData']>, now: number, widen: number) => {
    const g = gl!;
    g.useProgram(program);
    setProjection(program, proj);
    const u = (n: string) => g.getUniformLocation(program, n);
    g.uniform2f(u('u_viewport'), g.drawingBufferWidth, g.drawingBufferHeight);
    g.uniform1f(u('u_ratio'), window.devicePixelRatio || 1);
    g.uniform1f(u('u_lift'), liftFor(map!.getZoom()));
    g.uniform1f(u('u_now'), now);
    g.uniform1f(u('u_motion'), reduced ? 0 : 1);
    g.uniform1f(u('u_flow'), live ? 1 : 0);
    g.uniform1f(u('u_dim'), dim ? 1 : 0);
    g.uniform1f(u('u_hover'), hover);
    g.uniform1f(u('u_widen'), widen);
    g.uniform3f(u('u_support'), ...tones[0]);
    g.uniform3f(u('u_oppose'), ...tones[1]);
    g.uniform3f(u('u_neutral'), ...tones[2]);
  };

  return {
    id: OI_ARCS,
    type: 'custom',
    renderingMode: '3d',

    setArcs(next, dimOthers) {
      arcs = next;
      dim = dimOthers;
      arcsDirty = true;
      lastBirth = next.reduce((m, a) => Math.max(m, a.birth), 0);
      map?.triggerRepaint();
    },
    setPings(next) { pings = next; pingsDirty = true; map?.triggerRepaint(); },
    setLive(v) { live = v; map?.triggerRepaint(); },
    setTones(t) { tones = t; map?.triggerRepaint(); },
    setHover(id) { if (id !== hover) { hover = id; map?.triggerRepaint(); } },

    pick(x, y) {
      if (!gl || !map || !arcBuf || !lastProjection || !lastShader) return null;
      const g = gl;
      let set: Programs;
      try { set = programsFor(lastShader); } catch { return null; }
      const w = g.drawingBufferWidth, h = g.drawingBufferHeight;
      if (!pickTarget || pickTarget.w !== w || pickTarget.h !== h) {
        if (pickTarget) { g.deleteFramebuffer(pickTarget.fbo); g.deleteTexture(pickTarget.tex); }
        const tex = g.createTexture()!;
        g.bindTexture(g.TEXTURE_2D, tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
        const fbo = g.createFramebuffer()!;
        g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
        pickTarget = { fbo, tex, w, h };
      }
      // Everything changed here is put back, so MapLibre's own view of the GL state stays true.
      const saved = {
        fbo: g.getParameter(g.FRAMEBUFFER_BINDING),
        program: g.getParameter(g.CURRENT_PROGRAM),
        vao: g.getParameter(g.VERTEX_ARRAY_BINDING),
        viewport: g.getParameter(g.VIEWPORT) as Int32Array,
        clear: g.getParameter(g.COLOR_CLEAR_VALUE) as Float32Array,
        blend: g.isEnabled(g.BLEND),
        depth: g.isEnabled(g.DEPTH_TEST),
        texture: g.getParameter(g.TEXTURE_BINDING_2D),
      };
      g.bindFramebuffer(g.FRAMEBUFFER, pickTarget.fbo);
      g.viewport(0, 0, w, h);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.disable(g.BLEND);
      g.disable(g.DEPTH_TEST);
      const ratio = w / (g.canvas as HTMLCanvasElement).clientWidth;
      arcUniforms(set.pick, lastProjection, clock(), 8 * ratio);
      g.bindVertexArray(arcBuf.vao);
      g.drawElements(g.TRIANGLES, arcBuf.count, g.UNSIGNED_INT, 0);

      // A small box, nearest hit to the cursor wins: a line a few pixels wide is otherwise hard to hit.
      const px = Math.round(x * ratio);
      const py = Math.round(h - y * ratio);
      const R = Math.round(6 * ratio);
      const x0 = Math.max(0, px - R), y0 = Math.max(0, py - R);
      const bw = Math.min(w - x0, R * 2 + 1), bh = Math.min(h - y0, R * 2 + 1);
      let best: number | null = null;
      if (bw > 0 && bh > 0) {
        const buf = new Uint8Array(bw * bh * 4);
        g.readPixels(x0, y0, bw, bh, g.RGBA, g.UNSIGNED_BYTE, buf);
        let bestDist = Infinity;
        for (let iy = 0; iy < bh; iy++) {
          for (let ix = 0; ix < bw; ix++) {
            const o = (iy * bw + ix) * 4;
            const id = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
            if (!id) continue;
            const dist = (x0 + ix - px) ** 2 + (y0 + iy - py) ** 2;
            if (dist < bestDist) { bestDist = dist; best = id - 1; }
          }
        }
      }

      g.bindFramebuffer(g.FRAMEBUFFER, saved.fbo);
      g.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
      g.clearColor(saved.clear[0], saved.clear[1], saved.clear[2], saved.clear[3]);
      if (saved.blend) g.enable(g.BLEND);
      if (saved.depth) g.enable(g.DEPTH_TEST);
      g.useProgram(saved.program);
      g.bindVertexArray(saved.vao);
      g.bindTexture(g.TEXTURE_2D, saved.texture);
      return best !== null && best < arcs.length ? best : null;
    },

    onAdd(m, context) {
      map = m;
      gl = context as WebGL2RenderingContext;
      arcsDirty = pingsDirty = true;
    },

    onRemove() {
      if (gl) {
        freeArcs();
        freePings();
        if (pickTarget) { gl.deleteFramebuffer(pickTarget.fbo); gl.deleteTexture(pickTarget.tex); }
        for (const p of programs.values()) { gl.deleteProgram(p.arc); gl.deleteProgram(p.pick); gl.deleteProgram(p.ping); }
      }
      programs.clear();
      pickTarget = null;
      lastProjection = null;
      lastShader = null;
      gl = null;
      map = null;
    },

    render(_ctx, args) {
      if (!gl || !map) return;
      const proj = args.defaultProjectionData;
      if (!proj || !args.shaderData?.vertexShaderPrelude) return;
      let set: Programs;
      try { set = programsFor(args.shaderData); }
      catch (err) { console.error('[OSIRIS] OI layer:', err instanceof Error ? err.message : err); return; }
      lastProjection = proj;
      lastShader = args.shaderData;
      if (arcsDirty) { buildArcs(); arcsDirty = false; }
      if (pingsDirty) { buildPings(); pingsDirty = false; }
      if (!arcBuf && !pingBuf) return;

      const now = clock();
      const g = gl;
      // Occlusion is computed per vertex against the planet, so the depth buffer is not needed (and near the
      // surface it would only flicker).
      g.disable(g.DEPTH_TEST);
      g.depthMask(false);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);

      if (arcBuf) {
        arcUniforms(set.arc, proj, now, 0);
        g.bindVertexArray(arcBuf.vao);
        g.drawElements(g.TRIANGLES, arcBuf.count, g.UNSIGNED_INT, 0);
      }
      if (pingBuf) {
        const p = set.ping;
        g.useProgram(p);
        setProjection(p, proj);
        const u = (n: string) => g.getUniformLocation(p, n);
        g.uniform2f(u('u_viewport'), g.drawingBufferWidth, g.drawingBufferHeight);
        g.uniform1f(u('u_ratio'), window.devicePixelRatio || 1);
        g.uniform1f(u('u_now'), now);
        g.uniform1f(u('u_motion'), reduced ? 0 : 1);
        g.bindVertexArray(pingBuf.vao);
        g.drawArraysInstanced(g.TRIANGLES, 0, 6, pingBuf.count);
      }
      g.bindVertexArray(null);

      // Keep animating while the run is live and while arcs are still drawing in.
      const pending = now < lastBirth + 2.5 || pings.some(pg => (!pg.once ? live : now < pg.start + pg.period));
      if (!reduced && (live || pending)) map.triggerRepaint();
    },
  };
}

/* ───────────────────────────── The controller ───────────────────────────── */

export interface OiHover {
  key: string;
  title: string;
  detail: string;
  /** Pointer position, CSS pixels from the map's top left. */
  x: number;
  y: number;
}

export interface OiGlobe {
  /** Draws a run (or clears the globe for null). Cheap to call on every event. */
  update(state: RunState | null): void;
  /** Lights a piece of the research and what it touches; null clears. */
  select(key: string | null): void;
  /** The arcs' three tones, from the Style Studio. */
  setColors(colors: ToneColors): void;
  /** Keeps the globe centred in the space panels leave free; null gives the whole map back. */
  setInsets(padding: PaddingOptions | null): void;
  /** Let the camera follow the run (the default), or leave it where the person puts it. */
  follow(on: boolean): void;
  /** The piece of the run under a point on the map, if any, so other layers can leave that click to OI. */
  hit(point: { x: number; y: number }): string | null;
  /** Re-adds what a style change removed. */
  ensure(): void;
  destroy(): void;
}

export interface OiGlobeOptions {
  onSelect?: (key: string | null) => void;
  onHover?: (hover: OiHover | null) => void;
  /** The camera stopped following the run (a person moved the map), or started again. */
  onFollowChange?: (following: boolean) => void;
}

type Feature = GeoJSON.Feature<GeoJSON.Point, Record<string, string | number | boolean>>;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function attachOi(map: MlMap, options: OiGlobeOptions = {}): OiGlobe {
  const layer = createArcLayer();
  const director = createDirector(map, options.onFollowChange);
  let state: RunState | null = null;
  let selected: string | null = null;
  let palette: ToneColors = { ...DEFAULT_TONES };
  /** The links drawn, in the order the layer indexes them, for turning a pick back into a link. */
  let drawn: Link[] = [];
  /** When each link (by id and version) started drawing, on the layer's clock. */
  const births = new Map<string, number>();
  const nodeBirths = new Map<string, number>();
  /** When each actor started deciding, so its ripple keeps its rhythm across updates. */
  const thinkingSince = new Map<string, number>();
  let focusSince = 0;
  let hoverKey: string | null = null;

  const ensure = () => {
    if (!map.getStyle()) return;
    if (!map.getLayer(OI_ARCS)) map.addLayer(layer);
    if (!map.getSource(NODES)) map.addSource(NODES, { type: 'geojson', data: EMPTY });
    if (!map.getLayer('oi-node-halo')) {
      map.addLayer({
        id: 'oi-node-halo', type: 'circle', source: NODES,
        paint: {
          'circle-radius': ['get', 'halo'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['==', ['get', 'sel'], 1], 0.32, ['==', ['get', 'dim'], 1], 0.05, 0.16],
          'circle-blur': 0.7,
          'circle-pitch-alignment': 'map',
        },
      });
    }
    if (!map.getLayer('oi-node-core')) {
      map.addLayer({
        id: 'oi-node-core', type: 'circle', source: NODES,
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['==', ['get', 'dim'], 1], 0.3, ['==', ['get', 'kind'], 'context'], 0.75, 0.95],
          'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 2.5, ['==', ['get', 'kind'], 'actor'], 1.5, 1],
          'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#ffffff', ['==', ['get', 'kind'], 'actor'], 'rgba(243,234,255,0.9)', 'rgba(10,6,20,0.9)'],
        },
      });
    }
    const label = (id: string, filter: FilterSpecification, size: number, minzoom = 0) => {
      if (map.getLayer(id)) return;
      map.addLayer({
        id, type: 'symbol', source: NODES, filter, minzoom,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Bold'],
          'text-size': size,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': ['case', ['==', ['get', 'dim'], 1], 'rgba(239,228,255,0.32)', '#EFE4FF'],
          'text-halo-color': 'rgba(8,4,18,0.92)',
          'text-halo-width': 1.4,
        },
      });
    };
    // Actors, scenarios and signposts are always named; an event is named once the view is close, or when selected.
    label('oi-label-actor', ['any', ['in', ['get', 'kind'], ['literal', ['actor', 'scenario', 'signpost']]], ['all', ['==', ['get', 'kind'], 'event'], ['==', ['get', 'sel'], 1]]], 10);
    label('oi-label-agent', ['all', ['==', ['get', 'kind'], 'event'], ['!=', ['get', 'sel'], 1]], 9, 2.4);
    if (!map.getLayer('oi-label-forecast')) {
      map.addLayer({
        id: 'oi-label-forecast', type: 'symbol', source: NODES, filter: ['==', ['get', 'kind'], 'focus'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Bold'],
          'text-size': 14,
          'text-letter-spacing': 0.06,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#F5ECFF', 'text-halo-color': 'rgba(120,60,220,0.55)', 'text-halo-width': 2.2, 'text-halo-blur': 1.2 },
      });
    }
  };

  /* Pointer: points come from MapLibre's own hit-testing; arcs from the picking pass. */
  const nodeAt = (p: { x: number; y: number }): string | null => {
    if (!map.getLayer('oi-node-core')) return null;
    const f = map.queryRenderedFeatures([p.x, p.y], { layers: ['oi-node-core'] })[0];
    const key = f?.properties?.key;
    return typeof key === 'string' && key !== 'focus' ? key : null;
  };
  const arcAt = (p: { x: number; y: number }): string | null => {
    if (!drawn.length) return null;
    const i = layer.pick(p.x, p.y);
    return i === null ? null : `link:${drawn[i].id}`;
  };

  const onClick = (e: MapMouseEvent) => {
    if (!state) return;
    const key = nodeAt(e.point) ?? arcAt(e.point);
    if (key) options.onSelect?.(key);
    else if (selected) options.onSelect?.(null);
  };

  let lastMove = 0;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  const onMove = (e: MapMouseEvent) => {
    if (!state || (!drawn.length && !state.actors.length)) return;
    const run = () => {
      lastMove = performance.now();
      const key = nodeAt(e.point) ?? arcAt(e.point);
      const arcIndex = key?.startsWith('link:') ? drawn.findIndex(l => `link:${l.id}` === key) : -1;
      layer.setHover(arcIndex);
      map.getCanvas().style.cursor = key ? 'pointer' : '';
      if (key === hoverKey && !key) return;
      hoverKey = key;
      const b = key && state ? brief(state, key) : null;
      options.onHover?.(b && key ? { key, ...b, x: e.point.x, y: e.point.y } : null);
    };
    // Picking reads pixels back from the GPU: at most every 70 ms, and always the latest position.
    if (moveTimer) clearTimeout(moveTimer);
    const wait = 70 - (performance.now() - lastMove);
    if (wait <= 0) run();
    else moveTimer = setTimeout(run, wait);
  };
  const onLeave = () => {
    if (moveTimer) clearTimeout(moveTimer);
    layer.setHover(-1);
    if (hoverKey) { hoverKey = null; options.onHover?.(null); }
  };

  map.on('click', onClick);
  map.on('mousemove', onMove);
  map.on('mouseout', onLeave);
  const onStyle = () => { ensure(); if (state) draw(state); };
  map.on('style.load', onStyle);

  function draw(s: RunState) {
    const now = clock();
    const pos = new Map<string, LngLat>();
    for (const a of s.actors) if (a.lat !== null && a.lng !== null) pos.set(`a:${a.id}`, [a.lng, a.lat]);
    for (const c of s.context) if (c.lat !== null && c.lng !== null) pos.set(`c:${c.id}`, [c.lng, c.lat]);

    const lit = relatedLinks(s, selected);
    const dimOthers = lit.size > 0;

    // New arcs are staggered, so a burst (a replayed run, a world model) draws in sequence rather than at once.
    const version = (l: Link) => `${l.id}|${l.round}|${l.tone}`;
    // A quote's thread runs to a headline or a passage, most of them nowhere on Earth: the graph draws those.
    const shown = s.links.filter(l => l.kind !== 'cite');
    const fresh = shown.filter(l => !births.has(version(l)));
    const gap = fresh.length > 1 ? Math.min(0.14, 3 / fresh.length) : 0;
    fresh.forEach((l, i) => births.set(version(l), now + i * gap));
    const arcs: ArcSpec[] = [];
    drawn = [];
    for (const l of shown) {
      const from = pos.get(l.from);
      const to = pos.get(l.to);
      if (!from || !to || (from[0] === to[0] && from[1] === to[1])) continue;
      arcs.push({
        from, to, tone: TONE[l.tone], id: drawn.length, highlight: lit.has(l.id) ? 1 : 0,
        strength: l.strength, birth: births.get(version(l))!, kind: KIND[l.kind],
      });
      drawn.push(l);
    }
    layer.setArcs(arcs, dimOthers);
    layer.setLive(s.status === 'running');

    // Nodes. With a selection, the ones it touches stay lit and the rest dim.
    const touching = new Set<string>();
    if (selected) {
      touching.add(selected);
      for (const l of s.links) if (lit.has(l.id)) { touching.add(l.from); touching.add(l.to); }
    }
    const dimNode = (key: string) => (selected && touching.size > 1 && !touching.has(key) ? 1 : 0);
    // Each cast actor's latest move, across the worlds.
    const latest = new Map<string, Move>();
    for (const m of s.moves) latest.set(m.actor, m);
    const features: Feature[] = [];
    const point = (lng: number, lat: number, props: Record<string, string | number | boolean>): Feature =>
      ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
    for (const c of s.context) {
      if (c.lat === null || c.lng === null) continue;
      const key = `c:${c.id}`;
      features.push(point(c.lng, c.lat, { key, kind: 'context', label: '', color: '#9A93B8', radius: 2.6, halo: 6, sel: key === selected ? 1 : 0, dim: dimNode(key) }));
    }
    for (const a of s.actors) {
      if (a.lat === null || a.lng === null) continue;
      const key = `a:${a.id}`;
      const color = a.persona ? actorTint(s, latest.get(a.id)) : lift(palette.support, 0.35);
      features.push(point(a.lng, a.lat, { key, kind: 'actor', label: a.name, color, radius: key === selected ? 6.5 : a.persona ? 5.5 : 4.2, halo: a.persona ? 18 : 12, sel: key === selected ? 1 : 0, dim: dimNode(key) }));
    }
    // What happened in the simulated worlds, where it happened.
    for (const e of s.events) {
      if (e.lat === null || e.lng === null) continue;
      const key = `e:${e.id}`;
      features.push(point(e.lng, e.lat, {
        key, kind: 'event', label: `${e.world} · ${e.title.length > 36 ? `${e.title.slice(0, 35)}…` : e.title}`,
        color: leanColor(e.push === 'yes' ? 0.88 : e.push === 'no' ? 0.12 : 0.5), radius: key === selected ? 4.5 : e.kind === 'shock' ? 3.6 : 2.8, halo: 8,
        sel: key === selected ? 1 : 0, dim: dimNode(key),
      }));
    }
    if (s.report) {
      s.report.scenarios.forEach((sc, i) => {
        if (sc.lat === null || sc.lng === null) return;
        const key = `s:${i}`;
        features.push(point(sc.lng, sc.lat, {
          key, kind: 'scenario', label: `${sc.name} · ${Math.round(sc.probability * 100)}%`,
          color: lift(palette.support, 0.6), radius: 3 + 8 * sc.probability, halo: 10 + 24 * sc.probability, sel: key === selected ? 1 : 0, dim: dimNode(key),
        }));
      });
      s.report.signposts.forEach((sp, i) => {
        if (sp.lat === null || sp.lng === null) return;
        const key = `p:${i}`;
        features.push(point(sp.lng, sp.lat, {
          key, kind: 'signpost', label: sp.text.length > 40 ? `${sp.text.slice(0, 39)}…` : sp.text,
          color: leanColor(sp.means === 'yes' ? 0.9 : 0.1), radius: 3, halo: 8, sel: key === selected ? 1 : 0, dim: dimNode(key),
        }));
      });
    }
    const focus = s.frame?.focus;
    const figure = shortAnswer(s.frame, s.report, s.rounds[s.rounds.length - 1] ?? null);
    if (focus && focus.lat !== null && focus.lng !== null && figure) {
      features.push(point(focus.lng, focus.lat, { key: 'focus', kind: 'focus', label: s.report ? figure : `${figure} …`, color: '#FFFFFF', radius: 0, halo: 0, sel: 0, dim: 0 }));
    }
    (map.getSource(NODES) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });

    // Ripples: a node's arrival, an actor deciding, and the prediction's home while the run is live.
    const pings: Ping[] = [];
    const base = rgb(palette.support);
    for (const f of features) {
      const key = String(f.properties.key);
      if (f.properties.kind === 'context' || f.properties.kind === 'focus') continue;
      if (!nodeBirths.has(key)) nodeBirths.set(key, now + (nodeBirths.size % 12) * 0.05);
      const [lng, lat] = f.geometry.coordinates as LngLat;
      pings.push({ pos: mercator([lng, lat]), color: f.properties.kind === 'actor' ? base : rgb(String(f.properties.color)), size: 26, start: nodeBirths.get(key)!, period: 1.5, once: true });
    }
    // An actor deciding its next move, in any world, ripples.
    const deciding = new Set(Object.keys(s.thinking).map(k => k.split(':')[1]));
    for (const id of [...thinkingSince.keys()]) if (!deciding.has(id)) thinkingSince.delete(id);
    for (const a of s.actors) {
      if (!deciding.has(a.id) || a.lat === null || a.lng === null) continue;
      if (!thinkingSince.has(a.id)) thinkingSince.set(a.id, now);
      pings.push({ pos: mercator([a.lng, a.lat]), color: rgb(lift(palette.support, 0.4)), size: 30, start: thinkingSince.get(a.id)!, period: 1.1, once: false });
    }
    if (s.status === 'running' && focus && focus.lat !== null && focus.lng !== null) {
      focusSince ||= now;
      pings.push({ pos: mercator([focus.lng, focus.lat]), color: base, size: 70, start: focusSince, period: 2.8, once: false });
    }
    layer.setPings(pings);
  }

  const reset = () => {
    births.clear();
    nodeBirths.clear();
    thinkingSince.clear();
    focusSince = 0;
  };

  ensure();

  return {
    update(next) {
      if (next && state && next.startedAt !== state.startedAt) reset();
      state = next;
      ensure();
      if (!next) {
        director.update(null);
        reset();
        drawn = [];
        layer.setArcs([], false);
        layer.setPings([]);
        layer.setLive(false);
        (map.getSource(NODES) as GeoJSONSource | undefined)?.setData(EMPTY);
        return;
      }
      draw(next);
      director.update(next);
    },
    select(key) {
      if (key === selected) return;
      selected = key;
      if (state) draw(state);
    },
    setColors(colors) {
      const valid = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex);
      if (![colors.support, colors.oppose, colors.neutral].every(valid)) return;
      if (colors.support === palette.support && colors.oppose === palette.oppose && colors.neutral === palette.neutral) return;
      palette = { ...colors };
      layer.setTones([palette.support, palette.oppose, palette.neutral].map(rgb));
      if (state) draw(state);
    },
    setInsets(padding) {
      map.easeTo({ padding: padding ?? { top: 0, right: 0, bottom: 0, left: 0 }, duration: 650 });
    },
    follow(on) {
      director.follow(on);
    },
    ensure,
    hit(point) {
      return state ? nodeAt(point) ?? arcAt(point) : null;
    },
    destroy() {
      director.destroy();
      map.off('click', onClick);
      map.off('mousemove', onMove);
      map.off('mouseout', onLeave);
      map.off('style.load', onStyle);
      if (moveTimer) clearTimeout(moveTimer);
      if (!map.getStyle()) return;
      for (const id of [...LAYERS, OI_ARCS]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(NODES)) map.removeSource(NODES);
    },
  };
}

export { frameRun } from './camera';

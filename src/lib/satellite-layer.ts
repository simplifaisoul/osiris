import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';

/**
 * OSIRIS — satellites drawn at their real altitude
 *
 * Satellites were circle features pinned to the ground, so a 35,786 km GEO
 * bird and a 400 km ISS sat on the same surface as a traffic camera. The map
 * already runs MapLibre's globe projection, and the catalogue already carries
 * an altitude per satellite; nothing was lifting one off the other.
 *
 * MapLibre has no elevation property on circle or symbol layers. It does hand
 * custom layers a projection prelude, and in globe mode that prelude exposes
 *
 *     vec4 projectTileFor3D(vec2 posInTile, float elevation)
 *
 * which is what places geometry above the surface with the globe's own
 * curvature and camera. Verified against the running map before this was
 * written: the globe variant of the prelude does export it.
 *
 * Using MapLibre's prelude rather than our own matrix maths is what makes this
 * survive a projection change — the same shader compiles for mercator, where
 * `projectTileFor3D` is the flat-map equivalent, so the layer keeps working
 * when the operator presses 2D.
 */

/** Elevation is metres above the ellipsoid; the catalogue is in kilometres. */
const KM_TO_M = 1000;

/**
 * Altitude is compressed into a band the camera can actually show.
 *
 * Two hard limits bound this, both found by rendering and reading back the
 * framebuffer rather than by reasoning:
 *
 *   Floor. A satellite drawn at or near the surface is rejected by the depth
 *   test against the globe — it z-fights the very sphere it orbits. Nothing
 *   below roughly a tenth of an Earth radius reliably survives.
 *
 *   Ceiling. Drawn anywhere near true scale, GEO leaves the view frustum at
 *   any zoom that also shows the ground, and simply vanishes.
 *
 * So real altitude is mapped onto [FLOOR_KM, CEILING_KM]. The curve is sqrt,
 * which spreads the LEO shell — where most of the catalogue lives, 161 km to
 * about 2,000 km — instead of compressing it into a single line, while still
 * placing MEO and GEO distinguishably above it.
 *
 * This is a display transform, not a measurement. The popup shows the real
 * altitude in kilometres.
 */
const FLOOR_KM = 620;      // clears the globe depth test
const CEILING_KM = 2500;   // stays inside the frustum at world zoom
const MIN_ALT_KM = 150;    // lowest catalogue altitude that still orbits
const MAX_ALT_KM = 36000;  // the GEO belt

export function displayElevation(altKm: number, exaggeration = 1): number {
  if (!Number.isFinite(altKm) || altKm <= 0) return 0;
  const clamped = Math.min(Math.max(altKm, MIN_ALT_KM), MAX_ALT_KM);
  const t = (Math.sqrt(clamped) - Math.sqrt(MIN_ALT_KM)) /
            (Math.sqrt(MAX_ALT_KM) - Math.sqrt(MIN_ALT_KM));
  return (FLOOR_KM + (CEILING_KM - FLOOR_KM) * t) * exaggeration * KM_TO_M;
}

export interface SatPoint {
  lng: number;
  lat: number;
  altKm: number;
  /** Packed 0xRRGGBB. */
  color: number;
  /** Point size multiplier — the ISS and other stations read larger. */
  size: number;
}

const VERT = `
in vec2 a_corner;   // unit quad, -1..1 — one shared quad, drawn per instance
in vec3 a_pos;      // x, y = mercator [0..1]; z = display elevation (metres)
in vec3 a_color;
in float a_size;
uniform vec2 u_viewport;
uniform int u_selected;
out vec2 v_corner;
out vec3 v_color;
out float v_hot;
void main() {
  vec4 clip = projectTileFor3D(a_pos.xy, a_pos.z);
  // Shrink with distance so a dense catalogue does not turn the globe into a
  // solid sheet of dots when zoomed out.
  float px = clamp(a_size * 260.0 / max(clip.w, 0.0001), 2.5, 16.0);
  // One satellite out of nineteen thousand is invisible unless it is told to
  // stand out; the selected one gets size and a ring.
  v_hot = gl_InstanceID == u_selected ? 1.0 : 0.0;
  px += v_hot * 9.0;
  // Expand the quad in clip space. Multiplying by clip.w cancels the
  // perspective divide, so the marker keeps a constant size in pixels.
  gl_Position = clip + vec4(a_corner * px / u_viewport * 2.0 * clip.w, 0.0, 0.0);
  v_corner = a_corner;
  v_color = a_color;
}`;

const FRAG = `
precision mediump float;
in vec2 v_corner;
in vec3 v_color;
in float v_hot;
out vec4 fragColor;
void main() {
  // Round the marker off inside the quad; square satellites read as dead
  // pixels rather than objects.
  float r = length(v_corner);
  if (r > 1.0) discard;
  if (v_hot > 0.5) {
    // A bright ring rather than a bigger blob — a blob just looks like a
    // closer satellite, a ring reads as a selection.
    float ring = smoothstep(0.55, 0.75, r) * smoothstep(1.0, 0.85, r);
    vec3 c = mix(v_color, vec3(1.0), 0.55);
    fragColor = vec4(c, max(ring, smoothstep(0.45, 0.0, r)) * 0.95);
    return;
  }
  fragColor = vec4(v_color, smoothstep(1.0, 0.55, r));
}`;

/**
 * The picking pass. Same vertex maths as the visible pass — that is the whole
 * point: whatever the projection does to a satellite on screen, the pick
 * agrees, because it is the identical computation. Reimplementing the globe
 * projection on the CPU to hit-test would be a second source of truth, and it
 * would drift.
 *
 * The instance index is written straight out as a colour. gl_InstanceID means
 * no extra attribute is needed.
 */
const PICK_VERT = `
in vec2 a_corner;
in vec3 a_pos;
in float a_size;
uniform vec2 u_viewport;
flat out vec3 v_id;
out vec2 v_corner;
void main() {
  vec4 clip = projectTileFor3D(a_pos.xy, a_pos.z);
  // A little larger than the drawn marker: clicking is coarse, and a target
  // the exact size of a 3px dot is a target nobody can hit.
  float px = clamp(a_size * 260.0 / max(clip.w, 0.0001), 2.5, 16.0) + 4.0;
  gl_Position = clip + vec4(a_corner * px / u_viewport * 2.0 * clip.w, 0.0, 0.0);
  int id = gl_InstanceID + 1;   // 0 is reserved for 'nothing here'
  v_id = vec3(float(id & 255), float((id >> 8) & 255), float((id >> 16) & 255)) / 255.0;
  v_corner = a_corner;
}`;

const PICK_FRAG = `
precision mediump float;
flat in vec3 v_id;
in vec2 v_corner;
out vec4 fragColor;
void main() {
  if (length(v_corner) > 1.0) discard;
  fragColor = vec4(v_id, 1.0);
}`;

/**
 * The orbit track of the selected satellite, drawn at altitude rather than
 * projected onto the ground. A ground track is a different object: it shows
 * where the satellite passes over, not where it is. Lifting the line to the
 * same elevation as the marker is what makes it read as an orbit around the
 * planet instead of a line drawn on it.
 */
const ORBIT_VERT = `
in vec3 a_pos;
void main() {
  gl_Position = projectTileFor3D(a_pos.xy, a_pos.z);
}`;

const ORBIT_FRAG = `
precision mediump float;
uniform vec3 u_color;
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 0.85); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`satellite layer shader failed: ${log}`);
  }
  return sh;
}

/**
 * Builds the interleaved vertex buffer for a set of satellites.
 *
 * Exported so the packing is testable without a GL context: this is where an
 * off-by-one silently puts every satellite at the wrong altitude.
 */
export function packVertices(points: SatPoint[], exaggeration = 1): Float32Array<ArrayBuffer> {
  const STRIDE = 7; // x, y, z, r, g, b, size
  const out = new Float32Array(points.length * STRIDE);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const m = MercatorCoordinate.fromLngLat({ lng: p.lng, lat: p.lat }, 0);
    const o = i * STRIDE;
    out[o] = m.x;
    out[o + 1] = m.y;
    out[o + 2] = displayElevation(p.altKm, exaggeration);
    out[o + 3] = ((p.color >> 16) & 0xff) / 255;
    out[o + 4] = ((p.color >> 8) & 0xff) / 255;
    out[o + 5] = (p.color & 0xff) / 255;
    out[o + 6] = p.size;
  }
  return out;
}

/**
 * Packs one orbit segment. Same mercator + metres-of-elevation contract as
 * packVertices, so the track and the marker land in the same space.
 */
export function packOrbit(segment: { lng: number; lat: number; altKm: number }[], exaggeration = 1): Float32Array<ArrayBuffer> {
  const out = new Float32Array(segment.length * 3);
  for (let i = 0; i < segment.length; i++) {
    const p = segment[i];
    const m = MercatorCoordinate.fromLngLat({ lng: p.lng, lat: p.lat }, 0);
    out[i * 3] = m.x;
    out[i * 3 + 1] = m.y;
    out[i * 3 + 2] = displayElevation(p.altKm, exaggeration);
  }
  return out;
}

/** Parses "#RRGGBB" (or a bare RRGGBB) into a packed integer. */
export function parseColor(hex: string | undefined, fallback = 0x00e5ff): number {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1], 16) : fallback;
}

/**
 * A MapLibre custom layer drawing satellites as points at altitude.
 *
 * The shader is compiled lazily per projection variant: MapLibre changes the
 * prelude when the projection changes, and a program built against the globe
 * prelude draws nothing under mercator.
 */
export function createSatelliteLayer(id: string): CustomLayerInterface & {
  setPoints(points: SatPoint[]): void;
  setExaggeration(value: number): void;
  /** Index into the last setPoints() array, or null if nothing is under (x, y). */
  pick(x: number, y: number): number | null;
  /** Orbit track of the selected satellite; null clears it. */
  setOrbit(segments: { lng: number; lat: number; altKm: number }[][] | null, color?: number): void;
  /** Highlights one index from the last setPoints(); null clears it. */
  setSelected(index: number | null): void;
} {
  let gl: WebGL2RenderingContext | null = null;
  let map: MlMap | null = null;
  let program: WebGLProgram | null = null;
  let variant = '';
  let buffer: WebGLBuffer | null = null;
  let quad: WebGLBuffer | null = null;
  let pickProgram: WebGLProgram | null = null;
  let pickFbo: WebGLFramebuffer | null = null;
  let pickTex: WebGLTexture | null = null;
  let pickDepth: WebGLRenderbuffer | null = null;
  let pickSize = { w: 0, h: 0 };
  // The projection uniforms are only handed to us during render(). A pick
  // happens on a click, between frames, so the last frame's values are kept
  // and reused — the camera has not moved since.
  let lastProjection: CustomRenderMethodInput['defaultProjectionData'] | null = null;
  let orbitProgram: WebGLProgram | null = null;
  let orbitBuffers: { buf: WebGLBuffer; count: number }[] = [];
  let orbitSegments: { lng: number; lat: number; altKm: number }[][] | null = null;
  let orbitColor = 0x00e5ff;
  let orbitDirty = false;
  let selected = -1;
  let vertices: Float32Array<ArrayBuffer> = new Float32Array(0);
  let count = 0;
  let exaggeration = 1;
  let points: SatPoint[] = [];
  let dirty = false;

  const link = (prelude: string, define: string, vert: string, frag: string): WebGLProgram => {
    const vs = compile(gl!, gl!.VERTEX_SHADER, `#version 300 es\n${prelude}\n${define}\n${vert}`);
    const fs = compile(gl!, gl!.FRAGMENT_SHADER, `#version 300 es\n${frag}`);
    const pr = gl!.createProgram()!;
    gl!.attachShader(pr, vs);
    gl!.attachShader(pr, fs);
    gl!.linkProgram(pr);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(pr, gl!.LINK_STATUS)) {
      const log = gl!.getProgramInfoLog(pr);
      gl!.deleteProgram(pr);
      throw new Error(`satellite layer link failed: ${log}`);
    }
    return pr;
  };

  const buildProgram = (prelude: string, define: string) => {
    if (!gl) return;
    if (program) gl.deleteProgram(program);
    program = link(prelude, define, VERT, FRAG);
  };

  /** Lazily sized colour+depth target for the pick pass. */
  const ensurePickTargets = (w: number, h: number) => {
    if (!gl || (pickSize.w === w && pickSize.h === h && pickFbo)) return;
    if (pickTex) gl.deleteTexture(pickTex);
    if (pickDepth) gl.deleteRenderbuffer(pickDepth);
    if (pickFbo) gl.deleteFramebuffer(pickFbo);
    pickTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pickTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    pickDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    pickFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    pickSize = { w, h };
  };

  /** Binds the quad + per-instance attributes for whichever program is active. */
  const bindAttributes = (pr: WebGLProgram) => {
    const cornerLoc = gl!.getAttribLocation(pr, 'a_corner');
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.enableVertexAttribArray(cornerLoc);
    gl!.vertexAttribPointer(cornerLoc, 2, gl!.FLOAT, false, 0, 0);
    gl!.vertexAttribDivisor(cornerLoc, 0);

    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    const STRIDE = 7 * 4;
    for (const [name, size, offset] of [['a_pos', 3, 0], ['a_color', 3, 12], ['a_size', 1, 24]] as const) {
      const loc = gl!.getAttribLocation(pr, name);
      if (loc < 0) continue;
      gl!.enableVertexAttribArray(loc);
      gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, STRIDE, offset);
      gl!.vertexAttribDivisor(loc, 1);
    }
    return cornerLoc;
  };

  /** Instancing divisors are global; leaving them set corrupts later layers. */
  const clearDivisors = (pr: WebGLProgram, cornerLoc: number) => {
    gl!.vertexAttribDivisor(cornerLoc, 0);
    for (const n of ['a_pos', 'a_color', 'a_size']) {
      const loc = gl!.getAttribLocation(pr, n);
      if (loc >= 0) gl!.vertexAttribDivisor(loc, 0);
    }
  };

  const setProjectionUniforms = (pr: WebGLProgram, proj: NonNullable<CustomRenderMethodInput['defaultProjectionData']>) => {
    const u = (name: string) => gl!.getUniformLocation(pr, name);
    gl!.uniformMatrix4fv(u('u_projection_matrix'), false, proj.mainMatrix);
    gl!.uniform4f(u('u_projection_tile_mercator_coords'),
      proj.tileMercatorCoords[0], proj.tileMercatorCoords[1],
      proj.tileMercatorCoords[2], proj.tileMercatorCoords[3]);
    gl!.uniform4f(u('u_projection_clipping_plane'),
      proj.clippingPlane[0], proj.clippingPlane[1],
      proj.clippingPlane[2], proj.clippingPlane[3]);
    gl!.uniform1f(u('u_projection_transition'), proj.projectionTransition);
    gl!.uniformMatrix4fv(u('u_projection_fallback_matrix'), false, proj.fallbackMatrix);
  };

  return {
    id,
    type: 'custom',
    // '3d' so MapLibre depth-tests it against the globe: a satellite behind
    // the Earth must be occluded by it, not drawn over the top.
    renderingMode: '3d',

    onAdd(m: MlMap, context: WebGL2RenderingContext) {
      map = m;
      gl = context;
      buffer = gl.createBuffer();
      // One unit quad, reused for every satellite via instancing.
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1,  1,  1, -1,   1, 1,
      ]), gl.STATIC_DRAW);
      dirty = true;
    },

    onRemove() {
      if (gl) {
        if (program) gl.deleteProgram(program);
        if (buffer) gl.deleteBuffer(buffer);
        if (quad) gl.deleteBuffer(quad);
        if (pickProgram) gl.deleteProgram(pickProgram);
        if (pickTex) gl.deleteTexture(pickTex);
        if (pickDepth) gl.deleteRenderbuffer(pickDepth);
        if (pickFbo) gl.deleteFramebuffer(pickFbo);
        if (orbitProgram) gl.deleteProgram(orbitProgram);
        for (const o of orbitBuffers) gl.deleteBuffer(o.buf);
      }
      program = null;
      buffer = null;
      quad = null;
      pickProgram = null;
      pickTex = null;
      pickDepth = null;
      pickFbo = null;
      pickSize = { w: 0, h: 0 };
      orbitProgram = null;
      orbitBuffers = [];
      gl = null;
      map = null;
    },

    setPoints(next: SatPoint[]) {
      points = next;
      dirty = true;
      map?.triggerRepaint();
    },

    setExaggeration(value: number) {
      exaggeration = value;
      dirty = true;
      orbitDirty = true;
      map?.triggerRepaint();
    },

    setSelected(index: number | null) {
      selected = index ?? -1;
      map?.triggerRepaint();
    },

    setOrbit(segments, color) {
      orbitSegments = segments;
      if (color !== undefined) orbitColor = color;
      orbitDirty = true;
      map?.triggerRepaint();
    },

    /**
     * Renders the satellites into an offscreen buffer with each instance
     * coloured by its index, then reads back the pixels around (x, y).
     *
     * Coordinates are CSS pixels, as an event reports them; the draw buffer
     * may be larger on a scaled display, so they are converted first.
     */
    pick(x: number, y: number): number | null {
      if (!gl || !pickProgram || !buffer || !lastProjection || count === 0) return null;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      ensurePickTargets(w, h);
      if (!pickFbo) return null;

      const ratio = w / (gl.canvas as HTMLCanvasElement).clientWidth;
      const px = Math.round(x * ratio);
      // GL's origin is bottom-left; a DOM event's is top-left.
      const py = Math.round(h - y * ratio);

      const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pickFbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND);
      // No globe in this buffer to occlude against, so depth testing here
      // would only let satellites hide each other. Nearest-to-cursor wins.
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(pickProgram);
      setProjectionUniforms(pickProgram, lastProjection);
      gl.uniform2f(gl.getUniformLocation(pickProgram, 'u_viewport'), w, h);
      const cornerLoc = bindAttributes(pickProgram);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      clearDivisors(pickProgram, cornerLoc);

      // Read a small box, not one pixel: a click is never exact, and a marker
      // a few pixels across is otherwise unhittable.
      const R = 7;
      const x0 = Math.max(0, px - R), y0 = Math.max(0, py - R);
      const bw = Math.min(w - x0, R * 2 + 1), bh = Math.min(h - y0, R * 2 + 1);
      let best: number | null = null;
      if (bw > 0 && bh > 0) {
        const buf = new Uint8Array(bw * bh * 4);
        gl.readPixels(x0, y0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let bestDist = Infinity;
        for (let iy = 0; iy < bh; iy++) {
          for (let ix = 0; ix < bw; ix++) {
            const o = (iy * bw + ix) * 4;
            const id = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
            if (id === 0) continue;
            const dx = x0 + ix - px, dy = y0 + iy - py;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = id - 1; }
          }
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      return best !== null && best >= 0 && best < count ? best : null;
    },
    render(_context: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      if (!gl || !buffer) return;
      const shader = args?.shaderData;
      if (!shader?.vertexShaderPrelude) return;

      // Recompile when the projection changes — globe and mercator ship
      // different preludes, and the old program silently draws nothing.
      if (!program || variant !== shader.variantName) {
        try {
          buildProgram(shader.vertexShaderPrelude, shader.define || '');
          pickProgram = link(shader.vertexShaderPrelude, shader.define || '', PICK_VERT, PICK_FRAG);
          orbitProgram = link(shader.vertexShaderPrelude, shader.define || '', ORBIT_VERT, ORBIT_FRAG);
          orbitDirty = true;
          variant = shader.variantName || '';
        } catch (err) {
          console.error('[OSIRIS] satellite layer:', err instanceof Error ? err.message : err);
          return;
        }
      }
      if (!program) return;

      if (dirty) {
        vertices = packVertices(points, exaggeration);
        count = points.length;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        dirty = false;
      }
      if (count === 0) return;

      gl.useProgram(program);

      // MapLibre's prelude declares the projection uniforms but does not bind
      // them for a custom layer's own program — `defaultProjectionData` is
      // where the values come from, and every one has to be set. Without them
      // projectTile() reads zeroed uniforms and every vertex lands off-screen:
      // the draw succeeds, GL reports no error, and nothing appears.
      const proj = args.defaultProjectionData;
      lastProjection = proj ?? lastProjection;
      if (proj) setProjectionUniforms(program, proj);

      // The track first, so the marker draws over its own line.
      if (orbitDirty && orbitProgram) {
        for (const o of orbitBuffers) gl.deleteBuffer(o.buf);
        orbitBuffers = (orbitSegments ?? []).filter(seg => seg.length > 1).map(seg => {
          const data = packOrbit(seg, exaggeration);
          const buf = gl!.createBuffer()!;
          gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
          gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
          return { buf, count: seg.length };
        });
        orbitDirty = false;
      }
      if (orbitProgram && orbitBuffers.length && proj) {
        gl.useProgram(orbitProgram);
        setProjectionUniforms(orbitProgram, proj);
        gl.uniform3f(gl.getUniformLocation(orbitProgram, 'u_color'),
          ((orbitColor >> 16) & 0xff) / 255, ((orbitColor >> 8) & 0xff) / 255, (orbitColor & 0xff) / 255);
        const loc = gl.getAttribLocation(orbitProgram, 'a_pos');
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const o of orbitBuffers) {
          gl.bindBuffer(gl.ARRAY_BUFFER, o.buf);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
          gl.vertexAttribDivisor(loc, 0);
          gl.drawArrays(gl.LINE_STRIP, 0, o.count);
        }
        gl.depthMask(true);
        gl.useProgram(program);
        setProjectionUniforms(program, proj);
      }

      const cornerLoc = bindAttributes(program);
      gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1i(gl.getUniformLocation(program, 'u_selected'), selected);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      // Depth-tested against the globe so the far side occludes, but not
      // depth-written: satellites should not occlude each other into a mess.
      gl.depthMask(false);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.depthMask(true);
      clearDivisors(program, cornerLoc);
    },
  };
}

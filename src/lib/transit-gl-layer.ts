import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import { createSatelliteProgramCache } from './satellite-programs';

/**
 * OSIRIS — transit vehicles drawn on the GPU.
 *
 * Playback moves every vehicle a little each frame. Feeding those positions
 * through a GeoJSON source means MapLibre re-tiles the data and lays out an
 * icon per vehicle on every update; with a city's worth of buses that took
 * the map from 55 frames a second to 3. So the vehicles are a custom layer,
 * the way the satellites are: one buffer of positions is uploaded per frame
 * and one instanced draw puts them all on screen.
 *
 * Positions go through MapLibre's own projection prelude (`projectTileFor3D`,
 * at ground level), so the same shader is right on the flat map and the
 * globe. Vehicles are only sent for the part of the world in view, so the far
 * side of the globe never needs culling, and the layer is not depth-tested:
 * at the surface it would fight the globe itself.
 */

/** Floats per vehicle in the buffer setVehicles() takes. */
export const TRANSIT_STRIDE = 7; // mercator x, y; r, g, b; course (deg, or -1 for none); selected (0/1)

const VERT = `
in vec2 a_corner;    // unit quad, -1..1, shared by every instance
in vec2 a_pos;       // mercator [0..1]
in vec3 a_color;
in float a_course;   // degrees clockwise from north, or -1
in float a_selected;
uniform vec2 u_viewport;
uniform float u_size;      // marker radius, px
uniform float u_bearing;   // map bearing, degrees
uniform float u_arrows;    // 1 when close enough to show headings
out vec2 v_corner;
out vec3 v_color;
out float v_arrow;
out float v_selected;
void main() {
  vec4 clip = projectTileFor3D(a_pos, 0.0);
  float arrow = (a_course >= 0.0 && u_arrows > 0.5) ? 1.0 : 0.0;
  float px = u_size * (arrow > 0.5 ? 1.6 : 1.0) + a_selected * 6.0;
  // Turn the quad so its top points along the heading, as seen on screen.
  float a = radians(arrow > 0.5 ? a_course - u_bearing : 0.0);
  vec2 c = vec2(a_corner.x * cos(a) + a_corner.y * sin(a), -a_corner.x * sin(a) + a_corner.y * cos(a));
  // Expanded in clip space, times w to cancel the perspective divide: a constant size in pixels.
  gl_Position = clip + vec4(c * px / u_viewport * 2.0 * clip.w, 0.0, 0.0);
  v_corner = a_corner;
  v_color = a_color;
  v_arrow = arrow;
  v_selected = a_selected;
}`;

const FRAG = `
precision mediump float;
in vec2 v_corner;
in vec3 v_color;
in float v_arrow;
in float v_selected;
out vec4 fragColor;
// Inside a dot with a point on top: the body, then the tip.
float shape(vec2 p, float grow) {
  float body = length(p - vec2(0.0, -0.18)) - (0.58 + grow);
  // The tip: a wedge from the body up to y = 0.95.
  float tip = max(abs(p.x) * 1.15 + (p.y - 0.95) * 0.62, -(p.y + 0.1)) - grow;
  return min(body, tip);
}
void main() {
  vec2 p = v_corner;
  if (v_selected > 0.5) {
    // A ring around the selected vehicle; the vehicle itself is drawn by the inner disc.
    float r = length(p);
    if (r > 1.0) discard;
    float ring = smoothstep(0.78, 0.86, r) * smoothstep(1.0, 0.93, r);
    if (r < 0.62) {
      fragColor = vec4(v_color, 1.0);
      return;
    }
    fragColor = vec4(v_color, ring * 0.95);
    return;
  }
  if (v_arrow < 0.5) {
    float r = length(p);
    if (r > 1.0) discard;
    // A dark rim keeps a dot legible over a light street.
    vec3 c = mix(vec3(0.016, 0.067, 0.059), v_color, smoothstep(0.98, 0.78, r));
    fragColor = vec4(c, smoothstep(1.0, 0.9, r));
    return;
  }
  float d = shape(p, 0.0);
  float rim = shape(p, 0.09);
  if (rim > 0.02) discard;
  vec3 c = d < 0.0 ? v_color : vec3(0.016, 0.067, 0.059);
  fragColor = vec4(c, 1.0 - smoothstep(0.0, 0.02, rim));
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`transit layer shader failed: ${log}`);
  }
  return sh;
}

/** Packs "#RRGGBB" into three floats. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Writes one vehicle into the buffer at index i. */
export function packVehicle(out: Float32Array, i: number, lng: number, lat: number, color: [number, number, number], course: number | undefined, selected: boolean): void {
  const m = MercatorCoordinate.fromLngLat({ lng, lat }, 0);
  const o = i * TRANSIT_STRIDE;
  out[o] = m.x;
  out[o + 1] = m.y;
  out[o + 2] = color[0];
  out[o + 3] = color[1];
  out[o + 4] = color[2];
  out[o + 5] = course ?? -1;
  out[o + 6] = selected ? 1 : 0;
}

/** Marker radius in pixels for a zoom: small enough not to merge a city into a blob, large enough to click. */
export function markerSize(zoom: number): number {
  const stops: [number, number][] = [[5, 2.2], [9, 3.4], [12, 5], [16, 8], [19, 10]];
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, s1] = stops[i];
    const [z0, s0] = stops[i - 1];
    if (zoom <= z1) return s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0);
  }
  return stops[stops.length - 1][1];
}

/** From this zoom, vehicles that know their heading are drawn as arrows. */
export const ARROW_ZOOM = 12;

export function createTransitVehicleLayer(id: string): CustomLayerInterface & {
  /** The vehicles to draw: `count` records of TRANSIT_STRIDE floats. */
  setVehicles(data: Float32Array, count: number): void;
} {
  let gl: WebGL2RenderingContext | null = null;
  let map: MlMap | null = null;
  let buffer: WebGLBuffer | null = null;
  let quad: WebGLBuffer | null = null;
  let data: Float32Array = new Float32Array(0);
  let count = 0;
  let dirty = false;

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
      throw new Error(`transit layer link failed: ${log}`);
    }
    return pr;
  };
  // One program per projection variant: the prelude changes between flat and globe.
  const programs = createSatelliteProgramCache<WebGLProgram>((_kind, prelude, define) => link(prelude, define), pr => gl?.deleteProgram(pr));

  return {
    id,
    type: 'custom',
    renderingMode: '2d',

    onAdd(m: MlMap, context: WebGL2RenderingContext) {
      map = m;
      gl = context;
      buffer = gl.createBuffer();
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      dirty = true;
    },

    onRemove() {
      if (gl) {
        programs.clear();
        if (buffer) gl.deleteBuffer(buffer);
        if (quad) gl.deleteBuffer(quad);
      }
      buffer = null;
      quad = null;
      gl = null;
      map = null;
    },

    setVehicles(next: Float32Array, n: number) {
      data = next;
      count = n;
      dirty = true;
      map?.triggerRepaint();
    },

    render(_context: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      if (!gl || !buffer || !quad || !map || count === 0) return;
      const shader = args?.shaderData;
      const proj = args?.defaultProjectionData;
      if (!shader?.vertexShaderPrelude || !proj) return;
      let program: WebGLProgram;
      try { program = programs.get(shader, 'marker'); } catch (err) {
        console.error('[OSIRIS] transit layer:', err instanceof Error ? err.message : err);
        return;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (dirty) {
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * TRANSIT_STRIDE), gl.DYNAMIC_DRAW);
        dirty = false;
      }
      gl.useProgram(program);
      const u = (name: string) => gl!.getUniformLocation(program, name);
      // The prelude declares these but leaves a custom layer to set them, every one.
      gl.uniformMatrix4fv(u('u_projection_matrix'), false, proj.mainMatrix);
      gl.uniform4f(u('u_projection_tile_mercator_coords'), proj.tileMercatorCoords[0], proj.tileMercatorCoords[1], proj.tileMercatorCoords[2], proj.tileMercatorCoords[3]);
      gl.uniform4f(u('u_projection_clipping_plane'), proj.clippingPlane[0], proj.clippingPlane[1], proj.clippingPlane[2], proj.clippingPlane[3]);
      gl.uniform1f(u('u_projection_transition'), proj.projectionTransition);
      gl.uniformMatrix4fv(u('u_projection_fallback_matrix'), false, proj.fallbackMatrix);
      gl.uniform2f(u('u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      const ratio = gl.drawingBufferWidth / Math.max(1, map.getCanvas().clientWidth);
      gl.uniform1f(u('u_size'), markerSize(map.getZoom()) * ratio);
      gl.uniform1f(u('u_bearing'), map.getBearing());
      gl.uniform1f(u('u_arrows'), map.getZoom() >= ARROW_ZOOM ? 1 : 0);

      const cornerLoc = gl.getAttribLocation(program, 'a_corner');
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(cornerLoc);
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(cornerLoc, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const stride = TRANSIT_STRIDE * 4;
      const attrs = [['a_pos', 2, 0], ['a_color', 3, 8], ['a_course', 1, 20], ['a_selected', 1, 24]] as const;
      for (const [name, size, offset] of attrs) {
        const loc = gl.getAttribLocation(program, name);
        if (loc < 0) continue;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, 1);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

      // Divisors are global state; leaving them set corrupts the layers drawn after.
      gl.vertexAttribDivisor(cornerLoc, 0);
      for (const [name] of attrs) {
        const loc = gl.getAttribLocation(program, name);
        if (loc >= 0) gl.vertexAttribDivisor(loc, 0);
      }
    },
  };
}

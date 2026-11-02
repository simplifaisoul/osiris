import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createTileMesh, EXTENT } from 'maplibre-gl';
import {
  CLOUD_BASE_M, CLOUD_RELIEF_M, CLOUDS_MAX_ZOOM, PAD, PADDED, TILE,
  cloudLift, cloudOpacity, shadowOffset, type CloudImage, type Tile,
} from './live-clouds';
import { requestCloudTile } from './live-clouds-client';

/**
 * OSIRIS — Live Clouds hung in the sky.
 *
 * A raster layer can only paint onto the ground, so cloud drawn that way lay on
 * top of the places under it like a sheet of paper. This layer lifts it. Each
 * tile is a mesh raised to cloud altitude, and every point of it is raised
 * further by the height of the cloud top there — measured from the infrared —
 * so storm towers stand above low cloud, and tilting the map shows the deck
 * floating over the ground with its shadow falling separately beneath it.
 *
 * The geometry goes through MapLibre's own projectTileFor3D, the same function
 * the satellite layer uses, so it curves with the globe, flattens with the 2D
 * map, and the far side of the planet hides it.
 */

/** Tiles kept on the GPU, about 360 KB each. */
const CACHE = 160;
/** Tile requests in flight at once. */
const IN_FLIGHT = 12;
/** Most tiles drawn in a frame; a steeply tilted view reaches to the horizon. */
const MAX_TILES = 96;
/** Quads per tile side: enough for the globe's curve and the cloud relief. */
const GRANULARITY = 64;
/** How long a failed tile waits before it is asked for again. */
const RETRY_MS = 30_000;
/** Ground shadow: how dark at most, and its colour, a near-black blue. */
const SHADOW = 0.42;
const SHADOW_RGB = [0.01, 0.02, 0.055] as const;

const VERT = `
layout(location = 0) in vec2 a_pos;   // tile-local, 0..EXTENT
uniform sampler2D u_height;
uniform vec4 u_uv;      // where this tile sits on the texture drawn over it: offset, scale
uniform float u_base;   // altitude of the lowest cloud, metres
uniform float u_relief; // added for the highest
uniform float u_lift;   // 1 for the cloud, 0 for its shadow on the ground
out vec2 v_uv;
void main() {
  v_uv = u_uv.xy + clamp(a_pos / ${EXTENT}.0, 0.0, 1.0) * u_uv.zw;
  float h = texture(u_height, v_uv).r;
  gl_Position = projectTileFor3D(a_pos, u_lift * (u_base + h * u_relief));
}`;

const FRAG = `
precision highp float;
uniform sampler2D u_color;
uniform float u_opacity;
uniform bool u_shadow;
uniform vec2 u_shadow_offset; // texture units, toward the light
uniform vec3 u_shadow_rgb;
uniform float u_shadow_strength;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  if (u_shadow) {
    // The cloud that shades this patch of ground hangs up-light of it.
    float a = texture(u_color, v_uv - u_shadow_offset).a * u_shadow_strength * u_opacity;
    fragColor = vec4(u_shadow_rgb * a, a);
    return;
  }
  vec4 c = texture(u_color, v_uv);
  float a = c.a * u_opacity;
  fragColor = vec4(c.rgb * a, a); // MapLibre blends premultiplied
}`;

interface Entry { color: WebGLTexture; height: WebGLTexture; usedAt: number }
interface DrawItem { entry: Entry; uv: [number, number, number, number]; shadow: number; tileID: { wrap: number; canonical: { x: number; y: number; z: number } }; distance: number }

const keyOf = (time: string, z: number, x: number, y: number) => `${time}/${z}/${x}/${y}`;

/**
 * Where a tile sits on the texture of an ancestor `dz` levels up, in that
 * texture's coordinates — the inner TILE pixels of a PADDED-square image.
 */
export function ancestorUv(x: number, y: number, dz: number): [number, number, number, number] {
  const scale = 1 / 2 ** dz;
  const ox = (x % 2 ** dz) * scale, oy = (y % 2 ** dz) * scale;
  return [(PAD + ox * TILE) / PADDED, (PAD + oy * TILE) / PADDED, (scale * TILE) / PADDED, (scale * TILE) / PADDED];
}

export function createCloudLayer(id: string): CustomLayerInterface & { setFrame(time: string): void } {
  let gl: WebGL2RenderingContext | null = null;
  let map: MlMap | null = null;
  let frame = '';
  let previous = '';
  const programs = new Map<string, WebGLProgram>();
  let mesh: { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number } | null = null;
  const cache = new Map<string, Entry>();
  const pending = new Map<string, AbortController>();
  const failed = new Map<string, number>();
  const arrived: { key: string; image: CloudImage }[] = [];
  let tick = 0;

  const compile = (type: number, src: string) => {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, src);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const log = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(`clouds layer shader failed: ${log}`);
    }
    return shader;
  };

  /** One program per projection variant: the prelude changes when the projection does. */
  const programFor = (shader: CustomRenderMethodInput['shaderData']) => {
    const key = `${shader.variantName}\0${shader.define}`;
    let program = programs.get(key);
    if (program) return program;
    const vs = compile(gl!.VERTEX_SHADER, `#version 300 es\n${shader.vertexShaderPrelude}\n${shader.define}\n${VERT}`);
    const fs = compile(gl!.FRAGMENT_SHADER, `#version 300 es\n${FRAG}`);
    program = gl!.createProgram()!;
    gl!.attachShader(program, vs);
    gl!.attachShader(program, fs);
    gl!.linkProgram(program);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
      const log = gl!.getProgramInfoLog(program);
      gl!.deleteProgram(program);
      throw new Error(`clouds layer link failed: ${log}`);
    }
    programs.set(key, program);
    return program;
  };

  const texture = (format: number, internal: number, data: ArrayBufferView) => {
    const tex = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internal, PADDED, PADDED, 0, format, gl!.UNSIGNED_BYTE, data);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return tex;
  };

  const drop = (key: string) => {
    const entry = cache.get(key);
    if (!entry) return;
    gl?.deleteTexture(entry.color);
    gl?.deleteTexture(entry.height);
    cache.delete(key);
  };

  /** Uploads tiles that came back since the last frame, then trims the cache to size. */
  const upload = () => {
    for (const { key, image } of arrived.splice(0)) {
      drop(key);
      cache.set(key, {
        color: texture(gl!.RGBA, gl!.RGBA8, new Uint8Array(image.rgba.buffer)),
        height: texture(gl!.RED, gl!.R8, image.height),
        usedAt: tick,
      });
    }
    if (cache.size <= CACHE) return;
    const oldest = [...cache.entries()].filter(([, e]) => e.usedAt < tick).sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key] of oldest.slice(0, cache.size - CACHE)) drop(key);
  };

  const request = (tile: Tile) => {
    const key = keyOf(tile.time, tile.z, tile.x, tile.y);
    const controller = new AbortController();
    pending.set(key, controller);
    requestCloudTile(tile, controller.signal).then(image => {
      if (pending.get(key) !== controller) return;
      pending.delete(key);
      arrived.push({ key, image });
      map?.triggerRepaint();
    }, () => {
      if (pending.get(key) !== controller) return;
      pending.delete(key);
      if (!controller.signal.aborted) failed.set(key, Date.now());
    });
  };

  /** The nearest loaded texture for a tile: its own, else an ancestor's, this frame's before the last one's. */
  const find = (z: number, x: number, y: number) => {
    for (const time of [frame, previous]) {
      if (!time) continue;
      for (let dz = 0; dz <= z; dz++) {
        const entry = cache.get(keyOf(time, z - dz, x >> dz, y >> dz));
        if (entry) return { entry, dz };
      }
    }
    return null;
  };

  const setProjection = (program: WebGLProgram, proj: { mainMatrix: ArrayLike<number>; tileMercatorCoords: ArrayLike<number>; clippingPlane: ArrayLike<number>; projectionTransition: number; fallbackMatrix: ArrayLike<number> }) => {
    const u = (name: string) => gl!.getUniformLocation(program, name);
    gl!.uniformMatrix4fv(u('u_projection_matrix'), false, proj.mainMatrix as Float32List);
    gl!.uniform4fv(u('u_projection_tile_mercator_coords'), proj.tileMercatorCoords as Float32List);
    gl!.uniform4fv(u('u_projection_clipping_plane'), proj.clippingPlane as Float32List);
    gl!.uniform1f(u('u_projection_transition'), proj.projectionTransition);
    gl!.uniformMatrix4fv(u('u_projection_fallback_matrix'), false, proj.fallbackMatrix as Float32List);
  };

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    setFrame(time: string) {
      if (time === frame) return;
      previous = frame;
      frame = time;
      failed.clear();
      map?.triggerRepaint();
    },

    onAdd(m: MlMap, context: WebGL2RenderingContext) {
      map = m;
      gl = context;
      // One mesh serves every tile: positions are tile-local, the projection
      // uniforms place it. The imagery stops short of the poles, so no pole caps.
      const tileMesh = createTileMesh({ granularity: GRANULARITY, generateBorders: false }, '16bit');
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, tileMesh.vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.SHORT, false, 4, 0);
      const ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tileMesh.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      mesh = { vao, buffers: [vbo, ibo], count: tileMesh.indices.byteLength / 2 };
    },

    onRemove() {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
      for (const key of [...cache.keys()]) drop(key);
      if (gl) {
        for (const program of programs.values()) gl.deleteProgram(program);
        if (mesh) { gl.deleteVertexArray(mesh.vao); mesh.buffers.forEach(b => gl!.deleteBuffer(b)); }
      }
      programs.clear();
      mesh = null;
      gl = null;
      map = null;
    },

    render(_context: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      if (!gl || !map || !mesh || !frame) return;
      tick++;
      upload();
      const zoom = map.getZoom();
      const opacity = cloudOpacity(zoom);
      if (opacity <= 0) return;
      const lift = cloudLift(zoom);

      let program: WebGLProgram;
      try { program = programFor(args.shaderData); }
      catch (error) { console.error('[OSIRIS] clouds layer:', error instanceof Error ? error.message : error); return; }

      // What is on screen, nearest the centre first — which is also the order to fetch in.
      const ids = map.coveringTiles({ tileSize: TILE, minzoom: 0, maxzoom: CLOUDS_MAX_ZOOM, roundZoom: true }).slice(0, MAX_TILES);
      const wanted = new Set<string>();
      const center = map.getCenter();
      const items: DrawItem[] = [];
      for (const tileID of ids) {
        const { x, y, z } = tileID.canonical;
        const key = keyOf(frame, z, x, y);
        wanted.add(key);
        if (!cache.has(key) && !pending.has(key) && pending.size < IN_FLIGHT && Date.now() - (failed.get(key) ?? 0) > RETRY_MS) {
          request({ z, x, y, time: frame });
        }
        const found = find(z, x, y);
        if (!found) continue;
        found.entry.usedAt = tick;
        const n = 2 ** z;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
        const lng = ((x + 0.5) / n) * 360 - 180 + tileID.wrap * 360;
        const uv = ancestorUv(x, y, found.dz);
        items.push({
          entry: found.entry, uv, tileID: { wrap: tileID.wrap, canonical: { x, y, z } },
          // Kept within the texture's margin, so a shadow never reads past it.
          shadow: Math.min(shadowOffset(z, lat, lift) * uv[2], (PAD - 1) / PADDED) / Math.SQRT2,
          distance: Math.hypot(lng - center.lng, (lat * 180) / Math.PI - center.lat),
        });
      }
      // Requests for tiles that scrolled away are dropped, in the worker too.
      for (const [key, controller] of pending) {
        if (!wanted.has(key)) { controller.abort(); pending.delete(key); }
      }
      // Far tiles first: drawn without depth, nearer cloud must land on top.
      items.sort((a, b) => b.distance - a.distance);

      gl.useProgram(program);
      gl.bindVertexArray(mesh.vao);
      // No depth test: cloud a few kilometres up z-fights the globe's surface at
      // world zoom. The projection's clipping plane still hides the far side.
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const u = (name: string) => gl!.getUniformLocation(program, name);
      gl.uniform1i(u('u_color'), 0);
      gl.uniform1i(u('u_height'), 1);
      gl.uniform1f(u('u_base'), CLOUD_BASE_M * lift);
      gl.uniform1f(u('u_relief'), CLOUD_RELIEF_M * lift);
      gl.uniform1f(u('u_opacity'), opacity);
      gl.uniform3f(u('u_shadow_rgb'), ...SHADOW_RGB);
      gl.uniform1f(u('u_shadow_strength'), SHADOW);

      // Every shadow first, on the ground, then every cloud above them.
      for (const shadowPass of [true, false]) {
        gl.uniform1i(u('u_shadow'), shadowPass ? 1 : 0);
        gl.uniform1f(u('u_lift'), shadowPass ? 0 : 1);
        for (const item of items) {
          setProjection(program, args.getProjectionData({ tileID: item.tileID, applyGlobeMatrix: true }));
          gl.uniform4f(u('u_uv'), ...item.uv);
          gl.uniform2f(u('u_shadow_offset'), item.shadow, item.shadow);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, item.entry.color);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, item.entry.height);
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }
      }
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    },
  };
}

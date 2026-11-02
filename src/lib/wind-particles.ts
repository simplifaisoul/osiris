import { LngLat, type Map as MlMap } from 'maplibre-gl';
import { sampleWind, WIND_BANDS, WIND_STYLE, type WindGrid, type WindStyle } from './wind-layer';

/**
 * OSIRIS — the Wind layer's classic look: wind drawn as it blows.
 *
 * Thousands of particles ride the GFS surface wind (see wind-field), each
 * dragging a tail through the last places it has been, the way a weather map
 * shows it. They live in lng/lat, so they stay put as the map moves, curve
 * with the globe, and the far side of the planet hides them. Calm air is a
 * faint white; as the wind picks up it turns champagne, then gold, then ember
 * at storm force.
 *
 * Every frame is drawn fresh from those tails rather than faded over the last
 * one, so nothing smears or leaves a haze, motion is timed rather than counted
 * in frames, and speed, tail length and density can change while it runs.
 *
 * The default look is streamlines (wind-gl-layer); this one is the Wind
 * layer's Particles option.
 */

/** Screen pixels a 1 m/s wind moves a particle in a 60 fps frame, at speed 1. */
const SPEED = 0.12;
/** Tail positions each particle remembers: the longest tail it can draw, at any refresh rate. */
const TAIL = 96;
/** Opacity along a tail, head first. */
const LEVELS = [1, 0.7, 0.45, 0.22];
/** One particle per this many CSS pixels of map, at density 1. */
const DENSITY = 450;
const MIN_PARTICLES = 600;
const MAX_PARTICLES = 5000;
/** A particle lives this long, ms, before it is set down somewhere new. */
const MIN_LIFE = 1500;
const MAX_LIFE = 3500;
const FRAME_MS = 1000 / 60;

function bandOf(speed: number): number {
  for (let b = WIND_BANDS.length - 1; b > 0; b--) if (speed >= WIND_BANDS[b].from) return b;
  return 0;
}

export class WindParticles {
  private map: MlMap;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private field: WindGrid | null = null;
  private style: WindStyle = { ...WIND_STYLE };
  private colors = WIND_BANDS.map(b => LEVELS.map(l => `rgba(${b.rgb.join(',')},${(b.alpha * l).toFixed(3)})`));
  private raf = 0;
  private last = 0;
  /** Smoothed frame time, so a tail is as long on a 120 Hz screen as on a 60 Hz one. */
  private frameMs = FRAME_MS;
  private frames = 0;
  private count = 0;
  private lng = new Float64Array(0);
  private lat = new Float64Array(0);
  private age = new Float32Array(0);
  private life = new Float32Array(0);
  private band = new Uint8Array(0);
  /** Each particle's tail: TAIL screen positions in a ring, `head` the newest. */
  private hx = new Float32Array(0);
  private hy = new Float32Array(0);
  private len = new Uint8Array(0);
  private head = 0;
  /** Scratch for draw(), kept between frames so drawing allocates nothing. */
  private dim = new Uint8Array(0);
  private order = new Uint32Array(0);
  private bandStart = new Uint32Array(WIND_BANDS.length + 1);
  private bandFill = new Uint32Array(WIND_BANDS.length);
  private stepStart = new Uint16Array(LEVELS.length + 1);
  /** Set when the map moved: the tails' screen positions are stale. */
  private moved = true;
  private width = 0;
  private height = 0;

  constructor(map: MlMap) {
    this.map = map;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'osiris-wind';
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    map.getCanvasContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    map.on('resize', this.resize);
    map.on('move', this.onMove);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** The wind to draw, in m/s; null draws nothing. */
  setField(field: WindGrid | null): void {
    this.field = field;
  }

  setStyle(style: Partial<WindStyle>): void {
    const recount = style.density !== undefined && style.density !== this.style.density;
    Object.assign(this.style, style);
    if (recount) this.allocate();
  }

  remove(): void {
    cancelAnimationFrame(this.raf);
    this.map.off('resize', this.resize);
    this.map.off('move', this.onMove);
    this.canvas.remove();
  }

  private resize = () => {
    const box = this.map.getContainer();
    const dpr = window.devicePixelRatio || 1;
    this.width = box.clientWidth;
    this.height = box.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.allocate();
  };

  private allocate(): void {
    const base = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, this.width * this.height / DENSITY));
    const count = Math.round(base * this.style.density);
    this.count = count;
    this.lng = new Float64Array(count);
    this.lat = new Float64Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.band = new Uint8Array(count);
    this.hx = new Float32Array(count * TAIL);
    this.hy = new Float32Array(count * TAIL);
    this.len = new Uint8Array(count);
    this.dim = new Uint8Array(count);
    this.order = new Uint32Array(count);
    // Start at random ages, so they don't all die and respawn together.
    for (let k = 0; k < count; k++) this.spawn(k, true);
    this.moved = true;
  }

  private onMove = () => { this.moved = true; };

  private occluded(at: LngLat): boolean {
    const transform = (this.map as unknown as { transform?: { isLocationOccluded?: (l: LngLat) => boolean } }).transform;
    return transform?.isLocationOccluded?.(at) ?? false;
  }

  /** Set a particle down somewhere on the visible map, its tail starting there. */
  private spawn(k: number, anyAge = false): void {
    this.life[k] = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
    this.len[k] = 0;
    for (let tries = 0; tries < 6; tries++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const at = this.map.unproject([x, y]);
      if (Math.abs(at.lat) > 85 || this.occluded(at)) continue;
      const back = this.map.project(at);
      if (Math.abs(back.x - x) > 2 || Math.abs(back.y - y) > 2) continue; // off the globe's edge
      this.lng[k] = at.lng;
      this.lat[k] = at.lat;
      this.age[k] = anyAge ? Math.random() * this.life[k] : 0;
      this.hx[k * TAIL + this.head] = x;
      this.hy[k * TAIL + this.head] = y;
      this.len[k] = 1;
      return;
    }
    this.age[k] = this.life[k]; // nowhere to stand this frame; try again next
  }

  private kill(k: number): void {
    this.age[k] = this.life[k];
    this.len[k] = 0;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(now - this.last, 50) : FRAME_MS;
    this.last = now;
    this.frameMs += (dt - this.frameMs) * 0.05;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const field = this.field;
    if (!field || !this.width || !this.count) return;
    const map = this.map;

    if (this.moved) {
      // The view changed under the tails: keep only where each particle is now.
      for (let k = 0; k < this.count; k++) {
        if (!this.len[k]) continue;
        const p = map.project([this.lng[k], this.lat[k]]);
        this.hx[k * TAIL + this.head] = p.x;
        this.hy[k * TAIL + this.head] = p.y;
        this.len[k] = 1;
      }
      this.moved = false;
    }

    const prevHead = this.head;
    this.head = (this.head + 1) % TAIL;
    // Degrees per screen pixel at this zoom (512 px tiles), so motion looks the same at every zoom.
    const step = SPEED * this.style.speed * (360 / (512 * 2 ** map.getZoom())) * (dt / FRAME_MS);
    this.frames++;
    for (let k = 0; k < this.count; k++) {
      if (this.age[k] >= this.life[k]) { this.spawn(k); continue; }
      this.age[k] += dt;
      const wind = sampleWind(field, this.lng[k], this.lat[k]);
      if (!wind) { this.kill(k); continue; }
      const [u, v] = wind;
      const cos = Math.max(0.2, Math.cos(this.lat[k] * Math.PI / 180));
      const lng = this.lng[k] + u * step / cos;
      const lat = this.lat[k] + v * step;
      this.lng[k] = lng;
      this.lat[k] = lat;
      if (Math.abs(lat) > 85) { this.kill(k); continue; }
      const p = map.project([lng, lat]);
      const offscreen = p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height;
      if (offscreen || ((k + this.frames) % 4 === 0 && this.occluded(new LngLat(lng, lat)))) { this.kill(k); continue; }
      // A jump means the particle wrapped the antimeridian or crossed the
      // globe's limb; start its tail over rather than streak the screen.
      const prev = k * TAIL + prevHead;
      if (this.len[k] && (Math.abs(p.x - this.hx[prev]) > 40 || Math.abs(p.y - this.hy[prev]) > 40)) this.len[k] = 0;
      this.hx[k * TAIL + this.head] = p.x;
      this.hy[k * TAIL + this.head] = p.y;
      if (this.len[k] < TAIL) this.len[k]++;
      this.band[k] = bandOf(Math.hypot(u, v));
    }
    this.draw();
  };

  /**
   * Every tail, batched into one stroke per colour band and opacity step.
   *
   * Drawn on the context's own path, reset by beginPath, never on a fresh
   * Path2D per frame: a Path2D keeps its geometry outside the JS heap, so the
   * collector never felt the hundreds of thousands of segments a second piling
   * up, and with particles on for a few minutes the tab ran out of memory.
   */
  private draw(): void {
    const tail = Math.max(2, Math.min(TAIL, Math.round(this.style.trail * FRAME_MS / this.frameMs)));
    const levels = LEVELS.length;
    const bands = WIND_BANDS.length;
    // Where along a tail each opacity step starts: segment i (1-based) is at
    // step floor((i - 1) * levels / (tail - 1)).
    const from = this.stepStart;
    for (let l = 0; l <= levels; l++) from[l] = Math.ceil(l * (tail - 1) / levels) + 1;

    // Particles grouped by band, each with how far its tail is dimmed.
    const order = this.order;
    const starts = this.bandStart;
    starts.fill(0);
    for (let k = 0; k < this.count; k++) if (this.len[k] >= 2) starts[this.band[k] + 1]++;
    for (let b = 0; b < bands; b++) starts[b + 1] += starts[b];
    const fill = this.bandFill;
    for (let b = 0; b < bands; b++) fill[b] = starts[b];
    for (let k = 0; k < this.count; k++) {
      if (this.len[k] < 2) continue;
      // Fade in when set down, and out before it goes.
      const edge = Math.min(this.age[k], this.life[k] - this.age[k]);
      this.dim[k] = edge < 120 ? 2 : edge < 300 ? 1 : 0;
      order[fill[this.band[k]]++] = k;
    }

    const ctx = this.ctx;
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    for (let b = 0; b < bands; b++) {
      if (starts[b] === starts[b + 1]) continue;
      for (let l = 0; l < levels; l++) {
        let drawn = false;
        ctx.beginPath();
        for (let o = starts[b]; o < starts[b + 1]; o++) {
          const k = order[o];
          const step = l - this.dim[k];
          if (step < 0) continue;
          const n = Math.min(this.len[k], tail);
          // Segments i in [first, last) belong to this opacity step.
          const first = from[step];
          const last = Math.min(n, from[step + 1]);
          if (first >= last) continue;
          const base = k * TAIL;
          let slot = (this.head + TAIL - (first - 1)) % TAIL;
          ctx.moveTo(this.hx[base + slot], this.hy[base + slot]);
          for (let i = first; i < last; i++) {
            slot = (slot + TAIL - 1) % TAIL;
            ctx.lineTo(this.hx[base + slot], this.hy[base + slot]);
          }
          drawn = true;
        }
        if (!drawn) continue;
        ctx.strokeStyle = this.colors[b][l];
        ctx.stroke();
      }
    }
  }
}

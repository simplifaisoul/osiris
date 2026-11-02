/**
 * OSIRIS OI, the camera.
 *
 * A run has a shape, and the camera follows it like a director would:
 *
 *   world   the actors land and their relations arc in: frame them, nearly flat
 *   panel   the cast is chosen: widen a little to take them in, tilt a little
 *   round   each period of simulated time: tilt to show the arcs' height, swing
 *           the bearing round a quarter turn, and halfway through drift toward
 *           where the actors' moves are converging
 *   report  the prediction lands: close in on where it plays out
 *
 * Between shots the view sways gently around its bearing while the run is
 * live, which is what makes the arcs read as 3D. The moment a person drags,
 * zooms or turns the map, the director stops and leaves the camera to them,
 * until they ask it to follow again. Reduced-motion settings get the shots
 * without the sway, and MapLibre itself turns the flights into jumps.
 *
 * The shot maths is pure and exported for tests; the director is a thin loop
 * around it.
 */
import type { Map as MlMap, MapLibreEvent } from 'maplibre-gl';
import type { LngLat } from './arcs';
import type { RunState } from './state';

export interface Shot {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
  duration: number;
}

const RAD = Math.PI / 180;

/** The spherical mean of some points, so a cluster either side of the date line centres between them. */
export function centreOf(points: LngLat[]): LngLat | null {
  if (!points.length) return null;
  let x = 0, y = 0, z = 0;
  for (const [lng, lat] of points) {
    x += Math.cos(lat * RAD) * Math.cos(lng * RAD);
    y += Math.cos(lat * RAD) * Math.sin(lng * RAD);
    z += Math.sin(lat * RAD);
  }
  return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
}

function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The zoom that holds points spread this far from their centre, on a view about 1280 px across. */
export function zoomForSpread(km: number): number {
  return km > 7000 ? 1.15 : km > 4000 ? 1.6 : km > 2000 ? 2.4 : km > 800 ? 3.3 : 4.3;
}

/** A frame around some points: their centre, and the zoom their spread needs on a view this wide. */
export function frame(points: LngLat[], viewWidth = 1280): { lng: number; lat: number; zoom: number } | null {
  const c = centreOf(points);
  if (!c) return null;
  const spread = Math.max(0, ...points.map(p => distanceKm(c, p)));
  // A narrower view (a phone, or the space panels leave free) steps back a little.
  const narrow = Math.log2(Math.min(1, Math.max(320, viewWidth) / 1280)) * 0.8;
  return { lng: c[0], lat: c[1], zoom: Math.max(0.6, zoomForSpread(spread) + narrow) };
}

const placed = (xs: { lat: number | null; lng: number | null }[]): LngLat[] =>
  xs.filter(x => x.lat !== null && x.lng !== null).map(x => [x.lng!, x.lat!]);

/** The camera that frames a run's actors: the centre of the world model, zoomed to its spread. */
export function frameRun(s: RunState, viewWidth = 1280): { lat: number; lng: number; zoom: number } | null {
  const pts = placed(s.actors);
  if (pts.length) return frame(pts, viewWidth);
  const f = s.frame?.focus;
  return f && f.lat !== null && f.lng !== null ? { lat: f.lat, lng: f.lng, zoom: 2.4 } : null;
}

export type Beat = 'world' | 'panel' | `round:${number}` | 'report';

/** Which shot the run is at: none before there is anything to frame. */
export function beatOf(s: RunState): Beat | null {
  if (s.report) return 'report';
  if (s.phase === 'simulate' || s.phase === 'report') return `round:${Math.min(s.periods.length || s.periodsPlanned || 1, s.rounds.length + 1)}`;
  if (s.actors.some(a => a.persona)) return 'panel';
  if (s.actors.length) return 'world';
  return null;
}

/** The shot for a beat. `bearing` is where the camera points now, which a round swings on from. */
export function shotFor(s: RunState, beat: Beat, bearing: number, viewWidth = 1280): Shot | null {
  const actors = placed(s.actors);
  // The cast frames the simulation; the whole world model frames the start.
  const cast = placed(s.actors.filter(a => a.persona));
  const everyone = cast.length >= 2 ? cast : actors;
  if (beat === 'world') {
    const f = frame(actors, viewWidth);
    return f && { ...f, pitch: 15, bearing, duration: 2800 };
  }
  if (beat === 'panel') {
    const f = frame(everyone, viewWidth);
    return f && { ...f, zoom: f.zoom - 0.15, pitch: 28, bearing: bearing + 12, duration: 2600 };
  }
  if (beat.startsWith('round:')) {
    const n = Number(beat.slice(6));
    const f = frame(everyone, viewWidth);
    // Each round turns the view a further step, so the arcs are seen from a new side.
    return f && { ...f, zoom: f.zoom + 0.1, pitch: 42, bearing: bearing + (n % 2 ? 28 : -22), duration: 3200 };
  }
  // The report: where the forecast plays out. The scenarios' places, else the question's focus, else the actors.
  const scenes = placed(s.report?.scenarios ?? []);
  const focus = s.frame?.focus && s.frame.focus.lat !== null ? [[s.frame.focus.lng!, s.frame.focus.lat!] as LngLat] : [];
  const f = frame(scenes.length >= 2 ? scenes : focus.length ? [...focus, ...scenes] : actors, viewWidth);
  if (!f) return null;
  return { ...f, zoom: Math.min(4.6, Math.max(f.zoom, 1.6) + 0.5), pitch: 48, bearing: bearing + 18, duration: 3600 };
}

/**
 * Halfway through a period, the point the action is centred on: the middle of
 * this period's moves between actors. Null when too few have moved yet.
 */
export function activityCentre(s: RunState, round: number): LngLat | null {
  const where = new Map<string, LngLat>();
  for (const a of s.actors) if (a.lat !== null && a.lng !== null) where.set(`a:${a.id}`, [a.lng, a.lat]);
  const ends: LngLat[] = [];
  for (const l of s.links) {
    if (l.round !== round || l.kind !== 'move') continue;
    const a = where.get(l.from), b = where.get(l.to);
    if (a) ends.push(a);
    if (b) ends.push(b);
  }
  return ends.length >= 6 ? centreOf(ends) : null;
}

/* ───────────────────────────── The director ───────────────────────────── */

export interface Director {
  /** Called with each new state of the run. */
  update(s: RunState | null): void;
  /** Hand the camera to the director, or take it back. */
  follow(on: boolean): void;
  readonly following: boolean;
  destroy(): void;
}

export function createDirector(map: MlMap, onFollowChange?: (following: boolean) => void): Director {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let following = true;
  let run: RunState | null = null;
  let startedAt = 0;
  let beat: Beat | null = null;
  let aimedRound = 0;
  /** No sway until the current flight has landed. */
  let flyingUntil = 0;
  /** The bearing the sway breathes around. */
  let baseBearing = map.getBearing();
  let frameReq = 0;

  const width = () => {
    const p = map.getPadding();
    return map.getContainer().clientWidth - (p.left ?? 0) - (p.right ?? 0);
  };

  const play = (shot: Shot, delay = 0) => {
    const go = () => {
      if (!following) return;
      baseBearing = shot.bearing;
      flyingUntil = performance.now() + shot.duration + 150;
      map.flyTo({ center: [shot.lng, shot.lat], zoom: shot.zoom, pitch: shot.pitch, bearing: shot.bearing, duration: shot.duration, curve: 1.3 });
    };
    if (delay) setTimeout(go, delay);
    else go();
  };

  /** The gentle sway while the run is live: a slow breath of the bearing, never while a shot is flying. */
  const sway = () => {
    frameReq = 0;
    if (!following || reduced || !run || run.status !== 'running') return;
    const now = performance.now();
    if (now > flyingUntil && !map.isMoving()) {
      map.jumpTo({ bearing: baseBearing + 7 * Math.sin(now / 6500) });
    }
    frameReq = requestAnimationFrame(sway);
  };
  const startSway = () => { if (!frameReq && !reduced) frameReq = requestAnimationFrame(sway); };

  /** A person moved the map (only their moves carry an originalEvent): the camera is theirs now. */
  const takeOver = (e: MapLibreEvent & { originalEvent?: Event }) => {
    if (!e.originalEvent || !following) return;
    following = false;
    if (frameReq) { cancelAnimationFrame(frameReq); frameReq = 0; }
    onFollowChange?.(false);
  };
  // Scroll zoom animates without its event attached; the map's own wheel event carries it.
  const events = ['wheel', 'dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const;
  for (const ev of events) map.on(ev, takeOver);

  const direct = (s: RunState) => {
    const next = beatOf(s);
    if (!next) return;
    if (next !== beat) {
      const replay = beat === null && next === 'report';
      beat = next;
      if (replay) {
        // A finished run opened from a link: establish the world, then land on the forecast.
        const world = shotFor(s, 'world', map.getBearing(), width());
        const report = shotFor(s, 'report', (world?.bearing ?? map.getBearing()) + 10, width());
        if (world) play(world);
        if (report) play(report, (world?.duration ?? 0) + 900);
      } else {
        const shot = shotFor(s, next, baseBearing, width());
        if (shot) play(shot);
      }
      startSway();
      return;
    }
    // Halfway through a period, drift toward where the actors' moves converge.
    if (next.startsWith('round:')) {
      const round = Number(next.slice(6));
      const moved = s.moves.filter(m => m.period === round).length;
      const due = s.actors.filter(a => a.persona).length * Math.max(1, s.worlds.length);
      if (round !== aimedRound && moved >= Math.ceil(due / 2)) {
        aimedRound = round;
        const c = activityCentre(s, round);
        if (c && performance.now() > flyingUntil) {
          const here = map.getCenter();
          const mid = centreOf([[here.lng, here.lat], c, c])!;
          flyingUntil = performance.now() + 2600;
          map.easeTo({ center: mid, duration: 2600 });
        }
      }
    }
  };

  return {
    update(s) {
      if (!s) { run = null; beat = null; aimedRound = 0; return; }
      if (s.startedAt !== startedAt) {
        // A new run: the director takes the camera again.
        startedAt = s.startedAt;
        beat = null;
        aimedRound = 0;
        if (!following) { following = true; onFollowChange?.(true); }
      }
      run = s;
      if (following) direct(s);
      if (s.status !== 'running' && frameReq) { cancelAnimationFrame(frameReq); frameReq = 0; }
    },
    follow(on) {
      if (on === following) return;
      following = on;
      onFollowChange?.(on);
      if (on && run) {
        // Back to the shot the run is at now.
        const b = beatOf(run);
        const shot = b ? shotFor(run, b, map.getBearing(), width()) : null;
        if (shot) play(shot);
        startSway();
      } else if (frameReq) {
        cancelAnimationFrame(frameReq);
        frameReq = 0;
      }
    },
    get following() { return following; },
    destroy() {
      for (const ev of events) map.off(ev, takeOver);
      if (frameReq) cancelAnimationFrame(frameReq);
    },
  };
}

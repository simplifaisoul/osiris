'use client';

import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

// Real wind streamlines, not a decorative arrow grid -- the ask was
// explicitly "like Ventusky, something you can actually study." /api/wind-
// grid samples a real measured field (Open-Meteo, coarser than GFS's native
// 0.25° but genuinely observed data, not synthesised); this component
// advects a particle swarm through that field and draws the classic fading-
// streak visualisation (earth.nullschool, Windy, Ventusky all use the same
// technique: a low-alpha fade rect each frame instead of storing trail
// history, plus one line segment per particle per frame).
//
// Particles are advected in LAT/LON space, not screen pixels: the map is a
// Mercator projection, which is locally conformal (angles are preserved) but
// not equidistant, so a fixed pixel step per frame would visibly speed up
// wind flow near the poles and near the horizontal edges of the view. A
// metres-per-degree conversion (111,320 m per degree of latitude everywhere;
// that same distance per degree of longitude scaled by cos(latitude)) keeps
// the physical wind speed consistent regardless of where on the map a
// particle currently is, and reprojecting via map.project() every frame is
// what makes panning/zooming during the animation track correctly.

type WindGrid = {
  bbox: { west: number; south: number; east: number; north: number };
  nx: number; ny: number; u: number[]; v: number[];
};

const METRES_PER_DEGREE_LAT = 111320;
const PARTICLE_COUNT = 1400;
const PARTICLE_MAX_AGE = 90; // frames before a forced respawn
// Real wind (a few m/s to ~30 m/s) is imperceptibly slow against a map that
// can span thousands of km on screen. Every wind-map visualisation in
// existence exaggerates simulated time per frame for exactly this reason --
// this is that same knob, tuned by eye against the live render, not a
// physically meaningful constant.
const TIME_SCALE_SECONDS_PER_FRAME = 900;

function speedColor(speed: number): string {
  // m/s. 0 calm (blue) through ~15 m/s gale (red) -- the same convention
  // Windy/Ventusky use, so anyone who has seen either reads this instantly.
  const stops: [number, [number, number, number]][] = [
    [0, [40, 80, 180]], [3, [30, 150, 190]], [7, [60, 190, 100]],
    [11, [230, 200, 40]], [16, [230, 110, 30]], [24, [210, 30, 40]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (speed >= stops[i][0] && speed <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = hi[0] - lo[0] || 1;
  const t = Math.max(0, Math.min(1, (speed - lo[0]) / span));
  const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
  const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
  const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
  return `rgb(${r},${g},${b})`;
}

export default function WindParticles({
  map, active, wrapRef,
}: {
  map: maplibregl.Map | null;
  active: boolean;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<WindGrid | null>(null);
  const particlesRef = useRef<Array<{ lng: number; lat: number; age: number; sx: number; sy: number }>>([]);
  const rafRef = useRef<number | null>(null);
  const fetchedBboxRef = useRef<string | null>(null);

  // Bilinear-interpolate u/v at an arbitrary lng/lat from the sampled grid.
  // Outside the grid's bbox returns null so the caller can respawn instead
  // of extrapolating into a region with no data.
  const sampleUV = (lng: number, lat: number): [number, number] | null => {
    const g = gridRef.current;
    if (!g) return null;
    const { west, south, east, north } = g.bbox;
    if (lng < west || lng > east || lat < south || lat > north) return null;
    const fx = ((lng - west) / (east - west)) * (g.nx - 1);
    const fy = ((lat - south) / (north - south)) * (g.ny - 1);
    const x0 = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(g.ny - 2, Math.floor(fy)));
    const tx = fx - x0, ty = fy - y0;
    const idx = (x: number, y: number) => y * g.nx + x;
    const u00 = g.u[idx(x0, y0)], u10 = g.u[idx(x0 + 1, y0)];
    const u01 = g.u[idx(x0, y0 + 1)], u11 = g.u[idx(x0 + 1, y0 + 1)];
    const v00 = g.v[idx(x0, y0)], v10 = g.v[idx(x0 + 1, y0)];
    const v01 = g.v[idx(x0, y0 + 1)], v11 = g.v[idx(x0 + 1, y0 + 1)];
    const u = u00 * (1 - tx) * (1 - ty) + u10 * tx * (1 - ty) + u01 * (1 - tx) * ty + u11 * tx * ty;
    const v = v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
    return [u, v];
  };

  const respawn = (p: { lng: number; lat: number; age: number; sx: number; sy: number }) => {
    const g = gridRef.current;
    if (!g) return;
    p.lng = g.bbox.west + Math.random() * (g.bbox.east - g.bbox.west);
    p.lat = g.bbox.south + Math.random() * (g.bbox.north - g.bbox.south);
    p.age = Math.floor(Math.random() * PARTICLE_MAX_AGE);
    p.sx = NaN; p.sy = NaN; // no previous screen position yet -- skip the first segment
  };

  // Fetch the wind grid for the current viewport, debounced on move, same
  // pattern the ArcGIS layers already use for the same reason: moveend fires
  // on every pan/zoom tick and a fetch per twitch would hammer Open-Meteo.
  useEffect(() => {
    if (!map || !active) return;
    let cancelled = false;
    const fetchGrid = async () => {
      const b = map.getBounds();
      const bbox = `${b.getWest().toFixed(2)},${b.getSouth().toFixed(2)},${b.getEast().toFixed(2)},${b.getNorth().toFixed(2)}`;
      if (bbox === fetchedBboxRef.current) return;
      try {
        const res = await fetch(`/api/wind-grid?bbox=${encodeURIComponent(bbox)}`);
        if (!res.ok || cancelled) return;
        const g = await res.json();
        if (g.error || cancelled) return;
        gridRef.current = g;
        fetchedBboxRef.current = bbox;
        // A fresh grid invalidates in-flight particle positions relative to
        // it only in the sense of stale data, not geometry -- particles keep
        // flowing, just against updated vectors from here on.
      } catch { /* offline or Open-Meteo hiccup -- keep the last good grid */ }
    };
    fetchGrid();
    const onMoveEnd = () => { fetchGrid(); };
    map.on('moveend', onMoveEnd);
    const refreshTimer = setInterval(fetchGrid, 600000); // 10 min
    return () => {
      cancelled = true;
      map.off('moveend', onMoveEnd);
      clearInterval(refreshTimer);
    };
  }, [map, active]);

  // Animation loop.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!map || !active || !canvas || !wrap) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = wrap.clientWidth + 'px';
      canvas.style.height = wrap.clientHeight + 'px';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    if (particlesRef.current.length !== PARTICLE_COUNT) {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({ lng: 0, lat: 0, age: 0, sx: NaN, sy: NaN }));
      particlesRef.current.forEach(respawn);
    }

    // The bug a zoom/pan actually exposed: a particle's screen position
    // (sx, sy) is only meaningful under the projection it was recorded
    // under. Reproject an unchanged lng/lat under a NEW zoom/pan and the
    // "previous" point can land anywhere on screen relative to the new
    // point -- every one of 2,500 particles drawing a line from its old
    // (now-meaningless) screen spot to its reprojected one, all in the same
    // frame, is exactly the radial full-screen burst this produced, and
    // redoing that on every zoom step is what stressed the browser. `move`
    // fires continuously through a drag/zoom gesture, not just at its end,
    // so this drops every particle's remembered segment before that frame
    // renders -- the next frame just starts a fresh trail from wherever the
    // particle reprojects to now, no warp-line possible.
    const invalidateScreenPositions = () => {
      for (const p of particlesRef.current) { p.sx = NaN; p.sy = NaN; }
    };
    map.on('move', invalidateScreenPositions);

    const render = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      // Fade the previous frame instead of clearing it -- this IS the
      // streamline effect. A lower alpha here means longer, smoother trails;
      // measured by eye against the real render, not derived from anything.
      ctx.fillStyle = 'rgba(6,10,16,0.06)';
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(0, 0, w, h);

      const g = gridRef.current;
      if (g) {
        for (const p of particlesRef.current) {
          const uv = sampleUV(p.lng, p.lat);
          if (!uv) { respawn(p); continue; }
          const [u, v] = uv;
          const dtSeconds = TIME_SCALE_SECONDS_PER_FRAME;
          p.lat += (v * dtSeconds) / METRES_PER_DEGREE_LAT;
          const metresPerDegLon = METRES_PER_DEGREE_LAT * Math.cos((p.lat * Math.PI) / 180);
          p.lng += (u * dtSeconds) / Math.max(1, metresPerDegLon);
          p.age += 1;

          const screen = map.project([p.lng, p.lat]);
          if (screen.x < -50 || screen.x > w + 50 || screen.y < -50 || screen.y > h + 50 || p.age > PARTICLE_MAX_AGE) {
            respawn(p);
            continue;
          }
          if (Number.isFinite(p.sx) && Number.isFinite(p.sy)) {
            const speed = Math.hypot(u, v);
            ctx.strokeStyle = speedColor(speed);
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(p.sx, p.sy);
            ctx.lineTo(screen.x, screen.y);
            ctx.stroke();
          }
          p.sx = screen.x; p.sy = screen.y;
        }
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      map.off('move', invalidateScreenPositions);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [map, active, wrapRef]);

  if (!active) return null;
  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: 'screen' }} />
  );
}

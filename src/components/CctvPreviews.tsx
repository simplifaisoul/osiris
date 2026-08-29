'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { Map as MlMap } from 'maplibre-gl';

/**
 * OSIRIS — live CCTV previews on the map
 *
 * Zoom in far enough on a cluster of cameras and the nearest ones stop being
 * dots and start showing what they see: a small live frame pinned above each
 * marker, captioned with the camera's name.
 *
 * Only still-image cameras qualify. The catalogue is ~19,000 strong and the
 * overwhelming majority are JPEG snapshot feeds, which cost one request per
 * refresh; the handful of HLS/MP4/iframe cameras would each need a decoder or
 * an embed, and eight of those on screen at once would be a different feature
 * with a much worse frame budget. Those still open normally on click.
 *
 * Positions are written straight to the DOM on every map `move`, so panning
 * does not re-render React 60 times a second. Which cameras are shown is
 * recomputed only when the map settles.
 */

const MIN_ZOOM = 13;
const MAX_TILES = 8;
const TILE_W = 176;
/** 16:9, so a frame is not letterboxed inside its own container. */
const IMG_H = 99;
const LABEL_H = 20;
/** Clearance between the bottom of a tile and the marker it belongs to — the
 *  connector that ties the two together is drawn across it. */
const GAP = 26;
const TILE_H = IMG_H + LABEL_H;
const REFRESH_MS = 15000;
/** Keeps a tile clear of the viewport edge, and of the layer rail on the left. */
const EDGE = 60;
/** More at the top and bottom, where the app's own chrome is: the header at one
 *  end, the view controls and the ticker at the other. All of it draws over the
 *  previews, so a tile placed underneath is simply hidden. */
const EDGE_TOP = 96;
const EDGE_BOTTOM = 156;

/**
 * Where the tile for a marker at `pt` ends up.
 *
 * Shared by the two passes deliberately. Which cameras get a tile is decided
 * when the map settles and the tiles are then repositioned on every frame of a
 * pan, and if those two disagreed about where a tile lands, the overlap check
 * would be run against coordinates nothing is ever drawn at — which is what let
 * a tile clamped back inside the viewport come to rest on top of its neighbour.
 */
function layout(pt: { x: number; y: number }, width: number, height: number) {
  const maxX = width - TILE_W - EDGE;
  const maxY = height - TILE_H - EDGE_BOTTOM;
  /* Above the marker by default; below it when there is no room, so a camera
     near the top of the screen still gets a visible tile. */
  const above = pt.y - TILE_H - GAP;
  const flipped = above < EDGE_TOP;
  const wantX = pt.x - TILE_W / 2;
  const wantY = flipped ? pt.y + GAP : above;
  const x = Math.min(Math.max(wantX, EDGE), Math.max(EDGE, maxX));
  const y = Math.min(Math.max(wantY, EDGE_TOP), Math.max(EDGE_TOP, maxY));
  return {
    x,
    y,
    flipped,
    /* The connector is drawn straight down (or up) from the middle of the tile,
       which is only where the marker is if the tile sits where it wanted to. */
    anchored: Math.abs(x - wantX) < 1 && Math.abs(y - wantY) < 1,
  };
}

/** Whatever the camera layer is currently drawn in — see lib/map-palette. */
const CAM = 'var(--map-cctv)';
/** color-mix keeps every tint tied to that property, not to a frozen hex. */
const cam = (pct: number) => `color-mix(in srgb, ${CAM} ${pct}%, transparent)`;

export interface PreviewCamera {
  id: string;
  name: string;
  lng: number;
  lat: number;
  feed_url: string;
  city?: string;
  country?: string;
  source?: string;
  stream_url?: string;
  stream_type?: string;
  external_url?: string;
}

/** Cache-buster: these feeds are one URL that returns a new frame each time. */
function freshen(url: string): string {
  return url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
}

function Tile({ cam: camera, onOpen }: { cam: PreviewCamera; onOpen: (cam: PreviewCamera) => void }) {
  const [src, setSrc] = useState(() => freshen(camera.feed_url));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /* No reset needed on the way in: each tile is keyed by camera id, so a slot
     changing hands remounts this component with fresh state. */
  useEffect(() => {
    /* Staggered, so eight tiles do not all hit their origin on the same tick. */
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setSrc(freshen(camera.feed_url));
      interval = setInterval(() => setSrc(freshen(camera.feed_url)), REFRESH_MS);
    }, REFRESH_MS + Math.random() * 2000);

    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [camera.feed_url]);

  /* A camera that will not load is worse than no tile: it is a broken box
     sitting over the map claiming to be a feed. */
  if (failed) return null;

  return (
    <button
      onClick={() => onOpen(camera)}
      title={camera.name}
      className="cctv-tile group block w-full text-left focus:outline-none"
      style={{ width: TILE_W }}
    >
      <div
        className="relative overflow-hidden bg-black"
        style={{
          height: IMG_H,
          border: `1px solid ${cam(40)}`,
          boxShadow: '0 6px 20px rgba(0,0,0,0.65)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote camera frames, no loader */}
        <img
          src={src}
          alt={camera.name}
          width={TILE_W}
          height={IMG_H}
          className="h-full w-full object-cover transition-opacity duration-500"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          draggable={false}
        />

        {/* Two cosmetic passes over the picture: scanlines, for the same CRT
            read the full viewer already has, and an inner vignette so a bright
            frame does not bleed into the map at its edges. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)' }}
        />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_22px_rgba(0,0,0,0.85)]" />

        {/* Corner brackets. They make the frame read as an instrument rather
            than a thumbnail, and they hold that read over any picture. */}
        {[
          'left-0 top-0 border-l border-t',
          'right-0 top-0 border-r border-t',
          'left-0 bottom-0 border-l border-b',
          'right-0 bottom-0 border-r border-b',
        ].map(pos => (
          <span
            key={pos}
            className={`pointer-events-none absolute h-2.5 w-2.5 ${pos}`}
            style={{ borderColor: cam(80) }}
          />
        ))}

        <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 bg-black/70 px-1 py-[1px]">
          <span className="h-1 w-1 rounded-full bg-[var(--alert-red)] animate-pulse" />
          <span className="font-mono text-[7px] tracking-[0.18em] text-white/75">LIVE</span>
        </div>

        {/* Hover only: the tile is already a button, this says what it opens. */}
        <div
          className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 bg-black/70 px-1 py-[1px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ color: CAM }}
        >
          <Maximize2 className="h-2 w-2" />
          <span className="font-mono text-[7px] tracking-[0.18em]">OPEN</span>
        </div>

        {!loaded && (
          <div className="absolute inset-0 overflow-hidden bg-black">
            <div
              className="absolute inset-x-0 h-8"
              style={{
                background: `linear-gradient(to bottom, transparent, ${cam(18)}, transparent)`,
                animation: 'scan-line-sweep 1.8s ease-in-out infinite',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[7px] tracking-[0.25em] text-white/30">
              LINKING
            </div>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-1.5 truncate bg-black/90 px-1.5 font-mono text-[8px] uppercase tracking-[0.12em]"
        style={{
          height: LABEL_H,
          border: `1px solid ${cam(40)}`,
          borderTop: 'none',
          color: CAM,
        }}
      >
        <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: CAM, boxShadow: `0 0 5px ${CAM}` }} />
        <span className="truncate">{camera.name}</span>
      </div>
    </button>
  );
}

/**
 * The line from a tile to the marker it belongs to.
 *
 * Without one, eight frames float over the map with nothing saying which
 * camera each belongs to — at this zoom the dots are dense enough that the
 * nearest one is a guess. Which end it hangs from is decided by `place()`,
 * since only that knows whether the tile had room above its marker; both are
 * rendered and globals.css hides the one that does not apply.
 */
function Connector() {
  return (
    <>
      <span
        className="cctv-stem cctv-stem-down pointer-events-none absolute left-1/2 w-px"
        style={{ top: TILE_H, height: GAP - 5, background: `linear-gradient(to bottom, ${cam(70)}, ${cam(10)})` }}
      />
      <span
        className="cctv-stem cctv-stem-up pointer-events-none absolute left-1/2 w-px"
        style={{ bottom: TILE_H, height: GAP - 5, background: `linear-gradient(to top, ${cam(70)}, ${cam(10)})` }}
      />
    </>
  );
}

function CctvPreviews({ mapRef, active, onOpen }: {
  /* The ref rather than the map: reading `.current` during render is what the
     lint rule forbids, and every use here is inside an effect anyway. */
  mapRef: React.RefObject<MlMap | null>;
  active: boolean;
  onOpen: (cam: PreviewCamera) => void;
}) {
  const [cams, setCams] = useState<PreviewCamera[]>([]);
  const nodes = useRef(new Map<string, HTMLDivElement | null>());

  /** Pick which cameras get a tile. Runs only when the map settles. */
  const recompute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !active || map.getZoom() < MIN_ZOOM) {
      setCams(prev => (prev.length ? [] : prev));
      return;
    }

    let feats;
    try {
      feats = map.queryRenderedFeatures({ layers: ['cctv-dots'] });
    } catch {
      return; // layer not added yet
    }

    const canvas = map.getCanvas();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;

    const seen = new Set<string>();
    const candidates: { cam: PreviewCamera; box: ReturnType<typeof layout>; d: number }[] = [];

    for (const f of feats) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const id = String(p.id ?? '');
      const feed = String(p.feed_url ?? '');
      /* Absent stream_type means a snapshot feed, the same default the full
         viewer uses. Anything else needs a player, so it stays a dot. */
      const kind = String(p.stream_type ?? 'jpg');
      if (!id || seen.has(id) || !feed || kind !== 'jpg') continue;

      const coords = (f.geometry as { coordinates?: [number, number] })?.coordinates;
      if (!coords) continue;
      seen.add(id);

      const pt = map.project(coords);
      candidates.push({
        cam: {
          id,
          name: String(p.name ?? 'CAMERA'),
          lng: coords[0],
          lat: coords[1],
          feed_url: feed,
          city: p.city ? String(p.city) : undefined,
          country: p.country ? String(p.country) : undefined,
          source: p.source ? String(p.source) : undefined,
          stream_url: p.stream_url ? String(p.stream_url) : undefined,
          stream_type: p.stream_type ? String(p.stream_type) : undefined,
          external_url: p.external_url ? String(p.external_url) : undefined,
        },
        box: layout(pt, canvas.clientWidth, canvas.clientHeight),
        d: (pt.x - cx) ** 2 + (pt.y - cy) ** 2,
      });
    }

    /* Nearest the middle of the screen first, then drop any tile that would
       land on top of one already taken — overlapping frames read as one
       unusable smear rather than as several cameras. */
    candidates.sort((a, b) => a.d - b.d);
    const picked: typeof candidates = [];
    for (const c of candidates) {
      if (picked.length >= MAX_TILES) break;
      const clash = picked.some(p => Math.abs(p.box.x - c.box.x) < TILE_W + 8 && Math.abs(p.box.y - c.box.y) < TILE_H + GAP);
      if (!clash) picked.push(c);
    }

    setCams(prev => {
      const same = prev.length === picked.length && prev.every((p, i) => p.id === picked[i].cam.id);
      return same ? prev : picked.map(p => p.cam);
    });
  }, [mapRef, active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    /* `moveend` alone is not enough. Arriving somewhere fires it before the
       source tiles for that view have been parsed, so the query comes back
       empty and nothing would ever ask again. `idle` catches the frame after
       rendering settles, and `sourcedata` catches the camera list refreshing
       under a stationary map. */
    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === 'cctv' && e.isSourceLoaded) recompute();
    };

    recompute();
    map.on('moveend', recompute);
    map.on('zoomend', recompute);
    map.on('idle', recompute);
    map.on('sourcedata', onSourceData);
    return () => {
      map.off('moveend', recompute);
      map.off('zoomend', recompute);
      map.off('idle', recompute);
      map.off('sourcedata', onSourceData);
    };
  }, [mapRef, recompute]);

  /* Keep tiles glued to their markers without re-rendering during a pan. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      const canvas = map.getCanvas();
      for (const cam of cams) {
        const el = nodes.current.get(cam.id);
        if (!el) continue;
        const box = layout(map.project([cam.lng, cam.lat]), canvas.clientWidth, canvas.clientHeight);
        /* A tile pushed back inside the viewport has been moved off its marker,
           so its connector would point at empty map. Drop the line rather than
           draw something untrue. */
        el.dataset.flip = !box.anchored ? 'none' : box.flipped ? 'below' : 'above';
        el.style.transform = `translate3d(${Math.round(box.x)}px, ${Math.round(box.y)}px, 0)`;
      }
    };
    place();
    map.on('move', place);
    return () => { map.off('move', place); };
  }, [mapRef, cams]);

  if (!cams.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[40] overflow-hidden">
      {cams.map(cam => (
        <div
          key={cam.id}
          ref={el => { nodes.current.set(cam.id, el); }}
          data-flip="above"
          className="pointer-events-auto absolute left-0 top-0 will-change-transform"
          style={{ width: TILE_W }}
        >
          <Tile cam={cam} onOpen={onOpen} />
          <Connector />
        </div>
      ))}
    </div>
  );
}

export default memo(CctvPreviews);

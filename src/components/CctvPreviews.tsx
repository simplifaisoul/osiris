'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
const TILE_W = 132;
const IMG_H = 78;
const LABEL_H = 16;
/** Clearance between the bottom of a tile and the marker it belongs to. */
const GAP = 16;
const TILE_H = IMG_H + LABEL_H;
const REFRESH_MS = 15000;
/** Keeps a tile clear of the viewport edge, and of the layer rail on the left. */
const EDGE = 56;

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

function Tile({ cam, onOpen }: { cam: PreviewCamera; onOpen: (cam: PreviewCamera) => void }) {
  const [src, setSrc] = useState(() => freshen(cam.feed_url));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /* No reset needed on the way in: each tile is keyed by camera id, so a slot
     changing hands remounts this component with fresh state. */
  useEffect(() => {
    /* Staggered, so eight tiles do not all hit their origin on the same tick. */
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setSrc(freshen(cam.feed_url));
      interval = setInterval(() => setSrc(freshen(cam.feed_url)), REFRESH_MS);
    }, REFRESH_MS + Math.random() * 2000);

    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [cam.feed_url]);

  /* A camera that will not load is worse than no tile: it is a broken box
     sitting over the map claiming to be a feed. */
  if (failed) return null;

  return (
    <button
      onClick={() => onOpen(cam)}
      title={cam.name}
      className="group block w-full text-left transition-transform duration-200 hover:scale-[1.06] focus:outline-none"
      style={{ width: TILE_W }}
    >
      <div
        className="relative overflow-hidden border bg-black/80"
        style={{ height: IMG_H, borderColor: 'rgba(0,230,118,0.35)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- remote camera frames, no loader */}
        <img
          src={src}
          alt={cam.name}
          width={TILE_W}
          height={IMG_H}
          className="h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 0.92 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          draggable={false}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-[7px] font-mono tracking-[0.2em] text-white/30">
            LINKING
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 border border-white/5 group-hover:border-white/20" />
      </div>
      <div
        className="flex items-center gap-1 truncate border border-t-0 bg-black/85 px-1.5 font-mono text-[8px] uppercase tracking-[0.12em]"
        style={{ height: LABEL_H, borderColor: 'rgba(0,230,118,0.35)', color: 'var(--alert-green)' }}
      >
        <span className="truncate">{cam.name}</span>
      </div>
    </button>
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
    const candidates: { cam: PreviewCamera; x: number; y: number; d: number }[] = [];

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
        x: pt.x,
        y: pt.y,
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
      const clash = picked.some(p => Math.abs(p.x - c.x) < TILE_W + 10 && Math.abs(p.y - c.y) < TILE_H + GAP + 10);
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
      const maxX = canvas.clientWidth - TILE_W - EDGE;
      const maxY = canvas.clientHeight - TILE_H - EDGE;
      for (const cam of cams) {
        const el = nodes.current.get(cam.id);
        if (!el) continue;
        const pt = map.project([cam.lng, cam.lat]);
        /* Above the marker by default; below it when there is no room, so a
           camera near the top of the screen still gets a visible tile. */
        const above = pt.y - TILE_H - GAP;
        const y = above < EDGE ? pt.y + GAP : above;
        const x = pt.x - TILE_W / 2;
        el.style.transform = `translate3d(${Math.round(Math.min(Math.max(x, EDGE), Math.max(EDGE, maxX)))}px, ${Math.round(Math.min(Math.max(y, EDGE), Math.max(EDGE, maxY)))}px, 0)`;
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
          className="pointer-events-auto absolute left-0 top-0 will-change-transform"
          style={{ width: TILE_W }}
        >
          <Tile cam={cam} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

export default memo(CctvPreviews);

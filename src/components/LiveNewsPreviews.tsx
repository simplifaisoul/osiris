'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { layoutTile, tileHeight, tilesOverlap, type TileGeometry } from '@/lib/map-tile-layout';
import type { Map as MlMap } from 'maplibre-gl';

/**
 * OSIRIS — live TV news playing on the map.
 *
 * The CCTV previews pin a live frame above a camera marker, but only past zoom
 * 13: there are ~19,000 cameras, so at any wider view the tiles would be a
 * solid wall and the request cost would be absurd.
 *
 * These behave the same way: a feed shows its broadcast only once the map is
 * zoomed into the city it comes from, and is a dot at every wider view. Drawn
 * from further out they stop being a detail of a place and become a wall of
 * players over the whole planet, which is not what the layer is for.
 *
 * The tile, the connector, and the placement rules are the camera previews'
 * exactly — same component shape, same lib/map-tile-layout — because they mean
 * the same thing to an operator and should not read as two features.
 *
 * What differs is the media. A camera tile is an image or a short clip; these
 * are YouTube players, which are an order of magnitude heavier. Hence a hard
 * cap on how many run at once, and hence only the feeds whose operator permits
 * embedding get a tile — the rest stay dots and open in the full viewer, which
 * is what the click handler already did.
 */

/**
 * Matches the camera previews exactly. Below this a feed is a dot; the layer
 * is about what a place looks like right now, and that only means something
 * once you are looking at the place.
 */
const MIN_ZOOM = 13;

/**
 * Concurrent players.
 *
 * Every tile is a YouTube iframe with its own decoder, and unlike a camera
 * snapshot there is no cheap version of one. Four is what stays smooth on a
 * mid-range laptop while the globe is also rendering; the rest of the feeds
 * remain dots until the map moves and they win a slot.
 */
const MAX_TILES = 4;

/** Slightly larger than a camera tile — this is broadcast video, not a snapshot. */
const GEOM: TileGeometry = { width: 208, imageHeight: 117, labelHeight: 20, gap: 26 };
const TILE_H = tileHeight(GEOM);

/** The live-news layer's colour, matching news-dots in OsirisMap. */
const NEWS = '#EC407A';
const news = (pct: number) => `color-mix(in srgb, ${NEWS} ${pct}%, transparent)`;

export interface PreviewFeed {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** Directly embeddable player URL — see `embedUrl`. */
  embed: string;
  city?: string;
  country?: string;
  category?: string;
  url: string;
}

/**
 * The player URL for a feed, or null if it cannot be embedded.
 *
 * Seven of the fifteen feeds are already published in YouTube's
 * `embed/live_stream?channel=…` form, which plays whatever that channel is
 * broadcasting now without resolving a video id first — exactly what a 24/7
 * news channel needs, since the id changes every time the stream restarts.
 *
 * The rest are `/channel/…/live` links, which name a channel rather than a
 * broadcast and would need a server round-trip per feed to resolve, and Rumble,
 * which is not an embed at all. Those are also the ones flagged
 * `embed_allowed: false` upstream, so there is nothing to gain by chasing them:
 * the operator has said no.
 */
export function embedUrl(url: string, embedAllowed: boolean): string | null {
  if (!embedAllowed) return null;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (host !== 'www.youtube.com' && host !== 'youtube.com' && host !== 'www.youtube-nocookie.com') return null;
  if (!u.pathname.startsWith('/embed/')) return null;

  // Force the parameters a muted background player needs, whatever the feed
  // data happens to carry.
  u.searchParams.set('autoplay', '1');
  u.searchParams.set('mute', '1');
  u.searchParams.set('playsinline', '1');
  u.searchParams.set('rel', '0');
  u.searchParams.set('modestbranding', '1');
  // Required before the player will report its state back to the page.
  u.searchParams.set('enablejsapi', '1');
  return u.toString();
}

/**
 * Ask a player to report its state, and read the answer.
 *
 * A channel can be embeddable in principle and still refuse a particular
 * viewer — Sky News answers "This video is unavailable" while France 24, DW and
 * Al Jazeera play — and from outside the iframe there is no way to see that:
 * the frame is cross-origin, so it loads "successfully" and shows an error
 * inside. A dead box claiming to be a live feed is worse than no tile, which is
 * the same judgement the camera previews make about a broken camera.
 *
 * YouTube's iframe will post its state to the parent, but only after the parent
 * says it is listening. That handshake is what this does; `onError` then means
 * the channel will not play here and the tile is dropped.
 */
function useYouTubeError(name: string, onFail: () => void) {
  const ref = useRef<HTMLIFrameElement>(null);

  const handshake = useCallback(() => {
    ref.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: name, channel: 'widget' }),
      'https://www.youtube.com',
    );
  }, [name]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      if (e.source !== ref.current?.contentWindow) return;
      try {
        const msg = JSON.parse(String(e.data));
        if (msg?.event === 'onError') onFail();
      } catch {
        // The player also posts non-JSON frames; they are not errors.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onFail]);

  return { ref, handshake };
}

function Tile({ feed, onOpen, onFail }: {
  feed: PreviewFeed;
  onOpen: (feed: PreviewFeed) => void;
  onFail: (id: string) => void;
}) {
  const fail = useCallback(() => onFail(feed.id), [onFail, feed.id]);
  const { ref, handshake } = useYouTubeError(feed.id, fail);

  return (
    <div className="news-tile block w-full text-left" style={{ width: GEOM.width }}>
      <div
        className="relative overflow-hidden bg-black"
        style={{ height: GEOM.imageHeight, border: `1px solid ${news(45)}`, boxShadow: `0 0 14px ${news(18)}` }}
      >
        <iframe
          ref={ref}
          src={feed.embed}
          title={feed.name}
          className="h-full w-full"
          style={{ border: 0 }}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handshake}
          onError={fail}
        />
        {/* The player owns its own pointer events, so opening the full viewer
            needs its own target rather than a wrapping button. */}
        <button
          onClick={() => onOpen(feed)}
          title={`Open ${feed.name}`}
          aria-label={`Open ${feed.name}`}
          className="absolute right-1 top-1 z-10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em]"
          style={{ background: 'rgba(0,0,0,0.75)', border: `1px solid ${news(50)}`, color: NEWS }}
        >
          Open
        </button>
      </div>

      <div
        className="flex items-center gap-1.5 truncate bg-black/90 px-1.5 font-mono text-[8px] uppercase tracking-[0.12em]"
        style={{ height: GEOM.labelHeight, border: `1px solid ${news(40)}`, borderTop: 'none', color: NEWS }}
      >
        {/* The same blink the malware arrivals use, so "live" reads the same
            way everywhere on the map. */}
        <span className="news-live-dot h-1 w-1 shrink-0 rounded-full" style={{ background: NEWS }} />
        <span className="truncate">{feed.name}</span>
      </div>
    </div>
  );
}

/** The line tying a tile to its marker — the camera previews' connector, in pink. */
function Connector() {
  return (
    <>
      <span
        className="news-stem news-stem-down pointer-events-none absolute left-1/2 w-px"
        style={{ top: TILE_H, height: GEOM.gap - 5, background: `linear-gradient(to bottom, ${news(70)}, ${news(10)})` }}
      />
      <span
        className="news-stem news-stem-up pointer-events-none absolute left-1/2 w-px"
        style={{ bottom: TILE_H, height: GEOM.gap - 5, background: `linear-gradient(to top, ${news(70)}, ${news(10)})` }}
      />
    </>
  );
}

function LiveNewsPreviews({ mapRef, active, feeds, onOpen }: {
  mapRef: React.RefObject<MlMap | null>;
  active: boolean;
  /** The live-news records the map layer is built from — see OsirisMap. */
  feeds: Array<Record<string, unknown>> | undefined;
  onOpen: (feed: PreviewFeed) => void;
}) {
  const [picked, setPicked] = useState<PreviewFeed[]>([]);
  const nodes = useRef(new Map<string, HTMLDivElement | null>());
  /* Channels that answered with an error. Never cleared: re-picking one on the
     next pan would reload a player that has already said no, and put the dead
     box straight back on the map. */
  const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
  const onFail = useCallback((id: string) => {
    setDead(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  /** Pick which feeds get a tile. Runs only when the map settles. */
  const recompute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !active || !feeds?.length || map.getZoom() < MIN_ZOOM) {
      setPicked(prev => (prev.length ? [] : prev));
      return;
    }

    const canvas = map.getCanvas();
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;

    const seen = new Set<string>();
    const candidates: { feed: PreviewFeed; pt: { x: number; y: number }; d: number }[] = [];

    for (const f of feeds) {
      const name = String(f?.name ?? '');
      const url = String(f?.url ?? '');
      const lng = Number(f?.lng);
      const lat = Number(f?.lat);
      if (!name || !url || seen.has(name) || dead.has(name)) continue;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      const embed = embedUrl(url, f?.embed_allowed !== false && f?.embed_allowed !== 'false');
      if (!embed) continue;

      const pt = map.project([lng, lat]);
      if (pt.x < 0 || pt.y < 0 || pt.x > viewport.width || pt.y > viewport.height) continue;

      seen.add(name);
      candidates.push({
        feed: {
          id: name,
          name,
          lng,
          lat,
          embed,
          url,
          city: f?.city ? String(f.city) : undefined,
          country: f?.country ? String(f.country) : undefined,
          category: f?.category ? String(f.category) : undefined,
        },
        pt,
        d: (pt.x - cx) ** 2 + (pt.y - cy) ** 2,
      });
    }

    /* Nearest the middle of the screen first, then drop any tile that would
       land on top of one already taken. Zoomed right out this is doing real
       work: the four New York channels project to the same pixel, and London,
       Paris and Berlin are within a tile's width of each other. */
    candidates.sort((a, b) => a.d - b.d);
    const chosen: { feed: PreviewFeed; box: ReturnType<typeof layoutTile> }[] = [];
    for (const c of candidates) {
      if (chosen.length >= MAX_TILES) break;
      const box = layoutTile(c.pt, viewport, GEOM);
      if (chosen.some(p => tilesOverlap(p.box, box, GEOM))) continue;
      chosen.push({ feed: c.feed, box });
    }

    setPicked(prev => {
      const same = prev.length === chosen.length && prev.every((p, i) => p.id === chosen[i].feed.id);
      return same ? prev : chosen.map(p => p.feed);
    });
  }, [mapRef, active, feeds, dead]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === 'live-news' && e.isSourceLoaded) recompute();
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

  /* Keep tiles glued to their markers without re-rendering during a pan — and
     without reloading the players, which a React re-render would do. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = () => {
      const canvas = map.getCanvas();
      const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
      for (const feed of picked) {
        const el = nodes.current.get(feed.id);
        if (!el) continue;
        const box = layoutTile(map.project([feed.lng, feed.lat]), viewport, GEOM);
        el.dataset.flip = !box.anchored ? 'none' : box.flipped ? 'below' : 'above';
        el.style.transform = `translate3d(${Math.round(box.x)}px, ${Math.round(box.y)}px, 0)`;
      }
    };
    place();
    map.on('move', place);
    return () => { map.off('move', place); };
  }, [mapRef, picked]);

  if (!picked.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[39] overflow-hidden">
      {picked.map(feed => (
        <div
          key={feed.id}
          ref={el => { nodes.current.set(feed.id, el); }}
          data-flip="above"
          className="pointer-events-auto absolute left-0 top-0 will-change-transform"
          style={{ width: GEOM.width }}
        >
          <Tile feed={feed} onOpen={onOpen} onFail={onFail} />
          <Connector />
        </div>
      ))}
    </div>
  );
}

export default memo(LiveNewsPreviews);

'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import {
  X, Car, Footprints, Bike, ArrowUpDown, MapPin, Route,
  CornerUpRight, CornerUpLeft, ArrowUp, RotateCw, Merge,
  LocateFixed, Crosshair, Clock, Plus, Trash2, SlidersHorizontal, Mountain, Navigation, Play,
  AlertTriangle, Loader2, type LucideIcon,
} from 'lucide-react';
import { searchPlaces, type GeoResult } from '@/lib/geosearch';
import { loadRecent, rememberPlace, type RecentPlace } from '@/lib/recent-places';
import { PlaceRow } from './places';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Directions
   Turn-by-turn routing over /api/directions (Valhalla + OSRM): a start, any
   stops and a destination on one rail; the fastest route and its
   alternatives, each with the road it takes; the steps; and a hand-off to
   live navigation. Places it is given or picks are remembered for next time.
   ═══════════════════════════════════════════════════════════════ */

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  location: [number, number];
  type: string;
}

export interface RouteResult {
  provider: string;
  mode: string;
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  steps: RouteStep[];
  /** All options the engine offered, best first. Present on the API response. */
  routes?: RouteResult[];
  hasHighway?: boolean;
  hasToll?: boolean;
  hasFerry?: boolean;
  elevation?: Array<{ distance: number; height: number }>;
  ascent?: number;
  descent?: number;
}

/** What a route was planned with, besides its ends: the travel mode is on the route itself. */
export interface TripPlan {
  /** Intermediate stops, in order. */
  stops: { lat: number; lng: number }[];
  /** Any of 'tolls', 'highways', 'ferries'. */
  avoid: string[];
}

export interface LiveLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
}

interface Place {
  label: string;
  lat: number;
  lng: number;
  /** Secondary line, e.g. "Avenue Anatole France, Paris, France". */
  context?: string;
  /** poi | address | street | city | region | country | coordinate | current */
  kind?: string;
}

interface DirectionsBarProps {
  onRoute: (route: (RouteResult & {
    from: Place;
    to: Place;
    alternates?: Array<{ type: 'LineString'; coordinates: [number, number][] }>;
    activeSegment?: [number, number][] | null;
  }) | null) => void;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  onClose?: () => void;
  /** Current map centre — biases search toward what the operator is looking at. */
  center?: { lat: number; lng: number } | null;
  /** Live position, when tracking is on, so the map can draw the dot. */
  onLiveLocation?: (loc: LiveLocation | null) => void;
  /** Selected step segment, for highlighting the leg on the map. */
  onActiveSegment?: (seg: [number, number][] | null) => void;
  onFollowChange?: (follow: boolean) => void;
  /**
   * Hand the chosen route to the parent to drive live navigation, with the
   * plan behind it, so a re-plan on the way keeps the same stops and options.
   */
  onStartNavigation?: (route: RouteResult, destinationLabel: string, plan: TripPlan) => void;
  /** A destination to open with, handed over from Search ("Directions to here"). */
  initialTo?: Place | null;
}

const MODES = [
  { id: 'auto', label: 'Drive', Icon: Car },
  { id: 'pedestrian', label: 'Walk', Icon: Footprints },
  { id: 'bicycle', label: 'Bike', Icon: Bike },
] as const;

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Metres between two WGS84 points. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLng = (bLng - aLng) * p;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Index of the route vertex closest to a point. */
function nearestVertex(coords: [number, number][], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i][1] - lat) ** 2 + (coords[i][0] - lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * The maneuver the operator is heading into.
 *
 * Nearest-maneuver is the wrong rule: 160 m past a depart point, the closest
 * maneuver is still the one behind you. Progress along the route decides it —
 * project the position onto the route line, then take the first maneuver that
 * lies further along than that.
 */
export function nextManeuver(
  steps: RouteStep[],
  coords: [number, number][],
  lat: number,
  lng: number,
): { step: RouteStep; index: number; distance: number } | null {
  if (!steps.length) return null;
  if (!coords.length) return { step: steps[0], index: 0, distance: haversine(lat, lng, steps[0].location[1], steps[0].location[0]) };

  const here = nearestVertex(coords, lat, lng);
  for (let i = 0; i < steps.length; i++) {
    const at = nearestVertex(coords, steps[i].location[1], steps[i].location[0]);
    if (at > here) {
      return { step: steps[i], index: i, distance: haversine(lat, lng, steps[i].location[1], steps[i].location[0]) };
    }
  }
  // Past the last maneuver — the destination is what remains.
  const last = steps.length - 1;
  return { step: steps[last], index: last, distance: haversine(lat, lng, steps[last].location[1], steps[last].location[0]) };
}

/** Build an SVG path for the elevation profile, normalised into a viewbox. */
export function elevationPath(
  points: Array<{ distance: number; height: number }>,
  width: number,
  height: number,
): string {
  if (points.length < 2) return '';
  const maxD = points[points.length - 1].distance || 1;
  const hs = points.map((p) => p.height);
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  const span = hi - lo || 1;
  return points
    .map((p, i) => {
      const x = (p.distance / maxD) * width;
      const y = height - ((p.height - lo) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Wall-clock arrival time for a trip of `seconds` starting now. */
export function arrivalTime(seconds: number, now: Date = new Date()): string {
  const at = new Date(now.getTime() + seconds * 1000);
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Slice the route geometry between two step positions, so selecting a step can
 * highlight the leg it covers rather than just dropping a pin on its start.
 */
export function segmentBetween(
  coords: [number, number][],
  from: [number, number],
  to?: [number, number],
): [number, number][] {
  const nearest = (t: [number, number]) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = (coords[i][0] - t[0]) ** 2 + (coords[i][1] - t[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const a = nearest(from);
  const b = to ? nearest(to) : coords.length - 1;
  return coords.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function formatDuration(s: number): string {
  const total = Math.max(1, Math.round(s / 60));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** The road the route spends most of its distance on — the "via" line. */
export function viaRoad(steps: RouteStep[]): string | null {
  let best: { road: string; dist: number } | null = null;
  for (const s of steps) {
    const m = s.instruction.match(/\b(?:onto|on)\s+(.+?)(?:\.|,|$)/i);
    if (!m) continue;
    const road = m[1].trim().replace(/\s+/g, ' ');
    if (!road || /^the\b/i.test(road)) continue;
    if (!best || s.distance > best.dist) best = { road, dist: s.distance };
  }
  return best?.road ?? null;
}

/* ───────────── marks ───────────── */

/** The start: a hollow ivory ring, as on the rail. */
function StartMark({ size = 12 }: { size?: number }) {
  return <span className="rounded-full flex-shrink-0 border-2 border-[var(--text-heading)] bg-black" style={{ width: size, height: size }} />;
}

/** The destination: a gold pin, as on the rail. */
function EndMark({ className = 'w-4 h-4' }: { className?: string }) {
  return <MapPin className={`${className} flex-shrink-0`} style={{ color: 'var(--gold-primary)', fill: 'rgba(var(--gold-rgb),0.28)' }} />;
}

/** A stop on the way: a small gold diamond. */
function StopMark() {
  return <span className="w-2 h-2 rotate-45 flex-shrink-0" style={{ background: 'var(--gold-light)', opacity: 0.8 }} />;
}

const MANEUVER: Array<[(t: string) => boolean, LucideIcon]> = [
  [t => t === 'roundabout', RotateCw],
  [t => t === 'merge', Merge],
  [t => t.includes('right'), CornerUpRight],
  [t => t.includes('left'), CornerUpLeft],
];

/** A step's maneuver in a tile; the start and the end wear the rail's own marks. */
function StepIcon({ type, on = false }: { type: string; on?: boolean }) {
  const tile = (child: ReactNode) => (
    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors"
      style={{ borderColor: on ? 'rgba(var(--gold-rgb),0.45)' : 'rgba(255,255,255,0.07)', background: on ? 'rgba(var(--gold-rgb),0.12)' : 'rgba(255,255,255,0.03)' }}>
      {child}
    </span>
  );
  if (type === 'depart') return tile(<StartMark size={10} />);
  if (type === 'arrive') return tile(<EndMark className="w-3.5 h-3.5" />);
  const Icon = MANEUVER.find(([test]) => test(type))?.[1] ?? ArrowUp;
  const turn = Icon !== ArrowUp;
  return tile(<Icon className="w-3.5 h-3.5" style={{ color: on ? 'var(--gold-light)' : turn ? 'var(--text-heading)' : 'var(--text-muted)' }} />);
}

/** One place on the rail: its mark, and the dotted line down to the next. */
function RailRow({ mark, last = false, children }: { mark: ReactNode; last?: boolean; children: ReactNode }) {
  return (
    <div className="relative flex items-center gap-2.5">
      <span className="relative w-4 self-stretch flex items-center justify-center flex-shrink-0" aria-hidden>
        {mark}
        {!last && <span className="absolute left-1/2 -translate-x-1/2 top-[calc(50%+9px)] h-[calc(100%-12px)] w-px bg-[repeating-linear-gradient(to_bottom,var(--text-muted)_0_2px,transparent_2px_5px)]" />}
      </span>
      {children}
    </div>
  );
}

/* ───────────── a place field ───────────── */

/** Start, stop or destination: type a place, an address or coordinates, or pick a recent one. */
function PlaceInput({
  value, onChange, onPick, onClear, placeholder, autoFocus, biasLat, biasLng, onLocate, locating, liveFix, recent, trailing,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
  /** Empty the field and forget its place. */
  onClear?: () => void;
  placeholder: string;
  autoFocus?: boolean;
  biasLat?: number;
  biasLng?: number;
  /** Present only on the start field: fills it with the operator's position. */
  onLocate?: () => void;
  locating?: boolean;
  /** When a live fix exists, every field offers it first. */
  liveFix?: { lat: number; lng: number } | null;
  /** Offered while the field is empty. */
  recent: RecentPlace[];
  trailing?: ReactNode;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = useCallback((q: string) => {
    onChange(q);
    setIdx(0);
    if (timer.current) clearTimeout(timer.current);

    const coord = q.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
    if (coord) {
      const lat = parseFloat(coord[1]);
      const lng = parseFloat(coord[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setResults([{ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, kind: 'coordinate', context: 'Coordinates' }]);
        setOpen(true);
        return;
      }
    }

    if (q.trim().length < 2) { abort.current?.abort(); setResults([]); setLoading(false); setOpen(true); return; }

    timer.current = setTimeout(async () => {
      // Abandon any in-flight lookup so a slow earlier keystroke can never
      // overwrite the results for what the user has actually typed.
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;

      setLoading(true);
      const show = (found: GeoResult[]) => {
        setResults(found.map((r) => ({
          label: r.name, context: r.context, lat: r.lat, lng: r.lng, kind: r.kind,
        })));
        setOpen(true);
      };
      try {
        const near = biasLat !== undefined && biasLng !== undefined ? { lat: biasLat, lng: biasLng } : null;
        const found = await searchPlaces(q, near, ctrl.signal, show);
        if (ctrl.signal.aborted) return;
        show(found);
      } catch {
        if (!ctrl.signal.aborted) setResults([]);
      }
      if (!ctrl.signal.aborted) setLoading(false);
    }, 280);
  }, [onChange, biasLat, biasLng]);

  const choose = (p: Place) => {
    onChange(p.label);
    onPick(p);
    setOpen(false);
    setResults([]);
  };

  // What the list offers: where you are (when tracked), then what was typed for, or recent places while the field is empty.
  const empty = value.trim().length < 2;
  const you: Place[] = liveFix ? [{ label: 'Your location', lat: liveFix.lat, lng: liveFix.lng, kind: 'current', context: 'Live position' }] : [];
  const options: Array<Place & { recent?: boolean }> = [...you, ...(empty ? recent.map(r => ({ ...r, recent: true })) : results)];
  const at = Math.min(idx, Math.max(0, options.length - 1));
  const center = biasLat !== undefined && biasLng !== undefined ? { lat: biasLat, lng: biasLng } : null;

  return (
    <div className="relative flex-1 min-w-0" ref={box}>
      <div className="flex items-center h-10 rounded-lg border bg-black/45 transition-[border-color,box-shadow] border-white/[0.07] hover:border-white/[0.13] focus-within:!border-[rgba(var(--gold-rgb),0.5)] focus-within:shadow-[0_0_0_3px_rgba(var(--gold-rgb),0.08)]">
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setIdx((i) => Math.min(i + 1, options.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter') {
              e.preventDefault();
              const pick = options[at];
              if (pick) choose(pick);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 min-w-0 h-full bg-transparent pl-3 pr-1 text-[13px] text-[var(--text-heading)] outline-none placeholder:text-[var(--text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 mx-1 flex-shrink-0 animate-spin text-[var(--gold-primary)]" />}
        {value && onClear && (
          <button type="button" onClick={() => { onClear(); setResults([]); }} aria-label={`Clear ${placeholder.toLowerCase()}`}
            className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-white/[0.06] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {onLocate && (
          <button type="button" onClick={onLocate} disabled={locating} title="Use my location" aria-label="Use my location"
            className="w-8 h-8 mr-0.5 rounded-md flex items-center justify-center flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--gold-light)] hover:bg-[rgba(var(--gold-rgb),0.08)] transition-colors disabled:opacity-60">
            <LocateFixed className={`w-4 h-4 ${locating ? 'animate-pulse text-[var(--gold-light)]' : ''}`} />
          </button>
        )}
        {trailing}
      </div>

      {open && options.length > 0 && (
        <div role="listbox" aria-label={empty ? 'Suggestions' : 'Places found'}
          className="absolute top-full -left-[26px] -right-[42px] mt-1.5 z-[10000] rounded-xl border border-[var(--border-primary)] p-1.5 max-h-[280px] overflow-y-auto styled-scrollbar"
          style={{ background: 'var(--oi-solid)', boxShadow: '0 18px 44px rgba(0,0,0,0.75)' }}>
          {empty && recent.length > 0 && <span className="block px-3 pt-1 pb-1 text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">Recent</span>}
          {options.map((r, i) => (
            <PlaceRow key={`${r.kind}-${r.label}-${r.lat}-${i}`} place={r} query={empty ? '' : value} on={i === at}
              onPick={() => choose(r)} onHover={() => setIdx(i)} from={center} kindOverride={r.recent ? 'recent' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── the panel ───────────── */

/** A small icon button for the panel's header and field rows. */
function IconBtn({ children, label, onClick, on, className = '' }: { children: ReactNode; label: string; onClick: () => void; /** A toggle's state; leave out for a plain button. */ on?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={on}
      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${on ? 'text-[var(--gold-light)] bg-[rgba(var(--gold-rgb),0.12)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)] hover:bg-white/[0.06]'} ${className}`}>
      {children}
    </button>
  );
}

export default function DirectionsBar({ onRoute, onLocate, onClose, center = null, onLiveLocation, onActiveSegment, onFollowChange, onStartNavigation, initialTo = null }: DirectionsBarProps) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState(initialTo?.label ?? '');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(initialTo);
  const [mode, setMode] = useState<string>('auto');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveLocation | null>(null);
  const [tracking, setTracking] = useState(false);
  const [follow, setFollow] = useState(false);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [chosen, setChosen] = useState(0);
  const [vias, setVias] = useState<Array<{ place: Place | null; text: string }>>([]);
  const [avoid, setAvoid] = useState({ tolls: false, highways: false, ferries: false });
  const [showOptions, setShowOptions] = useState(false);
  const [recent, setRecent] = useState<RecentPlace[]>(() => (typeof window === 'undefined' ? [] : loadRecent()));
  const watchId = useRef<number | null>(null);

  /** Remember a place picked for the route, for the next time a field is empty. */
  const remember = (p: Place) => {
    if (p.kind === 'current') return;
    setRecent(rememberPlace({ label: p.label, context: p.context, lat: p.lat, lng: p.lng, kind: p.kind }));
  };

  const runRoute = useCallback(async (
    a: Place,
    b: Place,
    m: string,
    stops: Place[] = [],
    av: { tolls: boolean; highways: boolean; ferries: boolean } = { tolls: false, highways: false, ferries: false },
  ) => {
    setLoading(true);
    setError(null);
    setActiveStep(null);
    try {
      const viaParam = stops.length
        ? `&via=${stops.map((p) => `${p.lat},${p.lng}`).join('|')}` : '';
      const avoidList = Object.entries(av).filter(([, on]) => on).map(([k]) => k);
      const avoidParam = avoidList.length ? `&avoid=${avoidList.join(',')}` : '';
      const res = await fetch(
        `/api/directions?from=${a.lat},${a.lng}&to=${b.lat},${b.lng}&mode=${m}${viaParam}${avoidParam}`,
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        setRoute(null);
        setRoutes([]);
        onRoute(null);
        setError(data.error || 'No route found');
      } else {
        const all: RouteResult[] = data.routes?.length ? data.routes : [data];
        setRoutes(all);
        setChosen(0);
        setRoute(all[0]);
        onRoute({ ...all[0], from: a, to: b, alternates: all.slice(1).map((r) => r.geometry) });
      }
    } catch {
      setRoute(null);
      setRoutes([]);
      onRoute(null);
      setError('Routing service unreachable');
    }
    setLoading(false);
  }, [onRoute]);

  /** Current intermediate stops that actually resolved to a place. */
  const stops = useCallback(
    () => vias.map((v) => v.place).filter((p): p is Place => p !== null),
    [vias],
  );

  /** Continuous position updates — the moving dot, not a one-shot fix. */
  const toggleTracking = useCallback(() => {
    if (tracking) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setTracking(false);
      setFollow(false);
      onFollowChange?.(false);
      setLive(null);
      onLiveLocation?.(null);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('This browser has no geolocation');
      return;
    }

    setLocateError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: LiveLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        };
        setLive(loc);
        onLiveLocation?.(loc);
        setTracking(true);
      },
      () => {
        setLocateError('Location permission denied — needs HTTPS or localhost');
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    setTracking(true);
  }, [tracking, onLiveLocation, onFollowChange]);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  /**
   * Fill the origin with wherever the operator is.
   *
   * Tries the browser first (precise, but needs permission and a secure
   * context), then falls back to OSIRIS's existing IP geolocation, which needs
   * neither — so this still does something useful when permission is denied.
   */
  const useMyLocation = useCallback(async () => {
    setLocating(true);
    setLocateError(null);

    const apply = (lat: number, lng: number, label: string) => {
      const place: Place = { label, lat, lng, kind: 'current' };
      setFromText(label);
      setFrom(place);
      onLocate?.(lat, lng, 14);
      if (to) runRoute(place, to, mode, stops(), avoid);
    };

    const browser = await new Promise<GeolocationPosition | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    });

    if (browser) {
      const { latitude, longitude } = browser.coords;
      apply(latitude, longitude, 'My location');
      setLocating(false);
      return;
    }

    try {
      const res = await fetch('/api/geo');
      const d = await res.json();
      if (d?.lat && d?.lon) {
        apply(d.lat, d.lon, d.city ? `Near ${d.city}` : 'Approximate location');
        setLocateError('Approximate — from network location');
      } else {
        setLocateError('Could not determine your location');
      }
    } catch {
      setLocateError('Could not determine your location');
    }
    setLocating(false);
  }, [to, mode, runRoute, onLocate, stops, avoid]);

  const pickFrom = (p: Place) => { setFrom(p); remember(p); if (to) runRoute(p, to, mode, stops(), avoid); };
  const pickTo = (p: Place) => { setTo(p); remember(p); if (from) runRoute(from, p, mode, stops(), avoid); };
  const pickMode = (m: string) => { setMode(m); if (from && to) runRoute(from, to, m, stops(), avoid); };

  /** A recent place, from the empty state: the destination first, then the start. */
  const pickRecent = (p: Place) => {
    if (!to) { setToText(p.label); pickTo(p); }
    else { setFromText(p.label); pickFrom(p); }
  };

  /** Empty one end of the route: the route goes with it. */
  const clearEnd = (end: 'from' | 'to') => {
    if (end === 'from') { setFrom(null); setFromText(''); } else { setTo(null); setToText(''); }
    setRoute(null);
    setRoutes([]);
    setError(null);
    setActiveStep(null);
    onRoute(null);
  };

  const pickVia = (i: number, p: Place) => {
    const next = vias.map((v, j) => (j === i ? { place: p, text: p.label } : v));
    setVias(next);
    remember(p);
    const all = next.map((v) => v.place).filter((x): x is Place => x !== null);
    if (from && to) runRoute(from, to, mode, all, avoid);
  };

  const removeVia = (i: number) => {
    const next = vias.filter((_, j) => j !== i);
    setVias(next);
    const all = next.map((v) => v.place).filter((x): x is Place => x !== null);
    if (from && to) runRoute(from, to, mode, all, avoid);
  };

  const toggleAvoid = (key: 'tolls' | 'highways' | 'ferries') => {
    const next = { ...avoid, [key]: !avoid[key] };
    setAvoid(next);
    if (from && to) runRoute(from, to, mode, stops(), next);
  };

  const swap = () => {
    setFrom(to); setTo(from);
    setFromText(toText); setToText(fromText);
    // Reverse the intermediate stops too, or the trip back visits them backwards.
    const reversed = [...vias].reverse();
    setVias(reversed);
    if (from && to) {
      runRoute(to, from, mode, reversed.map((v) => v.place).filter((x): x is Place => x !== null), avoid);
    }
  };

  const chooseRoute = (i: number) => {
    const r = routes[i];
    setChosen(i);
    setRoute(r);
    setActiveStep(null);
    onActiveSegment?.(null);
    if (from && to) onRoute({ ...r, from, to, alternates: routes.filter((_, j) => j !== i).map((x) => x.geometry) });
  };

  const via = route ? viaRoad(route.steps) : null;
  const ready = Boolean(from && to);
  const avoiding = Object.values(avoid).filter(Boolean).length;
  // While tracking, the useful thing is the turn you are approaching, not the
  // whole list — recomputed from each position update.
  const guidance = live && route
    ? nextManeuver(route.steps, route.geometry.coordinates, live.lat, live.lng)
    : null;
  const bias = { biasLat: center?.lat, biasLng: center?.lng };

  return (
    <div className="glass-panel tool-glass relative overflow-hidden flex flex-col max-h-[min(80vh,720px)]">
      <span aria-hidden className="absolute inset-x-0 top-0 h-px z-20" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--gold-rgb),0.7) 30%, rgba(var(--gold-rgb),0.7) 70%, transparent)' }} />

      {/* ── header ── */}
      <header className="flex items-center gap-2.5 h-12 pl-4 pr-2 flex-shrink-0 border-b border-[var(--border-secondary)] bg-black/30">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb),0.12)' }}>
          <Route className="w-4 h-4 text-[var(--gold-primary)]" />
        </span>
        <h2 className="flex-1 text-[14px] font-semibold text-[var(--text-heading)]">Directions</h2>
        {tracking && (
          <span className="flex items-center gap-1.5 h-6 px-2 rounded-full text-[9.5px] font-mono tracking-[0.12em] uppercase text-[var(--gold-light)]"
            style={{ background: 'rgba(var(--gold-rgb),0.1)', boxShadow: 'inset 0 0 0 1px rgba(var(--gold-rgb),0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-light)] animate-osiris-pulse" /> Live
          </span>
        )}
        <IconBtn label={tracking ? 'Stop live tracking' : 'Track my location live'} onClick={toggleTracking} on={tracking}>
          <Crosshair className={`w-4 h-4 ${tracking ? 'animate-pulse' : ''}`} />
        </IconBtn>
        {tracking && (
          <IconBtn label={follow ? 'Stop following' : 'Keep the map centred on me'} on={follow}
            onClick={() => { const n = !follow; setFollow(n); onFollowChange?.(n); }}>
            <LocateFixed className="w-4 h-4" />
          </IconBtn>
        )}
        {onClose && <IconBtn label="Close directions" onClick={onClose}><X className="w-4 h-4" /></IconBtn>}
      </header>

      {/* ── start, stops, destination ── */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <RailRow mark={<StartMark />}>
            <PlaceInput
              value={fromText} onChange={setFromText} onPick={pickFrom} onClear={() => clearEnd('from')}
              placeholder="Choose a start" autoFocus={!initialTo} {...bias}
              onLocate={useMyLocation} locating={locating} liveFix={live} recent={recent}
            />
          </RailRow>
          {vias.map((v, i) => (
            <RailRow key={i} mark={<StopMark />}>
              <PlaceInput
                value={v.text}
                onChange={(t) => setVias((prev) => prev.map((x, j) => (j === i ? { ...x, text: t } : x)))}
                onPick={(p) => pickVia(i, p)}
                placeholder={`Stop ${i + 1}`} {...bias} liveFix={live} recent={recent}
                trailing={(
                  <button type="button" onClick={() => removeVia(i)} aria-label={`Remove stop ${i + 1}`}
                    className="w-8 h-8 mr-0.5 rounded-md flex items-center justify-center flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--alert-red)] hover:bg-[rgba(255,61,61,0.08)] transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              />
            </RailRow>
          ))}
          <RailRow mark={<EndMark />} last>
            <PlaceInput
              value={toText} onChange={setToText} onPick={pickTo} onClear={() => clearEnd('to')}
              placeholder="Choose a destination" {...bias} liveFix={live} recent={recent}
            />
          </RailRow>
        </div>
        <button onClick={swap} aria-label="Swap start and destination" title="Swap start and destination"
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--border-secondary)] bg-black/40 text-[var(--text-secondary)] hover:text-[var(--gold-light)] hover:border-[var(--border-active)] transition-colors">
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 pb-2.5 flex items-center gap-1 flex-shrink-0">
        <button onClick={() => setVias((v) => [...v, { place: null, text: '' }])}
          className="h-7 pl-1.5 pr-2.5 rounded-md flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] hover:text-[var(--gold-light)] hover:bg-white/[0.04] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add stop
        </button>
        <button onClick={() => setShowOptions((o) => !o)} aria-expanded={showOptions}
          className={`ml-auto h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[11.5px] transition-colors ${showOptions || avoiding ? 'text-[var(--gold-light)] bg-[rgba(var(--gold-rgb),0.08)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)] hover:bg-white/[0.04]'}`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Options{avoiding ? ` · ${avoiding}` : ''}
        </button>
      </div>

      {/* ── how ── */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div role="tablist" aria-label="Travel mode" className="flex gap-[2px] p-[3px] rounded-lg border border-[var(--border-secondary)] bg-black/45">
          {MODES.map(({ id, label, Icon }) => {
            const on = mode === id;
            return (
              <button key={id} role="tab" aria-selected={on} onClick={() => pickMode(id)}
                className={`relative flex-1 h-8 flex items-center justify-center gap-1.5 rounded-md text-[10.5px] font-mono tracking-[0.12em] uppercase transition-colors ${on ? 'text-[var(--gold-light)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}
                style={on ? { background: 'rgba(var(--gold-rgb),0.12)', boxShadow: 'inset 0 0 0 1px rgba(var(--gold-rgb),0.32)' } : undefined}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        {showOptions && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] font-mono tracking-[0.12em] uppercase text-[var(--text-muted)] mr-0.5">Avoid</span>
            {([['tolls', 'Tolls'], ['highways', 'Motorways'], ['ferries', 'Ferries']] as const).map(([k, word]) => (
              <button key={k} onClick={() => toggleAvoid(k)} aria-pressed={avoid[k]}
                className={`flex-1 h-7 rounded-full border text-[11px] transition-colors ${avoid[k] ? 'border-[var(--border-active)] bg-[rgba(var(--gold-rgb),0.12)] text-[var(--gold-light)]' : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}>
                {word}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── result region ── */}
      <div className="min-h-0 flex-1 overflow-y-auto styled-scrollbar border-t border-[var(--border-secondary)]">
        {loading && (
          <div className="p-4 space-y-2.5 animate-pulse" aria-live="polite" aria-busy="true">
            <div className="h-7 w-28 rounded bg-white/[0.07]" />
            <div className="h-3 w-48 rounded bg-white/[0.05]" />
            <div className="h-10 rounded-lg bg-white/[0.04]" />
            <div className="pt-1 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-white/[0.06]" />
                  <span className="h-2.5 rounded bg-white/[0.05]" style={{ width: `${70 - i * 12}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="px-5 py-6 flex flex-col items-center text-center">
            <span className="w-10 h-10 rounded-full flex items-center justify-center border border-[rgba(255,61,61,0.3)] bg-[rgba(255,61,61,0.06)]">
              <AlertTriangle className="w-4.5 h-4.5 text-[var(--alert-red)]" />
            </span>
            <p className="mt-2.5 text-[13px] text-[var(--text-heading)]">{error}</p>
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">Try a different point, or another way of travelling.</p>
          </div>
        )}

        {!loading && !error && !route && (
          <div className="p-3 flex flex-col gap-3">
            {ready ? (
              <p className="px-1 text-[12px] text-[var(--text-muted)]">Calculating…</p>
            ) : (
              <>
                {!from && (
                  <button onClick={useMyLocation} disabled={locating}
                    className="group flex items-center gap-3 w-full rounded-lg border border-[var(--border-secondary)] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-active)] hover:bg-[rgba(var(--gold-rgb),0.05)] disabled:opacity-70">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(var(--gold-rgb),0.12)' }}>
                      {locating ? <Loader2 className="w-4 h-4 animate-spin text-[var(--gold-light)]" /> : <LocateFixed className="w-4 h-4 text-[var(--gold-light)]" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-[var(--text-heading)]">Start from my location</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">{to ? `Then the route to ${to.label}` : 'Then choose where to go'}</span>
                    </span>
                  </button>
                )}
                {locateError && <p className="px-1 text-[11px] text-[var(--gold-light)]">{locateError}</p>}
                {recent.length > 0 && (
                  <div>
                    <span className="block px-1 pb-1 text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">Recent places</span>
                    <div className="flex flex-col gap-0.5">
                      {recent.slice(0, 4).map((r, i) => (
                        <PlaceRow key={`${r.label}-${r.lat}-${i}`} place={r} on={false} onPick={() => pickRecent(r)} from={center} kindOverride="recent" />
                      ))}
                    </div>
                  </div>
                )}
                <div className="px-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)] mr-0.5">Try</span>
                  <span className="instrument-sample">Heathrow</span>
                  <span className="instrument-sample">10 Downing St</span>
                  <span className="instrument-sample">51.5074, -0.1278</span>
                </div>
              </>
            )}
          </div>
        )}

        {!loading && route && (
          <>
            {guidance && (
              <div className="mx-3 mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'rgba(var(--gold-rgb),0.3)', background: 'rgba(var(--gold-rgb),0.06)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Navigation className="w-3 h-3 text-[var(--gold-light)]" />
                  <span className="text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--gold-light)]">Next</span>
                </div>
                <div className="flex items-center gap-3">
                  <StepIcon type={guidance.step.type} on />
                  <span className="flex-1 min-w-0 text-[13px] text-[var(--text-heading)] leading-snug">{guidance.step.instruction}</span>
                  <span className="text-[15px] font-mono text-[var(--gold-light)] tabular-nums flex-shrink-0">{formatDistance(guidance.distance)}</span>
                </div>
              </div>
            )}

            {/* summary — sticky so time, distance and arrival stay in view while the steps scroll under it */}
            <div className="sticky top-0 z-10 px-4 pt-3.5 pb-3 border-b border-[var(--border-secondary)]" style={{ background: 'var(--oi-solid)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[26px] leading-none font-mono font-light tabular-nums text-[var(--text-heading)]" style={{ textShadow: '0 0 20px rgba(var(--gold-rgb),0.2)' }}>
                      {formatDuration(route.duration)}
                    </span>
                    {chosen === 0 && routes.length > 1 && <span className="text-[9.5px] font-mono tracking-[0.12em] uppercase text-[var(--gold-light)]">Fastest</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] tabular-nums">
                    <span>{formatDistance(route.distance)}</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>Arrive {arrivalTime(route.duration)}</span>
                  </div>
                  {via && <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)] truncate">via {via}</div>}
                </div>
                {(route.hasToll || route.hasHighway || route.hasFerry) && (
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {route.hasToll && <span className="h-5 px-1.5 rounded flex items-center text-[9px] font-mono tracking-[0.1em] uppercase border border-[rgba(var(--gold-rgb),0.35)] text-[var(--gold-light)]">Toll</span>}
                    {route.hasHighway && <span className="h-5 px-1.5 rounded flex items-center text-[9px] font-mono tracking-[0.1em] uppercase border border-[var(--border-secondary)] text-[var(--text-secondary)]">Motorway</span>}
                    {route.hasFerry && <span className="h-5 px-1.5 rounded flex items-center text-[9px] font-mono tracking-[0.1em] uppercase border border-[var(--border-secondary)] text-[var(--text-secondary)]">Ferry</span>}
                  </div>
                )}
              </div>

              {onStartNavigation && (
                <button onClick={() => onStartNavigation(route, to?.label || 'your destination', {
                  stops: stops().map(({ lat, lng }) => ({ lat, lng })),
                  avoid: Object.entries(avoid).filter(([, on]) => on).map(([k]) => k),
                })} className="tool-btn-primary w-full mt-3">
                  <Play className="w-4 h-4" fill="currentColor" /> Start navigation
                </button>
              )}
            </div>

            {routes.length > 1 && (
              <div className="px-3 pt-3">
                <span className="block px-1 pb-1.5 text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">Routes · {routes.length}</span>
                <div role="radiogroup" aria-label="Routes" className="flex flex-col gap-1">
                  {routes.map((r, i) => {
                    const on = i === chosen;
                    // Compared in the whole minutes shown, so "14 min" beside "13 min" never reads "same time".
                    const slower = Math.max(1, Math.round(r.duration / 60)) - Math.max(1, Math.round(routes[0].duration / 60));
                    const road = viaRoad(r.steps);
                    return (
                      <button key={i} role="radio" aria-checked={on} onClick={() => chooseRoute(i)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${on ? 'border-[rgba(var(--gold-rgb),0.45)] bg-[rgba(var(--gold-rgb),0.08)]' : 'border-[var(--border-secondary)] hover:bg-white/[0.03] hover:border-[var(--border-primary)]'}`}>
                        <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 border" style={{ borderColor: on ? 'var(--gold-primary)' : 'var(--text-muted)' }}>
                          {on && <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-primary)]" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[12.5px] font-mono tabular-nums ${on ? 'text-[var(--gold-light)]' : 'text-[var(--text-heading)]'}`}>{formatDuration(r.duration)}</span>
                          <span className="block text-[11px] text-[var(--text-muted)] truncate">{road ? `via ${road}` : formatDistance(r.distance)}</span>
                        </span>
                        <span className="flex flex-col items-end flex-shrink-0 text-[10.5px] font-mono tabular-nums">
                          <span className="text-[var(--text-secondary)]">{formatDistance(r.distance)}</span>
                          <span className={i === 0 ? 'text-[var(--gold-light)]' : 'text-[var(--text-muted)]'}>{i === 0 ? 'Fastest' : slower > 0 ? `+${slower} min` : 'Same time'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {route.elevation && route.elevation.length > 1 && (
              <div className="px-4 pt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">
                    <Mountain className="w-3 h-3" /> Elevation
                  </span>
                  <span className="text-[10.5px] font-mono text-[var(--text-secondary)] tabular-nums">↑{route.ascent ?? 0} m · ↓{route.descent ?? 0} m</span>
                </div>
                <svg viewBox="0 0 300 40" className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
                  <path d={`${elevationPath(route.elevation, 300, 38)} L300,40 L0,40 Z`} fill="rgba(var(--gold-rgb),0.12)" />
                  <path d={elevationPath(route.elevation, 300, 38)} fill="none" stroke="var(--gold-primary)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            )}

            {/* steps */}
            <div className="px-3 pt-3 pb-2">
              <span className="block px-1 pb-1.5 text-[9.5px] font-mono tracking-[0.14em] uppercase text-[var(--text-muted)]">Turn by turn · {route.steps.length}</span>
              <ol className="flex flex-col gap-0.5">
                {route.steps.map((s, i) => {
                  const on = activeStep === i;
                  return (
                    <li key={i}>
                      <button
                        onClick={() => {
                          setActiveStep(i);
                          onLocate?.(s.location[1], s.location[0], 17);
                          onActiveSegment?.(segmentBetween(route.geometry.coordinates, s.location, route.steps[i + 1]?.location));
                        }}
                        className={`relative w-full text-left rounded-lg pl-3 pr-2.5 py-2 flex items-center gap-3 transition-colors ${on ? 'bg-[rgba(var(--gold-rgb),0.08)]' : 'hover:bg-white/[0.035]'}`}>
                        {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[var(--gold-primary)]" />}
                        <StepIcon type={s.type} on={on} />
                        <span className={`flex-1 min-w-0 text-[12.5px] leading-snug ${on ? 'text-[var(--text-heading)]' : 'text-[var(--text-primary)]'}`}>{s.instruction}</span>
                        {s.distance > 0 && (
                          <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums flex-shrink-0 text-right min-w-[44px]">{formatDistance(s.distance)}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <p className="px-4 py-2.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-secondary)]">
              Routing by {route.provider} ·{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--gold-light)]">© OpenStreetMap</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

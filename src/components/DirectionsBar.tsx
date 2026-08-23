'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Car, Footprints, Bike, ArrowUpDown, MapPin, Flag, Route,
  CornerUpRight, CornerUpLeft, ArrowUp, RotateCw, Merge, Search,
  LocateFixed, Building2, Landmark, Globe2, Signpost, Home, Crosshair, Clock,
  Plus, Trash2, SlidersHorizontal, Mountain, Navigation, Play,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Route Planner
   Turn-by-turn routing over /api/directions (Valhalla + OSRM)
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

export interface LiveLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
}

interface GeoHit {
  name: string;
  context: string;
  lat: number;
  lng: number;
  kind: string;
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
  /** Hand the chosen route to the parent to drive live navigation. */
  onStartNavigation?: (route: RouteResult, destinationLabel: string) => void;
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

function StepIcon({ type }: { type: string }) {
  // Turns carry the actual navigational signal, so they get the accent colour;
  // start/finish are green/flagged; filler moves stay muted.
  const cls = 'w-3.5 h-3.5';
  if (type === 'arrive') return <Flag className={`${cls} text-[var(--alert-green)]`} />;
  if (type === 'depart') return <MapPin className={`${cls} text-[var(--alert-green)]`} />;
  if (type === 'roundabout') return <RotateCw className={`${cls} text-[var(--cyan-primary)]`} />;
  if (type === 'merge') return <Merge className={`${cls} text-[var(--cyan-primary)]`} />;
  if (type.includes('right')) return <CornerUpRight className={`${cls} text-[var(--cyan-primary)]`} />;
  if (type.includes('left')) return <CornerUpLeft className={`${cls} text-[var(--cyan-primary)]`} />;
  return <ArrowUp className={`${cls} text-[var(--text-muted)]`} />;
}

/** Icon for a search hit, so the list is scannable by type. */
function KindIcon({ kind }: { kind?: string }) {
  const cls = 'w-3 h-3 flex-shrink-0 mt-0.5';
  if (kind === 'coordinate') return <MapPin className={`${cls} text-[var(--cyan-primary)]`} />;
  if (kind === 'current') return <LocateFixed className={`${cls} text-[var(--alert-green)]`} />;
  if (kind === 'country') return <Globe2 className={`${cls} text-[var(--gold-primary)]`} />;
  if (kind === 'region' || kind === 'city') return <Landmark className={`${cls} text-[#FF9500]`} />;
  if (kind === 'street') return <Signpost className={`${cls} text-[var(--text-secondary)]`} />;
  if (kind === 'address') return <Home className={`${cls} text-[var(--text-secondary)]`} />;
  if (kind === 'poi') return <Building2 className={`${cls} text-[var(--cyan-primary)]`} />;
  return <Search className={`${cls} text-[var(--text-muted)]`} />;
}

/** Origin / destination field with Nominatim autocomplete. */
function PlaceInput({
  value, onChange, onPick, placeholder, autoFocus, biasLat, biasLng, onLocate, locating, liveFix,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
  placeholder: string;
  autoFocus?: boolean;
  biasLat?: number;
  biasLng?: number;
  /** Present only on the origin field — fills it with the operator's position. */
  onLocate?: () => void;
  locating?: boolean;
  /** When a live fix exists, both fields offer it as the first choice. */
  liveFix?: { lat: number; lng: number } | null;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
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
    setIdx(-1);
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

    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }

    timer.current = setTimeout(async () => {
      // Abandon any in-flight lookup so a slow earlier keystroke can never
      // overwrite the results for what the user has actually typed.
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;

      setLoading(true);
      try {
        const bias = biasLat !== undefined && biasLng !== undefined
          ? `&lat=${biasLat}&lng=${biasLng}` : '';
        const res = await fetch(
          `/api/geosearch?q=${encodeURIComponent(q)}${bias}`,
          { signal: ctrl.signal },
        );
        const data: { results?: GeoHit[] } = await res.json();
        if (ctrl.signal.aborted) return;
        setResults((data.results || []).map((r) => ({
          label: r.name, context: r.context, lat: r.lat, lng: r.lng, kind: r.kind,
        })));
        setOpen(true);
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

  return (
    <div className="relative flex-1 min-w-0" ref={box}>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => search(e.target.value)}
        onFocus={() => (results.length || liveFix) && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            const pick = results[idx >= 0 ? idx : 0];
            if (pick) choose(pick);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent py-2 pr-6 text-[12px] text-[var(--text-primary)] outline-none
                   placeholder:text-[var(--text-muted)] focus:placeholder:text-[var(--text-secondary)]
                   border-b border-transparent focus:border-[var(--border-active)] transition-colors"
        autoComplete="off"
        spellCheck={false}
      />

      {loading && (
        <span className="absolute right-6 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-[var(--gold-primary)] border-t-transparent animate-spin" />
      )}

      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          title="Use my location"
          aria-label="Use my location"
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded text-[var(--text-muted)]
                     hover:text-[var(--alert-green)] hover:bg-[rgba(0,230,118,0.08)] transition-colors disabled:opacity-50"
        >
          <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-pulse text-[var(--alert-green)]' : ''}`} />
        </button>
      )}

      {open && (results.length > 0 || liveFix) && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-[10000] rounded-lg overflow-hidden
                     border border-[var(--border-primary)] bg-[var(--bg-panel-solid)] max-h-[240px] overflow-y-auto styled-scrollbar"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}
        >
          {liveFix && (
            <button
              onClick={() => choose({ label: 'Your location', lat: liveFix.lat, lng: liveFix.lng, kind: 'current', context: 'Live position' })}
              className="w-full text-left px-2.5 py-2 flex items-start gap-2 transition-colors
                         border-b border-[var(--border-secondary)] hover:bg-[rgba(0,230,118,0.08)]"
            >
              <KindIcon kind="current" />
              <span className="min-w-0">
                <span className="block text-[11px] text-[var(--alert-green)]">Your location</span>
                <span className="block text-[10px] text-[var(--text-muted)]">Live position</span>
              </span>
            </button>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => choose(r)}
              onMouseEnter={() => setIdx(i)}
              className={`w-full text-left px-2.5 py-2 flex items-start gap-2 transition-colors ${
                i === idx ? 'bg-[rgba(var(--gold-rgb),0.10)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <KindIcon kind={r.kind} />
              <span className="min-w-0">
                <span className={`block text-[11px] text-[var(--text-primary)] truncate ${r.kind === 'coordinate' ? 'tabular-nums' : ''}`}>
                  {r.label}
                </span>
                {r.context && (
                  <span className="block text-[10px] text-[var(--text-muted)] truncate">{r.context}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectionsBar({ onRoute, onLocate, onClose, center = null, onLiveLocation, onActiveSegment, onFollowChange, onStartNavigation }: DirectionsBarProps) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
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
  const watchId = useRef<number | null>(null);

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

  const pickFrom = (p: Place) => { setFrom(p); if (to) runRoute(p, to, mode, stops(), avoid); };
  const pickTo = (p: Place) => { setTo(p); if (from) runRoute(from, p, mode, stops(), avoid); };
  const pickMode = (m: string) => { setMode(m); if (from && to) runRoute(from, to, m, stops(), avoid); };

  const pickVia = (i: number, p: Place) => {
    const next = vias.map((v, j) => (j === i ? { place: p, text: p.label } : v));
    setVias(next);
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

  const via = route ? viaRoad(route.steps) : null;
  const ready = Boolean(from && to);
  // While tracking, the useful thing is the turn you are approaching, not the
  // whole list — recomputed from each position update.
  const guidance = live && route
    ? nextManeuver(route.steps, route.geometry.coordinates, live.lat, live.lng)
    : null;

  return (
    <div
      className="glass-panel instrument-grid instrument-corners relative overflow-hidden flex flex-col max-h-[min(78vh,640px)]"
      style={{ boxShadow: '0 18px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--gold-rgb),0.04)' }}
    >
      {/* ── header ── */}
      <header className="relative flex items-center gap-2 px-3 h-10 flex-shrink-0">
        {/* A lit accent bar reads as an instrument being powered, where a
            plain heading just reads as a form label. */}
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r"
          style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px rgba(var(--gold-rgb),0.6)' }}
        />
        <Route className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
        <h2 className="instrument-title flex-1">Route</h2>

        {/* State at a glance: standby until both ends are set, then the leg. */}
        <span
          className="instrument-chip"
          style={{ color: route ? 'var(--alert-green)' : 'var(--text-muted)' }}
        >
          {route ? `${route.steps.length} STEPS` : ready ? 'PLOTTING' : 'STANDBY'}
        </span>

        <button
          onClick={toggleTracking}
          aria-pressed={tracking}
          title={tracking ? 'Stop live tracking' : 'Track my location live'}
          className={`p-1.5 rounded transition-colors ${
            tracking
              ? 'text-[#4285F4] bg-[rgba(66,133,244,0.14)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Crosshair className={`w-3.5 h-3.5 ${tracking ? 'animate-pulse' : ''}`} />
        </button>

        {tracking && (
          <button
            onClick={() => { const n = !follow; setFollow(n); onFollowChange?.(n); }}
            aria-pressed={follow}
            title={follow ? 'Stop following' : 'Keep the map centred on me'}
            className={`p-1.5 rounded transition-colors ${
              follow
                ? 'text-[var(--gold-primary)] bg-[rgba(var(--gold-rgb),0.14)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close directions"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors -mr-1 p-1.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </header>
      <div className="instrument-rule flex-shrink-0" />

      {/* ── origin / destination rail ── */}
      <div className="flex items-stretch gap-2.5 px-3 py-2">
        {/* the rail: dot, connector, pin */}
        <div className="flex flex-col items-center pt-3 pb-3" aria-hidden="true">
          <span
            className="w-2 h-2 rounded-full bg-[var(--alert-green)] flex-shrink-0"
            style={{ boxShadow: '0 0 8px rgba(0,230,118,0.6)' }}
          />
          <span className="flex-1 w-px my-1 bg-[repeating-linear-gradient(to_bottom,var(--text-muted)_0_2px,transparent_2px_5px)]" />
          {vias.map((_, i) => (
            <span key={i} className="contents">
              <span className="w-1.5 h-1.5 bg-[var(--cyan-primary)] flex-shrink-0 rotate-45" />
              <span className="flex-1 w-px my-1 bg-[repeating-linear-gradient(to_bottom,var(--text-muted)_0_2px,transparent_2px_5px)]" />
            </span>
          ))}
          <MapPin className="w-3 h-3 text-[var(--alert-red)] flex-shrink-0" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col divide-y divide-[var(--border-secondary)]">
          <PlaceInput
            value={fromText} onChange={setFromText} onPick={pickFrom}
            placeholder="Choose starting point" autoFocus
            biasLat={center?.lat} biasLng={center?.lng}
            onLocate={useMyLocation} locating={locating} liveFix={live}
          />
          {vias.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <PlaceInput
                value={v.text}
                onChange={(t) => setVias((prev) => prev.map((x, j) => (j === i ? { ...x, text: t } : x)))}
                onPick={(p) => pickVia(i, p)}
                placeholder={`Stop ${i + 1}`}
                biasLat={center?.lat} biasLng={center?.lng} liveFix={live}
              />
              <button
                onClick={() => removeVia(i)}
                aria-label={`Remove stop ${i + 1}`}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--alert-red)] transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <PlaceInput
            value={toText} onChange={setToText} onPick={pickTo}
            placeholder="Choose destination"
            biasLat={center?.lat} biasLng={center?.lng} liveFix={live}
          />
        </div>

        <button
          onClick={swap}
          aria-label="Swap origin and destination"
          className="self-center p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--gold-primary)]
                     hover:bg-[rgba(var(--gold-rgb),0.08)] transition-colors flex-shrink-0"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── travel mode ── */}
      <div className="px-3 pb-2.5 flex items-center gap-1.5">
        <div
          role="tablist"
          aria-label="Travel mode"
          className="flex-1 flex p-0.5 rounded-lg border border-[var(--border-secondary)] bg-[rgba(0,0,0,0.35)]"
        >
          {MODES.map(({ id, label, Icon }) => {
            const on = mode === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                onClick={() => pickMode(id)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[6px] text-[11px] tracking-[0.12em] uppercase transition-all ${
                  on
                    ? 'bg-[rgba(var(--gold-rgb),0.14)] text-[var(--gold-primary)] shadow-[inset_0_0_0_1px_rgba(var(--gold-rgb),0.30),0_0_14px_rgba(var(--gold-rgb),0.10)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]'
                }`}
                style={on ? { fontFamily: 'var(--font-hud)' } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {/* A lit underline on the selected mode — the fill alone is
                    subtle enough to miss against a bright basemap. */}
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-[3px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
                    style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px rgba(var(--gold-rgb),0.7)' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setVias((v) => [...v, { place: null, text: '' }])}
          title="Add a stop"
          aria-label="Add a stop"
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--cyan-primary)]
                     hover:bg-[rgba(var(--cyan-rgb),0.08)] transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowOptions((o) => !o)}
          aria-pressed={showOptions}
          title="Route options"
          aria-label="Route options"
          className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
            showOptions || avoid.tolls || avoid.highways || avoid.ferries
              ? 'text-[var(--gold-primary)] bg-[rgba(var(--gold-rgb),0.1)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {showOptions && (
        <div className="px-3 pb-2.5 flex gap-1.5">
          {(['tolls', 'highways', 'ferries'] as const).map((k) => (
            <button
              key={k}
              onClick={() => toggleAvoid(k)}
              aria-pressed={avoid[k]}
              className={`flex-1 py-1.5 rounded-md border text-[10px] capitalize transition-all ${
                avoid[k]
                  ? 'border-[var(--border-active)] bg-[rgba(var(--gold-rgb),0.12)] text-[var(--gold-primary)]'
                  : 'border-[var(--border-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Avoid {k}
            </button>
          ))}
        </div>
      )}

      {/* ── result region ── */}
      <div className="min-h-0 flex-1 overflow-y-auto styled-scrollbar border-t border-[var(--border-secondary)]">
        {loading && (
          <div className="p-3 space-y-2 animate-pulse" aria-live="polite" aria-busy="true">
            <div className="h-5 w-24 rounded bg-[rgba(255,255,255,0.06)]" />
            <div className="h-3 w-40 rounded bg-[rgba(255,255,255,0.04)]" />
            <div className="pt-2 space-y-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded bg-[rgba(255,255,255,0.06)]" />
                  <span className="h-2.5 rounded bg-[rgba(255,255,255,0.05)]" style={{ width: `${70 - i * 12}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && locateError && (
          <p className="px-3 pt-2 text-[10px] text-[var(--gold-primary)]">{locateError}</p>
        )}

        {!loading && error && (
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] text-[var(--alert-red)]">{error}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              Try a different point, or switch travel mode.
            </p>
          </div>
        )}

        {!loading && !error && !route && (
          <div className="px-3 py-4">
            {ready ? (
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">Calculating…</p>
            ) : (
              <>
                <p className="hud-label mb-2">Accepted input</p>
                {/* Showing the formats beats describing them: the sample is the
                    documentation, and it is scannable at a glance. */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="instrument-sample">Heathrow</span>
                  <span className="instrument-sample">10 Downing St</span>
                  <span className="instrument-sample">51.5074,-0.1278</span>
                </div>
                <p className="mt-2.5 text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Set a start and a destination to plot a route.
                </p>
              </>
            )}
          </div>
        )}

        {!loading && route && (
          <>
            {guidance && (
              <div className="px-3 py-2.5 border-b border-[var(--border-secondary)] bg-[rgba(66,133,244,0.07)]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Navigation className="w-2.5 h-2.5 text-[#4285F4]" />
                  <span className="text-[9px] uppercase tracking-[0.15em] text-[#4285F4]">Next turn</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0"><StepIcon type={guidance.step.type} /></span>
                  <span className="flex-1 min-w-0 text-[12px] text-[var(--text-primary)] leading-snug">
                    {guidance.step.instruction}
                  </span>
                  <span className="text-[12px] text-[var(--gold-primary)] tabular-nums flex-shrink-0">
                    {formatDistance(guidance.distance)}
                  </span>
                </div>
              </div>
            )}

            {/* summary — sticky so time, distance and ETA stay visible while
                the step list scrolls underneath */}
            <div className="sticky top-0 z-10 px-3 py-2.5 border-b border-[var(--border-secondary)] bg-[var(--bg-panel)] backdrop-blur-xl">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[17px] leading-none text-[var(--gold-primary)] tabular-nums">
                    {formatDuration(route.duration)}
                  </div>
                  {via && (
                    <div className="text-[10px] text-[var(--text-muted)] truncate mt-1">via {via}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[12px] text-[var(--text-secondary)] tabular-nums">
                    {formatDistance(route.distance)}
                  </div>
                  <div className="flex items-center gap-1 justify-end text-[10px] text-[var(--text-muted)] tabular-nums mt-1">
                    <Clock className="w-2.5 h-2.5" />
                    {arrivalTime(route.duration)}
                  </div>
                </div>
              </div>

              {(route.hasToll || route.hasHighway || route.hasFerry) && (
                <div className="flex gap-1.5 mt-2">
                  {route.hasToll && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[var(--border-secondary)] text-[var(--alert-orange)]">Toll</span>}
                  {route.hasHighway && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[var(--border-secondary)] text-[var(--text-muted)]">Motorway</span>}
                  {route.hasFerry && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[var(--border-secondary)] text-[var(--cyan-primary)]">Ferry</span>}
                </div>
              )}

              {route.elevation && route.elevation.length > 1 && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                      <Mountain className="w-2.5 h-2.5" /> Elevation
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">
                      ↑{route.ascent ?? 0} m · ↓{route.descent ?? 0} m
                    </span>
                  </div>
                  <svg viewBox="0 0 300 40" className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
                    <path
                      d={`${elevationPath(route.elevation, 300, 38)} L300,40 L0,40 Z`}
                      fill="rgba(0,229,255,0.12)"
                    />
                    <path
                      d={elevationPath(route.elevation, 300, 38)}
                      fill="none" stroke="var(--cyan-primary)" strokeWidth="1.2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              )}

              {onStartNavigation && (
                <button
                  onClick={() => onStartNavigation(route, to?.label || 'your destination')}
                  className="w-full mt-2.5 flex items-center justify-center gap-2 py-2 rounded-lg
                             bg-[rgba(66,133,244,0.16)] border border-[rgba(66,133,244,0.45)]
                             text-[#7BAAF7] text-[12px] tracking-wide
                             hover:bg-[rgba(66,133,244,0.24)] transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start navigation
                </button>
              )}

              {routes.length > 1 && (
                <div className="flex gap-1 mt-2.5" role="tablist" aria-label="Route options">
                  {routes.map((r, i) => {
                    const on = i === chosen;
                    const slower = Math.round((r.duration - routes[0].duration) / 60);
                    return (
                      <button
                        key={i}
                        role="tab"
                        aria-selected={on}
                        onClick={() => {
                          setChosen(i);
                          setRoute(r);
                          setActiveStep(null);
                          onActiveSegment?.(null);
                          if (from && to) {
                            onRoute({
                              ...r, from, to,
                              alternates: routes.filter((_, j) => j !== i).map((x) => x.geometry),
                            });
                          }
                        }}
                        className={`flex-1 px-2 py-2 rounded-md border text-[10px] transition-all ${
                          on
                            ? 'border-[var(--border-active)] bg-[rgba(var(--gold-rgb),0.12)] text-[var(--gold-primary)]'
                            : 'border-[var(--border-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="block tabular-nums">{formatDuration(r.duration)}</span>
                        <span className="block text-[9px] opacity-70 tabular-nums">
                          {i === 0 ? 'Fastest' : slower > 0 ? `+${slower} min` : formatDistance(r.distance)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* steps */}
            <ol>
              {route.steps.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      setActiveStep(i);
                      onLocate?.(s.location[1], s.location[0], 17);
                      onActiveSegment?.(
                        segmentBetween(route.geometry.coordinates, s.location, route.steps[i + 1]?.location),
                      );
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-l-2 transition-colors ${
                      activeStep === i
                        ? 'border-[var(--gold-primary)] bg-[rgba(var(--gold-rgb),0.07)]'
                        : 'border-transparent hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                  >
                    <span className="mt-px flex-shrink-0"><StepIcon type={s.type} /></span>
                    <span className="flex-1 min-w-0 text-[11px] text-[var(--text-primary)] leading-snug">
                      {s.instruction}
                    </span>
                    {s.distance > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0 mt-px w-12 text-right">
                        {formatDistance(s.distance)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>

            <p className="px-3 py-2 text-[9px] text-[var(--text-muted)] tracking-wider uppercase border-t border-[var(--border-secondary)]">
              Routing via {route.provider} · OpenStreetMap
            </p>
          </>
        )}
      </div>
    </div>
  );
}

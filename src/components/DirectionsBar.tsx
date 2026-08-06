'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Car, Footprints, Bike, ArrowUpDown, MapPin, Flag, Route,
  CornerUpRight, CornerUpLeft, ArrowUp, RotateCw, Merge, Search,
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
}

interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface DirectionsBarProps {
  onRoute: (route: (RouteResult & { from: Place; to: Place }) | null) => void;
  onLocate?: (lat: number, lng: number, zoom?: number) => void;
  onClose?: () => void;
  /** Pre-filled destination; consumed as initial state (parent remounts by key). */
  initialTo?: Place | null;
}

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
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

/** A "lat, lng" label must never be split on its comma like an address. */
export function isCoordLabel(label: string): boolean {
  return /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(label.trim());
}

/** Shorten a Nominatim display_name to something readable in a narrow field. */
export function shortLabel(displayName: string): string {
  if (isCoordLabel(displayName)) return displayName.trim();
  const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[0]}, ${parts[1]}`;
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

/** Origin / destination field with Nominatim autocomplete. */
function PlaceInput({
  value, onChange, onPick, placeholder, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setResults([{ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng }]);
        setOpen(true);
        return;
      }
    }

    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data: NominatimPlace[] = await res.json();
        setResults(data.map((r) => ({
          label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon),
        })));
        setOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 320);
  }, [onChange]);

  const choose = (p: Place) => {
    onChange(shortLabel(p.label));
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
        onFocus={() => results.length && setOpen(true)}
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
        className="w-full bg-transparent py-2 pr-6 text-[11px] text-[var(--text-primary)] outline-none
                   placeholder:text-[var(--text-muted)] focus:placeholder:text-[var(--text-secondary)]
                   border-b border-transparent focus:border-[var(--border-active)] transition-colors"
        autoComplete="off"
        spellCheck={false}
      />

      {loading && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-[var(--gold-primary)] border-t-transparent animate-spin" />
      )}

      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-[10000] rounded-lg overflow-hidden
                     border border-[var(--border-primary)] bg-[var(--bg-panel-solid)] max-h-[220px] overflow-y-auto styled-scrollbar"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}
        >
          {results.map((r, i) => {
            const coord = isCoordLabel(r.label);
            const parts = coord ? [r.label] : r.label.split(',').map((p) => p.trim());
            return (
              <button
                key={i}
                onClick={() => choose(r)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full text-left px-2.5 py-2 flex items-start gap-2 transition-colors ${
                  i === idx ? 'bg-[rgba(var(--gold-rgb),0.10)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                {coord
                  ? <MapPin className="w-3 h-3 text-[var(--cyan-primary)] flex-shrink-0 mt-0.5" />
                  : <Search className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />}
                <span className="min-w-0">
                  <span className="block text-[10px] text-[var(--text-primary)] truncate tabular-nums">{parts[0]}</span>
                  {parts.length > 1 && (
                    <span className="block text-[9px] text-[var(--text-muted)] truncate">
                      {parts.slice(1, 4).join(', ')}
                    </span>
                  )}
                  {coord && (
                    <span className="block text-[9px] text-[var(--text-muted)]">Coordinates</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DirectionsBar({ onRoute, onLocate, onClose, initialTo = null }: DirectionsBarProps) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState(initialTo ? shortLabel(initialTo.label) : '');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(initialTo);
  const [mode, setMode] = useState<string>('auto');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const runRoute = useCallback(async (a: Place, b: Place, m: string) => {
    setLoading(true);
    setError(null);
    setActiveStep(null);
    try {
      const res = await fetch(`/api/directions?from=${a.lat},${a.lng}&to=${b.lat},${b.lng}&mode=${m}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setRoute(null);
        onRoute(null);
        setError(data.error || 'No route found');
      } else {
        setRoute(data);
        onRoute({ ...data, from: a, to: b });
      }
    } catch {
      setRoute(null);
      onRoute(null);
      setError('Routing service unreachable');
    }
    setLoading(false);
  }, [onRoute]);

  const pickFrom = (p: Place) => { setFrom(p); if (to) runRoute(p, to, mode); };
  const pickTo = (p: Place) => { setTo(p); if (from) runRoute(from, p, mode); };
  const pickMode = (m: string) => { setMode(m); if (from && to) runRoute(from, to, m); };

  const swap = () => {
    setFrom(to); setTo(from);
    setFromText(toText); setToText(fromText);
    if (from && to) runRoute(to, from, mode);
  };

  const via = route ? viaRoad(route.steps) : null;
  const ready = Boolean(from && to);

  return (
    <div
      className="glass-panel overflow-hidden flex flex-col max-h-[min(78vh,640px)]"
      style={{ boxShadow: '0 18px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--gold-rgb),0.04)' }}
    >
      {/* ── header ── */}
      <header className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border-secondary)] flex-shrink-0">
        <Route className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
        <h2 className="text-[10px] tracking-[0.18em] text-[var(--text-secondary)] uppercase flex-1">Route</h2>
        {route && (
          <span className="text-[9px] text-[var(--text-muted)] tabular-nums">
            {route.steps.length} steps
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close directions"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors -mr-1 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* ── origin / destination rail ── */}
      <div className="flex items-stretch gap-2.5 px-3 py-2">
        {/* the rail: dot, connector, pin */}
        <div className="flex flex-col items-center pt-3 pb-3" aria-hidden="true">
          <span
            className="w-2 h-2 rounded-full bg-[var(--alert-green)] flex-shrink-0"
            style={{ boxShadow: '0 0 8px rgba(0,230,118,0.6)' }}
          />
          <span className="flex-1 w-px my-1 bg-[repeating-linear-gradient(to_bottom,var(--text-muted)_0_2px,transparent_2px_5px)]" />
          <MapPin className="w-3 h-3 text-[var(--alert-red)] flex-shrink-0" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col divide-y divide-[var(--border-secondary)]">
          <PlaceInput
            value={fromText} onChange={setFromText} onPick={pickFrom}
            placeholder="Choose starting point" autoFocus={!initialTo}
          />
          <PlaceInput
            value={toText} onChange={setToText} onPick={pickTo}
            placeholder="Choose destination" autoFocus={Boolean(initialTo)}
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
      <div className="px-3 pb-2.5">
        <div
          role="tablist"
          aria-label="Travel mode"
          className="flex p-0.5 rounded-lg border border-[var(--border-secondary)] bg-[rgba(0,0,0,0.35)]"
        >
          {MODES.map(({ id, label, Icon }) => {
            const on = mode === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                onClick={() => pickMode(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-[10px] transition-all ${
                  on
                    ? 'bg-[rgba(var(--gold-rgb),0.14)] text-[var(--gold-primary)] shadow-[inset_0_0_0_1px_rgba(var(--gold-rgb),0.25)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

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

        {!loading && error && (
          <div className="px-3 py-4 text-center">
            <p className="text-[10px] text-[var(--alert-red)]">{error}</p>
            <p className="text-[9px] text-[var(--text-muted)] mt-1">
              Try a different point, or switch travel mode.
            </p>
          </div>
        )}

        {!loading && !error && !route && (
          <p className="px-3 py-4 text-[10px] text-[var(--text-muted)] leading-relaxed">
            {ready
              ? 'Calculating…'
              : 'Enter a start and destination. Place names, addresses and lat,lng all work.'}
          </p>
        )}

        {!loading && route && (
          <>
            {/* summary */}
            <div className="px-3 py-2.5 flex items-baseline justify-between gap-3 border-b border-[var(--border-secondary)]">
              <div className="min-w-0">
                <div className="text-[17px] leading-none text-[var(--gold-primary)] tabular-nums">
                  {formatDuration(route.duration)}
                </div>
                {via && (
                  <div className="text-[9px] text-[var(--text-muted)] truncate mt-1">via {via}</div>
                )}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] tabular-nums flex-shrink-0">
                {formatDistance(route.distance)}
              </div>
            </div>

            {/* steps */}
            <ol>
              {route.steps.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => { setActiveStep(i); onLocate?.(s.location[1], s.location[0], 17); }}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2.5 border-l-2 transition-colors ${
                      activeStep === i
                        ? 'border-[var(--gold-primary)] bg-[rgba(var(--gold-rgb),0.07)]'
                        : 'border-transparent hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                  >
                    <span className="mt-px flex-shrink-0"><StepIcon type={s.type} /></span>
                    <span className="flex-1 min-w-0 text-[10px] text-[var(--text-primary)] leading-snug">
                      {s.instruction}
                    </span>
                    {s.distance > 0 && (
                      <span className="text-[9px] text-[var(--text-muted)] tabular-nums flex-shrink-0 mt-px w-12 text-right">
                        {formatDistance(s.distance)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>

            <p className="px-3 py-2 text-[8px] text-[var(--text-muted)] tracking-wider uppercase border-t border-[var(--border-secondary)]">
              Routing via {route.provider} · OpenStreetMap
            </p>
          </>
        )}
      </div>
    </div>
  );
}

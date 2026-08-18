'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X, Volume2, VolumeX, CornerUpRight, CornerUpLeft, ArrowUp, RotateCw,
  Merge, Flag, MapPin, AlertTriangle, Loader2, LocateFixed,
} from 'lucide-react';
import {
  cumulativeDistances, stepPositions, computeProgress, shouldAnnounce, announcementText,
  type NavStep, type NavFix, type NavProgress,
} from '@/lib/navigation';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Live Navigation
   Turn-by-turn guidance driven by the device's own position feed
   ═══════════════════════════════════════════════════════════════ */

export interface NavRoute {
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  steps: NavStep[];
}

interface NavigationViewProps {
  route: NavRoute;
  destinationLabel: string;
  /** Position feed; the parent owns the geolocation watch. */
  fix: NavFix | null;
  onExit: () => void;
  /** Ask the parent to recompute the route from the current position. */
  onReroute: (from: { lat: number; lng: number }) => void;
  /** Snapped position + progress, so the map can follow and draw. */
  onProgress?: (p: NavProgress | null) => void;
  /** Whether the map is currently locked to the driver. */
  following?: boolean;
  /** Re-lock the camera after the operator has looked around. */
  onRecenter?: () => void;
}

function ManeuverIcon({ type, className }: { type: string; className?: string }) {
  const c = className ?? 'w-8 h-8';
  if (type === 'arrive') return <Flag className={`${c} text-[var(--alert-green)]`} />;
  if (type === 'depart') return <MapPin className={`${c} text-[var(--alert-green)]`} />;
  if (type === 'roundabout') return <RotateCw className={`${c} text-white`} />;
  if (type === 'merge') return <Merge className={`${c} text-white`} />;
  if (type.includes('right')) return <CornerUpRight className={`${c} text-white`} />;
  if (type.includes('left')) return <CornerUpLeft className={`${c} text-white`} />;
  return <ArrowUp className={`${c} text-white`} />;
}

/** Guidance distances read better rounded than exact. */
export function navDistance(m: number): string {
  if (m < 20) return 'Now';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function navDuration(s: number): string {
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

export default function NavigationView({
  route, destinationLabel, fix, onExit, onReroute, onProgress, following, onRecenter,
}: NavigationViewProps) {
  const [muted, setMuted] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  // Coarse clock for the arrival time — reading Date.now() during render is
  // impure, and the ETA does not need to tick faster than this anyway.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const spoken = useRef<Record<number, number>>({});
  const offRouteSince = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Derived once per route rather than on every position update. The parent
  // keys this component by route, so a recalculated route remounts it and the
  // spoken/off-route bookkeeping resets without a state write in an effect.
  const geometry = route.geometry.coordinates;
  const cumulative = useMemo(() => cumulativeDistances(geometry), [geometry]);
  const stepAlong = useMemo(
    () => stepPositions(geometry, route.steps, cumulative),
    [geometry, route.steps, cumulative],
  );

  // Progress is derived from the current fix, not stored — deriving it keeps
  // the render a pure function of props and avoids a state write per fix.
  const progress = useMemo<NavProgress | null>(
    () => (fix && geometry.length
      ? computeProgress(geometry, route.steps, stepAlong, route.duration, fix, cumulative)
      : null),
    [fix, geometry, route.steps, stepAlong, route.duration, cumulative],
  );

  const speak = useCallback((text: string) => {
    if (muted || typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  }, [muted]);

  // ── the guidance loop: side effects only ──
  useEffect(() => {
    const p = progress;
    if (!p || !fix) return;

    onProgress?.(p);

    if (p.arrived) {
      if (!spoken.current[-1]) {
        spoken.current[-1] = 1;
        speak('You have arrived at your destination.');
      }
      return;
    }

    // Only reroute once the driver has been off-line for a few seconds — a
    // single noisy fix beside a building should not tear up the route.
    if (p.offRoute) {
      if (offRouteSince.current === null) offRouteSince.current = Date.now();
      else if (Date.now() - offRouteSince.current > 6000 && !rerouting) {
        setRerouting(true);
        speak('Recalculating.');
        onReroute({ lat: fix.lat, lng: fix.lng });
      }
      return;
    }
    offRouteSince.current = null;

    const step = route.steps[p.stepIndex];
    if (!step) return;
    const band = shouldAnnounce(p.stepIndex, p.distanceToStep, spoken.current);
    if (band !== null) {
      spoken.current[p.stepIndex] = band;
      speak(announcementText(step.instruction, band));
    }
  }, [progress, fix, route.steps, speak, onReroute, onProgress, rerouting]);

  // Keep the display awake — a navigation view that sleeps mid-junction is useless.
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } };
    nav.wakeLock?.request('screen').then((s) => {
      if (cancelled) { s.release().catch(() => {}); return; }
      wakeLock.current = s;
    }).catch(() => {});
    return () => {
      cancelled = true;
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, []);

  // Never leave a half-spoken instruction behind on exit.
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const step = progress ? route.steps[progress.stepIndex] : route.steps[0];
  const arrived = progress?.arrived ?? false;

  return (
    <div className="flex flex-col gap-1.5">
      {/* ── maneuver banner ── */}
      <div
        className="glass-panel overflow-hidden !border-[var(--border-active)]"
        style={{ boxShadow: '0 18px 56px rgba(0,0,0,0.75)' }}
      >
        <div className={`px-4 py-3 flex items-center gap-4 ${arrived ? 'bg-[rgba(0,230,118,0.10)]' : 'bg-[rgba(66,133,244,0.10)]'}`}>
          {arrived
            ? <Flag className="w-8 h-8 text-[var(--alert-green)] flex-shrink-0" />
            : <ManeuverIcon type={step?.type ?? 'straight'} />}

          <div className="flex-1 min-w-0">
            {!arrived && progress && (
              <div className="text-[22px] leading-none text-[var(--gold-primary)] tabular-nums mb-1">
                {navDistance(progress.distanceToStep)}
              </div>
            )}
            <div className={`text-[12px] leading-snug ${arrived ? 'text-[var(--alert-green)]' : 'text-[var(--text-primary)]'}`}>
              {arrived ? `You have arrived at ${destinationLabel}` : step?.instruction ?? 'Starting…'}
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            {/* Only offered once the operator has taken the camera off the
                driver — while following, it would be a no-op. */}
            {onRecenter && !following && (
              <button
                onClick={onRecenter}
                title="Recenter on me and resume follow"
                aria-label="Recenter on me and resume follow"
                className="p-1.5 rounded-md text-[#4285F4] bg-[rgba(66,133,244,0.14)] hover:bg-[rgba(66,133,244,0.24)] transition-colors animate-pulse"
              >
                <LocateFixed className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setMuted((m) => !m); window.speechSynthesis?.cancel(); }}
              aria-pressed={muted}
              title={muted ? 'Unmute voice guidance' : 'Mute voice guidance'}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onExit}
              title="End navigation"
              aria-label="End navigation"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--alert-red)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* progress along the route */}
        <div className="h-[3px] bg-[rgba(255,255,255,0.06)]">
          <div
            className="h-full bg-[var(--gold-primary)] transition-[width] duration-700"
            style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }}
          />
        </div>

        {/* ── trip status ── */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          {rerouting ? (
            <span className="flex items-center gap-2 text-[12px] text-[var(--alert-orange)]">
              <Loader2 className="w-3 h-3 animate-spin" /> Recalculating route…
            </span>
          ) : progress?.offRoute ? (
            <span className="flex items-center gap-2 text-[12px] text-[var(--alert-orange)]">
              <AlertTriangle className="w-3 h-3" /> Off route
            </span>
          ) : (
            <span className="text-[12px] text-[var(--text-muted)] truncate">
              to {destinationLabel}
            </span>
          )}

          {progress && !arrived && (
            <span className="flex items-baseline gap-2.5 flex-shrink-0 tabular-nums">
              <span className="text-[13px] text-[var(--text-primary)]">{navDuration(progress.durationRemaining)}</span>
              <span className="text-[12px] text-[var(--text-secondary)]">{navDistance(progress.distanceRemaining)}</span>
              <span className="text-[12px] text-[var(--text-muted)]">
                {new Date(now + progress.durationRemaining * 1000)
                  .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ── the turn after this one ── */}
      {progress && !arrived && route.steps[progress.stepIndex + 1] && (
        <div className="glass-panel px-4 py-2 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] flex-shrink-0">Then</span>
          <ManeuverIcon type={route.steps[progress.stepIndex + 1].type} className="w-4 h-4" />
          <span className="text-[12px] text-[var(--text-secondary)] truncate">
            {route.steps[progress.stepIndex + 1].instruction}
          </span>
        </div>
      )}

      {!fix && (
        <div className="glass-panel px-4 py-2 text-[12px] text-[var(--alert-orange)]">
          Waiting for a position fix… navigation needs HTTPS or localhost.
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { X, Plane, Gauge, ArrowUp, Radio, Crosshair, Loader2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Flight Watch
   Pin several aircraft and follow them side by side
   ═══════════════════════════════════════════════════════════════ */

export interface WatchedFlight {
  icao24: string;
  callsign: string;
  category?: string;
}

/** Live telemetry, refreshed from the flights feed. */
export interface FlightTelemetry {
  lat: number;
  lng: number;
  alt: number;
  speed_knots: number;
  heading: number;
  grounded?: boolean;
  squawk?: string;
}

export interface Airport {
  icao: string;
  iata?: string;
  city?: string;
  lat: number;
  lng: number;
}

export interface AircraftDetail {
  icao24: string;
  registration: string | null;
  typeCode: string | null;
  model: string | null;
  operator: string | null;
  track: [number, number][];
  points: number;
  /** Scheduled endpoints, so the map can pin the airports it flies between. */
  origin?: Airport | null;
  destination?: Airport | null;
}

interface FlightWatchPanelProps {
  watched: WatchedFlight[];
  /** Current telemetry keyed by icao24, from the live feed. */
  telemetry: Record<string, FlightTelemetry>;
  onRemove: (icao24: string) => void;
  onLocate: (lat: number, lng: number) => void;
  /** Resolved identity + flown track, so the map can draw each path. */
  onDetail: (icao24: string, detail: AircraftDetail | null) => void;
}

/** Feet is what aviation actually uses; the feed reports metres. */
export function toFeet(metres: number): number {
  return Math.round((metres * 3.28084) / 25) * 25;
}

export function formatAlt(metres: number | undefined, grounded?: boolean): string {
  if (grounded) return 'Ground';
  if (typeof metres !== 'number' || !Number.isFinite(metres)) return '—';
  return `${toFeet(metres).toLocaleString()} ft`;
}

function Row({ flight, telem, onRemove, onLocate, onDetail }: {
  flight: WatchedFlight;
  telem?: FlightTelemetry;
  onRemove: (icao24: string) => void;
  onLocate: (lat: number, lng: number) => void;
  onDetail: (icao24: string, d: AircraftDetail | null) => void;
}) {
  const [detail, setDetail] = useState<AircraftDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cs = (flight.callsign || '').replace(/\s+/g, '');

    // Airframe and scheduled route come from different places: the trace files
    // know what the aircraft is and where it has been, the route lookup knows
    // which airports it is booked between.
    Promise.all([
      fetch(`/api/aircraft?icao24=${flight.icao24}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      cs
        ? fetch(`/api/flight-route?callsign=${encodeURIComponent(cs)}&icao24=${flight.icao24}`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]).then(([ac, route]) => {
      if (cancelled) return;
      const base = ac && !ac.error ? (ac as AircraftDetail) : null;
      const merged: AircraftDetail | null = base
        ? {
            ...base,
            origin: route?.found ? route.origin : null,
            destination: route?.found ? route.destination : null,
          }
        : null;
      setDetail(merged);
      setLoading(false);
      onDetail(flight.icao24, merged);
    });

    return () => { cancelled = true; };
  }, [flight.icao24, flight.callsign, onDetail]);

  return (
    <div className="glass-panel overflow-hidden" style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}>
      <header className="flex items-center gap-2 px-2.5 h-8 border-b border-[var(--border-secondary)]">
        <Plane className="w-3 h-3 text-[var(--cyan-primary)] flex-shrink-0" />
        <span className="text-[11px] text-[var(--text-primary)] tracking-wide truncate">
          {flight.callsign || flight.icao24.toUpperCase()}
        </span>
        <span className="text-[8px] text-[var(--text-muted)] tabular-nums ml-auto flex-shrink-0">
          {flight.icao24.toUpperCase()}
        </span>
        {telem && (
          <button
            onClick={() => onLocate(telem.lat, telem.lng)}
            title="Centre on this aircraft"
            className="p-0.5 text-[var(--text-muted)] hover:text-[var(--cyan-primary)] transition-colors"
          >
            <Crosshair className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => onRemove(flight.icao24)}
          title="Stop watching"
          aria-label={`Stop watching ${flight.callsign || flight.icao24}`}
          className="p-0.5 text-[var(--text-muted)] hover:text-[var(--alert-red)] transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </header>

      <div className="px-2.5 py-2">
        {loading ? (
          <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
            <Loader2 className="w-3 h-3 animate-spin" /> Identifying airframe…
          </div>
        ) : (
          <>
            <div className="text-[10px] text-[var(--text-primary)] leading-snug">
              {detail?.model || 'Unidentified type'}
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 text-[8px] text-[var(--text-muted)]">
              {detail?.registration && <span className="tabular-nums">{detail.registration}</span>}
              {detail?.typeCode && <span>{detail.typeCode}</span>}
              {detail?.operator && <span className="truncate max-w-[170px]">{detail.operator}</span>}
            </div>
          </>
        )}

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <div className="flex items-center gap-1">
            <ArrowUp className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[9px] text-[var(--text-secondary)] tabular-nums truncate">
              {formatAlt(telem?.alt, telem?.grounded)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Gauge className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[9px] text-[var(--text-secondary)] tabular-nums truncate">
              {telem ? `${Math.round(telem.speed_knots)} kt` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[9px] text-[var(--text-secondary)] tabular-nums truncate">
              {telem?.squawk || '—'}
            </span>
          </div>
        </div>

        {detail?.origin && detail?.destination && (
          <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-[var(--border-secondary)]">
            <span className="text-[10px] text-[var(--text-primary)] tabular-nums">
              {detail.origin.iata || detail.origin.icao}
            </span>
            <span className="text-[9px] text-[var(--text-muted)]">&rarr;</span>
            <span className="text-[10px] text-[var(--text-primary)] tabular-nums">
              {detail.destination.iata || detail.destination.icao}
            </span>
          </div>
        )}

        {detail && detail.points > 0 && (
          <div className="mt-1.5 text-[8px] text-[var(--text-muted)] tabular-nums">
            {detail.points} points this leg
          </div>
        )}
        {!telem && (
          <div className="mt-1.5 text-[8px] text-[var(--alert-orange)]">
            No longer in the live feed
          </div>
        )}
      </div>
    </div>
  );
}

export default function FlightWatchPanel({
  watched, telemetry, onRemove, onLocate, onDetail,
}: FlightWatchPanelProps) {
  if (watched.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {watched.map((f) => (
        <Row
          key={f.icao24}
          flight={f}
          telem={telemetry[f.icao24]}
          onRemove={onRemove}
          onLocate={onLocate}
          onDetail={onDetail}
        />
      ))}
    </div>
  );
}

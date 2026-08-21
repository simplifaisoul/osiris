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
  /** Airports read off the track: where this leg was seen to leave and land. */
  departure?: Airport | null;
  arrival?: Airport | null;
  /** Endpoints the map should pin — observed where possible, schedule where not. */
  origin?: Airport | null;
  destination?: Airport | null;
}

/** Schedule lookup result from /api/flight-route. */
export interface ScheduledRoute {
  found?: boolean;
  origin?: Airport | null;
  destination?: Airport | null;
}

const R_KM = 6371;

export function greatCircleKm(a: [number, number], b: [number, number]): number {
  const t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t;
  const dLng = (b[0] - a[0]) * t;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

const sameAirport = (a: Airport, b: Airport) =>
  a.icao === b.icao || (Boolean(a.iata) && a.iata === b.iata);

/**
 * Is the aircraft actually inside the corridor between these two airports?
 *
 * Flying O→D means the legs either side of you add up to about the whole trip.
 * A wrong-leg schedule fails loudly — one sampled aircraft measured 32× the
 * direct distance out of its supposed corridor.
 */
export function onCorridor(here: [number, number], origin: Airport, destination: Airport): boolean {
  const direct = greatCircleKm([origin.lng, origin.lat], [destination.lng, destination.lat]);
  const detour = greatCircleKm([origin.lng, origin.lat], here)
    + greatCircleKm(here, [destination.lng, destination.lat]);
  // Short hops spend a bigger share of the trip on departure and arrival
  // vectoring, so allow a fixed slice of slack on top of the proportional one.
  return detour <= direct * 1.15 + 150;
}

/**
 * Decide which airports are safe to put on the map.
 *
 * Schedule lookups are keyed by callsign, and across a live sample they named
 * the wrong leg of the aircraft's day about four times in five — origins over
 * a thousand kilometres from where the track began. Drawn, that is a dot in
 * open country with a straight line to nowhere, which is exactly what this
 * used to look like.
 *
 * So the track leads and the schedule corroborates: the departure the aircraft
 * was seen to make is the origin, and the schedule's destination is only
 * accepted when its origin agrees with that departure. With no observed
 * departure to check against — coverage that began mid-ocean — the corridor
 * test stands in. Failing both, nothing is drawn.
 */
export function resolveEndpoints(
  ac: AircraftDetail,
  schedule: ScheduledRoute | null,
): { origin: Airport | null; destination: Airport | null } {
  const observedDep = ac.departure || null;
  const observedArr = ac.arrival || null;
  const sched = schedule?.found ? schedule : null;
  const here = ac.track.length ? ac.track[ac.track.length - 1] : null;

  // Already landed: both ends were watched happening, nothing to corroborate.
  if (observedDep && observedArr) return { origin: observedDep, destination: observedArr };

  let destination: Airport | null = observedArr;
  if (!destination && sched?.origin && sched?.destination && here) {
    const corroborated = observedDep
      ? sameAirport(observedDep, sched.origin)
      : onCorridor(here, sched.origin, sched.destination);
    if (corroborated) destination = sched.destination;
  }

  return { origin: observedDep, destination };
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
        ? { ...base, ...resolveEndpoints(base, route as ScheduledRoute | null) }
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
        <span className="text-[10px] text-[var(--text-primary)] tracking-wide truncate">
          {flight.callsign || flight.icao24.toUpperCase()}
        </span>
        <span className="text-[9px] text-[var(--text-muted)] tabular-nums ml-auto flex-shrink-0">
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
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <Loader2 className="w-3 h-3 animate-spin" /> Identifying airframe…
          </div>
        ) : (
          <>
            <div className="text-[11px] text-[var(--text-primary)] leading-snug">
              {detail?.model || 'Unidentified type'}
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 text-[9px] text-[var(--text-muted)]">
              {detail?.registration && <span className="tabular-nums">{detail.registration}</span>}
              {detail?.typeCode && <span>{detail.typeCode}</span>}
              {detail?.operator && <span className="truncate max-w-[170px]">{detail.operator}</span>}
            </div>
          </>
        )}

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <div className="flex items-center gap-1">
            <ArrowUp className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[10px] text-[var(--text-secondary)] tabular-nums truncate">
              {formatAlt(telem?.alt, telem?.grounded)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Gauge className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[10px] text-[var(--text-secondary)] tabular-nums truncate">
              {telem ? `${Math.round(telem.speed_knots)} kt` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[10px] text-[var(--text-secondary)] tabular-nums truncate">
              {telem?.squawk || '—'}
            </span>
          </div>
        </div>

        {(detail?.origin || detail?.destination) && (
          <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-[var(--border-secondary)]">
            <span className="text-[11px] text-[var(--text-primary)] tabular-nums">
              {detail.origin ? detail.origin.iata || detail.origin.icao : '····'}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">&rarr;</span>
            <span className="text-[11px] text-[var(--text-primary)] tabular-nums">
              {detail.destination ? detail.destination.iata || detail.destination.icao : '····'}
            </span>
            {/* An unconfirmed destination is a schedule claim, not something the
                aircraft was seen to do — say so rather than imply certainty. */}
            <span className="text-[9px] text-[var(--text-muted)] ml-auto">
              {detail.arrival ? 'landed' : detail.destination ? 'scheduled' : 'destination unknown'}
            </span>
          </div>
        )}

        {detail && detail.points > 0 && (
          <div className="mt-1.5 text-[9px] text-[var(--text-muted)] tabular-nums">
            {detail.points} points this leg
          </div>
        )}
        {!telem && (
          <div className="mt-1.5 text-[9px] text-[var(--alert-orange)]">
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

'use client';

import { ExternalLink, Plane, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ViewBelow from '@/components/ViewBelow';
import ModelView from '@/components/ModelView';
import { colorSafe, compass, Field, PictureToggle, type Picture } from '@/components/CardBits';
import { deadReckon, fixFromFeed, readLiveFix, type AircraftState, type LiveFix } from '@/lib/aircraft-live';
import { aircraftModelSpec, buildAircraftModel } from '@/lib/aircraft-models';

/**
 * OSIRIS — selected aircraft readout
 *
 * Clicking an aircraft opens this card in place of the old popup, which was
 * pinned to a position up to several minutes old. The card follows the
 * aircraft live: a fresh fix every ten seconds from /api/aircraft/live, moved
 * on between fixes from its ground speed, track and climb rate. It shows the
 * ground below it, or a 3D model of its type.
 */

/** What the map hands the card about a clicked aircraft. */
export interface AircraftSelection {
  icao24: string;
  callsign: string;
  /** The marker's colour, from its layer. */
  color: string;
  /** The flights feed's record, the first position before a live fix lands. */
  feed: {
    lat: number; lng: number; alt?: number; heading?: number; speed_knots?: number; squawk?: string;
    model?: string; registration?: string; grounded?: boolean; aircraft_category?: string;
  };
  /** When the feed was taken, ms; null if unknown. */
  feedAt: number | null;
}

/** Where the card says the aircraft is, for the map to draw. */
export interface AircraftMapState {
  lng: number;
  lat: number;
  trackDeg: number | null;
  /** Whether this comes from a live fix rather than the feed's snapshot. */
  live: boolean;
}

interface Identity {
  registration: string | null;
  typeCode: string | null;
  model: string | null;
  operator: string | null;
}

interface RouteInfo {
  found?: boolean;
  origin?: { icao: string; iata?: string; city?: string } | null;
  destination?: { icao: string; iata?: string; city?: string } | null;
  progress?: number;
  totalDistanceKm?: number;
  departureTime?: string | number | null;
  arrivalTime?: string | number | null;
}

/** How often a fresh fix is asked for, and how long to wait after the server says it is busy or has none. */
const POLL_MS = 10_000;
const BUSY_MS = 15_000;
const NONE_MS = 30_000;
/** A fix older than this is no longer called live. */
const LIVE_WITHIN_S = 60;

const EMERGENCY: Record<string, string> = { '7500': 'HIJACK', '7600': 'RADIO FAILURE', '7700': 'EMERGENCY' };

function ago(s: number): string {
  if (s < 90) return `${Math.round(s)} S AGO`;
  if (s < 5400) return `${Math.round(s / 60)} MIN AGO`;
  return `${Math.round(s / 3600)} H AGO`;
}

function clock(t: string | number | null | undefined): string {
  if (t === null || t === undefined || t === '') return '—';
  const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' });
}

/**
 * Asks for a fresh fix every ten seconds while the card is open; backs off
 * when the server is busy. `missing` says no source has a position for it.
 */
function useLiveFix(icao24: string, first: LiveFix): { fix: LiveFix; missing: boolean } {
  const [fix, setFix] = useState(first);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      let wait = POLL_MS;
      if (!document.hidden) {
        try {
          const r = await fetch(`/api/aircraft/live?icao24=${encodeURIComponent(icao24)}`);
          if (r.status === 503) wait = BUSY_MS;
          else if (!r.ok) { wait = NONE_MS; if (r.status === 404 && !gone) setMissing(true); }
          else {
            const next = readLiveFix(await r.json());
            if (next && !gone) { setFix(prev => (next.at >= prev.at ? next : prev)); setMissing(false); }
          }
        } catch { wait = BUSY_MS; }
      }
      if (!gone) timer = setTimeout(ask, wait);
    };
    ask();
    return () => { gone = true; clearTimeout(timer); };
  }, [icao24]);
  return { fix, missing };
}

export default function AircraftCard({ ac, onClose, onMap }: {
  ac: AircraftSelection;
  onClose: () => void;
  /** Each second: where the aircraft is, for the map. */
  onMap?: (s: AircraftMapState) => void;
}) {
  const accent = colorSafe(ac.color);
  // A feed position of unknown age is shown where it is, not moved on as if it were fresh.
  const first = useMemo(() => fixFromFeed({ ...ac.feed, icao24: ac.icao24, callsign: ac.callsign }, ac.feedAt ?? 0), [ac]);
  const { fix, missing } = useLiveFix(ac.icao24, first);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s: AircraftState = deadReckon(fix, now);

  // Who it is: registration, type and operator.
  const [identity, setIdentity] = useState<Identity | null | 'none'>(null);
  useEffect(() => {
    let gone = false;
    fetch(`/api/aircraft?icao24=${encodeURIComponent(ac.icao24)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!gone) setIdentity(d && !d.error ? d : 'none'); })
      .catch(() => { if (!gone) setIdentity('none'); });
    return () => { gone = true; };
  }, [ac.icao24]);

  // Where it is booked from and to.
  const [route, setRoute] = useState<RouteInfo | null | 'none'>(null);
  useEffect(() => {
    let gone = false;
    const params = new URLSearchParams({
      callsign: ac.callsign.replace(/\s+/g, ''),
      icao24: ac.icao24,
      lat: String(ac.feed.lat),
      lng: String(ac.feed.lng),
      speed: String(ac.feed.speed_knots ?? 0),
    });
    fetch(`/api/flight-route?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!gone) setRoute(d?.found ? d : 'none'); })
      .catch(() => { if (!gone) setRoute('none'); });
    return () => { gone = true; };
  }, [ac]);

  // Where it is, for the map's marker.
  const onMapRef = useRef(onMap);
  useEffect(() => { onMapRef.current = onMap; });
  useEffect(() => {
    onMapRef.current?.({ lng: s.lng, lat: s.lat, trackDeg: s.trackDeg, live: fix.source !== 'feed' });
  }, [s, fix.source]);

  const typeCode = fix.typeCode ?? (identity && identity !== 'none' ? identity.typeCode : null)
    ?? (ac.feed.model && /^[A-Z0-9]{2,4}$/.test(ac.feed.model) ? ac.feed.model : null);
  const spec = aircraftModelSpec(typeCode, { helicopter: /heli|rotor/i.test(ac.feed.aircraft_category ?? '') });
  const [picture, setPicture] = useState<Picture>('view');
  const toggle = <PictureToggle picture={picture} onChange={setPicture} accent={accent} />;

  const live = fix.source !== 'feed' && s.ageS <= LIVE_WITHIN_S;
  const reg = fix.registration ?? (identity && identity !== 'none' ? identity.registration : null) ?? (ac.feed.registration && ac.feed.registration !== 'N/A' ? ac.feed.registration : null);
  const title = ac.callsign || reg || ac.icao24.toUpperCase();
  const model = identity && identity !== 'none' ? [identity.model, identity.operator].filter(Boolean).join(' · ') : null;
  const squawk = fix.squawk;
  const emergency = squawk ? EMERGENCY[squawk] : undefined;
  const altKm = Math.max(0.3, ((s.altFt ?? 0) * 0.3048) / 1000);
  const vr = s.vertRateFpm;

  return (
    <div
      className="pointer-events-auto absolute left-2 right-2 top-16 z-[350] max-h-[calc(100vh-104px)] overflow-y-auto overflow-x-hidden rounded-lg border bg-[var(--bg-panel)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:left-[72px] md:right-auto md:top-[88px] md:w-[272px]"
      style={{ borderColor: `${accent}33` }}
      role="dialog"
      aria-label={`Aircraft ${title}`}
    >
      <div className="h-px w-full" style={{ background: `${accent}99` }} />

      <div className="flex items-start gap-2 px-2.5 pt-2.5">
        <Plane className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" style={{ color: accent, transform: `rotate(${(s.trackDeg ?? 0) - 45}deg)` }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold leading-tight tracking-wide text-[var(--text-heading)]" title={title}>{title}</div>
          <div className="truncate text-[9px] font-mono tracking-[0.12em] text-[var(--text-secondary)]" title={model ?? undefined}>
            {identity === null ? 'IDENTIFYING AIRFRAME…' : model || 'Airframe not in registry'}
          </div>
        </div>
        {live ? (
          <span className="mt-[1px] flex flex-shrink-0 items-center gap-1 text-[8px] font-mono tracking-[0.15em]" style={{ color: accent }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
            LIVE
          </span>
        ) : (
          <span className="mt-[1px] flex-shrink-0 text-[8px] font-mono tracking-[0.12em] text-[var(--text-muted)]">
            {fix.source !== 'feed' ? `SEEN ${ago(s.ageS)}` : missing ? 'NO LIVE POSITION' : 'LOCATING…'}
          </span>
        )}
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
          aria-label="Clear aircraft selection"
          title="Clear selection (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2">
        {picture === 'view' ? (
          <ViewBelow lat={s.lat} lng={s.lng} altKm={altKm} headingDeg={s.onGround ? null : s.trackDeg} accent={accent} corner={toggle} />
        ) : (
          <ModelView
            buildKey={`${spec.family}:${spec.label}`}
            build={THREE => buildAircraftModel(THREE, spec)}
            label={spec.label}
            sizeText={() => (spec.trueSize ? `${Math.round(spec.lengthM)} M LONG · ${Math.round(spec.spanM)} M ${spec.family === 'helicopter' ? 'ROTOR' : 'SPAN'}` : null)}
            note="Illustrative model of this aircraft type, not a photograph · drag to turn"
            corner={toggle}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-[var(--border-secondary)] px-2.5 py-2.5">
        <Field
          label="ALTITUDE"
          value={s.onGround ? 'On ground' : s.altFt === null ? '—' : `${Math.round(s.altFt).toLocaleString()} ft`}
          sub={!s.onGround && s.altFt !== null ? `${Math.round(s.altFt * 0.3048).toLocaleString()} m` : undefined}
          color="var(--cyan-primary)"
        />
        <Field
          label="SPEED"
          value={s.gsKt === null ? '—' : `${Math.round(s.gsKt)} kt`}
          sub={s.gsKt === null ? undefined : `${Math.round(s.gsKt * 1.852).toLocaleString()} km/h`}
          color="var(--cyan-primary)"
        />
        <Field label="HEADING" value={s.trackDeg === null ? '—' : `${Math.round(s.trackDeg)}° ${compass(s.trackDeg)}`} />
        <Field
          label="VERTICAL"
          value={vr === null ? '—' : Math.abs(vr) < 100 ? 'Level' : `${vr > 0 ? '↑' : '↓'} ${Math.abs(Math.round(vr)).toLocaleString()} ft/min`}
        />
        <Field label="LATITUDE" value={`${s.lat.toFixed(3)}°`} />
        <Field label="LONGITUDE" value={`${s.lng.toFixed(3)}°`} />
        <Field label="TYPE" value={typeCode ?? '—'} color={accent} />
        <Field label="REGISTRATION" value={reg ?? '—'} />
        <Field label="SQUAWK" value={squawk ? (emergency ? `${squawk} ${emergency}` : squawk) : '—'} color={emergency ? '#FF3B30' : undefined} />
        <Field label="ICAO24" value={ac.icao24.toUpperCase()} />
      </div>

      {route && route !== 'none' && route.origin && route.destination && (
        <div className="border-t border-[var(--border-secondary)] px-2.5 py-2 font-mono">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[8px] tracking-[0.15em] text-[var(--text-muted)]">FROM</div>
              <div className="truncate text-[12px] font-bold text-[var(--text-heading)]">{route.origin.iata || route.origin.icao} <span className="text-[9px] font-normal text-[var(--text-secondary)]">{route.origin.city}</span></div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[8px] tracking-[0.15em] text-[var(--text-muted)]">TO</div>
              <div className="truncate text-[12px] font-bold text-[var(--text-heading)]">{route.destination.iata || route.destination.icao} <span className="text-[9px] font-normal text-[var(--text-secondary)]">{route.destination.city}</span></div>
            </div>
          </div>
          <div className="my-1.5 h-[2px] rounded bg-white/10">
            <div className="h-full rounded" style={{ width: `${Math.round((route.progress ?? 0) * 100)}%`, background: accent }} />
          </div>
          <div className="flex justify-between text-[9px] text-[var(--text-secondary)]">
            <span>DEP {clock(route.departureTime)}</span>
            <span>{Math.round((route.progress ?? 0) * 100)}%{route.totalDistanceKm ? ` · ${route.totalDistanceKm.toLocaleString()} km` : ''}</span>
            <span>ARR {clock(route.arrivalTime)}</span>
          </div>
        </div>
      )}

      <button
        onClick={() => (window as unknown as { osirisWatchFlight?: (f: { icao24: string; callsign: string }) => void }).osirisWatchFlight?.({ icao24: ac.icao24, callsign: ac.callsign })}
        className="block w-full border-t px-2.5 py-2 text-[9px] font-mono font-bold tracking-[0.15em] transition-colors hover:brightness-125"
        style={{ borderColor: 'var(--border-secondary)', color: accent, background: `${accent}0f` }}
      >
        + WATCH THIS AIRCRAFT
      </button>
      <div className="flex border-t border-[var(--border-secondary)] text-[8px] font-mono tracking-[0.14em]">
        {[
          ['FLIGHTAWARE', `https://www.flightaware.com/live/flight/${encodeURIComponent(ac.callsign)}`],
          ['ADS-B', `https://globe.adsbexchange.com/?icao=${encodeURIComponent(ac.icao24)}`],
          ['RADARBOX', `https://www.radarbox.com/data/flights/${encodeURIComponent(ac.callsign)}`],
        ].map(([text, href]) => (
          <a key={text} href={href} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 py-2 text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-white">
            {text} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ))}
      </div>
    </div>
  );
}

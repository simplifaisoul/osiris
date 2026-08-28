'use client';

import { ExternalLink, Orbit, Satellite, X } from 'lucide-react';

/**
 * OSIRIS — selected satellite readout
 *
 * Satellites are the one layer drawn off the surface, and that broke the popup
 * they used to get. A MapLibre popup can only be anchored to a ground
 * coordinate, so a bird at 35,786 km got a card pinned to the patch of ocean
 * underneath it — pointing at empty sea while the marker and its orbit sat well
 * away, up the globe. Every other layer's popup lands on its own marker; this
 * one could not.
 *
 * So the readout stops pretending to be attached. What ties it to the object is
 * already on the globe and already correct: the selection ring the shader draws
 * around the picked satellite, and the orbit track in the satellite's own
 * colour. The card carries the numbers, in a fixed place that does not move
 * while the satellite does — and the satellite does move, every poll.
 */

export interface SatelliteDetail {
  name: string;
  lat: number;
  lng: number;
  /** Kilometres above the ellipsoid — the real figure, not the drawn one. */
  alt: number;
  color?: string;
  mission?: string;
  category?: string;
  noradId?: string;
  /** From the orbit reply; null until it lands or if the TLE gave no period. */
  periodMinutes?: number | null;
  /** Whether the orbit track on the globe is on its way, drawn, or unavailable. */
  track: 'loading' | 'ready' | 'unavailable';
}

/** Earth's mean radius — only used to turn a period into a speed. */
const EARTH_RADIUS_KM = 6371;

/**
 * The orbital shell, by the usual boundaries. GEO is a narrow band rather than
 * "anything high": a Molniya apogee is not a geostationary satellite, and
 * labelling it one would be worse than saying nothing.
 */
function regime(altKm: number): { label: string; note: string } {
  if (altKm < 2000) return { label: 'LEO', note: 'Low Earth orbit' };
  if (altKm < 35000) return { label: 'MEO', note: 'Medium Earth orbit' };
  if (altKm <= 36500) return { label: 'GEO', note: 'Geostationary belt' };
  return { label: 'HEO', note: 'High / highly elliptical' };
}

/** Circular-orbit speed implied by the period; the point of it is scale, not precision. */
function speedKmS(altKm: number, periodMinutes: number): number {
  return (2 * Math.PI * (EARTH_RADIUS_KM + altKm)) / (periodMinutes * 60);
}

function period(minutes: number): string {
  if (minutes < 100) return `${minutes.toFixed(1)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Only a literal hex colour reaches an inline style. */
function colorSafe(value: string | undefined): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value ?? '')) ? String(value) : 'var(--cyan-primary)';
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-mono tracking-[0.15em] text-[var(--text-muted)]">{label}</div>
      <div
        className="truncate text-[11px] font-mono tabular-nums text-[var(--text-primary)]"
        style={color ? { color } : undefined}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

export default function SatelliteCard({ sat, onClose }: { sat: SatelliteDetail; onClose: () => void }) {
  const accent = colorSafe(sat.color);
  const shell = regime(sat.alt);

  return (
    <div
      className="pointer-events-auto absolute left-2 right-2 top-16 z-[350] overflow-hidden rounded-lg border bg-[var(--bg-panel)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:left-[72px] md:right-auto md:top-[88px] md:w-[248px]"
      style={{ borderColor: `${accent}33` }}
      role="dialog"
      aria-label={`Satellite ${sat.name}`}
    >
      {/* A rule in the satellite's own colour, matching its marker and its track. */}
      <div className="h-px w-full" style={{ background: `${accent}99` }} />

      <div className="flex items-start gap-2 px-2.5 pt-2.5">
        <Satellite className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" style={{ color: accent }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold leading-tight tracking-wide text-[var(--text-heading)]" title={sat.name}>
            {sat.name}
          </div>
          <div className="truncate text-[9px] font-mono tracking-[0.12em] text-[var(--text-secondary)]">
            {sat.mission || 'Unknown mission'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
          aria-label="Clear satellite selection"
          title="Clear selection (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 px-2.5 py-2.5">
        <Field label="ALTITUDE" value={`${Math.round(sat.alt).toLocaleString()} km`} color="var(--cyan-primary)" />
        <Field label="ORBIT" value={shell.label} color={accent} />
        <Field
          label="PERIOD"
          value={sat.periodMinutes ? period(sat.periodMinutes) : '—'}
        />
        <Field
          label="SPEED"
          value={sat.periodMinutes ? `${speedKmS(sat.alt, sat.periodMinutes).toFixed(2)} km/s` : '—'}
        />
        <Field label="LATITUDE" value={`${sat.lat.toFixed(3)}°`} />
        <Field label="LONGITUDE" value={`${sat.lng.toFixed(3)}°`} />
        <Field label="NORAD ID" value={sat.noradId || '—'} />
        <Field label="CLASS" value={shell.note} />
      </div>

      {/* What the globe is showing, so a missing track reads as a known state
          rather than as the selection having silently failed. */}
      <div className="flex items-center gap-1.5 border-t border-[var(--border-secondary)] px-2.5 py-1.5 text-[8px] font-mono tracking-[0.12em] text-[var(--text-muted)]">
        <Orbit className="h-2.5 w-2.5" />
        {sat.track === 'loading' && <span>PLOTTING ORBIT…</span>}
        {sat.track === 'ready' && <span style={{ color: accent }}>ORBIT TRACK ON GLOBE</span>}
        {sat.track === 'unavailable' && <span>NO TRACK — TLE UNAVAILABLE</span>}
      </div>

      {sat.noradId && (
        <a
          href={`https://www.n2yo.com/satellite/?s=${encodeURIComponent(sat.noradId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 border-t px-2.5 py-2 text-[9px] font-mono tracking-[0.15em] transition-colors"
          style={{ borderColor: 'var(--border-secondary)', color: accent, background: `${accent}0a` }}
        >
          TRACK ON N2YO <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}

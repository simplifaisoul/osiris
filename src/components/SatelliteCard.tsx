'use client';

import { Box, ExternalLink, Satellite, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SatState } from '@/lib/orbit';
import { orbitUrl, readEphemeris, stateAt, type Ephemeris } from '@/lib/satellite-live';
import SatelliteView from '@/components/SatelliteView';
import SatelliteModel from '@/components/SatelliteModel';

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
 * around the picked satellite. The card carries the numbers, in a fixed place
 * that does not move while the satellite does.
 *
 * Once the orbit reply lands, the card follows the satellite live: position,
 * speed and heading every second, the marker moved with it, and a picture of
 * the ground below, or a 3D model of the satellite at the press of a toggle.
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
  /** Where it will be over the next minutes, from the orbit reply; what the card follows live. */
  live?: Ephemeris | null;
}

/** How long one set of samples is used before asking for the next, ms. They run for twenty minutes. */
const REFRESH_MS = 10 * 60_000;

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

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

/**
 * Once a second, the satellite's state between the orbit route's samples.
 * Before the samples run out the route is asked again.
 */
function useLiveSatellite(
  noradId: string | undefined,
  first: Ephemeris | null | undefined,
  onLive?: (state: SatState) => void,
): SatState | null {
  const [live, setLive] = useState<SatState | null>(null);
  const callbacks = useRef({ onLive });
  useEffect(() => { callbacks.current = { onLive }; });

  useEffect(() => {
    if (!noradId || !first) return;
    let samples = first;
    let nextAsk = samples.from + REFRESH_MS;
    let gone = false;
    const tick = () => {
      const now = Date.now();
      const state = stateAt(samples, now);
      setLive(state);
      if (state) callbacks.current.onLive?.(state);
      if (now < nextAsk) return;
      // A failed ask is tried again in a minute, not every second.
      nextAsk = now + 60_000;
      fetch(orbitUrl(noradId, now))
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          const next = readEphemeris(d?.live);
          if (gone || !next) return;
          samples = next;
          nextAsk = next.from + REFRESH_MS;
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { gone = true; clearInterval(timer); };
  }, [noradId, first]);

  return live;
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

function Field({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
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
      {sub && <div className="truncate text-[9px] font-mono tabular-nums text-[var(--text-secondary)]">{sub}</div>}
    </div>
  );
}

export default function SatelliteCard({ sat, onClose, onLive }: {
  sat: SatelliteDetail;
  onClose: () => void;
  /** Each second's live state, to move the marker with it. */
  onLive?: (state: SatState) => void;
}) {
  const accent = colorSafe(sat.color);
  const live = useLiveSatellite(sat.noradId, sat.live, onLive);
  const lat = live?.lat ?? sat.lat;
  const lng = live?.lng ?? sat.lng;
  const alt = live?.altKm ?? sat.alt;
  const shell = regime(alt);
  // The picture: the ground below the satellite, or the satellite itself.
  const [picture, setPicture] = useState<'view' | 'model'>('view');
  const pictureToggle = (
    <div className="flex overflow-hidden rounded bg-black/60 text-[8px] font-mono tracking-[0.14em]" role="group" aria-label="Picture">
      {([['view', 'VIEW'], ['model', '3D MODEL']] as const).map(([key, text]) => (
        <button
          key={key}
          onClick={() => setPicture(key)}
          aria-pressed={picture === key}
          className={`flex items-center gap-1 px-1.5 py-1 transition-colors ${picture === key ? 'bg-white/15' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
          style={picture === key ? { color: accent } : undefined}
        >
          {key === 'model' && <Box className="h-2.5 w-2.5" />}
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="pointer-events-auto absolute left-2 right-2 top-16 z-[350] overflow-hidden rounded-lg border bg-[var(--bg-panel)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:left-[72px] md:right-auto md:top-[88px] md:w-[272px]"
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
        {live && (
          <span className="mt-[1px] flex flex-shrink-0 items-center gap-1 text-[8px] font-mono tracking-[0.15em]" style={{ color: accent }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
            LIVE
          </span>
        )}
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
          aria-label="Clear satellite selection"
          title="Clear selection (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {picture === 'view' ? (
        <SatelliteView lat={lat} lng={lng} altKm={alt} headingDeg={live?.headingDeg ?? null} accent={accent} corner={pictureToggle} />
      ) : (
        <SatelliteModel
          name={sat.name}
          mission={sat.mission}
          category={sat.category}
          altKm={alt}
          noradId={sat.noradId}
          corner={pictureToggle}
        />
      )}

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-[var(--border-secondary)] px-2.5 py-2.5">
        <Field label="ALTITUDE" value={`${Math.round(alt).toLocaleString()} km`} color="var(--cyan-primary)" />
        <Field
          label="SPEED"
          value={live ? `${live.speedKmS.toFixed(2)} km/s` : '—'}
          sub={live ? `${Math.round(live.speedKmS * 3600).toLocaleString()} km/h` : undefined}
          color="var(--cyan-primary)"
        />
        <Field
          label="HEADING"
          value={live ? (live.headingDeg === null ? 'Holds station' : `${Math.round(live.headingDeg)}° ${compass(live.headingDeg)}`) : '—'}
        />
        <Field
          label="PERIOD"
          value={sat.periodMinutes ? period(sat.periodMinutes) : '—'}
        />
        <Field label="LATITUDE" value={`${lat.toFixed(3)}°`} />
        <Field label="LONGITUDE" value={`${lng.toFixed(3)}°`} />
        <Field label="ORBIT" value={shell.label} color={accent} />
        <Field label="NORAD ID" value={sat.noradId || '—'} />
        <div className="col-span-2">
          <Field label="CLASS" value={shell.note} />
        </div>
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

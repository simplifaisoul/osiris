'use client';
/**
 * OSIRIS — places, as Search and Directions both list them.
 *
 * One row for a place wherever it appears: a kind icon in a tile, the name
 * with what was typed picked out, where it is, how far it is from where the
 * map is looking, and what kind of place it is. Gold marks the row the
 * keyboard or pointer is on; nothing else is coloured, so a list reads at a
 * glance.
 */
import { createElement, type ReactNode } from 'react';
import {
  Building2, Clock, Globe2, Home, Landmark, LocateFixed, MapPin, Mountain, Signpost, type LucideIcon,
} from 'lucide-react';
import { haversine } from '@/lib/geo';

export interface PlaceLike {
  label: string;
  context?: string;
  lat: number;
  lng: number;
  kind?: string;
}

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  poi: { icon: Building2, label: 'Place' },
  address: { icon: Home, label: 'Address' },
  street: { icon: Signpost, label: 'Street' },
  city: { icon: Landmark, label: 'City' },
  region: { icon: Mountain, label: 'Region' },
  country: { icon: Globe2, label: 'Country' },
  coordinate: { icon: MapPin, label: 'Coordinates' },
  current: { icon: LocateFixed, label: 'You' },
  recent: { icon: Clock, label: 'Recent' },
};

export const kindIcon = (kind?: string): LucideIcon => KIND[kind ?? '']?.icon ?? MapPin;
export const kindLabel = (kind?: string): string => KIND[kind ?? '']?.label ?? 'Place';

/** How far a place is from a point, rounded the way a person says it. */
export function distanceText(from: { lat: number; lng: number } | null | undefined, to: { lat: number; lng: number }): string {
  if (!from) return '';
  const m = haversine([from.lng, from.lat], [to.lng, to.lat]) * 1000;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 100_000) return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
  return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
}

/** A name with the first match of what was typed in gold. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-[var(--gold-light)]">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  );
}

/** The kind icon in its tile: gold when the row is the one in hand. */
export function KindTile({ kind, on = false, size = 32, icon }: { kind?: string; on?: boolean; size?: number; icon?: LucideIcon }) {
  return (
    <span className="rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors"
      style={{
        width: size, height: size,
        borderColor: on ? 'rgba(var(--gold-rgb),0.45)' : 'rgba(255,255,255,0.07)',
        background: on ? 'rgba(var(--gold-rgb),0.12)' : 'rgba(255,255,255,0.03)',
      }}>
      {createElement(icon ?? kindIcon(kind), { style: { width: size * 0.47, height: size * 0.47, color: on ? 'var(--gold-light)' : 'var(--text-secondary)' } })}
    </span>
  );
}

/**
 * A place in a list. `onPick` is the row; `trailing` sits beside it (an
 * action such as Directions), outside the row's own button.
 */
export function PlaceRow({ place, query = '', on, onPick, onHover, from, trailing, kindOverride, id }: {
  place: PlaceLike;
  query?: string;
  on: boolean;
  onPick: () => void;
  onHover?: () => void;
  /** Where the map is looking, for the distance. */
  from?: { lat: number; lng: number } | null;
  trailing?: ReactNode;
  /** Show this kind's icon and word instead of the place's own (e.g. recent). */
  kindOverride?: string;
  id?: string;
}) {
  const kind = kindOverride ?? place.kind;
  const far = place.kind === 'current' ? '' : distanceText(from, place);
  return (
    <div id={id} role="option" aria-selected={on} onMouseEnter={onHover}
      className={`group relative flex items-center rounded-lg transition-colors ${on ? 'bg-[rgba(var(--gold-rgb),0.08)]' : 'hover:bg-white/[0.035]'}`}>
      {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[var(--gold-primary)]" />}
      <button type="button" onClick={onPick} tabIndex={-1}
        className="flex-1 min-w-0 flex items-center gap-3 pl-3 pr-2 py-2 text-left">
        <KindTile kind={kind} on={on} />
        <span className="flex-1 min-w-0">
          <span className={`block text-[13px] leading-snug truncate ${place.kind === 'coordinate' ? 'font-mono tabular-nums' : ''} text-[var(--text-heading)]`}>
            <Highlight text={place.label} query={query} />
          </span>
          {place.context && <span className="block mt-0.5 text-[11px] leading-snug truncate text-[var(--text-muted)]">{place.context}</span>}
        </span>
        <span className="flex flex-col items-end gap-0.5 flex-shrink-0 pl-1">
          {far && <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)]" title="From the centre of the map">{far}</span>}
          <span className="text-[9px] font-mono tracking-[0.12em] uppercase text-[var(--text-muted)]">{kindLabel(kind)}</span>
        </span>
      </button>
      {trailing && <span className="pr-2 flex-shrink-0">{trailing}</span>}
    </div>
  );
}

/** A keyboard key, for hints. */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-[var(--border-primary)] bg-white/[0.03] text-[9.5px] font-mono text-[var(--text-secondary)] leading-none">{children}</kbd>;
}

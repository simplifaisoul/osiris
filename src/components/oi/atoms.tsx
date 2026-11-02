'use client';
/**
 * OSIRIS OI: the small parts every view is built from, in the platform's
 * own idiom (HUD labels, the 3D/2D-style segmented control, layer toggles).
 */
import { createElement, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, BookOpen, Building2, CalendarClock, CandlestickChart, ChartLine, Crown, Database, Factory, FileText, GitBranch, Globe2, Landmark, Link2,
  MapPin, MessageCircle, Newspaper, Orbit, Quote, Scale, ScrollText, Signpost, Swords, TrendingUp, Users, Zap, type LucideIcon, type LucideProps,
} from 'lucide-react';
import { pointView } from '@/lib/oi/forecast';
import { mentions } from '@/lib/oi/objects';
import type { RunState } from '@/lib/oi/state';
import type { Frame, LinkKind, Move, WorldPoint } from '@/lib/oi/types';
import { LABEL, T, alt, blue, gold, initials, tint } from './theme';

/** OI's mark: a gold core, its ring, and a body in orbit that turns while OI is at work; the body is blue when it is Assist speaking. */
export function OiMark({ size = 16, live = false, assist = false }: { size?: number; live?: boolean; assist?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0">
      <circle cx="12" cy="12" r="8.5" style={{ stroke: T.gold }} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" style={{ fill: T.gold }} />
      <g style={{ transformOrigin: '12px 12px', animation: live ? 'spin 3.2s linear infinite' : undefined }}>
        <circle cx="12" cy="3.5" r="2.1" style={{ fill: assist ? T.blue : T.alt }} />
      </g>
    </svg>
  );
}

export function IconButton({ children, title, onClick, active, disabled }: { children: ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--hover-accent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] disabled:opacity-30 disabled:pointer-events-none ${active ? 'text-[var(--gold-light)] bg-[var(--hover-accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}>
      {children}
    </button>
  );
}

export function TextButton({ children, onClick, title, tone, active, disabled }: { children: ReactNode; onClick: () => void; title?: string; tone?: 'danger'; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[9.5px] font-mono tracking-[0.14em] uppercase whitespace-nowrap transition-colors hover:bg-[var(--hover-accent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] disabled:opacity-30 disabled:pointer-events-none ${tone === 'danger' ? 'text-[var(--text-secondary)] hover:text-[var(--alert-red)]' : active ? 'text-[var(--gold-light)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}>
      {children}
    </button>
  );
}

/** The platform's toggle switch. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`layer-toggle ${on ? 'active' : ''}`} />;
}

/** Choices in a row with a sliding highlight, the same control as the map's 3D / 2D switch. */
export function Segmented<V extends string>({ id, options, value, onChange, size = 'md', accent = 'gold' }: {
  id: string; options: { value: V; label: string; icon?: ReactNode; title?: string; disabled?: boolean }[]; value: V; onChange: (v: V) => void; size?: 'sm' | 'md';
  /** Gold for Forecast and the platform, blue for Assist. */
  accent?: 'gold' | 'blue';
}) {
  const tint = accent === 'blue' ? blue : gold;
  return (
    <div role="tablist" className="flex items-center gap-[2px] p-[3px] rounded-lg border border-[var(--border-secondary)] bg-black/50">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)} title={o.title} disabled={o.disabled}
            className={`relative flex-1 flex items-center justify-center gap-1.5 disabled:opacity-35 disabled:pointer-events-none ${size === 'sm' ? 'h-[26px] px-2 text-[9.5px]' : 'h-8 px-3 text-[10px]'} rounded-md font-mono font-medium tracking-[0.14em] uppercase whitespace-nowrap transition-colors duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] ${on ? '' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}
            style={on ? { color: accent === 'blue' ? T.blue : T.goldLight } : undefined}>
            {on && (
              <motion.span layoutId={`oi-seg-${id}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-md border"
                style={{ borderColor: tint(0.32), background: tint(0.1), boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }} />
            )}
            {o.icon && <span className="relative z-10">{o.icon}</span>}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Overline({ children, color }: { children: ReactNode; color?: string }) {
  return <span className={LABEL} style={{ color: color ?? T.label }}>{children}</span>;
}

export function SectionTitle({ children, count, right }: { children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={LABEL} style={{ color: T.label }}>{children}</span>
      {count !== undefined && <span className="text-[10px] font-mono tabular-nums text-[var(--gold-primary)]">{count}</span>}
      <span className="flex-1 h-px bg-[var(--border-secondary)]" />
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 px-4 text-center text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{children}</p>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center h-4 px-1 rounded border border-[var(--border-primary)] text-[9px] font-mono text-[var(--text-secondary)] leading-none">{children}</kbd>;
}

export function Avatar({ name, size = 28, ring }: { name: string; size?: number; ring?: 'selected' | 'thinking' }) {
  return (
    <span className="rounded-full flex items-center justify-center font-mono font-medium flex-shrink-0 border"
      style={{
        width: size, height: size, fontSize: size * 0.34, color: ring === 'selected' ? T.goldLight : T.body, background: 'var(--oi-raised)',
        borderColor: ring === 'selected' ? T.gold : ring === 'thinking' ? T.alt : 'var(--border-primary)',
        boxShadow: ring === 'selected' ? `0 0 0 3px ${gold(0.14)}` : ring === 'thinking' ? `0 0 0 3px ${alt(0.14)}` : undefined,
      }}>
      {initials(name)}
    </span>
  );
}

/** Where a world stands in figures; how it resolved once it has. */
export function PointTag({ point, frame }: { point: WorldPoint; frame: Frame | null }) {
  return (
    <span title={point.resolved ? 'Resolved in this world' : 'Where the question stands in this world'}
      className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[10.5px] font-mono tabular-nums whitespace-nowrap text-[var(--text-heading)]"
      style={{ borderColor: point.resolved ? gold(0.45) : 'var(--border-secondary)', background: point.resolved ? gold(0.08) : 'rgba(255,255,255,0.025)' }}>
      {point.resolved && <span className="text-[9px] tracking-[0.12em] text-[var(--gold-light)]">RESOLVED</span>}
      {pointView(point, frame)}
    </span>
  );
}

/** How an actor's move stands toward the actors it is aimed at: one gold scale, from working with them to working against them. */
export const STANCE: Record<Move['stance'], { word: string; color: string }> = {
  cooperate: { word: 'Cooperates', color: T.gold },
  pressure: { word: 'Presses', color: T.alt },
  oppose: { word: 'Opposes', color: T.heading },
  hold: { word: 'Holds', color: T.label },
};

export function StanceTag({ stance }: { stance: Move['stance'] }) {
  const st = STANCE[stance];
  return (
    <span className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded border text-[9px] font-mono tracking-[0.1em] uppercase whitespace-nowrap"
      style={{ color: st.color, borderColor: tint(st.color, 30), background: tint(st.color, 6) }}>
      {st.word}
    </span>
  );
}

/* ───────────── Object types ───────────── */

const ACTOR_ICON: Record<string, LucideIcon> = {
  state: Landmark, leader: Crown, organisation: Building2, company: Factory, market: TrendingUp, group: Users, place: MapPin,
};
const SOURCE_ICON: Record<string, LucideIcon> = {
  news: Newspaper, social: MessageCircle, quake: Activity, market: CandlestickChart, series: ChartLine, odds: Scale, data: Database, web: Globe2, wiki: BookOpen,
};
export const LINK_ICON: Record<LinkKind, LucideIcon> = { relation: Link2, evidence: FileText, move: Swords, cite: Quote };

/** The icon for an object, from its research key's prefix and its subtype. */
export function iconFor(key: string, subtype = ''): LucideIcon {
  const prefix = key.split(':')[0];
  if (prefix === 'a') return ACTOR_ICON[subtype] ?? Landmark;
  if (prefix === 'c') return SOURCE_ICON[subtype] ?? Newspaper;
  if (prefix === 'e') return subtype === 'shock' || subtype === 'injected' ? Zap : CalendarClock;
  if (prefix === 'w') return Orbit;
  if (prefix === 's') return GitBranch;
  if (prefix === 'p') return Signpost;
  if (prefix === 'r') return ScrollText;
  return Link2;
}

/** An object's icon, by its research key and subtype, or a link's by its kind. */
export function TypeIcon({ k, subtype, link, ...rest }: LucideProps & { k: string; subtype?: string; link?: LinkKind }) {
  return createElement(link ? LINK_ICON[link] : iconFor(k, subtype), rest);
}

/** The accent an object wears: gold for the world model and the report, champagne for the simulation. */
export function accentFor(key: string): string {
  const prefix = key.split(':')[0];
  if (prefix === 'r') return T.goldLight;
  if (prefix === 'w' || prefix === 'e' || prefix === 'p') return T.alt;
  if (prefix === 'c') return T.body;
  return T.gold;
}

/**
 * Text with the run's actors and sources in it made clickable: the same
 * sentence an actor said, but "China" opens China.
 */
export function Mentions({ text, s, onSelect }: { text: string; s: RunState; onSelect: (key: string) => void }) {
  const parts = mentions(text, s);
  return (
    <>
      {parts.map((p, i) => typeof p === 'string' ? <span key={i}>{p}</span> : (
        <button key={i} onClick={e => { e.stopPropagation(); onSelect(p.key); }}
          className="text-[var(--text-primary)] underline decoration-dotted decoration-[var(--gold-dim)] underline-offset-2 hover:text-[var(--gold-light)] hover:decoration-[var(--gold-primary)] transition-colors">
          {p.text}
        </button>
      ))}
    </>
  );
}

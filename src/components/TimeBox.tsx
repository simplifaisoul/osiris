'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Power, SlidersHorizontal, type LucideIcon } from 'lucide-react';

/**
 * OSIRIS — the small boxes that hold a weather layer's time and controls
 * (WindBar, RainBar). They stack in one dock at the bottom left, above the
 * 3D/2D and MAP/SAT strip and in line with it. Each folds to a chip that
 * still shows the time its layer is drawn at, and its power button turns the
 * layer itself off.
 */

/** Bottom left, above the view strip; the first box sits lowest. Over the
 *  CCTV previews (z 40), under the layer rail (z 50), so its flyouts open over the boxes. */
export const DOCK = 'absolute z-[45] left-3 bottom-[124px] md:left-[120px] md:bottom-[160px] flex flex-col-reverse items-start gap-2 pointer-events-none font-mono';

export const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const pad = (n: number) => String(n).padStart(2, '0');
export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const zulu = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;

const PANEL = 'pointer-events-auto rounded-xl border border-[var(--border-primary)] bg-black/75 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)]';

export function BoxShell({ icon: Icon, title, source, open, playing, tuning, tuneLabel, chip, tune, onOpen, onFold, onTune, onOff, children }: {
  icon: LucideIcon;
  /** The layer's name, as the layer panel shows it. */
  title: string;
  source: string;
  open: boolean;
  playing: boolean;
  tuning: boolean;
  tuneLabel: string;
  /** What the folded chip shows after the name: the time, mostly. */
  chip: React.ReactNode;
  tune: React.ReactNode;
  onOpen: () => void;
  onFold: () => void;
  onTune: () => void;
  onOff?: () => void;
  children: React.ReactNode;
}) {
  const name = title.toLowerCase();

  useEffect(() => {
    if (!open) return;
    const other = (e: Event) => { if ((e as CustomEvent<string>).detail !== title && narrow()) onFold(); };
    window.addEventListener(OPENED, other);
    return () => window.removeEventListener(OPENED, other);
  }, [open, title, onFold]);

  if (!open) {
    return (
      <motion.button
        type="button" onClick={() => { onOpen(); window.dispatchEvent(new CustomEvent(OPENED, { detail: title })); }}
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
        title={`Show the ${name} controls`} aria-label={`Show the ${name} controls`} aria-expanded={false}
        className={`${PANEL} rounded-lg flex items-center gap-2 h-8 pl-2.5 pr-1.5 hover:border-[var(--gold-primary)]/40 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)]`}
      >
        <Icon className={`w-3.5 h-3.5 text-[var(--gold-primary)] ${playing ? 'animate-pulse' : ''}`} strokeWidth={1.7} />
        <span className="text-[9px] tracking-[0.22em] text-white/55">{title.toUpperCase()}</span>
        {chip}
        <ChevronUp className="w-3.5 h-3.5 text-white/40" strokeWidth={1.6} />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
      className={`${PANEL} w-[min(288px,calc(100vw-24px))]`}
      role="group" aria-label={`${title} time and controls`}
    >
      <div className="flex items-center gap-1.5 h-8 pl-2.5 pr-1 border-b border-white/[0.06]">
        <Icon className="w-3.5 h-3.5 text-[var(--gold-primary)]" strokeWidth={1.7} />
        <span className="text-[9.5px] tracking-[0.22em] text-[var(--gold-light)]">{title.toUpperCase()}</span>
        <span className="text-[8.5px] tracking-[0.16em] text-white/30">{source}</span>
        <div className="ml-auto flex items-center">
          <IconButton label={tuneLabel} onClick={onTune} active={tuning} pressed={tuning}>
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.6} />
          </IconButton>
          <IconButton label={`Hide the ${name} controls`} onClick={onFold}>
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.6} />
          </IconButton>
          {onOff && (
            <IconButton label={`Turn the ${title} layer off`} onClick={onOff}>
              <Power className="w-3.5 h-3.5" strokeWidth={1.6} />
            </IconButton>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {tuning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="px-3 py-2.5 flex flex-col gap-2">{tune}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 pt-2 pb-1">{children}</div>
    </motion.div>
  );
}

/** The time in large type, and under it UTC, how far it is from now, and whether it's still loading. */
export function TimeReadout({ at, rel, note, tone, waiting, live }: {
  at: Date; rel: string; note?: string; tone: string; waiting: boolean;
  /** Following the newest data as it lands: a beating dot says so. */
  live?: boolean;
}) {
  return (
    <div className="min-h-[34px]" aria-live="off">
      <div className="text-[13px] leading-tight font-semibold tracking-wider text-[var(--gold-light)] tabular-nums">
        {DAYS[at.getDay()]} {at.getDate()} {MONTHS[at.getMonth()]} {clock(at)}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap text-[9px] tracking-[0.14em] tabular-nums">
        <span className="text-white/35">{zulu(at)}</span>
        <span className={`flex items-center gap-1 ${tone}`}>
          {live && <span aria-hidden="true" className="w-[5px] h-[5px] rounded-full bg-[var(--gold-light)] animate-pulse self-center" />}
          {rel}{note && ` · ${note}`}
        </span>
        {waiting && <span className="text-white/35 animate-pulse">LOADING</span>}
      </div>
    </div>
  );
}

/** What the layer says at the middle of the map, at the slider's time. */
export function AtCentre({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 h-4 whitespace-nowrap text-[9px] tracking-[0.14em] tabular-nums overflow-hidden" title={title}>
      <span className="text-white/30">MAP CENTRE</span>
      {children}
    </div>
  );
}

/** A box opened on a phone folds the others: there's room for one. */
const OPENED = 'osiris:timebox-open';
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * The track: solid up to now and dashed gold after it, gold between the
 * slider and now, a dot per frame (lit once loaded), ticks with labels under
 * them, and a range input over the lot.
 */
export function TimeTrack({ first, last, now, at, step, times, loaded, ticks, labels, ariaLabel, valueText, onSeek, onSpace }: {
  first: number; last: number; now: number; at: number; step: number;
  times: number[]; loaded: ReadonlySet<number>;
  ticks: number[]; labels: { at: number; label: string }[];
  ariaLabel: string; valueText: string;
  onSeek: (t: number) => void; onSpace: () => void;
}) {
  const pct = (t: number) => (last > first ? ((t - first) / (last - first)) * 100 : 0);
  return (
    <div className="relative h-[34px] mx-1 mt-0.5">
      <div className="absolute inset-x-0 top-[11px] h-[3px] rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct(Math.min(now, last))}%` }} />
        {now < last && (
          <div className="absolute inset-y-0 right-0"
            style={{ left: `${pct(Math.max(now, first))}%`, background: 'repeating-linear-gradient(90deg, rgba(var(--gold-rgb),0.45) 0 5px, transparent 5px 8px)' }} />
        )}
        <div className="absolute inset-y-0 bg-[var(--gold-primary)]/60"
          style={{ left: `${Math.min(pct(at), pct(Math.min(now, last)))}%`, width: `${Math.abs(pct(at) - pct(Math.min(now, last)))}%` }} />
      </div>
      {times.map(t => (
        <span key={t} aria-hidden="true"
          className={`absolute top-[5px] w-[2px] h-[2px] -ml-px rounded-full ${loaded.has(t) ? 'bg-white/60' : 'bg-white/12'}`}
          style={{ left: `${pct(t)}%` }} />
      ))}
      {ticks.map(t => (
        <span key={t} aria-hidden="true" className="absolute top-[8px] h-[9px] w-px bg-white/25" style={{ left: `${pct(t)}%` }} />
      ))}
      {labels.map(l => (
        <span key={l.at} aria-hidden="true"
          className="absolute top-[19px] -translate-x-1/2 text-[8px] tracking-[0.1em] text-white/40 whitespace-nowrap"
          style={{ left: `${pct(l.at)}%` }}>{l.label}</span>
      ))}
      {now >= first && now <= last && (
        <span aria-hidden="true" className="absolute top-[4px] h-[17px] w-px bg-[var(--gold-light)]/80" style={{ left: `${pct(now)}%` }} />
      )}
      <input
        type="range" min={first} max={last} step={step} value={at}
        onChange={e => onSeek(Number(e.target.value))}
        onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); onSpace(); } }}
        aria-label={ariaLabel} aria-valuetext={valueText}
        className="peer absolute inset-x-0 top-0 h-[26px] w-full opacity-0 cursor-pointer"
      />
      <span aria-hidden="true"
        className="pointer-events-none absolute top-[6px] -ml-[6px] w-[12px] h-[12px] rounded-full bg-[var(--gold-primary)] border-2 border-black/60 shadow-[0_0_10px_rgba(var(--gold-rgb),0.55)] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--gold-light)]"
        style={{ left: `${pct(at)}%` }} />
    </div>
  );
}

/** A small text button in the transport row: NOW, LIVE, the play rate. */
export function TextButton({ title, onClick, children }: { title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="px-1.5 h-6 rounded-md text-[9px] tracking-[0.16em] text-white/50 hover:text-[var(--gold-light)] hover:bg-[var(--hover-accent)] transition-colors tabular-nums">
      {children}
    </button>
  );
}

export function IconButton({ label, onClick, disabled, active, pressed, children }: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean; pressed?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={`flex w-6 h-6 shrink-0 rounded-md items-center justify-center transition-colors disabled:opacity-25 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)] ${active ? 'text-[var(--gold-light)] bg-[var(--gold-primary)]/15' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-accent)]'}`}>
      {children}
    </button>
  );
}

export function Tune({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="flex items-baseline justify-between text-[8.5px] tracking-[0.18em] text-white/40">
        {label}
        <span className="text-[9px] tracking-wider text-[var(--gold-light)]/80 tabular-nums">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full bg-white/10 cursor-pointer" />
    </label>
  );
}

/** A row of choices, one picked: units, on and off. */
export function Choice<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-[3px] p-[2px] rounded-md border border-white/10" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-1.5 py-0.5 rounded text-[9px] tracking-wider transition-colors ${value === o.value ? 'bg-[var(--gold-primary)]/15 text-[var(--gold-light)]' : 'text-white/40 hover:text-white/70'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A colour scale: a swatch per step, and the value it starts at under it. */
export function Legend({ title, steps }: { title: string; steps: { color: string; value: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[8.5px] tracking-[0.18em] text-white/40">{title}</span>
      <div className="flex">
        {steps.map(s => (
          <div key={s.value + s.name} className="flex flex-col items-start gap-0.5 flex-1 min-w-0" title={s.name}>
            <span className="h-[5px] w-full" style={{ background: s.color }} />
            <span className="text-[8.5px] tabular-nums text-white/45">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** RESET, at the end of a tune panel's last row. */
export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="ml-auto text-[9px] tracking-[0.18em] text-white/35 hover:text-[var(--gold-light)] transition-colors">
      RESET
    </button>
  );
}

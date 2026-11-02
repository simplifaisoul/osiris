'use client';
/**
 * OSIRIS OI: Forecast or Assist.
 *
 * The two ways to use OI as one compact switch, each in its own colour so it
 * is never in doubt which is showing: Forecast in gold, Assist in blue. Each
 * says in its tooltip what it does, and shows when it is at work: a forecast
 * running, or OI in the middle of a reply.
 */
import { motion } from 'framer-motion';
import { MessageSquare, Orbit } from 'lucide-react';
import { T, blue, gold } from './theme';

export type OiMode = 'forecast' | 'assist';

const MODES: { value: OiMode; label: string; blurb: string }[] = [
  { value: 'forecast', label: 'Forecast', blurb: 'The actors play your question out in parallel worlds' },
  { value: 'assist', label: 'Assist', blurb: 'Talk to OI and it works the map for you' },
];

/** The colour a mode wears everywhere it shows: gold for Forecast, blue for Assist. */
export const modeAccent = (m: OiMode) => (m === 'assist' ? T.blue : T.gold);
export const modeTint = (m: OiMode) => (m === 'assist' ? blue : gold);

export function ModeSwitch({ id, mode, onMode, forecastLive = false, assistBusy = false }: {
  id: string;
  mode: OiMode;
  onMode: (m: OiMode) => void;
  /** A forecast is running. */
  forecastLive?: boolean;
  /** OI is in the middle of a reply. */
  assistBusy?: boolean;
}) {
  return (
    <div role="tablist" aria-label="How to use OI" className="grid grid-cols-2 gap-[2px] p-[3px] rounded-lg border border-[var(--border-secondary)] bg-black/50">
      {MODES.map(m => {
        const on = mode === m.value;
        const working = m.value === 'forecast' ? forecastLive : assistBusy;
        const Icon = m.value === 'forecast' ? Orbit : MessageSquare;
        const accent = modeAccent(m.value), tint = modeTint(m.value);
        return (
          <button key={m.value} role="tab" aria-selected={on} onClick={() => onMode(m.value)} title={m.blurb}
            className={`relative h-8 flex items-center justify-center gap-2 rounded-md font-mono text-[10px] font-medium tracking-[0.16em] uppercase transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] ${on ? '' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}
            style={on ? { color: accent } : undefined}>
            {on && (
              <motion.span layoutId={`oi-mode-${id}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-md border" style={{ borderColor: tint(0.35), background: tint(0.1), boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }} />
            )}
            <Icon className="relative w-3.5 h-3.5" />
            <span className="relative">{m.label}</span>
            {working && (
              <span className="relative w-1.5 h-1.5 rounded-full animate-osiris-pulse" title={m.value === 'forecast' ? 'A forecast is running' : 'OI is replying'}
                style={{ background: accent, boxShadow: `0 0 6px ${tint(0.8)}` }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

'use client';
/**
 * OSIRIS OI: the execution trace.
 *
 * The run as the engine ran it: each step with its state, how long it took
 * (live, for the one under way), the engine's own words for it and what it
 * produced. Steps not reached yet are listed, so the whole plan shows from
 * the first event.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Minus, X } from 'lucide-react';
import { formatDuration, traceOf, type TraceStep } from '@/lib/oi/trace';
import type { RunState } from '@/lib/oi/state';
import { LABEL, T, gold } from './theme';
import { SectionTitle } from './atoms';

function StepIcon({ status }: { status: TraceStep['status'] }) {
  const box = 'w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 border relative z-10';
  if (status === 'done') return <span className={box} style={{ borderColor: T.gold, background: gold(0.14), color: T.gold }}><Check className="w-2.5 h-2.5" strokeWidth={3} /></span>;
  if (status === 'active') return <span className={box} style={{ borderColor: T.goldLight, background: 'var(--oi-solid)', color: T.goldLight, boxShadow: `0 0 0 3px ${gold(0.12)}` }}><Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={3} /></span>;
  if (status === 'failed') return <span className={box} style={{ borderColor: T.red, background: 'rgba(255,61,61,0.12)', color: T.red }}><X className="w-2.5 h-2.5" strokeWidth={3} /></span>;
  if (status === 'skipped') return <span className={box} style={{ borderColor: 'var(--border-primary)', color: T.mute }}><Minus className="w-2.5 h-2.5" /></span>;
  return <span className={box} style={{ borderColor: 'var(--border-primary)', background: 'var(--oi-solid)' }} />;
}

export function TraceView({ s }: { s: RunState }) {
  const steps = useMemo(() => traceOf(s), [s]);
  // The step under way shows its time ticking.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (s.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.status]);

  const total = s.startedAt ? (s.endedAt || (s.status === 'running' ? now : s.updatedAt)) - s.startedAt : 0;
  const tokens = s.usage.input + s.usage.output;

  return (
    <section aria-label="Execution trace">
      <SectionTitle right={<span className="text-[10px] font-mono tabular-nums tracking-[0.04em] text-[var(--text-secondary)]">{formatDuration(total)}</span>}>Execution</SectionTitle>
      <ol className="relative flex flex-col">
        {steps.map((st, i) => {
          const running = st.status === 'active';
          const duration = st.start !== null ? (st.end ?? now) - st.start : null;
          const quiet = st.status === 'pending' || st.status === 'skipped';
          return (
            <li key={st.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[8.5px] top-[18px] bottom-0 w-px" style={{ background: st.status === 'done' ? gold(0.45) : 'var(--border-secondary)' }} />}
              <StepIcon status={st.status} />
              <div className="flex-1 min-w-0 -mt-px">
                <div className="flex items-baseline gap-2">
                  <span className={`flex-1 text-[12px] font-semibold truncate ${quiet ? 'text-[var(--text-muted)]' : running ? 'text-[var(--gold-light)]' : 'text-[var(--text-heading)]'}`}>{st.title}</span>
                  <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${running ? 'text-[var(--gold-light)]' : 'text-[var(--text-muted)]'}`}>
                    {duration !== null ? formatDuration(duration) : st.status === 'skipped' ? 'not reached' : 'pending'}
                  </span>
                </div>
                {st.detail && !quiet && <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)] truncate">{st.detail}</p>}
                {st.metrics.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px]">
                    {st.metrics.map(m => (
                      <span key={m.label} className="whitespace-nowrap">
                        <span className="text-[var(--text-muted)]">{m.label}</span> <span className="font-mono tabular-nums text-[var(--text-heading)]">{m.value}</span>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 grid grid-cols-3 rounded-lg border border-[var(--border-secondary)] divide-x divide-[var(--border-secondary)]">
        {[['Model calls', String(s.usage.calls)], ['Tokens', tokens ? tokens.toLocaleString() : '—'], ['Engine', s.provider || '—']].map(([k, v]) => (
          <div key={k} className="px-3 py-2 min-w-0">
            <div className={LABEL} style={{ color: T.label }}>{k}</div>
            <div className="mt-0.5 text-[12px] font-mono tabular-nums truncate text-[var(--text-heading)]" title={k === 'Engine' ? `${s.provider} / ${s.model}` : undefined}>{v}</div>
          </div>
        ))}
      </div>
      {s.warnings.length > 0 && (
        <details className="mt-3 group rounded-md border border-[var(--border-secondary)] px-3 py-2">
          <summary className={`cursor-pointer list-none flex items-center gap-2 ${LABEL} text-[var(--text-secondary)] hover:text-[var(--text-heading)]`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${T.goldLight}` }} />
            {s.warnings.length} hiccup{s.warnings.length === 1 ? '' : 's'} along the way
            <span className="ml-auto normal-case tracking-normal text-[10px] text-[var(--text-muted)] group-open:hidden">Show</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {s.warnings.slice(-6).map((w, i) => <li key={i} className="text-[10.5px] leading-snug text-[var(--text-secondary)] truncate" title={w}>{w}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

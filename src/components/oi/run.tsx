'use client';
/**
 * OSIRIS OI: a run at a glance: where it is, its controls, and the
 * prediction so far with how it got there and where each world stands.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Camera, Check, Crosshair, Square, Zap } from 'lucide-react';
import type { OiClient } from '@/lib/oi/client';
import { currentAnswer, latestPoints, type RunState } from '@/lib/oi/state';
import { formatAmount, leader, positionIn } from '@/lib/oi/forecast';
import { formatDuration } from '@/lib/oi/trace';
import { ANCHOR, KIND_LABEL, LABEL, T, fit, gold, ivory, pct, smooth } from './theme';
import { OiMark, Overline, PointTag, TextButton } from './atoms';

const PHASES: { id: RunState['phase']; label: string }[] = [
  { id: 'context', label: 'Research' },
  { id: 'graph', label: 'World' },
  { id: 'agents', label: 'Cast' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'report', label: 'Report' },
];

/** A number that eases to its new value instead of jumping: up from zero the first time, then from wherever it is. */
function useTween(target: number | null, ms = 900): number | null {
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (target === null || !Number.isFinite(target)) return;
    const start = from.current ?? 0;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = start + (target - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target === null ? null : shown ?? 0;
}

/**
 * The run's five stages as one connected line. The dots sit evenly from edge
 * to edge; the end labels align to the edges so they stay inside the panel.
 */
export function PhaseRail({ s }: { s: RunState }) {
  const n = PHASES.length;
  const at = s.status === 'done' ? n : PHASES.findIndex(p => p.id === s.phase);
  const along = (i: number) => `calc((100% - 7px) * ${i / (n - 1)})`;
  return (
    <div className="relative w-full h-[30px]" aria-label={`Stage ${Math.min(at + 1, n)} of ${n}`}>
      <span className="absolute top-[3px] left-[3px] right-[3px] h-px bg-[var(--border-primary)]" />
      <span className="absolute top-[3px] left-[3px] h-px transition-[width] duration-700"
        style={{ width: `calc((100% - 6px) * ${Math.min(at, n - 1) / (n - 1)})`, background: T.gold, boxShadow: `0 0 8px ${gold(0.6)}` }} />
      {PHASES.map((p, i) => {
        const done = i < at;
        const now = i === at && s.status === 'running';
        const failed = i === at && s.status === 'failed';
        return (
          <span key={p.id}>
            <span className="absolute top-0 w-[7px] h-[7px] rounded-full" style={{ left: along(i), background: failed ? T.red : done || now ? T.gold : 'var(--oi-solid)', boxShadow: `0 0 0 1px ${failed ? T.red : done || now ? T.gold : 'var(--border-primary)'}` }}>
              {now && <span className="absolute inset-[-4px] rounded-full animate-ping" style={{ background: gold(0.35) }} />}
            </span>
            <span className="absolute top-[15px] text-[9px] font-mono tracking-[0.1em] uppercase whitespace-nowrap"
              style={{ ...(i === 0 ? { left: 0 } : i === n - 1 ? { right: 0 } : { left: `calc(3.5px + ${along(i)})`, transform: 'translateX(-50%)' }), color: failed ? T.red : now ? T.goldLight : done ? T.body : T.mute }}>
              {p.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function StatusLine({ s }: { s: RunState }) {
  if (s.status === 'running') {
    const thinking = Object.keys(s.thinking).length;
    return (
      <p role="status" className="flex items-center gap-2 text-[11.5px] min-w-0 text-[var(--text-secondary)]">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-osiris-pulse" style={{ background: T.gold, boxShadow: `0 0 6px ${gold(0.8)}` }} />
        <span className="truncate min-w-0">{s.phaseLabel || 'Starting'}</span>
        {thinking > 0 && <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.06em] text-[var(--oi-alt)]" title="Actors deciding their move, across the worlds">· {thinking} deciding</span>}
      </p>
    );
  }
  if (s.status === 'failed') return <p role="status" className="text-[11.5px] text-[var(--alert-red)] truncate">{s.message || 'The run failed.'}</p>;
  if (s.status === 'cancelled') return <p role="status" className="text-[11.5px] text-[var(--text-secondary)]">Stopped.</p>;
  const took = s.startedAt && s.endedAt ? formatDuration(s.endedAt - s.startedAt) : '';
  return (
    <p role="status" className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
      <Check className="w-3.5 h-3.5 text-[var(--gold-primary)]" /> Prediction complete
      {took && <span className="font-mono text-[10px] text-[var(--text-muted)]">· {took}, {s.usage.calls} model calls</span>}
    </p>
  );
}

/** A small pill button: a run's toggles and actions. On, it is gold. */
export function Chip({ children, onClick, title, on = false, danger = false, disabled = false }: { children: ReactNode; onClick?: () => void; title: string; on?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-pressed={onClick && !danger ? on : undefined} disabled={disabled || !onClick}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[9.5px] font-mono tracking-[0.12em] uppercase whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] disabled:cursor-default ${
        on ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/10 text-[var(--gold-light)]'
          : danger ? 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[rgba(255,61,61,0.4)] hover:text-[var(--alert-red)] hover:bg-[rgba(255,61,61,0.06)]'
            : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-primary)] hover:text-[var(--text-heading)] hover:bg-[var(--hover-accent)]'}`}>
      {children}
    </button>
  );
}

export function Controls({ s, oi, focus, onFocus, following, onFollow }: { s: RunState; oi: OiClient; focus?: boolean; onFocus?: () => void; following?: boolean; onFollow?: () => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {following !== undefined && onFollow && (
        <Chip on={following} onClick={following ? undefined : onFollow} title={following ? 'The camera follows the run. Move the map to take over.' : 'Let the camera follow the run again'}>
          <Camera className="w-3 h-3" /> {following ? 'Following' : 'Follow'}
        </Chip>
      )}
      {onFocus && (
        <Chip on={focus} onClick={onFocus} title={focus ? 'Bring the other map layers back' : 'Hide the other map layers so the analysis stands out'}>
          <Crosshair className="w-3 h-3" /> Focus
        </Chip>
      )}
      {s.status === 'running' && oi.canSteer && <Chip danger onClick={() => oi.cancel()} title="Stop the run"><Square className="w-2.5 h-2.5" /> Stop</Chip>}
    </div>
  );
}

export function RunHead({ s, oi, focus, onFocus, following, onFollow }: { s: RunState; oi: OiClient; focus?: boolean; onFocus?: () => void; following?: boolean; onFollow?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        {s.frame && <span className={`block mb-1.5 ${LABEL}`} style={{ color: T.gold }}>{KIND_LABEL[s.frame.kind]}</span>}
        <h3 className="text-[14.5px] font-semibold leading-snug text-[var(--text-heading)]">{s.question}</h3>
        {s.frame && s.frame.proposition !== s.question && (
          <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">{s.frame.kind === 'binary' ? 'Resolves YES if ' : 'Framed as '}</span>{s.frame.proposition}
            {s.frame.horizon && <span className="text-[var(--text-muted)]"> · by {s.frame.horizon}</span>}
          </p>
        )}
      </div>
      {/* The stages matter while it runs (and where it stopped); once done, a line says so. */}
      {s.status !== 'done' && <PhaseRail s={s} />}
      <div className="flex flex-col gap-2.5">
        <StatusLine s={s} />
        <Controls s={s} oi={oi} focus={focus} onFocus={onFocus} following={following} onFollow={onFollow} />
      </div>
    </div>
  );
}

/* ───────────── The verdict ───────────── */

export function Verdict({ s, large = false }: { s: RunState; large?: boolean }) {
  const frame = s.frame;
  const last = s.rounds[s.rounds.length - 1] ?? null;
  const final = Boolean(s.report);
  const caption = final ? 'Prediction' : last ? `So far · ${s.worlds.length} worlds, period ${last.round} of ${s.periodsPlanned}` : s.status === 'running' ? 'The prediction' : 'Prediction';

  let value: number | null = null;
  let format = (v: number) => `${Math.round(v * 100)}`;
  let suffix = '%';
  let sub = '';
  let detail: ReactNode = null;

  if (frame?.kind === 'choice') {
    const shares = s.report?.shares ?? last?.shares ?? null;
    const lead = shares ? leader(shares) : -1;
    if (shares) { value = shares[lead]; sub = frame.outcomes[lead] ?? ''; }
    detail = (
      <div className="flex flex-col gap-2.5">
        {frame.outcomes.map((o, i) => {
          const v = shares?.[i] ?? null;
          const top = i === lead;
          return (
            <div key={o}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="flex-1 text-[12px] truncate" style={{ color: top ? T.heading : T.body, fontWeight: top ? 600 : 400 }}>{o}</span>
                <span className="text-[11.5px] font-mono tabular-nums" style={{ color: top ? T.goldLight : T.body }}>{pct(v)}</span>
              </div>
              <div className="relative h-1 rounded-full overflow-hidden bg-white/[0.06]">
                <motion.div className="absolute inset-y-0 left-0 rounded-full" initial={false} animate={{ width: `${(v ?? 0) * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
                  style={{ background: top ? `linear-gradient(90deg, ${gold(0.55)}, ${T.gold})` : ivory(0.22) }} />
                {frame.prior[i] !== undefined && <span className="absolute top-0 bottom-0 w-px" style={{ left: `${frame.prior[i] * 100}%`, background: ivory(0.55) }} title={`Prior ${pct(frame.prior[i])}`} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (frame?.kind === 'number') {
    const e = s.report?.estimate ?? (last?.value ? { value: last.value.median, low: last.value.low, high: last.value.high } : null);
    if (e) { value = e.value; format = formatAmount; suffix = ''; sub = frame.unit; }
    if (e) {
      const lo = Math.min(e.low, frame.anchor ?? e.low, last?.value?.min ?? e.low);
      const hi = Math.max(e.high, frame.anchor ?? e.high, last?.value?.max ?? e.high);
      const at = (v: number) => positionIn(v, lo, hi) * 100;
      detail = (
        <div>
          <div className="relative h-5">
            <span className="absolute top-[9px] inset-x-0 h-[2px] rounded-full bg-white/[0.07]" />
            <motion.span className="absolute top-[7px] h-[6px] rounded-sm" initial={false} animate={{ left: `${at(e.low)}%`, width: `${at(e.high) - at(e.low)}%` }} transition={{ duration: 0.7 }}
              style={{ background: gold(0.22), boxShadow: `inset 0 0 0 1px ${gold(0.45)}` }} />
            <motion.span className="absolute top-[3px] w-[2px] h-[14px] -ml-px rounded-full" initial={false} animate={{ left: `${at(e.value)}%` }} transition={{ duration: 0.7 }}
              style={{ background: T.goldLight, boxShadow: `0 0 10px ${gold(0.8)}` }} />
            {frame.anchor !== null && (
              <span className="absolute top-[4px] w-px h-[12px]" style={{ left: `${at(frame.anchor)}%`, background: ivory(0.7) }} title={`Today: ${formatAmount(frame.anchor)}`} />
            )}
          </div>
          <div className="flex justify-between text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
            <span>{formatAmount(e.low)}</span>
            <span className="tracking-[0.12em]">80% RANGE</span>
            <span>{formatAmount(e.high)}</span>
          </div>
          {frame.anchor !== null && <p className="mt-1.5 text-[10px] font-mono tracking-[0.1em] text-[var(--text-muted)]">TODAY <span className="text-[var(--text-heading)]">{formatAmount(frame.anchor)}</span></p>}
        </div>
      );
    }
  } else if (frame) {
    const p = s.report?.probability ?? last?.consensus ?? null;
    if (p !== null) { value = p; sub = 'chance of YES'; }
    // The prediction market on this same question, where there is one: the crowd's money beside the base rate.
    const market = s.context.find(c => c.id === frame.market && c.odds)?.odds;
    detail = (
      <div>
        <div className="relative h-5">
          <span className="absolute top-[9px] inset-x-0 h-[2px] rounded-full bg-white/[0.07]" />
          {last && <motion.span className="absolute top-[7px] h-[6px] rounded-sm" initial={false} animate={{ left: `${last.min * 100}%`, width: `${Math.max(1, (last.max - last.min) * 100)}%` }} transition={{ duration: 0.7 }}
            style={{ background: gold(0.2), boxShadow: `inset 0 0 0 1px ${gold(0.4)}` }} title="The range across the worlds" />}
          <span className="absolute top-[4px] w-px h-[12px]" style={{ left: `${frame.baseRate * 100}%`, background: ivory(0.7) }} title={`Base rate ${pct(frame.baseRate)}`} />
          {market && <span className="absolute w-[6px] h-[6px] -ml-[3px] rotate-45" style={{ left: `${market.probability * 100}%`, top: 7, background: ANCHOR.market }} title={`${market.platform} ${pct(market.probability)}`} />}
          {p !== null && <motion.span className="absolute top-[2px] w-[2px] h-4 -ml-px rounded-full" initial={false} animate={{ left: `${p * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ background: T.goldLight, boxShadow: `0 0 10px ${gold(0.8)}` }} />}
        </div>
        <div className="flex justify-between text-[10px] font-mono tracking-[0.1em] text-[var(--text-muted)]">
          <span>NO</span>
          <span>{s.quant ? 'BASELINE' : 'BASE RATE'} <span className="text-[var(--text-heading)]">{pct(frame.baseRate)}</span>{market && <> · {market.platform.toUpperCase()} <span style={{ color: ANCHOR.market }}>{pct(market.probability)}</span></>}</span>
          <span>YES</span>
        </div>
      </div>
    );
  }

  const shown = useTween(value);
  // The prediction market on this same question: the crowd's number beside OI's.
  const crowd = frame ? s.context.find(c => c.id === frame.market && c.odds)?.odds : undefined;
  const standing = latestPoints(s);
  return (
    <section className="flex flex-col gap-4" aria-label="Prediction">
      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <Overline>{caption}</Overline>
          {shown === null && s.status === 'running' ? (
            // No figure yet: say when one comes, rather than show an empty number.
            <div className="mt-2">
              <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--text-heading)]">
                <span className="w-2 h-2 rounded-full animate-osiris-pulse" style={{ background: T.gold, boxShadow: `0 0 8px ${gold(0.8)}` }} /> Forming
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-secondary)]">The figure appears after the first period of simulated time, then firms up as the worlds play on.</p>
            </div>
          ) : (
            <div className={`mt-1.5 flex items-baseline gap-1 font-mono font-light tabular-nums tracking-[-0.03em] ${large ? 'text-[52px] leading-[0.92]' : 'text-[46px] leading-none'}`}
              style={{ color: T.heading, textShadow: `0 0 26px ${gold(0.22)}` }}>
              {shown === null ? <span className="text-[var(--text-muted)]">—</span> : <>{format(shown)}<span className={`${large ? 'text-[22px]' : 'text-[20px]'} text-[var(--gold-primary)]`}>{suffix}</span></>}
            </div>
          )}
          {sub && <p className="mt-1.5 text-[12.5px] font-medium truncate text-[var(--gold-light)]">{sub}</p>}
          {crowd && s.report && frame?.kind === 'binary' && (
            <p className="mt-1 text-[10px] font-mono tracking-[0.06em] uppercase text-[var(--text-muted)]" title={`${crowd.platform} prices the same question at ${pct(crowd.probability)}`}>
              vs {crowd.platform} <span style={{ color: ANCHOR.market }}>{pct(crowd.probability)}</span>{' '}
              <span style={{ color: Math.abs(s.report.probability - crowd.probability) < 0.02 ? T.body : T.goldLight }}>
                {Math.abs(s.report.probability - crowd.probability) < 0.02 ? 'in line' : `${s.report.probability > crowd.probability ? '+' : '−'}${Math.round(Math.abs(s.report.probability - crowd.probability) * 100)} pts`}
              </span>
            </p>
          )}
        </div>
        <Trajectory s={s} width={large ? 140 : 128} />
      </div>
      {detail}
      {standing.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5" aria-label="Where each world stands">
          <span className={LABEL} style={{ color: T.label }}>Worlds</span>
          {s.worlds.map(w => {
            const p = standing.get(w);
            return p
              ? <span key={w} className="inline-flex items-center gap-1.5"><span className="text-[10px] font-mono text-[var(--text-secondary)]">{w}</span><PointTag point={p} frame={frame} /></span>
              : <span key={w} className="text-[10px] font-mono text-[var(--text-muted)]">{w} —</span>;
          })}
        </div>
      )}
    </section>
  );
}

function Trajectory({ s, width = 128 }: { s: RunState; width?: number }) {
  const W = width, H = 48;
  const frame = s.frame;
  const gid = `oi-tr-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Nothing to draw until a period is pooled: give the space to the words beside it.
  if (!frame || !s.rounds.length) return null;
  const n = s.rounds.length + (s.report ? 1 : 0);
  const x = (i: number) => (n === 1 ? W / 2 : 4 + (i / (n - 1)) * (W - 8));

  if (frame.kind === 'choice') {
    const series = frame.outcomes.map((_, k) => [...s.rounds.map(r => r.shares?.[k] ?? 0), ...(s.report?.shares ? [s.report.shares[k]] : [])]);
    const top = Math.max(0.1, ...series.flat()) * 1.1;
    const y = (v: number) => H - 4 - (v / top) * (H - 8);
    const lead = leader(series.map(v => v[v.length - 1]));
    return (
      <svg width={W} height={H} className="flex-shrink-0 overflow-visible" aria-hidden>
        {/* The leader in gold, drawn last so it sits on top; the rest in faint ivory. */}
        {series.map((vals, k) => k === lead ? null : (
          <path key={k} d={smooth(vals.map((v, i) => [x(i), y(v)]))} fill="none" strokeWidth={1.1} strokeLinecap="round" style={{ stroke: ivory(0.28) }} />
        ))}
        {series[lead] && <path d={smooth(series[lead].map((v, i) => [x(i), y(v)]))} fill="none" strokeWidth={1.8} strokeLinecap="round" style={{ stroke: T.gold }} />}
      </svg>
    );
  }

  let vals: number[];
  let y: (v: number) => number;
  let ref: number | null = null;
  if (frame.kind === 'number') {
    const pts = s.rounds.map(r => r.value?.median ?? NaN);
    vals = [...pts, ...(s.report?.estimate ? [s.report.estimate.value] : [])].filter(Number.isFinite);
    const all = [...vals, ...s.rounds.flatMap(r => (r.value ? [r.value.p25, r.value.p75] : [])), ...(frame.anchor !== null ? [frame.anchor] : [])];
    const lo = Math.min(...all), hi = Math.max(...all);
    y = v => (hi > lo ? H - 4 - ((v - lo) / (hi - lo)) * (H - 8) : H / 2);
    ref = frame.anchor;
  } else {
    vals = [...s.rounds.map(r => r.consensus), ...(s.report ? [s.report.probability] : [])];
    const [lo, hi] = fit([...vals, ...s.rounds.flatMap(r => [r.p25, r.p75]), frame.baseRate], 0.2);
    y = v => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
    ref = frame.baseRate;
  }
  const pts = vals.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smooth(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z` : '';
  const end = pts[pts.length - 1];
  return (
    <svg width={W} height={H} className="flex-shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: T.gold, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: T.gold, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {ref !== null && <line x1={0} x2={W} y1={y(ref)} y2={y(ref)} strokeDasharray="2 4" style={{ stroke: ivory(0.35) }} />}
      {area && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: T.gold }} />
      {end && <circle cx={end[0]} cy={end[1]} r={3} strokeWidth={1.5} style={{ fill: s.report ? T.goldLight : T.gold, stroke: 'var(--bg-void)' }} />}
    </svg>
  );
}

/* ───────────── Between asking and the first word from the run ───────────── */

/** A run is open but has not spoken yet: say so, so the panel never looks as if nothing happened. */
export function Connecting({ onCancel }: { onCancel: () => void }) {
  return (
    <section role="status" className="px-6 py-12 flex flex-col items-center gap-3 text-center">
      <span className="relative flex items-center justify-center w-14 h-14 rounded-full border" style={{ borderColor: gold(0.3), background: gold(0.05) }}>
        <span className="absolute inset-0 rounded-full animate-ping" style={{ background: gold(0.08) }} />
        <OiMark size={26} live />
      </span>
      <p className="mt-1 text-[14px] font-semibold text-[var(--text-heading)]">Starting your forecast</p>
      <p className="max-w-[270px] text-[11.5px] leading-relaxed text-[var(--text-secondary)]">Connecting to the run. It researches the question first, then casts the actors; the globe draws as it goes.</p>
      <TextButton onClick={onCancel} title="It keeps running; open it again from your predictions">Ask something else</TextButton>
    </section>
  );
}

/* ───────────── Steering and accounting ───────────── */

export function InjectBox({ oi, s }: { oi: OiClient; s: RunState }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const late = s.phase === 'report';
  const send = async () => {
    if (text.trim().length < 3) return;
    const err = await oi.inject(text.trim());
    setMsg(err ?? 'Queued. It happens in every world in the next period of simulated time.');
    if (!err) setText('');
    setTimeout(() => setMsg(''), 3500);
  };
  return (
    <div>
      <div className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-md border border-[var(--border-primary)] bg-black/50 focus-within:border-[var(--border-active)] transition-colors">
        <Zap className="w-3.5 h-3.5 flex-shrink-0 text-[var(--gold-primary)]" />
        <input value={text} onChange={e => setText(e.target.value.slice(0, 400))} onKeyDown={e => e.key === 'Enter' && send()} disabled={late}
          placeholder={late ? 'The report is being written' : 'Inject an event into every world'} aria-label="Event to inject"
          className="flex-1 bg-transparent outline-none text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-50" />
        <button onClick={send} disabled={late || text.trim().length < 3}
          className="h-7 px-2.5 rounded text-[9.5px] font-mono tracking-[0.14em] text-[var(--gold-light)] hover:bg-[var(--hover-accent)] disabled:opacity-30 transition-colors">
          INJECT
        </button>
      </div>
      {msg && <p role="status" className="mt-1.5 text-[11px] text-[var(--text-secondary)]">{msg}</p>}
    </div>
  );
}

export function UsageLine({ s }: { s: RunState }) {
  const tokens = s.usage.input + s.usage.output;
  const answer = currentAnswer(s);
  return (
    <div className="px-4 py-2.5 border-t border-[var(--border-secondary)] text-[10px] font-mono tracking-[0.04em] flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[var(--text-muted)]">
      <span className="truncate max-w-[45%]">{s.provider} / {s.model}</span>
      <span aria-hidden>·</span><span>{s.usage.calls} calls</span>
      {tokens > 0 && <><span aria-hidden>·</span><span>{tokens.toLocaleString()} tokens</span></>}
      {s.warnings.length > 0 && <><span aria-hidden>·</span><span title={s.warnings.join('\n')} className="text-[var(--text-secondary)] underline decoration-dotted underline-offset-2 cursor-help">{s.warnings.length} hiccup{s.warnings.length === 1 ? '' : 's'}</span></>}
      {answer && <span className="ml-auto text-[var(--gold-primary)] truncate">{answer}</span>}
    </div>
  );
}

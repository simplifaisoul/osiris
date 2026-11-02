'use client';
/**
 * OSIRIS OI: the timeline view.
 *
 * The simulation over dated time: above, the worlds pooled period by period
 * with their range, the base rate (or today's value), injected events and the
 * report's final word; below, one lane per simulated world with where the
 * question stood in it after each period, how far it moved, and what
 * happened. A lane opens its world; an event opens itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { formatAmount } from '@/lib/oi/forecast';
import { timelineOf, type Timeline, type TimelineCell, type TimelineLane } from '@/lib/oi/timeline';
import { castOf, type RunState } from '@/lib/oi/state';
import { LABEL, SOLID, T, fit, gold, ivory, smooth } from './theme';
import { priceText } from '@/lib/oi/quant';
import { Empty, TypeIcon } from './atoms';

const NAME_COL = 196;
const MIN_COL = 150;

/** A change, in the question's own terms: points of probability or share, or the amount itself. */
function deltaText(s: RunState, cell: TimelineCell, prev: TimelineCell | null): string {
  if (s.frame?.kind === 'number') {
    const a = prev?.point.value, b = cell.point.value;
    if (a === undefined || b === undefined) return '';
    const d = b - a;
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatAmount(Math.abs(d))}`;
  }
  const pts = Math.round((cell.delta ?? 0) * 100);
  return `${pts > 0 ? '+' : pts < 0 ? '−' : ''}${Math.abs(pts)}`;
}

function Delta({ s, cell, prev }: { s: RunState; cell: TimelineCell; prev: TimelineCell | null }) {
  if (cell.delta === null || Math.abs(cell.delta) < 0.005) return null;
  const up = cell.delta > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums" style={{ color: up ? T.gold : T.text }}>
      {up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{deltaText(s, cell, prev)}
    </span>
  );
}

/** How far a world moved from its first period to its last. */
function Drift({ s, lane }: { s: RunState; lane: TimelineLane }) {
  const spoken = lane.cells.filter((c): c is TimelineCell => c !== null);
  if (lane.drift === null || spoken.length < 2) return <span className="px-2.5 py-2 text-[10px] font-mono text-[var(--text-muted)]">—</span>;
  const held = Math.abs(lane.drift) < 0.005;
  const first = spoken[0], last = spoken[spoken.length - 1];
  const text = s.frame?.kind === 'number' ? deltaText(s, last, first) : `${lane.drift > 0 ? '+' : '−'}${Math.round(Math.abs(lane.drift) * 100)} pts`;
  return (
    <span className="px-2.5 py-2 text-[10px] font-mono tabular-nums" style={{ color: held ? T.mute : lane.drift > 0 ? T.gold : T.text }}>
      {held ? 'held' : text}
    </span>
  );
}

/**
 * The part of the scale the simulation actually used, at least a fifth of it,
 * so worlds moving between 44% and 46% read as moving. Chart and lanes share it.
 */
function windowOf(tl: Timeline): [number, number] {
  const vals: number[] = [];
  const add = (...xs: (number | null | undefined)[]) => { for (const x of xs) if (typeof x === 'number' && Number.isFinite(x)) vals.push(x); };
  for (const l of tl.lanes) for (const c of l.cells) add(c?.value);
  for (const p of tl.pooled) add(p?.value, p?.low, p?.high);
  add(tl.final?.value, tl.final?.low, tl.final?.high, tl.reference?.value);
  if (!vals.length) return [0, 1];
  const [a, b] = fit(vals, 0.2);
  let lo = Math.max(0, a), hi = Math.min(1, b);
  if (hi - lo < 0.2) { if (lo === 0) hi = Math.min(1, 0.2); else lo = Math.max(0, hi - 0.2); }
  return [lo, hi];
}

/** The worlds pooled across the periods, drawn in the columns the lanes use. */
function PooledChart({ tl, cols, win }: { tl: Timeline; cols: number; win: [number, number] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 132, pad = 18;
  const x = (i: number) => ((i + 0.5) / cols) * w;
  const norm = (v: number) => Math.min(1, Math.max(0, (v - win[0]) / (win[1] - win[0] || 1)));
  const y = (v: number) => pad + (1 - norm(v)) * (H - pad * 2);
  const grid = [win[0], (win[0] + win[1]) / 2, win[1]];
  const pts = tl.pooled.map((p, i) => (p ? { ...p, i } : null)).filter((p): p is NonNullable<typeof p> => p !== null);
  const band = pts.filter(p => p.low !== null && p.high !== null);
  const finalX = tl.final ? x(cols - 1) : 0;
  return (
    <div ref={box} className="relative" style={{ height: H }}>
      {w > 0 && (
        <svg width={w} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
          {grid.map((v, i) => (
            <g key={i}>
              <line x1={0} x2={w} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--border-secondary)' }} strokeDasharray={i === 1 ? '2 4' : undefined} />
              <text x={4} y={y(v) - 3} className="font-mono" style={{ fontSize: 9.5, fill: 'var(--text-muted)', letterSpacing: '0.04em' }}>{tl.label(v)}</text>
            </g>
          ))}
          {tl.reference && (
            <g>
              <line x1={0} x2={w} y1={y(tl.reference.value)} y2={y(tl.reference.value)} strokeDasharray="3 4" style={{ stroke: ivory(0.45) }} />
              <text x={56} y={y(tl.reference.value) + 11} className="font-mono" style={{ fontSize: 9.5, fill: T.text, letterSpacing: '0.08em' }}>{tl.reference.label.toUpperCase()}</text>
            </g>
          )}
          {tl.injects.map((inj, k) => {
            const ix = ((inj.round - 1) / cols) * w;
            return (
              <g key={k}>
                <line x1={ix} x2={ix} y1={4} y2={H - 4} strokeDasharray="2 3" style={{ stroke: 'var(--gold-light)', opacity: 0.7 }} />
                <title>{`Injected in period ${inj.round}: ${inj.text}`}</title>
                <circle cx={ix} cy={6} r={3} style={{ fill: 'var(--gold-light)' }} />
              </g>
            );
          })}
          {band.length > 1 && (
            <path d={`${smooth(band.map(p => [x(p.i), y(p.high!)]))} L${band.slice().reverse().map(p => `${x(p.i)},${y(p.low!)}`).join(' L')} Z`} style={{ fill: gold(0.1), stroke: 'none' }} />
          )}
          {pts.length > 1 && <path d={smooth(pts.map(p => [x(p.i), y(p.value)]))} fill="none" strokeWidth={1.8} style={{ stroke: T.gold }} />}
          {tl.final && pts.length > 0 && (
            <line x1={x(pts[pts.length - 1].i)} x2={finalX} y1={y(pts[pts.length - 1].value)} y2={y(tl.final.value)} strokeDasharray="3 3" style={{ stroke: T.goldLight, opacity: 0.7 }} />
          )}
          {pts.map(p => (
            <g key={p.i}>
              {p.low !== null && p.high !== null && <line x1={x(p.i)} x2={x(p.i)} y1={y(p.high)} y2={y(p.low)} style={{ stroke: gold(0.5) }} />}
              <circle cx={x(p.i)} cy={y(p.value)} r={3.5} strokeWidth={1.5} style={{ fill: T.gold, stroke: 'var(--bg-void)' }} />
              <text x={x(p.i)} y={y(p.value) - 8} textAnchor="middle" className="font-mono" style={{ fontSize: 9.5, fill: 'var(--text-primary)', stroke: 'rgba(0,0,0,0.9)', strokeWidth: 3, paintOrder: 'stroke' }}>{p.label}</text>
            </g>
          ))}
          {tl.final && (
            <g>
              {tl.final.low !== null && tl.final.high !== null && <line x1={finalX} x2={finalX} y1={y(tl.final.high)} y2={y(tl.final.low)} strokeWidth={2} style={{ stroke: gold(0.6) }} />}
              <rect x={finalX - 4.5} y={y(tl.final.value) - 4.5} width={9} height={9} transform={`rotate(45 ${finalX} ${y(tl.final.value)})`} style={{ fill: T.goldLight, filter: `drop-shadow(0 0 6px ${gold(0.8)})` }} />
              <text x={finalX} y={y(tl.final.value) - 10} textAnchor="middle" className="font-mono" style={{ fontSize: 10, fontWeight: 600, fill: T.goldLight, stroke: 'rgba(0,0,0,0.9)', strokeWidth: 3, paintOrder: 'stroke' }}>{tl.final.label}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

function LaneRow({ s, lane, tl, cols, template, win, selected, onSelect }: {
  s: RunState; lane: TimelineLane; tl: Timeline; cols: number; template: string; win: [number, number]; selected: string | null; onSelect: (k: string | null) => void;
}) {
  const at = (v: number) => Math.min(100, Math.max(0, ((v - win[0]) / (win[1] - win[0] || 1)) * 100));
  const world = lane.key.slice(2);
  const on = selected === lane.key;
  const pick = (k: string) => onSelect(selected === k ? null : k);
  const deciding = (r: number) => Object.entries(s.thinking).some(([k, p]) => k.startsWith(`${world}:`) && p === r);
  return (
    <div className={`grid w-full items-stretch border-b border-[var(--border-secondary)] transition-colors ${on ? 'bg-[var(--hover-accent)]' : ''}`}
      style={{ gridTemplateColumns: template, boxShadow: on ? `inset 2px 0 0 ${T.gold}` : undefined }}>
      <button onClick={() => pick(lane.key)} aria-pressed={on} className="flex items-start gap-2 px-3 py-2 min-w-0 sticky left-0 z-10 text-left hover:bg-[var(--hover-accent)]" style={{ background: SOLID }}>
        <span className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 border" style={{ color: T.gold, borderColor: gold(on ? 0.7 : 0.25), background: gold(0.06) }}>
          <TypeIcon k={lane.key} className="w-3 h-3" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold truncate text-[var(--text-heading)]">{lane.name}</span>
          <span className="block text-[10.5px] leading-snug line-clamp-2 text-[var(--text-muted)]">{lane.role}</span>
        </span>
      </button>
      {tl.rounds.map((r, idx) => {
        const cell = lane.cells[idx];
        const prev = lane.cells.slice(0, idx).reverse().find((c): c is TimelineCell => c !== null) ?? null;
        if (!cell) {
          return (
            <span key={r} className="px-2.5 py-2 text-[10px] font-mono text-[var(--text-muted)]">
              {deciding(r) ? <Loader2 className="w-3 h-3 animate-spin text-[var(--oi-alt)]" /> : '—'}
            </span>
          );
        }
        return (
          <span key={r} className="px-2.5 py-2 min-w-0 flex flex-col gap-1.5">
            <button onClick={() => pick(lane.key)} title={cell.point.note || undefined} className="text-left">
              <span className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-mono tabular-nums truncate text-[var(--text-primary)]">{cell.point.resolved ? `Resolved · ${cell.label}` : cell.label}</span>
                <Delta s={s} cell={cell} prev={prev} />
              </span>
              <span className="relative mt-1.5 block h-[2px] rounded-full bg-white/[0.07]">
                <span className="absolute top-1/2 w-[7px] h-[7px] -ml-[3.5px] -mt-[3.5px] rounded-full" style={{ left: `${at(cell.value)}%`, background: on ? T.gold : T.text, boxShadow: on ? `0 0 6px ${gold(0.8)}` : undefined }} />
              </span>
              {cell.point.price && s.quant && s.frame?.kind !== 'number' && (
                <span className="mt-1 block text-[10px] font-mono tabular-nums text-[var(--text-muted)]">{s.quant.symbol} {priceText(cell.point.price.close, s.quant.currency)}</span>
              )}
            </button>
            {cell.events.slice(0, 3).map(e => {
              const key = `e:${e.id}`;
              const surprise = e.kind === 'shock';
              return (
                <button key={e.id} onClick={() => pick(key)} title={`${e.date} · ${e.title}`}
                  className={`flex items-start gap-1 text-left text-[10.5px] leading-snug transition-colors ${selected === key ? 'text-[var(--text-heading)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                  <TypeIcon k={key} subtype={e.kind} className="w-2.5 h-2.5 mt-[2px] flex-shrink-0" style={{ color: surprise || e.kind === 'injected' ? T.goldLight : T.alt }} />
                  <span className="line-clamp-2">{e.title}</span>
                </button>
              );
            })}
            {cell.events.length > 3 && <button onClick={() => pick(lane.key)} className="self-start text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]">+{cell.events.length - 3} more</button>}
          </span>
        );
      })}
      {cols > tl.rounds.length && <Drift s={s} lane={lane} />}
    </div>
  );
}

export function TimelineView({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const tl = useMemo(() => timelineOf(s), [s]);
  const cols = tl.rounds.length + (s.report ? 1 : 0);
  const template = `${NAME_COL}px repeat(${cols}, minmax(${MIN_COL}px, 1fr))`;
  const win = useMemo(() => windowOf(tl), [tl]);

  if (!castOf(s).length || !s.worlds.length) return <div className="h-full flex items-center justify-center"><Empty>The timeline fills in once the actors are cast and the worlds start to run.</Empty></div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 border-b border-[var(--border-secondary)]">
        <div>
          <div className="hud-text text-[10px] text-[var(--gold-primary)]">Timeline</div>
          <div className="mt-0.5 text-[10px] font-mono tracking-[0.1em] text-[var(--text-muted)]">
            {tl.rounds.length} PERIODS · {tl.lanes.length} WORLDS · {s.events.length} EVENTS{tl.injects.length ? ` · ${tl.injects.length} INJECTED` : ''}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3.5 text-[9.5px] font-mono tracking-[0.1em] text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[2px]" style={{ background: T.gold }} />POOLED</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: gold(0.18) }} />RANGE</span>
          {tl.reference && <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed" style={{ borderColor: ivory(0.6) }} />{s.frame?.kind === 'number' ? 'TODAY' : 'BASE RATE'}</span>}
          {tl.injects.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-light)]" />INJECT</span>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto styled-scrollbar">
        <div style={{ minWidth: NAME_COL + cols * MIN_COL }}>
          <div className="grid border-b border-[var(--border-secondary)]" style={{ gridTemplateColumns: template }}>
            <div className="px-3 py-3 flex flex-col gap-1 sticky left-0 z-10" style={{ background: SOLID }}>
              <span className={`${LABEL} text-[var(--text-secondary)]`}>The worlds pooled</span>
              <span className="text-[9.5px] leading-snug text-[var(--text-muted)]">
                {s.frame?.kind === 'number' ? 'The worlds’ median, with their range' : s.frame?.kind === 'choice' ? 'The leading outcome’s pooled share' : 'P(YES) across the worlds, with their range'}
              </span>
            </div>
            <div style={{ gridColumn: `2 / span ${cols}` }} className="py-1"><PooledChart tl={tl} cols={cols} win={win} /></div>
          </div>
          <div className="grid sticky top-0 z-20 border-b border-[var(--border-primary)]" style={{ gridTemplateColumns: template, background: SOLID }}>
            <span className={`px-3 py-2 ${LABEL} text-[var(--text-muted)] sticky left-0`}>World</span>
            {tl.rounds.map(r => {
              const st = s.rounds.find(x => x.round === r);
              const live = !st && s.status === 'running' && s.phase === 'simulate' && s.steps.filter(x => x.phase === 'simulate').length === r;
              const period = tl.periods.find(p => p.index === r);
              return (
                <span key={r} className="px-2.5 py-2 flex flex-col gap-0.5" style={{ color: live ? T.goldLight : st ? T.body : T.mute }}>
                  <span className={`${LABEL}`}>Period {r}{live && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle animate-osiris-pulse" style={{ background: T.gold, boxShadow: `0 0 6px ${gold(0.8)}` }} />}</span>
                  {period && <span className="text-[10px] font-mono tracking-[0.04em] text-[var(--text-muted)] truncate">{period.label}</span>}
                </span>
              );
            })}
            {cols > tl.rounds.length && <span className={`px-2.5 py-2 ${LABEL} text-[var(--gold-primary)]`}>Final · drift</span>}
          </div>
          {tl.lanes.map(lane => (
            <LaneRow key={lane.key} s={s} lane={lane} tl={tl} cols={cols} template={template} win={win} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';
/**
 * OSIRIS OI: what a prediction rests on, side by side.
 *
 * The prediction is not one model's opinion: it is weighed against what can
 * be checked. Here they stand on one scale, each a click away from its
 * source: the price's own history (the statistical baseline), the crowd's
 * money (the prediction market on the same question), the simulation priced
 * across the market's own paths, how the worlds ended, and the prediction
 * itself. A yes/no question reads in percent; a quantity in its own units,
 * each as a range.
 */
import { motion } from 'framer-motion';
import { formatAmount } from '@/lib/oi/forecast';
import { priceText } from '@/lib/oi/quant';
import type { RunState } from '@/lib/oi/state';
import type { ContextItem } from '@/lib/oi/types';
import { ANCHOR, LABEL, T, pct, tint } from './theme';
import { SectionTitle, TypeIcon } from './atoms';
import { PriceFan } from './fan';
import { LadderChart } from './ladder';
import { TrackRecord } from './record';


interface Row {
  key: string;
  label: string;
  /** What it is, in a line. */
  detail: string;
  color: string;
  /** Opens its source. */
  select?: string;
  /** A probability (0..1), or a range on the quantity's scale. */
  value?: number;
  range?: [number, number, number];
  strong?: boolean;
  muted?: boolean;
}

/**
 * Each anchor's mark, the shape it has on the prediction's own bar: a tick for
 * the baseline, a diamond for a market, a dot for the simulation, a bar for
 * the prediction. Shape tells them apart where the gold tones are close.
 */
function Mark({ row }: { row: Row }) {
  const kind = row.key === 'base' ? 'tick' : row.key === 'sim' ? 'dot' : row.key.startsWith('pred') ? 'bar' : 'diamond';
  return (
    <span className="w-2.5 h-2.5 flex items-center justify-center flex-shrink-0 self-center" aria-hidden>
      {kind === 'tick' && <span className="w-px h-2.5" style={{ background: row.color }} />}
      {kind === 'dot' && <span className="w-[7px] h-[7px] rounded-full" style={{ background: row.color }} />}
      {kind === 'bar' && <span className="w-[2px] h-2.5 rounded-full" style={{ background: row.color, boxShadow: `0 0 6px ${tint(row.color, 80)}` }} />}
      {kind === 'diamond' && <span className="w-[6px] h-[6px] rotate-45" style={{ background: row.color }} />}
    </span>
  );
}

const traded = (v: number, platform: string) => (platform === 'Polymarket' ? `$${formatAmount(v)} traded` : `${formatAmount(v)} mana traded`);

/** The markets found: the one on this same question first, the related after. */
function marketsOf(s: RunState): { same: ContextItem | null; related: ContextItem[] } {
  const odds = s.context.filter(c => c.kind === 'odds' && c.odds);
  const same = odds.find(c => c.id === s.frame?.market) ?? null;
  return { same, related: odds.filter(c => c !== same) };
}

/** Whether a run has anything to weigh its prediction against. */
export function hasAnchors(s: RunState): boolean {
  return Boolean(s.quant || s.context.some(c => c.kind === 'odds'));
}

export function Anchors({ s, selected, onSelect }: { s: RunState; selected: string | null; onSelect: (k: string | null) => void }) {
  const f = s.frame;
  const q = s.quant;
  if (!f || !hasAnchors(s)) return null;
  const { same, related } = marketsOf(s);
  const series = q ? s.context.find(c => c.kind === 'series' && c.symbol === q.symbol) : undefined;
  const r = s.report;
  const last = s.rounds[s.rounds.length - 1];
  const rows: Row[] = [];

  if (f.kind === 'number') {
    if (q) rows.push({ key: 'base', label: 'Statistical baseline', detail: `${q.symbol}'s own daily moves, resampled to ${q.days} days ahead`, color: ANCHOR.baseline, range: [q.p10, q.p50, q.p90], select: series && `c:${series.id}` });
    if (q?.simulated) rows.push({ key: 'sim', label: 'The simulation, priced', detail: 'Each world’s events, across the market’s own paths', color: ANCHOR.simulation, range: [q.simulated.p10, q.simulated.p50, q.simulated.p90] });
    if (r?.estimate) rows.push({ key: 'pred', label: 'Prediction', detail: `${r.confidence} confidence`, color: ANCHOR.prediction, range: [r.estimate.low, r.estimate.value, r.estimate.high], strong: true, select: 'r:report' });
  } else {
    if (q?.probability !== undefined) rows.push({ key: 'base', label: 'Statistical baseline', detail: `${q.symbol}'s own daily moves, resampled to the horizon`, color: ANCHOR.baseline, value: q.probability, select: series && `c:${series.id}` });
    if (same?.odds) rows.push({ key: 'mkt', label: `${same.odds.platform} traders`, detail: `“${same.title}” · ${traded(same.odds.volume, same.odds.platform)}`, color: ANCHOR.market, value: same.odds.probability, select: `c:${same.id}` });
    if (q?.simulated?.probability !== undefined) rows.push({ key: 'sim', label: 'The simulation, priced', detail: `${s.worlds.length} worlds’ events, across the market’s own paths`, color: ANCHOR.simulation, value: q.simulated.probability });
    else if (last && f.kind === 'binary') rows.push({ key: 'sim', label: 'The worlds pooled', detail: `${s.worlds.length} simulated worlds`, color: ANCHOR.simulation, value: last.consensus });
    if (r && f.kind === 'binary') rows.push({ key: 'pred', label: 'Prediction', detail: `${r.confidence} confidence`, color: ANCHOR.prediction, value: r.probability, strong: true, select: 'r:report' });
    if (r?.shares && f.kind === 'choice') {
      f.outcomes.forEach((o, i) => {
        if (i < 4) rows.push({ key: `pred:${i}`, label: `Prediction · ${o}`, detail: i === 0 ? `${r.confidence} confidence` : '', color: ANCHOR.prediction, value: r.shares![i] ?? 0, strong: i === 0, select: 'r:report' });
      });
    }
    // A "which" question is priced one outcome at a time: each market stands beside the prediction, not behind it.
    // Rungs of the same ladder are on the ladder chart; the rows keep the markets it does not show.
    const onLadder = (m: ContextItem) => Boolean(same?.odds?.ladder && m.url === same.url);
    for (const m of related.filter(m => !onLadder(m)).slice(0, f.kind === 'choice' ? 4 : 3)) {
      if (m.odds) rows.push({ key: m.id, label: f.kind === 'choice' ? `${m.odds.platform} traders` : 'Related market', detail: `“${m.title}”`, color: ANCHOR.market, value: m.odds.probability, select: `c:${m.id}`, muted: f.kind !== 'choice' });
    }
  }
  if (!rows.length) return null;

  // A quantity's scale: every range on it, and today's price.
  const lo = Math.min(...rows.flatMap(x => x.range ?? []), q?.price ?? Infinity);
  const hi = Math.max(...rows.flatMap(x => x.range ?? []), q?.price ?? -Infinity);
  const at = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
  const say = (v: number) => (q ? priceText(v, q.currency) : formatAmount(v));

  return (
    <div>
      <SectionTitle>What it rests on</SectionTitle>
      {q && (
        <button onClick={() => series && onSelect(selected === `c:${series.id}` ? null : `c:${series.id}`)} disabled={!series}
          className="w-full mb-2.5 flex items-center gap-2 rounded-md border border-[var(--border-secondary)] bg-white/[0.015] px-2.5 py-1.5 text-left hover:bg-[var(--hover-accent)] transition-colors">
          <TypeIcon k="c:q" subtype="series" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ANCHOR.baseline }} />
          <span className="text-[11px] font-semibold whitespace-nowrap text-[var(--text-heading)]">{q.symbol}</span>
          <span className="text-[11px] font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]">{priceText(q.price, q.currency)}</span>
          <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">on {q.asOf} · swings {Math.round(q.vol * 100)}% a year{f.measure?.threshold !== undefined ? ` · level ${priceText(f.measure.threshold, q.currency)} (${f.measure.threshold >= q.price ? '+' : '−'}${Math.round(Math.abs(f.measure.threshold / q.price - 1) * 100)}%)` : ''}</span>
        </button>
      )}
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const on = row.select && selected === row.select;
          return (
            <button key={row.key} onClick={() => row.select && onSelect(on ? null : row.select)} disabled={!row.select}
              className={`group text-left rounded-md -mx-1.5 px-1.5 py-1 transition-colors ${row.select ? 'hover:bg-[var(--hover-accent)]' : 'cursor-default'} ${on ? 'bg-[var(--hover-accent)]' : ''}`}
              style={{ opacity: row.muted ? 0.72 : 1 }}>
              <span className="flex items-baseline gap-2">
                <Mark row={row} />
                <span className={`${row.strong ? 'text-[12px] font-semibold text-[var(--text-heading)]' : 'text-[11.5px] text-[var(--text-primary)]'} whitespace-nowrap`}>{row.label}</span>
                <span className="flex-1 min-w-0 truncate text-[10.5px] text-[var(--text-muted)]">{row.detail}</span>
                <span className={`font-mono tabular-nums whitespace-nowrap ${row.strong ? 'text-[13px]' : 'text-[11px]'}`} style={{ color: row.strong ? T.goldLight : T.text }}>
                  {row.value !== undefined ? pct(row.value) : row.range ? say(row.range[1]) : ''}
                </span>
              </span>
              <span className="relative mt-1 block h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
                {row.value !== undefined && (
                  <motion.span className="absolute inset-y-0 left-0 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(1, row.value * 100)}%` }} transition={{ duration: 0.7, delay: i * 0.06 }}
                    style={{ background: row.strong ? `linear-gradient(90deg, ${tint(row.color, 55)}, ${row.color})` : tint(row.color, 70) }} />
                )}
                {row.range && (
                  <>
                    <motion.span className="absolute inset-y-0 rounded-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: i * 0.06 }}
                      style={{ left: `${at(row.range[0])}%`, width: `${Math.max(1, at(row.range[2]) - at(row.range[0]))}%`, background: tint(row.color, row.strong ? 60 : 40) }} />
                    <span className="absolute -top-px w-[2px] h-[7px] -ml-px rounded-full" style={{ left: `${at(row.range[1])}%`, background: row.color }} />
                  </>
                )}
                {row.range && q && <span className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${at(q.price)}%` }} title={`Today ${say(q.price)}`} />}
              </span>
              {row.range && (
                <span className="mt-0.5 flex justify-between text-[9.5px] font-mono tabular-nums text-[var(--text-muted)]">
                  <span>{say(row.range[0])}</span><span>{say(row.range[2])}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* The figures above, then what they come from: the price world by world, the whole ladder, the baseline's record. */}
      {q?.fan?.length ? (
        <div className="mt-4">
          <span className={`block mb-2 ${LABEL} text-[var(--oi-label)]`}>The price, world by world</span>
          <PriceFan s={s} />
        </div>
      ) : null}
      {q?.curve?.length && s.context.some(c => c.odds?.ladder) ? (
        <div className="mt-4">
          <span className={`block mb-2 ${LABEL} text-[var(--oi-label)]`}>Every level, the model and the crowd</span>
          <LadderChart s={s} />
        </div>
      ) : null}
      {q?.backtest ? (
        <div className="mt-4">
          <span className={`block mb-2 ${LABEL} text-[var(--oi-label)]`}>Is the baseline any good? Its record on {q.symbol}&apos;s past</span>
          <TrackRecord s={s} />
        </div>
      ) : null}
    </div>
  );
}

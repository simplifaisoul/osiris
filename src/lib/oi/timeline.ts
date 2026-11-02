/**
 * OSIRIS OI: the simulation over time.
 *
 * One lane per simulated world, one column per period of simulated time (real
 * dates), each cell where the question stood in that world at the end of the
 * period, how far it moved, and what happened; above them, the worlds pooled
 * period by period, and the report's final word. Every value is put on one
 * 0..1 scale so lanes and chart line up whatever the question asks: a
 * probability as itself, a choice as the share of the outcome that ended up
 * leading, a number by where it falls in the run's range.
 */
import type { RunState } from './state';
import type { Period, SimEvent, WorldPoint } from './types';
import { formatAmount, leader, pointView, positionIn } from './forecast';

export interface TimelineCell {
  round: number;
  point: WorldPoint;
  /** 0..1 on the timeline's scale. */
  value: number;
  label: string;
  /** Change since this world's previous period, on the same scale; null for its first. */
  delta: number | null;
  /** What happened in this world in this period, in date order. */
  events: SimEvent[];
}

export interface TimelineLane {
  /** The world's research key, "w:<world>". */
  key: string;
  name: string;
  /** How it ended, or where it stands. */
  role: string;
  /** One per period, null where the world has not reported yet. */
  cells: (TimelineCell | null)[];
  /** First to last, on the scale. */
  drift: number | null;
}

export interface TimelinePoint { value: number; low: number | null; high: number | null; label: string }

export interface Timeline {
  rounds: number[];
  /** The periods' dates, by period. */
  periods: Period[];
  lanes: TimelineLane[];
  /** The worlds pooled after each period, or null for a period not yet pooled. */
  pooled: (TimelinePoint | null)[];
  /** The report's figure, once written. */
  final: TimelinePoint | null;
  /** The base rate, or today's value for a number, on the scale. */
  reference: { value: number; label: string } | null;
  injects: { round: number; text: string }[];
  /** What the scale means at its two ends. */
  ends: [string, string];
  /** A point on the scale in the question's own terms: a percentage, or an amount. */
  label: (v: number) => string;
}

export function timelineOf(s: RunState): Timeline {
  const frame = s.frame;
  const n = Math.max(s.periods.length, s.periodsPlanned, s.rounds.length, 1);
  const rounds = Array.from({ length: n }, (_, i) => i + 1);
  const [lo, hi] = rangeOf(s);
  const leadShares = s.report?.shares ?? s.rounds[s.rounds.length - 1]?.shares;
  const lead = leadShares ? leader(leadShares) : 0;
  const scale = (p: WorldPoint): number => {
    if (frame?.kind === 'number') return positionIn(p.value ?? NaN, lo, hi);
    if (frame?.kind === 'choice') return p.shares?.[lead] ?? 0;
    return p.probability;
  };
  const toScale = (v: number) => (frame?.kind === 'number' ? positionIn(v, lo, hi) : v);

  const lanes: TimelineLane[] = s.worlds.map(w => {
    let prev: number | null = null;
    const cells = rounds.map(r => {
      const point = s.points.find(p => p.world === w && p.period === r);
      if (!point) return null;
      const value = scale(point);
      const events = s.events.filter(e => e.world === w && e.period === r).sort((a, b) => a.date.localeCompare(b.date));
      const cell: TimelineCell = { round: r, point, value, label: pointView(point, frame), delta: prev === null ? null : value - prev, events };
      prev = value;
      return cell;
    });
    const played = cells.filter((c): c is TimelineCell => c !== null);
    const last = played[played.length - 1]?.point;
    return {
      key: `w:${w}`,
      name: `World ${w}`,
      role: last ? (last.resolved ? `Resolved: ${pointView(last, frame)}` : last.note || pointView(last, frame)) : 'Not started',
      cells,
      drift: played.length > 1 ? played[played.length - 1].value - played[0].value : null,
    };
  });

  const pooled = rounds.map(r => {
    const st = s.rounds.find(x => x.round === r);
    if (!st) return null;
    if (frame?.kind === 'number' && st.value) {
      return { value: toScale(st.value.median), low: toScale(st.value.min), high: toScale(st.value.max), label: formatAmount(st.value.median) };
    }
    if (frame?.kind === 'choice' && st.shares) {
      return { value: st.shares[lead] ?? 0, low: null, high: null, label: `${frame.outcomes[lead] ?? ''} ${Math.round((st.shares[lead] ?? 0) * 100)}%`.trim() };
    }
    return { value: st.consensus, low: st.min, high: st.max, label: `${Math.round(st.consensus * 100)}%` };
  });

  let final: TimelinePoint | null = null;
  const r = s.report;
  if (r) {
    if (frame?.kind === 'number' && r.estimate) final = { value: toScale(r.estimate.value), low: toScale(r.estimate.low), high: toScale(r.estimate.high), label: formatAmount(r.estimate.value) };
    else if (frame?.kind === 'choice' && r.shares) final = { value: r.shares[lead] ?? 0, low: null, high: null, label: `${frame.outcomes[lead] ?? ''} ${Math.round((r.shares[lead] ?? 0) * 100)}%`.trim() };
    else final = { value: r.probability, low: null, high: null, label: `${Math.round(r.probability * 100)}%` };
  }

  const reference = frame?.kind === 'binary' ? { value: frame.baseRate, label: `Base rate ${Math.round(frame.baseRate * 100)}%` }
    : frame?.kind === 'number' && frame.anchor !== null ? { value: toScale(frame.anchor), label: `Today ${formatAmount(frame.anchor)}` }
      : null;

  const ends: [string, string] = frame?.kind === 'number' ? [formatAmount(lo), formatAmount(hi)]
    : frame?.kind === 'choice' ? ['0%', `${frame.outcomes[lead] ?? 'Leader'} 100%`] : ['NO', 'YES'];

  const label = frame?.kind === 'number' ? (v: number) => formatAmount(lo + v * (hi - lo)) : (v: number) => `${Math.round(v * 100)}%`;
  return { rounds, periods: s.periods, lanes, pooled, final, reference, injects: s.injects, ends, label };
}

/** A number question's range: every world's value in every period, the report's range and today's value. */
export function rangeOf(s: RunState): [number, number] {
  const vals = [
    ...s.points.map(p => p.value),
    s.report?.estimate?.low, s.report?.estimate?.high,
    s.frame?.anchor ?? undefined,
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi > lo) return [lo, hi];
  const pad = Math.abs(lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}

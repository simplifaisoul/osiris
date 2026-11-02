/**
 * OSIRIS OI: the run's execution trace.
 *
 * What the engine did, step by step, with when and how long: research the
 * question, map the world, cast the actors, each period of simulated time
 * across the worlds, write the prediction.
 * Steps the run has not reached yet are listed as pending, so the trace reads
 * as the whole plan from the first event. Every figure comes from the run's
 * own events; nothing here is estimated.
 */
import type { RunState } from './state';
import type { Phase } from './types';
import { formatAmount, leader } from './forecast';

export type StepStatus = 'done' | 'active' | 'pending' | 'failed' | 'skipped';

export interface TraceMetric { label: string; value: string }

export interface TraceStep {
  /** 'context', 'graph', 'agents', 'round:<n>' (a period) or 'report'. */
  id: string;
  phase: Phase;
  title: string;
  /** The engine's own words for the step, once it has started it. */
  detail: string;
  status: StepStatus;
  start: number | null;
  end: number | null;
  metrics: TraceMetric[];
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** A duration in the trace's terms: tenths of a second, then minutes. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`;
}

export function traceOf(s: RunState): TraceStep[] {
  const planned: { id: string; phase: Phase; title: string }[] = [
    { id: 'context', phase: 'context', title: 'Research the question' },
    { id: 'graph', phase: 'graph', title: 'Map the world' },
    { id: 'agents', phase: 'agents', title: 'Cast the actors' },
    ...Array.from({ length: Math.max(1, s.periods.length || s.periodsPlanned) }, (_, i) => ({
      id: `round:${i + 1}`, phase: 'simulate' as Phase, title: `Simulate · ${s.periods[i]?.label ?? `period ${i + 1}`}`,
    })),
    { id: 'report', phase: 'report', title: 'Write the prediction' },
  ];

  // The engine announces each stage as it enters it; the k-th "simulate" is period k.
  const seen = new Map<string, { label: string; at: number; index: number }>();
  let round = 0;
  s.steps.forEach((st, index) => {
    const id = st.phase === 'simulate' ? `round:${++round}` : st.phase;
    if (st.phase !== 'done') seen.set(id, { label: st.label, at: st.at, index });
  });

  const ended = s.status !== 'running';
  return planned.map(p => {
    const hit = seen.get(p.id);
    const next = hit ? s.steps[hit.index + 1] : undefined;
    const start = hit?.at ?? null;
    const end = hit ? (next?.at ?? (ended ? s.endedAt || s.updatedAt : null)) : null;
    let status: StepStatus;
    if (!hit) status = ended ? 'skipped' : 'pending';
    else if (next) status = 'done';
    else if (!ended) status = 'active';
    else status = s.status === 'done' ? 'done' : 'failed';
    return { id: p.id, phase: p.phase, title: p.title, detail: hit?.label ?? '', status, start, end, metrics: hit ? metricsFor(s, p.id) : [] };
  });
}

function metricsFor(s: RunState, id: string): TraceMetric[] {
  const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
  switch (id) {
    case 'context': {
      const kinds = (['web', 'series', 'odds', 'wiki', 'news', 'social', 'quake', 'market', 'data'] as const).map(k => [k, count(s.context, c => c.kind === k)] as const).filter(([, n]) => n > 0);
      const name = { web: 'Articles', series: 'Market data', odds: 'Prediction markets', wiki: 'Background', news: 'Live feed', social: 'Social posts', quake: 'Quakes', market: 'Market board', data: 'Your data' } as const;
      return [{ label: 'Sources', value: String(s.context.length) }, ...kinds.map(([k, n]) => ({ label: name[k], value: String(n) }))];
    }
    case 'graph': {
      const out: TraceMetric[] = [
        { label: 'Actors', value: String(s.actors.length) },
        { label: 'Relations', value: String(count(s.links, l => l.kind === 'relation')) },
        { label: 'Evidence', value: String(count(s.links, l => l.kind === 'evidence')) },
      ];
      const f = s.frame;
      if (f?.kind === 'binary') out.push({ label: s.quant ? 'Baseline' : 'Base rate', value: pct(f.baseRate) });
      if (s.quant) out.push({ label: 'Price', value: `${s.quant.symbol} ${formatAmount(s.quant.price)}` });
      if (f?.kind === 'choice') out.push({ label: 'Outcomes', value: String(f.outcomes.length) });
      if (f?.kind === 'number' && f.anchor !== null) out.push({ label: 'Today', value: formatAmount(f.anchor) });
      return out;
    }
    case 'agents': {
      const cast = count(s.actors, a => Boolean(a.persona));
      return [
        { label: 'Actors cast', value: s.actorsPlanned ? `${cast} / ${s.actorsPlanned}` : String(cast) },
        ...(s.periods.length ? [{ label: 'Periods', value: String(s.periods.length) }, { label: 'Worlds', value: String(s.worlds.length) }] : []),
      ];
    }
    case 'report': {
      const r = s.report;
      if (!r) return [];
      const sourced = count(r.drivers, d => (d.sources?.length ?? 0) > 0);
      return [
        { label: 'Confidence', value: r.confidence },
        ...(r.drivers.some(d => d.sources) ? [{ label: 'Sourced drivers', value: `${sourced} / ${r.drivers.length}` }] : []),
        { label: 'Scenarios', value: String(r.scenarios.length) },
        { label: 'Signposts', value: String(r.signposts.length) },
      ];
    }
  }
  const round = Number(id.slice(6));
  const moves = s.moves.filter(m => m.period === round);
  const out: TraceMetric[] = [
    { label: 'Moves', value: String(moves.length) },
    { label: 'Events', value: String(count(s.events, e => e.period === round && e.kind !== 'injected')) },
  ];
  const shocks = count(s.events, e => e.period === round && e.kind === 'shock');
  if (shocks) out.push({ label: 'Surprises', value: String(shocks) });
  // Quotes, and how many were found word for word in their sources.
  const cites = moves.flatMap(m => m.cites ?? []);
  if (cites.length) out.push({ label: 'Quotes', value: `${cites.length} · ${count(cites, c => c.exact)} verbatim` });
  const resolved = count(s.points, p => p.period === round && Boolean(p.resolved));
  if (resolved) out.push({ label: 'Resolved', value: `${resolved} / ${s.worlds.length}` });
  const injects = count(s.injects, x => x.round === round);
  if (injects) out.push({ label: 'Injected', value: String(injects) });
  const stat = s.rounds.find(r => r.round === round);
  if (stat) {
    if (s.frame?.kind === 'number' && stat.value) out.push({ label: 'Median', value: formatAmount(stat.value.median) });
    else if (s.frame?.kind === 'choice' && stat.shares) {
      const i = leader(stat.shares);
      out.push({ label: 'Leads', value: `${s.frame.outcomes[i] ?? '—'} ${pct(stat.shares[i])}` });
    } else out.push({ label: 'Worlds pooled', value: pct(stat.consensus) }, { label: 'Range', value: `${pct(stat.min)}–${pct(stat.max)}` });
  }
  return out;
}

/** How far through the plan the run is, 0..1, for a progress line. */
export function progressOf(steps: TraceStep[]): number {
  if (!steps.length) return 0;
  const done = steps.filter(st => st.status === 'done' || st.status === 'failed').length;
  const active = steps.some(st => st.status === 'active') ? 0.5 : 0;
  return Math.min(1, (done + active) / steps.length);
}

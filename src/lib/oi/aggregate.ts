/**
 * Pooling the simulated worlds. Each world is one equally likely way the
 * future could go, so the chance of an outcome is the worlds' mixture: the
 * mean of their figures, with a world where the question settled counting as
 * certain. (A pool of log-odds, the way forecasters' opinions are combined,
 * would let one world that settled early outvote the rest.) The median,
 * quartiles and range are reported beside it so worlds that split read as
 * split.
 */
import type { RoundStat } from './types';

const bound = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** The q-quantile of sorted values, interpolated. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** The chance across the worlds: the mean of their figures, each held to [0, 1]. NaN with no worlds. */
export function mixture(views: { probability: number }[]): number {
  if (!views.length) return NaN;
  return views.reduce((t, v) => t + Math.min(1, Math.max(0, v.probability)), 0) / views.length;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const weight = (confidence: number) => 0.25 + Math.min(1, Math.max(0, confidence));

/**
 * Pooled shares for a choice question: a weighted average of the worlds'
 * distributions (a linear pool, the same mixture as a yes/no question's),
 * renormalised.
 */
export function poolShares(views: { shares: number[]; confidence: number }[], n: number): number[] {
  const out = new Array(n).fill(0);
  let den = 0;
  for (const v of views) {
    const w = weight(v.confidence);
    for (let i = 0; i < n; i++) out[i] += w * (v.shares[i] ?? 0);
    den += w;
  }
  const total = out.reduce((t, x) => t + x, 0);
  return den && total ? out.map(x => r3(x / total)) : out.map(() => r3(1 / Math.max(1, n)));
}

/** The worlds pooled after a period, whatever kind of answer the question wants. */
export function roundStatFor(
  round: number,
  posts: { probability: number; confidence: number; shares?: number[]; estimate?: { value: number; low: number; high: number } }[],
  kind: 'binary' | 'choice' | 'number',
  outcomes = 0,
): RoundStat {
  if (kind === 'choice') {
    const views = posts.filter(p => p.shares?.length === outcomes) as { probability: number; confidence: number; shares: number[] }[];
    const shares = poolShares(views, outcomes);
    const lead = shares.reduce((b, v, i) => (v > shares[b] ? i : b), 0);
    const votes = new Array(outcomes).fill(0);
    for (const v of views) votes[v.shares.reduce((b, x, i) => (x > v.shares[b] ? i : b), 0)]++;
    // The scalar fields follow the leader: how much of the worlds' weight it holds, and how unevenly.
    const base = roundStat(round, views.map(v => ({ probability: v.shares[lead], confidence: v.confidence })));
    return { ...base, consensus: shares[lead], shares, votes };
  }
  if (kind === 'number') {
    const ests = posts.map(p => p.estimate).filter((e): e is { value: number; low: number; high: number } => Boolean(e));
    const vals = ests.map(e => e.value).sort((a, b) => a - b);
    const lows = ests.map(e => e.low).sort((a, b) => a - b);
    const highs = ests.map(e => e.high).sort((a, b) => a - b);
    const base = roundStat(round, posts);
    return {
      ...base,
      consensus: 0.5,
      n: vals.length,
      value: {
        median: quantile(vals, 0.5),
        p25: quantile(vals, 0.25),
        p75: quantile(vals, 0.75),
        min: vals[0] ?? NaN,
        max: vals[vals.length - 1] ?? NaN,
        low: quantile(lows, 0.5),
        high: quantile(highs, 0.5),
      },
    };
  }
  return roundStat(round, posts);
}

export function roundStat(round: number, views: { probability: number; confidence: number }[]): RoundStat {
  const ps = views.map(v => bound(v.probability)).sort((a, b) => a - b);
  const histogram = new Array(10).fill(0);
  for (const p of ps) histogram[Math.min(9, Math.floor(p * 10))]++;
  const p25 = quantile(ps, 0.25);
  const p75 = quantile(ps, 0.75);
  return {
    round,
    consensus: r3(mixture(views)),
    median: r3(quantile(ps, 0.5)),
    mean: r3(ps.reduce((t, p) => t + p, 0) / (ps.length || 1)),
    p25: r3(p25),
    p75: r3(p75),
    min: r3(ps[0] ?? NaN),
    max: r3(ps[ps.length - 1] ?? NaN),
    spread: r3(p75 - p25),
    n: ps.length,
    histogram,
  };
}

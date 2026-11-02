/**
 * The three kinds of answer OI gives, and how each is read, pooled and said.
 * Pure and browser-safe: the engine, the API summary and the panel all speak
 * through these, so a number is never formatted two ways.
 */
import type { Estimate, Frame, Report, RoundStat, WorldPoint } from './types';

/** Outcome colours for a choice question: OI's violet and magenta first, then hues that stay distinct beside them. */
export const OUTCOME_COLORS = ['#B388FF', '#FF5CCB', '#6E8BFF', '#6FE3C1', '#FFB86B', '#E3DDF2'];

export const outcomeColor = (i: number) => OUTCOME_COLORS[((i % OUTCOME_COLORS.length) + OUTCOME_COLORS.length) % OUTCOME_COLORS.length];

/** A quantity a model wrote: 86.4, "86.4", "$86.40", "1,234". Null when it is not one. */
export function amount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) < 1e15 ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[,\s]/g, '').replace(/^[^0-9+\-.]+/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : null;
}

/**
 * Shares for each of `n` outcomes, summing to 1. Reads an array in order, or
 * an object keyed by outcome label, and falls back when the reply has none.
 */
export function normalizeShares(raw: unknown, outcomes: string[], fallback: number[]): number[] {
  const n = outcomes.length;
  let values: number[] = [];
  if (Array.isArray(raw)) {
    values = raw.slice(0, n).map(v => amount(v) ?? 0);
  } else if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k.trim().toLowerCase(), amount(v) ?? 0] as const);
    values = outcomes.map(label => entries.find(([k]) => k === label.toLowerCase())?.[1] ?? 0);
  }
  while (values.length < n) values.push(0);
  // Percentages, fractions and plain weights all come out right once divided by their total.
  values = values.map(v => Math.max(0, v));
  const total = values.reduce((t, v) => t + v, 0);
  if (!(total > 0)) return fallback.length === n ? fallback.slice() : uniform(n);
  return values.map(v => v / total);
}

export const uniform = (n: number) => Array.from({ length: n }, () => 1 / Math.max(1, n));

export const leader = (shares: number[]) => shares.reduce((best, v, i) => (v > shares[best] ? i : best), 0);

/** An estimate whose range contains its value. */
export function orderEstimate(value: number, low: number | null, high: number | null): Estimate {
  let lo = low ?? value;
  let hi = high ?? value;
  if (lo > hi) [lo, hi] = [hi, lo];
  return { value, low: Math.min(lo, value), high: Math.max(hi, value) };
}

/** A figure as a desk would read it: 86.4, 1,234, 4.25, 1.2M, 3.4B. */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(a >= 1e13 ? 0 : 1)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return Math.round(n).toLocaleString('en-US');
  if (a >= 10) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** A short read of where one world stands: "62%", "Lula 45%", "86.4", or how it resolved: "YES", "Lula". */
export function pointView(p: WorldPoint, frame: Frame | null): string {
  if (p.resolved) return frame?.kind === 'choice' ? p.resolved : p.resolved.toUpperCase();
  if (frame?.kind === 'choice' && p.shares) {
    const i = leader(p.shares);
    return `${frame.outcomes[i] ?? '?'} ${pct(p.shares[i])}`;
  }
  if (frame?.kind === 'number') return p.value !== undefined ? formatAmount(p.value) : '—';
  return pct(p.probability);
}

/** The answer in a phrase, from a report or from the last round's pool. */
export function answerText(frame: Frame | null, report: Report | null, stat: RoundStat | null): string {
  if (!frame) return '';
  if (frame.kind === 'choice') {
    const shares = report?.shares ?? stat?.shares;
    if (!shares?.length) return '';
    const i = leader(shares);
    return `${frame.outcomes[i] ?? '?'} (${pct(shares[i])})`;
  }
  if (frame.kind === 'number') {
    const e = report?.estimate ?? (stat?.value ? { value: stat.value.median, low: stat.value.low, high: stat.value.high } : null);
    if (!e) return '';
    return `${formatAmount(e.value)}${frame.unit ? ` ${frame.unit}` : ''} (${formatAmount(e.low)}–${formatAmount(e.high)})`;
  }
  const p = report?.probability ?? stat?.consensus;
  return typeof p === 'number' ? `${pct(p)} YES` : '';
}

/** The answer at a glance, for a label on the globe: "62%", "Lula 45%", "86.4 USD". */
export function shortAnswer(frame: Frame | null, report: Report | null, stat: RoundStat | null): string {
  if (!frame) return '';
  if (frame.kind === 'choice') {
    const shares = report?.shares ?? stat?.shares;
    if (!shares?.length) return '';
    const i = leader(shares);
    return `${frame.outcomes[i] ?? '?'} ${pct(shares[i])}`;
  }
  if (frame.kind === 'number') {
    const v = report?.estimate?.value ?? stat?.value?.median;
    if (v === undefined || !Number.isFinite(v)) return '';
    const unit = frame.unit.split(' ')[0] ?? '';
    return `${formatAmount(v)}${unit && unit.length <= 4 ? ` ${unit}` : ''}`;
  }
  const p = report?.probability ?? stat?.consensus;
  return typeof p === 'number' ? pct(p) : '';
}

/** How a driver or signpost's direction reads for this kind of question. */
export function directionWord(frame: Frame | null, push: 'yes' | 'no', favors: string): string {
  if (frame?.kind === 'choice') return favors || (push === 'yes' ? 'for' : 'against');
  if (frame?.kind === 'number') return push === 'yes' ? 'higher' : 'lower';
  return push === 'yes' ? 'YES' : 'NO';
}

/**
 * Where a value sits in a spread, 0 (lowest) to 1 (highest): how the
 * globe and the timeline colour a world on a number question.
 */
export function positionIn(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value) || !(hi > lo)) return 0.5;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

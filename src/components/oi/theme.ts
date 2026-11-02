/**
 * OSIRIS OI: the panel's design tokens.
 *
 * Forecast is gold and black. Gold leads: what is selected, what is live, the
 * prediction. Champagne (`alt`) is its quiet second, and ivory and greys
 * carry the rest. Red is kept for failure. Assist keeps the platform's blue
 * (`blue`), so the two ways of using OI never look alike. In Ghost the same
 * tokens follow that theme's violets.
 *
 * The arcs keep their own three colours, set in the Style Studio; OI shows
 * them only where it draws or explains the arcs (the legend, the graph's
 * lines), never as a way of marking things in its lists.
 */
import type { Frame, Link } from '@/lib/oi/types';

export const T = {
  gold: 'var(--gold-primary)',
  goldLight: 'var(--gold-light)',
  goldDim: 'var(--gold-dim)',
  /** Champagne: Forecast's second tone. */
  alt: 'var(--oi-alt)',
  /** Assist's blue: the platform's own cyan. */
  blue: 'var(--cyan-primary)',
  heading: 'var(--text-heading)',
  text: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  mute: 'var(--text-muted)',
  /** Small labels: a step brighter than muted, so they can be read on black. */
  label: 'var(--oi-label)',
  line: 'var(--border-secondary)',
  lineStrong: 'var(--border-primary)',
  active: 'var(--border-active)',
  red: 'var(--alert-red)',
  /** A price that rose, in Assist's market cards (with red for one that fell). */
  green: 'var(--alert-green)',
  /** The arcs' three colours, from the Style Studio. */
  support: 'var(--map-oi-support, #b388ff)',
  oppose: 'var(--map-oi-oppose, #ff5ccb)',
  neutral: 'var(--map-oi-neutral, #8c7cff)',
};

/**
 * The anchors a prediction is weighed against, told apart by tone on one gold
 * scale: the baseline in ivory, the crowd in champagne, the simulation in
 * gold, the prediction in bright gold.
 */
export const ANCHOR = { baseline: T.text, market: T.alt, simulation: T.gold, prediction: T.goldLight } as const;

export const gold = (a: number) => `rgba(var(--gold-rgb),${a})`;
export const alt = (a: number) => `rgba(var(--oi-alt-rgb),${a})`;
export const blue = (a: number) => `rgba(var(--cyan-rgb),${a})`;
export const ivory = (a: number) => `rgba(232,230,224,${a})`;
export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
/** The arcs' colour for a line's tone: for drawing the arcs and the graph's lines, and the legend that explains them. */
export const toneColor = (tone: Link['tone']) => (tone === 'support' ? T.support : tone === 'oppose' ? T.oppose : T.neutral);

/** A line's tone as OI writes it in its lists: aligned in gold, opposed in ivory, between in grey. */
export const toneInk = (tone: Link['tone']) => (tone === 'support' ? T.gold : tone === 'oppose' ? T.heading : T.label);

/** Toward YES (higher, or the outcome it favours) in gold; toward NO (lower) in ivory. */
export const leanTo = (push: 'yes' | 'no') => (push === 'yes' ? T.gold : T.text);

/** The HUD's small label: mono, spaced, upper case. */
export const LABEL = 'text-[9.5px] font-mono tracking-[0.14em] uppercase';
export const FIELD = 'w-full bg-black/50 border border-[var(--border-primary)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-active)] focus:shadow-[0_0_0_3px_rgba(var(--gold-rgb),0.08)] transition-[border-color,box-shadow]';
/** A surface laid over the busy globe or graph: OI's black, solid. */
export const SOLID = 'var(--oi-solid)';

export const pct = (p: number | null | undefined) => (p === null || p === undefined || !Number.isFinite(p) ? '—' : `${Math.round(p * 100)}%`);
export const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const shortName = (name: string) => name.replace(' (Alibaba Cloud)', '').replace(' (scripted, dev only)', '');

export const KIND_LABEL: Record<Frame['kind'], string> = { binary: 'Yes / no', choice: 'Which outcome', number: 'How much' };
export const KIND_SHORT: Record<Frame['kind'], string> = { binary: 'Yes / no', choice: 'Which', number: 'How much' };

export function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** A window around some values, at least `min` wide, so small moves still read as moves. */
export function fit(vals: number[], min: number): [number, number] {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const half = Math.max(min, (hi - lo) * 1.2) / 2;
  return [(lo + hi) / 2 - half, (lo + hi) / 2 + half];
}

/** A smooth line through points, for trajectories and sparklines. */
export function smooth(points: [number, number][]): string {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

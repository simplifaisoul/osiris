/**
 * Reading model output. Models are asked for JSON and mostly comply, but they
 * wrap it in prose, fence it in markdown, think out loud before it, leave
 * trailing commas and write "45%" for 0.45. Everything here is defensive: a
 * value that is missing or out of range becomes a safe default, never a crash,
 * and nothing the model writes reaches the page as markup (it is rendered as
 * text) or grows beyond a fixed length.
 */
import { centroidFor } from '@/lib/countryCentroids';
import { amount, answerText, normalizeShares, orderEstimate, uniform } from './forecast';
import { dateIn } from './clock';
import { parseCites, pushOf, sourceIds } from './sources';
import type {
  Actor, ActorKind, ContextItem, Driver, Estimate, Frame, Link, Located, Move, PathStep, Period, Persona, Report, Scenario, Signpost, SimEvent, Tone, WorldPoint,
} from './types';

/* ───────────────────────────── JSON ───────────────────────────── */

/** The first JSON object in a model's reply. Throws when there is none. */
export function extractJson(text: string): Record<string, unknown> {
  let s = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = s.indexOf('{');
  if (start < 0) throw new Error('no JSON object in the reply');
  s = s.slice(start);

  // Walk to the brace that closes the first one, minding strings.
  let depth = 0;
  let inString = false;
  let end = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  const body = end >= 0 ? s.slice(0, end + 1) : s;

  for (const candidate of [body, body.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const v = JSON.parse(candidate);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* try the next repair */ }
  }
  throw new Error('the reply was not valid JSON');
}

/* ───────────────────────────── Values ───────────────────────────── */

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A number in range, from a number or a numeric string. */
export function num(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

/**
 * A probability in [0.01, 0.99]. Reads 0.45, "0.45", 45 and "45%" alike.
 * Never 0 or 1: a world that has not settled the question is not certain of it; only a resolution is.
 */
export function prob(v: unknown, fallback: number): number {
  let n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) n /= 100;
  return clamp(n, 0.01, 0.99);
}

/** Plain text: control characters out, whitespace collapsed, cut to `max`. */
export function text(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  const s = String(v).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return fallback;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** A short id: lowercase letters, digits, underscore. */
export function slug(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) : '';
  return s || fallback;
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  return (options as readonly string[]).includes(s) ? (s as T) : fallback;
}

export function list(v: unknown, max: number): unknown[] {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** A model-given place. Falls back to the country's centroid, then to nowhere. (0, 0) is a missing value, not the Gulf of Guinea. */
export function locate(v: Record<string, unknown>, fallbackPlace = ''): Located {
  const place = text(v.place ?? v.location ?? v.city, 80, fallbackPlace);
  const lat = num(v.lat ?? v.latitude, -90, 90, NaN);
  const lng = num(v.lng ?? v.lon ?? v.longitude, -180, 180, NaN);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)
    && Math.abs(lat) <= 85;
  if (valid) return { place, lat: round4(lat), lng: round4(lng) };
  const c = centroidFor(typeof v.country === 'string' ? v.country.toUpperCase().slice(0, 2) : null);
  if (c) return { place, lat: c[1], lng: c[0] };
  return { place, lat: null, lng: null };
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Nodes that share a spot (three actors "in Washington") are fanned out on a
 * small ring, so arcs between them have length and their markers do not stack.
 */
export function spreadDuplicates<T extends Located>(nodes: T[], radiusDeg = 0.9): T[] {
  const groups = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (n.lat === null || n.lng === null) return;
    const k = `${n.lat.toFixed(1)},${n.lng.toFixed(1)}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const out = nodes.slice();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, j) => {
      const n = out[i];
      const a = (2 * Math.PI * j) / idx.length;
      const lat = clamp(n.lat! + radiusDeg * Math.sin(a), -85, 85);
      const lng = n.lng! + (radiusDeg * Math.cos(a)) / Math.max(0.2, Math.cos((n.lat! * Math.PI) / 180));
      out[i] = { ...n, lat: round4(lat), lng: round4(((lng + 540) % 360) - 180) };
    });
  }
  return out;
}

/* ───────────────────────────── The world model ───────────────────────────── */

const ACTOR_KINDS: readonly ActorKind[] = ['state', 'leader', 'organisation', 'company', 'market', 'group', 'place'];

const SUPPORT_RELATIONS = new Set(['alliance', 'ally', 'trade', 'supply', 'negotiation', 'cooperation', 'support', 'partnership']);
const OPPOSE_RELATIONS = new Set(['rivalry', 'rival', 'conflict', 'war', 'sanction', 'sanctions', 'hostility', 'competition', 'opposition']);

export function relationTone(kind: string): Tone {
  if (SUPPORT_RELATIONS.has(kind)) return 'support';
  if (OPPOSE_RELATIONS.has(kind)) return 'oppose';
  return 'neutral';
}

export interface WorldModel {
  frame: Frame;
  actors: Actor[];
  links: Link[];
}

/** The question's kind and its outcomes. A choice with fewer than two usable outcomes is asked as yes or no. */
export function parseKind(raw: Record<string, unknown>): Pick<Frame, 'kind' | 'outcomes' | 'unit' | 'prior' | 'anchor'> {
  let kind = oneOf(raw.kind, ['binary', 'choice', 'number'] as const, 'binary');
  const outcomes: string[] = [];
  for (const o of list(raw.outcomes, 6)) {
    const label = text(typeof o === 'object' && o ? (o as Record<string, unknown>).label ?? (o as Record<string, unknown>).name : o, 60);
    if (label && !outcomes.some(x => x.toLowerCase() === label.toLowerCase())) outcomes.push(label);
  }
  if (kind === 'choice' && outcomes.length < 2) kind = 'binary';
  const anchor = kind === 'number' ? amount(raw.anchor) : null;
  return {
    kind,
    outcomes: kind === 'choice' ? outcomes : [],
    unit: kind === 'number' ? text(raw.unit, 40) : '',
    prior: kind === 'choice' ? normalizeShares(raw.prior, outcomes, uniform(outcomes.length)) : [],
    anchor,
  };
}

export function parseWorld(raw: Record<string, unknown>, question: string, context: ContextItem[]): WorldModel {
  const focusRaw = obj(raw.focus);
  const focus = locate(focusRaw);
  const frame: Frame = {
    question,
    ...parseKind(raw),
    proposition: text(raw.proposition, 300, question),
    resolution: text(raw.resolution, 400),
    horizon: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.horizon ?? '')) ? String(raw.horizon) : '',
    baseRate: prob(raw.base_rate ?? raw.baseRate, 0.5),
    baseRateReason: text(raw.base_rate_reason ?? raw.baseRateReason, 400),
    focus: focus.lat === null && !focus.place ? null : focus,
  };
  // The price the question turns on, when the research found it: a ticker the model names without data behind it is dropped.
  const m = obj(raw.measure);
  const symbol = text(m.symbol, 20).toUpperCase();
  const priced = symbol ? context.find(c => c.kind === 'series' && c.symbol?.toUpperCase() === symbol) : undefined;
  if (priced?.symbol) {
    const level = amount(m.threshold ?? m.level);
    frame.measure = {
      symbol: priced.symbol,
      ...(frame.kind === 'binary' && level !== null && level > 0 ? {
        threshold: level,
        direction: oneOf(m.direction, ['above', 'below'] as const, 'above'),
        touch: m.touch !== false && m.touch !== 'false',
      } : {}),
    };
  }
  // The prediction market that asks this same question, when one does.
  const market = text(raw.market, 8).toLowerCase();
  if (market && context.some(c => c.kind === 'odds' && c.id === market)) frame.market = market;

  const actors: Actor[] = [];
  const ids = new Set<string>();
  for (const [i, a] of list(raw.actors, 16).entries()) {
    const o = obj(a);
    const name = text(o.name, 80);
    if (!name) continue;
    let id = slug(o.id ?? name, `actor_${i + 1}`);
    while (ids.has(id)) id = `${id}_${i}`;
    ids.add(id);
    actors.push({
      id,
      name,
      kind: oneOf(o.kind, ACTOR_KINDS, 'group'),
      role: text(o.role, 200),
      lean: num(o.lean, -1, 1, 0),
      ...locate(o),
    });
  }
  const placed = spreadDuplicates(actors);

  const links: Link[] = [];
  const pairs = new Set<string>();
  for (const r of list(raw.relations, 28)) {
    const o = obj(r);
    const from = slug(o.from, '');
    const to = slug(o.to, '');
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    const pair = [from, to].sort().join('|');
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    const kind = text(o.kind, 24, 'influence').toLowerCase();
    links.push({
      id: `rel:${pair}`,
      from: `a:${from}`,
      to: `a:${to}`,
      kind: 'relation',
      tone: relationTone(kind),
      strength: num(o.strength, 0, 1, 0.5),
      label: text(o.note, 160, kind),
      round: 0,
    });
  }

  const ctxIds = new Set(context.map(c => c.id));
  for (const [i, e] of list(raw.evidence, 24).entries()) {
    const o = obj(e);
    const source = text(o.source, 12).toLowerCase();
    const actor = slug(o.actor, '');
    if (!ctxIds.has(source) || !ids.has(actor)) continue;
    const effect = oneOf(o.effect, ['yes', 'no', 'neutral'] as const, 'neutral');
    links.push({
      id: `ev:${source}:${actor}:${i}`,
      from: `c:${source}`,
      to: `a:${actor}`,
      kind: 'evidence',
      tone: effect === 'yes' ? 'support' : effect === 'no' ? 'oppose' : 'neutral',
      strength: 0.5,
      label: text(o.note, 160),
      round: 0,
    });
  }

  return { frame, actors: placed, links };
}

/* ───────────────────────────── The simulation ───────────────────────────── */

/**
 * The cast: up to \`count\` actors from the world model, each with what it
 * wants, what it can do, what it will not accept and how it decides. Actors
 * the world model did not name are ignored, as are repeats.
 */
export function parseCast(raw: Record<string, unknown>, count: number, actorIds: Set<string>): { id: string; persona: Persona }[] {
  const out: { id: string; persona: Persona }[] = [];
  for (const c of list(raw.cast ?? raw.actors, count + 6)) {
    const o = obj(c);
    const id = slug(o.id ?? o.actor, '');
    if (!actorIds.has(id) || out.some(x => x.id === id)) continue;
    out.push({
      id,
      persona: {
        goal: text(o.goal, 240, 'Advance its own interests'),
        levers: list(o.levers, 4).map(l => text(l, 140)).filter(Boolean),
        redLines: text(o.red_lines ?? o.redLines, 220),
        style: text(o.style, 180),
      },
    });
    if (out.length >= count) break;
  }
  return out;
}

const STANCES = ['cooperate', 'pressure', 'oppose', 'hold'] as const;

/**
 * One actor's move. Throws when the reply says nothing the actor does: a move
 * is an action, and an actor that names none is asked again.
 */
export function parseMove(
  raw: Record<string, unknown>, actor: string, world: string, period: number, actorIds: Set<string>,
  frame?: Pick<Frame, 'kind' | 'outcomes'>,
  /** What each citable source says, to check the move's quotes against. */
  sources?: Map<string, string>,
): Move {
  const action = text(raw.action ?? raw.move, 240);
  if (!action) throw new Error('no action in the reply');
  const targets = list(Array.isArray(raw.targets) ? raw.targets : raw.target ? [raw.target] : [], 3)
    .map(t => slug(t, '')).filter((t, i, a) => actorIds.has(t) && t !== actor && a.indexOf(t) === i);
  const outcomes = frame?.kind === 'choice' ? frame.outcomes : [];
  const favors = favored(raw.favors, outcomes);
  const why = text(raw.why ?? raw.reasoning, 240);
  return {
    id: `${world}:${actor}:${period}`,
    world,
    period,
    actor,
    action,
    statement: text(raw.statement ?? raw.says, 300),
    targets,
    stance: oneOf(raw.stance, STANCES, targets.length ? 'pressure' : 'hold'),
    push: frame?.kind === 'choice' ? (favors ? 'yes' : 'neutral') : pushOf(raw.effect ?? raw.push),
    ...(favors ? { favors } : {}),
    why,
    cites: sources ? parseCites(raw.cites ?? raw.citations ?? raw.quotes, sources, 2, outcomes) : [],
  };
}

/**
 * The world engine's step: what happened in one period of one world (one to
 * four events, dated inside the period, at most one of them a surprise), and
 * where the question then stands. A figure the reply leaves out falls back on
 * the world's last one, then on the frame's prior; a number question with
 * neither throws, and the step is asked again.
 */
/**
 * The world engine's step: the period's events, where the question stands,
 * and, on a price question (`priced`), how far the events push the price
 * beyond its own course (`push`, a fraction, at most ±30%). On a price
 * question the price decides the standing, so a reply without one is fine.
 */
export function parseStep(
  raw: Record<string, unknown>, world: string, period: Period, actorIds: Set<string>,
  frame: Pick<Frame, 'kind' | 'outcomes' | 'baseRate' | 'prior' | 'anchor'>,
  last: WorldPoint | null,
  priced = false,
): { events: SimEvent[]; point: WorldPoint; push: number } {
  const outcomes = frame.kind === 'choice' ? frame.outcomes : [];
  const events: SimEvent[] = [];
  let shocks = 0;
  for (const e of list(raw.events, 6)) {
    const o = obj(e);
    const title = text(o.title ?? o.event, 140);
    if (!title) continue;
    const kind = oneOf(o.kind, ['event', 'shock'] as const, 'event');
    if (kind === 'shock' && shocks++ > 0) continue;
    const favors = favored(o.favors, outcomes);
    events.push({
      id: `${world}:${period.index}:${events.length + 1}`,
      world,
      period: period.index,
      date: dateIn(o.date, period),
      title,
      detail: text(o.detail ?? o.description, 360),
      actors: list(o.actors, 4).map(a => slug(a, '')).filter(a => actorIds.has(a)),
      push: frame.kind === 'choice' ? (favors ? 'yes' : 'neutral') : pushOf(o.effect ?? o.push),
      ...(favors ? { favors } : {}),
      kind,
      ...locate(o),
    });
    if (events.length >= 4) break;
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const st = obj(raw.state ?? raw.standing);
  const note = text(st.note ?? st.summary, 240);
  const said = text(st.resolved, 60).toLowerCase();
  const pushed = amount(raw.price_push ?? st.price_push);
  // A model that writes 8 for 8% means 0.08.
  const push = pushed === null ? 0 : clamp(Math.abs(pushed) > 1 ? pushed / 100 : pushed, -0.3, 0.3);
  if (frame.kind === 'choice') {
    const won = said && said !== 'null' && said !== 'none' ? favored(st.resolved, outcomes) : '';
    const shares = won
      ? outcomes.map(o => (o === won ? 1 : 0))
      : normalizeShares(st.shares ?? st.distribution, outcomes, last?.shares ?? (frame.prior.length === outcomes.length ? frame.prior : uniform(outcomes.length)));
    return { events, point: { world, period: period.index, probability: Math.max(...shares), shares, resolved: won || null, note }, push };
  }
  if (frame.kind === 'number') {
    const value = amount(st.value ?? st.estimate) ?? last?.value ?? frame.anchor;
    if ((value === null || value === undefined) && !priced) throw new Error('no value in the reply');
    return { events, point: { world, period: period.index, probability: 0.5, value: value ?? 0, resolved: null, note }, push };
  }
  const resolved = /^y(es)?$/.test(said) ? 'yes' : /^no?$/.test(said) ? 'no' : null;
  const probability = resolved === 'yes' ? 0.99 : resolved === 'no' ? 0.01 : prob(st.probability ?? st.p, last?.probability ?? frame.baseRate);
  return { events, point: { world, period: period.index, probability, resolved, note }, push };
}

/* ───────────────────────────── The report ───────────────────────────── */

/** A direction as a model writes it: yes/no, up/down, higher/lower, for/against. */
function direction(v: unknown): 'yes' | 'no' {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  return /^(no|down|lower|against|decrease|less)/.test(s) ? 'no' : 'yes';
}

/** The outcome a driver or signpost helps, matched to the frame's labels. */
function favored(v: unknown, outcomes: string[]): string {
  const s = text(v, 60).toLowerCase();
  if (!s) return '';
  return outcomes.find(o => o.toLowerCase() === s) ?? outcomes.find(o => s.includes(o.toLowerCase()) || o.toLowerCase().includes(s)) ?? '';
}

/**
 * The report. `swarm` is where the simulation ended: a binary question's
 * pooled P(YES), a choice question's pooled shares, a number question's
 * pooled estimate. The report agent's figures override it only where they
 * parse. The predicted path keeps its steps in date order.
 */
export function parseReport(
  raw: Record<string, unknown>,
  swarm: { probability: number; shares?: number[]; estimate?: Estimate },
  actorIds: Set<string>,
  frame?: Pick<Frame, 'kind' | 'outcomes' | 'unit'>,
  /** The ids a driver may cite. */
  sources?: Set<string>,
  /** The simulated worlds, by id. */
  worldIds?: Set<string>,
): Report {
  const outcomes = frame?.kind === 'choice' ? frame.outcomes : [];
  const drivers: Driver[] = list(raw.drivers, 6).map(d => {
    const o = obj(d);
    const actor = slug(o.actor, '');
    return {
      text: text(o.text, 220),
      push: direction(o.push),
      favors: favored(o.favors ?? o.push, outcomes),
      weight: num(o.weight, 0, 1, 0.5),
      actor: actorIds.has(actor) ? actor : null,
      ...(sources ? { sources: sourceIds(o.sources ?? o.source, sources) } : {}),
    };
  }).filter(d => d.text);

  const scenarios: Scenario[] = list(raw.scenarios, 4).map(s => {
    const o = obj(s);
    return { name: text(o.name, 80), probability: num(o.probability, 0, 1, 0), description: text(o.description, 360), ...locate(o) };
  }).filter(s => s.name);
  // Scenarios are alternatives: make them add up, whatever the model wrote.
  const total = scenarios.reduce((t, s) => t + s.probability, 0);
  if (total > 0) for (const s of scenarios) s.probability = Math.round((s.probability / total) * 100) / 100;

  const signposts: Signpost[] = list(raw.signposts, 6).map(s => {
    const o = obj(s);
    return { text: text(o.text, 220), means: direction(o.means), favors: favored(o.favors ?? o.means, outcomes), ...locate(o) };
  }).filter(s => s.text);

  let probability = prob(raw.probability, swarm.probability);
  let shares: number[] | undefined;
  let estimate: Estimate | undefined;
  if (frame?.kind === 'choice') {
    shares = normalizeShares(raw.shares ?? raw.distribution, outcomes, swarm.shares ?? uniform(outcomes.length));
    probability = Math.max(...shares);
  } else if (frame?.kind === 'number') {
    const e = obj(raw.estimate);
    const value = amount(raw.estimate !== null && typeof raw.estimate === 'object' ? e.value : raw.estimate);
    estimate = value === null && swarm.estimate ? swarm.estimate
      : value === null ? undefined
      : orderEstimate(value, amount(e.low ?? raw.low), amount(e.high ?? raw.high));
    probability = 0.5;
  }
  const report: Report = {
    headline: text(raw.headline, 120, 'Prediction'),
    answer: '',
    probability,
    swarm: swarm.probability,
    ...(shares ? { shares } : {}),
    ...(estimate ? { estimate } : {}),
    confidence: oneOf(raw.confidence, ['low', 'medium', 'high'] as const, 'medium'),
    summary: text(raw.summary, 1200),
    drivers,
    scenarios,
    signposts,
    dissent: text(raw.dissent, 400),
    caveats: list(raw.caveats, 5).map(c => text(c, 200)).filter(Boolean),
    deviation: text(raw.deviation_reason ?? raw.deviation, 300),
    path: list(raw.path ?? raw.timeline, 10).map((p): PathStep => {
      const o = obj(p);
      const date = text(o.date, 10);
      return {
        date: /^\d{4}-\d{2}(-\d{2})?$/.test(date) ? date : '',
        title: text(o.title ?? o.event, 160),
        detail: text(o.detail ?? o.description, 320),
        actors: list(o.actors, 4).map(a => slug(a, '')).filter(a => actorIds.has(a)),
      };
    }).filter(p => p.title).sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0)),
    actorMoves: list(raw.actor_moves ?? raw.actorMoves, 10).map(m => {
      const o = obj(m);
      return { actor: slug(o.actor ?? o.id, ''), prediction: text(o.prediction ?? o.move, 260) };
    }).filter(m => actorIds.has(m.actor) && m.prediction),
    worlds: list(raw.worlds, 8).map(w => {
      const o = obj(w);
      return { world: text(o.world ?? o.id, 12).replace(/^world\s*/i, '').slice(0, 2).toUpperCase(), outcome: text(o.outcome, 140), summary: text(o.summary, 260) };
    }).filter(w => w.outcome && (!worldIds || worldIds.has(w.world))),
  };
  report.answer = frame ? answerText({ ...emptyFrame, ...frame }, report, null) : `${Math.round(probability * 100)}% YES`;
  return report;
}

/** The fields answerText needs beyond the kind, when a caller has only part of a frame. */
const emptyFrame: Frame = {
  question: '', kind: 'binary', proposition: '', resolution: '', horizon: '', outcomes: [], unit: '',
  baseRate: 0.5, prior: [], anchor: null, baseRateReason: '', focus: null,
};

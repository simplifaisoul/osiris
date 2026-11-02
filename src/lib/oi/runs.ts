/**
 * Runs in flight and recently finished, held in this process's memory.
 *
 * - A run is public to anyone holding its id (a random UUID), so it can be
 *   shared and watched. Changing it (injecting an event, cancelling) needs the
 *   run token handed only to whoever started it.
 * - The visitor's key lives in the closure of the run's chat function and
 *   nowhere else. It is not on the record, so it goes when the run ends.
 * - Limits keep one visitor, or everyone at once, from tying the server up.
 *
 * The store hangs off globalThis so every route bundle (and a dev reload)
 * sees the same runs.
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DEPTHS, FatalError, runEngine, type EngineDeps } from './engine';
import type { SeedScope } from './depths';
import { createChat, providerInfo, scrub, type ChatFn, type ProviderId } from './providers';
import { applyEvent, currentAnswer, initialState, type RunState } from './state';
import { pointView } from './forecast';
import { worldOutcome } from './prompts';
import { text } from './parse';
import type { ContextItem, Depth, OiEvent, Stamped } from './types';

export const LIMITS = {
  /** Runs one address may have going at once. */
  perIpActive: 2,
  /** Runs one address may start per window. */
  perIpStarts: 8,
  windowMs: 10 * 60_000,
  /** Runs the whole server will have going at once. */
  globalActive: Number(process.env.OI_MAX_ACTIVE) || 24,
  /** Runs kept in memory, finished ones evicted oldest first. */
  maxRuns: 150,
  /** How long a finished run stays watchable. */
  ttlMs: 3 * 3_600_000,
  maxEvents: 4000,
  maxInjects: 8,
  /** A run that is still going after this is stopped. */
  deadlineMs: 20 * 60_000,
};

export interface Run {
  id: string;
  token: string;
  ip: string;
  createdAt: number;
  finishedAt: number | null;
  events: Stamped[];
  state: RunState;
  listeners: Set<(e: Stamped) => void>;
  abort: AbortController;
  injects: string[];
  injectCount: number;
}

interface Store {
  runs: Map<string, Run>;
  starts: Map<string, number[]>;
}

const g = globalThis as unknown as { __osirisOi?: Store };
const store: Store = (g.__osirisOi ??= { runs: new Map(), starts: new Map() });

export interface StartInput {
  question: string;
  seed: string;
  seedScope?: SeedScope;
  depth: Depth;
  useFeeds: boolean;
  provider: ProviderId;
  model: string;
  key: string;
  ip: string;
}

export interface StartDeps {
  /** For tests: a chat function in place of the provider's. */
  chat?: ChatFn;
  gather?: (question: string, seed: string, limit: number) => Promise<ContextItem[]>;
  research?: EngineDeps['research'];
  concurrency?: number;
}

export type StartResult = { ok: true; run: Run } | { ok: false; status: number; error: string };

const active = (r: Run) => r.state.status === 'running';

/** The abort reason a cancel uses, to tell it apart from a failure. */
const CANCELLED = Symbol('cancelled');

function prune(now = Date.now()) {
  for (const [id, r] of store.runs) {
    if (r.finishedAt && now - r.finishedAt > LIMITS.ttlMs) store.runs.delete(id);
  }
  if (store.runs.size > LIMITS.maxRuns) {
    const finished = [...store.runs.values()].filter(r => r.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!);
    for (const r of finished.slice(0, store.runs.size - LIMITS.maxRuns)) store.runs.delete(r.id);
  }
  for (const [ip, times] of store.starts) {
    const kept = times.filter(t => now - t < LIMITS.windowMs);
    if (kept.length) store.starts.set(ip, kept);
    else store.starts.delete(ip);
  }
}

/** Events that may be dropped once a run's log is full. The ones that matter are always kept. */
const DROPPABLE = new Set(['thinking', 'warn', 'link', 'usage']);

function emit(run: Run, e: OiEvent) {
  const stamped = { ...e, seq: run.state.lastSeq + 1, at: Date.now() } as Stamped;
  if (run.events.length >= LIMITS.maxEvents && DROPPABLE.has(e.t)) return;
  run.events.push(stamped);
  run.state = applyEvent(run.state, stamped);
  for (const l of run.listeners) {
    try { l(stamped); } catch { /* a listener's failure is its own */ }
  }
}

export function startRun(input: StartInput, deps: StartDeps = {}): StartResult {
  const now = Date.now();
  prune(now);
  const runs = [...store.runs.values()];
  if (runs.filter(active).length >= LIMITS.globalActive) {
    return { ok: false, status: 503, error: 'OI is at capacity. Try again in a few minutes.' };
  }
  if (runs.filter(r => active(r) && r.ip === input.ip).length >= LIMITS.perIpActive) {
    return { ok: false, status: 429, error: `You already have ${LIMITS.perIpActive} runs going. Wait for one to finish or cancel it.` };
  }
  const starts = store.starts.get(input.ip) ?? [];
  if (starts.length >= LIMITS.perIpStarts) {
    return { ok: false, status: 429, error: 'Too many runs started from your address. Try again in a few minutes.' };
  }
  store.starts.set(input.ip, [...starts, now]);

  const run: Run = {
    id: randomUUID(),
    token: randomBytes(24).toString('base64url'),
    ip: input.ip,
    createdAt: now,
    finishedAt: null,
    events: [],
    state: initialState(),
    listeners: new Set(),
    abort: new AbortController(),
    injects: [],
    injectCount: 0,
  };
  store.runs.set(run.id, run);

  const depth = DEPTHS[input.depth];
  emit(run, { t: 'start', question: input.question, depth: input.depth, provider: input.provider, model: input.model, actors: depth.actors, periods: depth.periods, worlds: depth.worlds });

  const chat = deps.chat ?? createChat(input.provider, input.key, input.model);
  const key = input.key;
  const deadline = setTimeout(() => run.abort.abort(new Error('The run took too long and was stopped.')), LIMITS.deadlineMs);

  void runEngine(
    { question: input.question, seed: input.seed, seedScope: input.seedScope, depth: input.depth, useFeeds: input.useFeeds },
    {
      chat,
      concurrency: deps.concurrency ?? providerInfo(input.provider).concurrency,
      emit: e => emit(run, e),
      signal: run.abort.signal,
      takeInjects: () => run.injects.splice(0),
      gather: deps.gather,
      research: deps.research,
    },
  ).then(
    () => emit(run, { t: 'end', status: 'done' }),
    (err: unknown) => {
      const reason = run.abort.signal.reason;
      if (run.abort.signal.aborted && reason === CANCELLED) {
        emit(run, { t: 'end', status: 'cancelled', message: 'Cancelled.' });
        return;
      }
      const raw = run.abort.signal.aborted && reason instanceof Error ? reason.message
        : err instanceof FatalError || err instanceof Error ? err.message : 'The run failed.';
      emit(run, { t: 'end', status: 'failed', message: scrub(raw, key).slice(0, 300) });
    },
  ).finally(() => {
    clearTimeout(deadline);
    run.finishedAt = Date.now();
    run.injects = [];
    // Watchers are told by the 'end' event; nothing more will come.
    run.listeners.clear();
  });

  return { ok: true, run };
}

export function getRun(id: string): Run | undefined {
  prune();
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? store.runs.get(id) : undefined;
}

/** True when `token` is this run's token, compared in constant time. */
export function ownsRun(run: Run, token: unknown): boolean {
  if (typeof token !== 'string' || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(run.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cancelRun(run: Run): boolean {
  if (!active(run)) return false;
  run.abort.abort(CANCELLED);
  return true;
}

export type InjectResult = { ok: true } | { ok: false; status: number; error: string };

/** Queue an event to land in every world at the start of the next period. */
export function injectEvent(run: Run, raw: unknown): InjectResult {
  const t = text(raw, 400);
  if (t.length < 3) return { ok: false, status: 400, error: 'Describe the event in a few words.' };
  if (!active(run)) return { ok: false, status: 409, error: 'This run has finished.' };
  if (run.state.phase === 'report') return { ok: false, status: 409, error: 'The report is being written; it is too late to inject.' };
  if (run.injectCount >= LIMITS.maxInjects) return { ok: false, status: 429, error: `At most ${LIMITS.maxInjects} events per run.` };
  run.injectCount++;
  run.injects.push(t);
  return { ok: true };
}

/** Replays events after `after`, then follows the run live. Returns the unsubscribe. */
export function subscribe(run: Run, after: number, listener: (e: Stamped) => void): () => void {
  for (const e of run.events) if (e.seq > after) listener(e);
  if (!active(run)) return () => {};
  run.listeners.add(listener);
  return () => { run.listeners.delete(listener); };
}

const MAX_WAITS_PER_IP = 6;
const waits = ((globalThis as unknown as { __osirisOiWaits?: Map<string, number> }).__osirisOiWaits ??= new Map());

/**
 * A slot for one held-open wait (a long-poll, an MCP call waiting on a run),
 * or null when this address already holds its share. Call the returned
 * function to give the slot back. Without this, one client could park
 * hundreds of connections on the server, each waiting minutes.
 */
export function waitSlot(ip: string): (() => void) | null {
  const n = waits.get(ip) ?? 0;
  if (n >= MAX_WAITS_PER_IP) return null;
  waits.set(ip, n + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (waits.get(ip) ?? 1) - 1;
    if (left > 0) waits.set(ip, left);
    else waits.delete(ip);
  };
}

/** Resolves when the run ends, the time is up, or `signal` aborts. */
export function waitForEnd(run: Run, ms: number, signal?: AbortSignal): Promise<void> {
  if (!active(run) || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const unsubscribe = subscribe(run, run.state.lastSeq, e => { if (e.t === 'end') finish(); });
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/* ───────────────────────────── Views ───────────────────────────── */

const pct = (p: number | null | undefined) => (typeof p === 'number' && Number.isFinite(p) ? Math.round(p * 1000) / 10 : null);

/** A compact, JSON-ready account of a run: what an API caller or an MCP client reads. */
export function runSummary(run: Run, origin: string) {
  const s = run.state;
  const last = s.rounds[s.rounds.length - 1];
  const latest = new Map(s.points.map(p => [p.world, p]));
  return {
    id: run.id,
    status: s.status,
    phase: s.phase,
    phase_label: s.phaseLabel,
    message: s.message || undefined,
    question: s.question,
    depth: s.depth,
    provider: s.provider,
    model: s.model,
    watch_url: watchUrl(origin, run.id),
    kind: s.frame?.kind,
    answer: currentAnswer(s) || undefined,
    probability_pct: s.frame?.kind === 'number' ? undefined : pct(s.report?.probability ?? last?.consensus),
    proposition: s.frame?.proposition,
    outcomes: s.frame?.kind === 'choice' ? s.frame.outcomes : undefined,
    unit: s.frame?.kind === 'number' ? s.frame.unit : undefined,
    resolution: s.frame?.resolution,
    horizon: s.frame?.horizon || undefined,
    base_rate_pct: s.frame?.kind === 'binary' ? pct(s.frame.baseRate) : undefined,
    prior_pct: s.frame?.kind === 'choice' ? s.frame.prior.map(p => pct(p)) : undefined,
    anchor: s.frame?.kind === 'number' ? s.frame.anchor : undefined,
    // What the prediction rests on besides the simulation: the price's own history, and the prediction market on the same question.
    measure: s.frame?.measure ?? undefined,
    baseline: s.quant ? {
      symbol: s.quant.symbol, price: s.quant.price, as_of: s.quant.asOf, volatility_pct: pct(s.quant.vol), horizon_days: s.quant.days,
      probability_pct: s.quant.probability !== undefined ? pct(s.quant.probability) : undefined,
      p10: s.quant.p10, p50: s.quant.p50, p90: s.quant.p90, method: s.quant.method,
      // How the method has done on this instrument's own past: forecasts from the year before each day, against what happened.
      // The chance of trading at each level by the horizon, from the price's own history and, once run, the simulation.
      curve: s.quant.curve?.map(c => ({ level: c.level, probability_pct: pct(c.probability) })),
      simulated_curve: s.quant.simulated?.curve?.map(c => ({ level: c.level, probability_pct: pct(c.probability) })),
      record: s.quant.backtest ? { forecasts: s.quant.backtest.n, from: s.quant.backtest.from, to: s.quant.backtest.to, calibration_gap_pts: Math.round(s.quant.backtest.gap * 1000) / 10, brier: s.quant.backtest.brier, hindsight_brier: s.quant.backtest.reference, bins: s.quant.backtest.bins } : undefined,
      simulated: s.quant.simulated ? {
        probability_pct: s.quant.simulated.probability !== undefined ? pct(s.quant.simulated.probability) : undefined,
        p10: s.quant.simulated.p10, p50: s.quant.simulated.p50, p90: s.quant.simulated.p90,
      } : undefined,
    } : undefined,
    market: s.frame?.market ?? undefined,
    progress: {
      periods_done: s.rounds.length,
      periods_planned: s.periodsPlanned,
      worlds: s.worlds.length || s.worldsPlanned,
      actors_cast: s.actors.filter(a => a.persona).length,
      moves: s.moves.length,
      events: s.events.length,
      actors: s.actors.length,
      links: s.links.length,
      context_items: s.context.length,
    },
    // The simulated clock, and the worlds pooled at the end of each period.
    periods: s.periods,
    pooled: s.rounds.map(r => (s.frame?.kind === 'number' && r.value
      ? { period: r.round, median: r.value.median, low: r.value.low, high: r.value.high, worlds: r.n }
      : s.frame?.kind === 'choice' && r.shares
        ? { period: r.round, shares_pct: r.shares.map(x => pct(x)), worlds_leaning: r.votes, worlds: r.n }
        : { period: r.round, probability_pct: pct(r.consensus), lowest_pct: pct(r.min), highest_pct: pct(r.max), worlds: r.n })),
    report: s.report ? {
      headline: s.report.headline,
      answer: s.report.answer,
      probability_pct: s.frame?.kind === 'number' ? undefined : pct(s.report.probability),
      swarm_pct: s.frame?.kind === 'number' ? undefined : pct(s.report.swarm),
      shares_pct: s.report.shares?.map(x => pct(x)),
      estimate: s.report.estimate,
      confidence: s.report.confidence,
      summary: s.report.summary,
      drivers: s.report.drivers,
      scenarios: s.report.scenarios.map(x => ({ ...x, probability_pct: pct(x.probability) })),
      signposts: s.report.signposts,
      dissent: s.report.dissent,
      caveats: s.report.caveats,
      deviation: s.report.deviation || undefined,
      path: s.report.path,
      actor_moves: s.report.actorMoves,
      worlds: s.report.worlds,
    } : null,
    actors: s.actors.map(a => ({ id: a.id, name: a.name, kind: a.kind, place: a.place, lat: a.lat, lng: a.lng, role: a.role, lean: a.lean, persona: a.persona })),
    // What the actors and the report quoted: the ids in drivers' `sources` and moves' `quotes` point here.
    sources: s.context.map(c => ({
      id: c.id, kind: c.kind, title: c.title, source: c.source, url: c.url, excerpt: c.excerpt, place: c.place || undefined, published: c.published || undefined,
      ...(c.odds ? {
        odds: {
          platform: c.odds.platform, probability_pct: pct(c.odds.probability), volume: c.odds.volume, closes: c.odds.closes || undefined,
          // A rung of a price ladder: the crowd's price on every level.
          ladder: c.odds.ladder?.map(r => ({ level: r.level, direction: r.direction, probability_pct: pct(r.probability) })),
        },
      } : {}),
      ...(c.symbol ? { symbol: c.symbol } : {}),
      quoted: s.links.filter(l => l.kind === 'cite' && l.to === `c:${c.id}`).length,
    })),
    // Each world as it stands: its figure, how it ended, and its events in date order.
    worlds: s.worlds.map(w => {
      const p = latest.get(w);
      return {
        world: w,
        view: p ? pointView(p, s.frame) : undefined,
        outcome: s.frame && p ? worldOutcome(s.frame, p) : undefined,
        note: p?.note,
        events: s.events.filter(e => e.world === w).map(e => ({ date: e.date, title: e.title, detail: e.detail, kind: e.kind, actors: e.actors, place: e.place || undefined })),
      };
    }),
    injected: s.injects,
    usage: s.usage,
    warnings: s.warnings.length ? s.warnings : undefined,
    started_at: new Date(s.startedAt || run.createdAt).toISOString(),
    updated_at: new Date(s.updatedAt || run.createdAt).toISOString(),
  };
}

export function watchUrl(origin: string, id: string): string {
  return `${origin}/?oi=${id}`;
}

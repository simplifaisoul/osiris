'use client';
/**
 * OI in the browser: the visitor's engine settings and key, the run
 * they are watching (followed over Server-Sent Events and folded with the
 * same applyEvent the server uses), their history, and the calls that start,
 * steer and question a run.
 *
 * The key is kept in this browser only: in localStorage if the visitor asks
 * to be remembered, otherwise in sessionStorage, which the tab forgets when it
 * closes. It travels to OSIRIS in a header on each call that needs it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from './providers';
import { applyEvent, currentAnswer, currentProbability, initialState, type RunState } from './state';
import { directionWord, formatAmount } from './forecast';
import { ladderGaps, ladderSentence, readLadder } from './ladder';
import { recordSentence } from './quant';
import { questionBlock, trajectoryLine } from './prompts';
import type { Citation, Depth, RunStatus, Stamped } from './types';
import type { SeedScope } from './depths';

export interface Engine {
  provider: ProviderId;
  model: string;
  remember: boolean;
}

export interface HistoryEntry {
  id: string;
  question: string;
  at: number;
  probability: number | null;
  /** The answer in words, whatever kind of question it was. */
  answer?: string;
  status: RunStatus;
  provider: string;
  model: string;
}

const ENGINE_KEY = 'osiris.oi.engine';
const HISTORY_KEY = 'osiris.oi.history';
const TOKENS_KEY = 'osiris.oi.tokens';
const keySlot = (p: string) => `osiris.oi.key.${p}`;
const HISTORY_CAP = 25;

function store(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}
function read(kind: 'local' | 'session', k: string): string | null {
  try { return store(kind)?.getItem(k) ?? null; } catch { return null; }
}
function write(kind: 'local' | 'session', k: string, v: string | null) {
  try {
    const s = store(kind);
    if (!s) return;
    if (v === null) s.removeItem(k);
    else s.setItem(k, v);
  } catch { /* storage full or blocked: settings just do not persist */ }
}

export function loadEngine(): Engine | null {
  try {
    const e = JSON.parse(read('local', ENGINE_KEY) || 'null');
    if (e && typeof e.provider === 'string' && typeof e.model === 'string') return { provider: e.provider, model: e.model, remember: Boolean(e.remember) };
  } catch { /* corrupt: start over */ }
  return null;
}

export function saveEngine(e: Engine) {
  write('local', ENGINE_KEY, JSON.stringify(e));
}

export function loadKey(provider: string): string {
  return read('local', keySlot(provider)) || read('session', keySlot(provider)) || '';
}

/** Keeps the key where the visitor chose, and removes it from the other place. */
export function saveKey(provider: string, key: string, remember: boolean) {
  write(remember ? 'local' : 'session', keySlot(provider), key || null);
  write(remember ? 'session' : 'local', keySlot(provider), null);
}

export function forgetKey(provider: string) {
  write('local', keySlot(provider), null);
  write('session', keySlot(provider), null);
}

function loadHistory(): HistoryEntry[] {
  try {
    const h = JSON.parse(read('local', HISTORY_KEY) || '[]');
    return Array.isArray(h) ? h.filter(x => x && typeof x.id === 'string' && typeof x.question === 'string').slice(0, HISTORY_CAP) : [];
  } catch { return []; }
}

function tokens(): Record<string, string> {
  try { return JSON.parse(read('session', TOKENS_KEY) || '{}') || {}; } catch { return {}; }
}

/** Puts the run in the address (or takes it out), leaving the other parameters exactly as they were written. */
function setUrlRun(id: string | null) {
  try {
    const { pathname, search, hash } = window.location;
    const rest = search.replace(/^\?/, '').split('&').filter(p => p && !p.startsWith('oi='));
    if (id) rest.push(`oi=${id}`);
    window.history.replaceState(window.history.state, '', `${pathname}${rest.length ? `?${rest.join('&')}` : ''}${hash}`);
  } catch { /* not in a browser */ }
}

/** The headers that carry an engine and key on every OI request. */
export const headersFor = (engine: Engine, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-oi-provider': engine.provider,
  'x-oi-model': engine.model,
  ...(key ? { 'x-oi-key': key } : {}),
});

/** What went wrong, in OI's words if it gave any. */
export async function errorOf(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === 'string' ? body.error : '') || `OI answered ${res.status}.`;
}

export interface StartInput {
  question: string;
  seed: string;
  seedScope?: SeedScope;
  depth: Depth;
  useFeeds: boolean;
}

export function useOi() {
  const [state, setState] = useState<RunState | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Read from this browser on the first client render; the server has no storage and renders none.
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [token, setToken] = useState<string | null>(null);
  const source = useRef<EventSource | null>(null);
  const queue = useRef<Stamped[]>([]);
  const frame = useRef(0);
  /** The run as folded so far, and whose it is: the stream handler reads these outside React's render. */
  const latest = useRef<RunState | null>(null);
  const following = useRef<string | null>(null);

  /** Keeps the history entry in step with how a run ended. */
  const record = useCallback((id: string, s: RunState) => {
    const probability = currentProbability(s);
    const answer = currentAnswer(s) || undefined;
    setHistory(h => {
      const i = h.findIndex(x => x.id === id);
      if (i < 0 || (h[i].status === s.status && h[i].probability === probability && h[i].answer === answer)) return h;
      const next = h.slice();
      next[i] = { ...h[i], status: s.status, probability, answer };
      write('local', HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const flush = useCallback(() => {
    frame.current = 0;
    const events = queue.current.splice(0);
    if (!events.length) return;
    const next = events.reduce(applyEvent, latest.current ?? initialState());
    latest.current = next;
    setState(next);
    if (following.current && next.status !== 'running') record(following.current, next);
  }, [record]);

  const close = useCallback(() => {
    source.current?.close();
    source.current = null;
    queue.current = [];
    if (frame.current) clearTimeout(frame.current);
    frame.current = 0;
  }, []);

  useEffect(() => close, [close]);

  /** Follows a run: replays it from the start, then live. False when it is gone. */
  const watch = useCallback(async (id: string): Promise<boolean> => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    close();
    latest.current = null;
    following.current = id;
    setError('');
    setState(null);
    setRunId(id);
    setToken(tokens()[id] ?? null);
    const res = await fetch(`/api/oi/runs/${id}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) {
      setError(res?.status === 404 ? 'That forecast has expired. Runs are kept for a few hours.' : 'Could not reach OI.');
      setRunId(null);
      setUrlRun(null);
      return false;
    }
    setUrlRun(id);
    const es = new EventSource(`/api/oi/runs/${id}/events`);
    source.current = es;
    es.onmessage = m => {
      let e: Stamped;
      try { e = JSON.parse(m.data); } catch { return; }
      queue.current.push(e);
      // The run is over: stop here, or the browser would reconnect when the server closes the stream.
      if (e.t === 'end') { es.close(); if (source.current === es) source.current = null; }
      // One render per short beat, however fast events arrive (a replay sends hundreds at once).
      // A timer, not an animation frame: frames stop while the tab is hidden, and a run must keep
      // up when its watcher switches tabs.
      if (!frame.current) frame.current = window.setTimeout(flush, 60);
    };
    // A dropped connection reconnects by itself and resumes from the last event it saw. One the
    // server refused outright (too many streams, a run gone) does not: say so rather than sit silent.
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED || source.current !== es) return;
      source.current = null;
      setError('Lost the live stream of this run. Reopen it from your forecasts to catch up.');
    };
    return true;
  }, [close, flush]);

  const start = useCallback(async (input: StartInput, engine: Engine, key: string): Promise<string | null> => {
    setError('');
    let res: Response;
    try {
      res = await fetch('/api/oi/runs', {
        method: 'POST',
        headers: headersFor(engine, key),
        body: JSON.stringify({ question: input.question, seed: input.seed, seed_scope: input.seedScope, depth: input.depth, use_feeds: input.useFeeds }),
      });
    } catch {
      setError('Could not reach OI.');
      return null;
    }
    if (!res.ok) { setError(await errorOf(res)); return null; }
    const body = await res.json();
    write('session', TOKENS_KEY, JSON.stringify({ ...tokens(), [body.id]: body.run_token }));
    const entry: HistoryEntry = { id: body.id, question: input.question, at: Date.now(), probability: null, status: 'running', provider: engine.provider, model: engine.model };
    setHistory(h => {
      const next = [entry, ...h.filter(x => x.id !== body.id)].slice(0, HISTORY_CAP);
      write('local', HISTORY_KEY, JSON.stringify(next));
      return next;
    });
    await watch(body.id);
    return body.id;
  }, [watch]);

  const cancel = useCallback(async () => {
    if (!runId || !token) return;
    await fetch(`/api/oi/runs/${runId}`, { method: 'DELETE', headers: { 'x-oi-run-token': token } }).catch(() => null);
  }, [runId, token]);

  const inject = useCallback(async (text: string): Promise<string | null> => {
    if (!runId || !token) return 'Only the browser that started this run can steer it.';
    const res = await fetch(`/api/oi/runs/${runId}/inject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-oi-run-token': token },
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (!res) return 'Could not reach OI.';
    return res.ok ? null : errorOf(res);
  }, [runId, token]);

  const ask = useCallback(async (target: string, message: string, engine: Engine, key: string): Promise<{ reply?: string; error?: string }> => {
    if (!runId) return { error: 'No run.' };
    const res = await fetch(`/api/oi/runs/${runId}/ask`, {
      method: 'POST',
      headers: headersFor(engine, key),
      body: JSON.stringify({ target, message }),
    }).catch(() => null);
    if (!res) return { error: 'Could not reach OI.' };
    if (!res.ok) return { error: await errorOf(res) };
    return { reply: (await res.json()).reply };
  }, [runId]);

  const clear = useCallback(() => {
    close();
    latest.current = null;
    following.current = null;
    setState(null);
    setRunId(null);
    setToken(null);
    setError('');
    setUrlRun(null);
  }, [close]);

  const forget = useCallback((id: string) => {
    setHistory(h => {
      const next = h.filter(x => x.id !== id);
      write('local', HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { state, runId, error, setError, history, canSteer: Boolean(token), start, watch, cancel, inject, ask, clear, forget };
}

export type OiClient = ReturnType<typeof useOi>;

/** Checks a key by listing the models it can use. */
export async function checkKey(provider: ProviderId, key: string): Promise<{ models: { id: string; name: string }[]; preferred: string; listed: boolean } | { error: string }> {
  const res = await fetch('/api/oi/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-oi-provider': provider, ...(key ? { 'x-oi-key': key } : {}) },
    body: JSON.stringify({ provider }),
  }).catch(() => null);
  if (!res) return { error: 'Could not reach OI.' };
  if (!res.ok) return { error: await errorOf(res) };
  const body = await res.json();
  return { models: body.models ?? [], preferred: body.default ?? '', listed: body.listed !== false };
}

/** The prediction as Markdown, for export: the answer, the story, the worlds and the sources. */
export function toMarkdown(s: RunState, url: string): string {
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const r = s.report;
  const lines = [`# ${r?.headline || s.question}`, '', `**Question:** ${s.question}`];
  if (s.frame) lines.push('', '```', questionBlock(s.frame), '```');
  if (r) {
    lines.push('', `## Prediction: ${r.answer} (${r.confidence} confidence)`, r.deviation, '', r.summary);
    const actorName = (id: string) => s.actors.find(a => a.id === id)?.name ?? id;
    const anchors: string[] = [];
    const q = s.quant;
    if (q) {
      anchors.push(`- **${q.symbol}** at ${formatAmount(q.price)} ${q.currency} on ${q.asOf}, swinging ${Math.round(q.vol * 100)}% a year`);
      anchors.push(q.probability !== undefined ? `- **Statistical baseline**: ${pct(q.probability)}. ${q.method}` : `- **Statistical baseline**: 80% between ${formatAmount(q.p10)} and ${formatAmount(q.p90)}, the middle at ${formatAmount(q.p50)}. ${q.method}`);
      if (q.simulated) anchors.push(q.simulated.probability !== undefined ? `- **The simulation, priced** (each world's events across the market's own paths): ${pct(q.simulated.probability)}` : `- **The simulation, priced**: 80% between ${formatAmount(q.simulated.p10)} and ${formatAmount(q.simulated.p90)}, the middle at ${formatAmount(q.simulated.p50)}`);
    }
    for (const c of s.context.filter(x => x.kind === 'odds' && x.odds)) {
      anchors.push(`- **${c.odds!.platform}${c.id === s.frame?.market ? ' (this question)' : ' (related)'}**: [${c.title.replace(/[[\]]/g, '')}](${c.url}) ${pct(c.odds!.probability)}`);
    }
    if (q?.backtest) anchors.push(`- **The baseline's record**: ${recordSentence(q.backtest, q.symbol, q.probability)}`);
    const ladderOdds = (s.context.find(c => c.id === s.frame?.market) ?? s.context.find(c => c.odds?.ladder))?.odds;
    if (q?.curve && ladderOdds?.ladder) {
      const read = ladderSentence(readLadder(ladderGaps(q.curve, ladderOdds.ladder, q.price)), formatAmount, ladderOdds.platform);
      if (read) anchors.push(`- **Every level**: ${read}`);
    }
    if (anchors.length) lines.push('', '## What it rests on', ...anchors);
    if (r.path.length) lines.push('', '## How it unfolds', ...r.path.map(p => `- **${p.date || 'Later'}**: ${p.title}${p.detail ? `. ${p.detail}` : ''}${p.actors.length ? ` (${p.actors.map(actorName).join(', ')})` : ''}`));
    if (r.actorMoves.length) lines.push('', '## What each actor does', ...r.actorMoves.map(m => `- **${actorName(m.actor)}**: ${m.prediction}`));
    if (r.worlds.length) lines.push('', '## The simulated worlds', ...r.worlds.map(w => `- **World ${w.world}**: ${w.outcome}. ${w.summary}`));
    const refs = (ids: string[] | undefined) => (ids?.length ? ` ${ids.map(id => `[${id}]`).join('')}` : '');
    if (r.drivers.length) lines.push('', '## Drivers', ...r.drivers.map(d => `- ${d.text} (${directionWord(s.frame, d.push, d.favors)})${refs(d.sources)}`));
    if (r.scenarios.length) lines.push('', '## Scenarios', ...r.scenarios.map(x => `- **${x.name}** (${pct(x.probability)}): ${x.description}`));
    if (r.signposts.length) lines.push('', '## Signposts', ...r.signposts.map(x => `- ${x.text}${x.place ? ` (${x.place})` : ''}: points ${directionWord(s.frame, x.means, x.favors)}`));
    if (r.dissent) lines.push('', '## Dissent', r.dissent);
    if (r.caveats.length) lines.push('', '## Caveats', ...r.caveats.map(c => `- ${c}`));
  }
  if (s.rounds.length && s.frame) lines.push('', '## The worlds pooled, period by period', ...s.rounds.map(x => `- ${s.periods[x.round - 1]?.label ?? `Period ${x.round}`}: ${trajectoryLine(s.frame!, x)}`));
  // The thread back to the words: what the actors quoted to ground their first moves, then every source used.
  const names = new Map(s.actors.map(a => [a.id, a.name]));
  const way = (c: Citation) => (c.favors ? `for ${c.favors}` : c.push === 'neutral' || !c.push ? 'context' : directionWord(s.frame, c.push, ''));
  const quoted = s.moves.filter(m => m.cites?.length && m.world === s.worlds[0]);
  if (quoted.length) lines.push('', '## What the actors quoted', ...quoted.flatMap(m => m.cites!.map(c => `- **${names.get(m.actor) ?? m.actor}** (period ${m.period}): “${c.quote}” [${c.source}], ${way(c)}${c.why ? `: ${c.why}` : ''}${c.exact ? '' : ' (paraphrase)'}`)));
  const used = new Set(s.links.filter(l => l.kind === 'cite' || l.kind === 'evidence').flatMap(l => [l.from, l.to]).filter(k => k.startsWith('c:')).map(k => k.slice(2)));
  const sources = s.context.filter(c => used.has(c.id));
  if (sources.length) lines.push('', '## Sources', ...sources.map(c => `- [${c.id}] ${c.kind === 'data' && c.id !== 'data' ? `“${c.title}”` : c.url ? `[${c.title.replace(/[[\]]/g, '')}](${c.url})` : c.title} (${[c.source, c.place, c.published.slice(0, 10)].filter(Boolean).join(', ')})`));
  lines.push('', `Run on ${s.provider} / ${s.model}, ${s.usage.calls} model calls. Watch: ${url}`, '', '_OSIRIS OI: a prediction engine after MiroFish, rebuilt natively: the actors simulated in parallel worlds. A simulation, not a guarantee._');
  return lines.filter(l => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1');
}

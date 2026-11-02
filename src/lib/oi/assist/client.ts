'use client';
/**
 * OSIRIS OI Assist: the conversation, in the page.
 *
 * Holds what has been said and done, runs a turn against the server and the
 * map (agent.converse), and shows each step as it happens: what OI said, each
 * action with its state, and the cards it put on screen. The conversation is
 * kept for the browser session, so a reload or closing the panel loses nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorOf, headersFor, type Engine } from '../client';
import { converse } from './agent';
import { FIND_LAYERS, LAYERS, SOURCES } from './catalog';
import { asksForForecast, type AssistContext, type AssistMessage, type Call, type Mode, type ToolName } from './protocol';
import { runCall, type Card, type Depth, type Site } from './tools';

export interface ActionView {
  tool: ToolName;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'ok' | 'error';
  summary?: string;
}

export type Entry =
  | { id: string; role: 'user'; text: string; mode: Mode; at: number }
  | { id: string; role: 'oi'; says: string[]; actions: ActionView[]; cards: Card[]; busy: boolean; error?: string; at: number; retry?: { text: string; mode: Mode } };

export interface Auth { engine: Engine; key: string }

export interface AssistDeps {
  /** The page, minus starting forecasts: those need the reader's engine and key, given per turn. */
  site: Omit<Site, 'forecast'>;
  startForecast: (question: string, depth: Depth, auth: Auth) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  forecastSummary: () => AssistContext['forecast'];
  /** Whether the workspace is open and what it shows. */
  ui?: () => AssistContext['ui'];
  /** Called with OI's final words for a turn, e.g. to read them aloud. */
  onReply?: (text: string) => void;
}

const STORE = 'osiris.oi.assist';
const MAX_ENTRIES = 80;

function load(): { entries: Entry[]; history: AssistMessage[] } {
  if (typeof window === 'undefined') return { entries: [], history: [] };
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) || 'null') as { entries?: Entry[]; history?: AssistMessage[] } | null;
    // A turn that was mid-flight when the page went away did not finish.
    const entries = (raw?.entries ?? []).map(e => (e.role === 'oi' && e.busy ? { ...e, busy: false, error: e.error ?? 'Interrupted.' } : e));
    return { entries, history: raw?.history ?? [] };
  } catch {
    return { entries: [], history: [] };
  }
}

function save(entries: Entry[], history: AssistMessage[]) {
  try { sessionStorage.setItem(STORE, JSON.stringify({ entries: entries.slice(-MAX_ENTRIES), history: history.slice(-40) })); } catch { /* storage full or blocked */ }
}

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useAssist(deps: AssistDeps) {
  const [initial] = useState(load);
  const [entries, setEntries] = useState<Entry[]>(initial.entries);
  const [busy, setBusy] = useState(false);
  const history = useRef<AssistMessage[]>(initial.history);
  const abort = useRef<AbortController | null>(null);
  const depsRef = useRef(deps);
  useEffect(() => { depsRef.current = deps; });
  useEffect(() => { save(entries, history.current); }, [entries]);

  /** What is on screen, for the model. The server stamps the time and checks the rest. */
  const context = useCallback((): AssistContext => {
    const { site, forecastSummary } = depsRef.current;
    const v = site.view();
    const layers = site.layers();
    const d = site.data();
    return {
      now: '',
      view: { lat: v.lat, lng: v.lng, zoom: v.zoom, projection: v.projection, style: v.style },
      layersOn: Object.keys(LAYERS).filter(k => layers[k]),
      loaded: Object.fromEntries(FIND_LAYERS.map(l => [l, SOURCES[l].keys.reduce((n, k) => n + (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0), 0)])),
      forecast: forecastSummary(),
      ui: depsRef.current.ui?.(),
    };
  }, []);

  const send = useCallback(async (text: string, mode: Mode, auth: Auth) => {
    const said = text.trim();
    if (!said || abort.current) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    const oiId = nextId();
    setEntries(e => [...e, { id: nextId(), role: 'user', text: said, mode, at: Date.now() }, { id: oiId, role: 'oi', says: [], actions: [], cards: [], busy: true, at: Date.now() }]);
    const patch = (f: (e: Extract<Entry, { role: 'oi' }>) => Extract<Entry, { role: 'oi' }>) =>
      setEntries(list => list.map(e => (e.id === oiId && e.role === 'oi' ? f(e) : e)));

    // Where each step's actions start in the entry's list.
    const base: number[] = [];
    let actionsSoFar = 0;
    let finalSay = '';
    const site: Site = {
      ...depsRef.current.site,
      forecast: (q, d) => (asksForForecast(said, mode)
        ? depsRef.current.startForecast(q, d, auth)
        : Promise.resolve({ ok: false as const, error: 'A forecast starts only when you ask for one: say "forecast…", or pick Forecast mode' })),
    };

    try {
      history.current = await converse(history.current, said, mode, {
        signal: ctrl.signal,
        context,
        step: async (messages, ctx, signal) => {
          const res = await fetch('/api/oi/assist', { method: 'POST', headers: headersFor(auth.engine, auth.key), body: JSON.stringify({ messages, context: ctx }), signal });
          if (!res.ok) throw new Error(await errorOf(res));
          const { step } = await res.json() as { step: { say?: string; actions?: Call[]; done?: boolean } };
          return { say: step.say ?? '', calls: Array.isArray(step.actions) ? step.actions : [], done: step.done !== false };
        },
        exec: (call, signal) => runCall(call, site, signal),
        onProgress: p => {
          if (p.type === 'step') {
            base[p.step] = actionsSoFar;
            actionsSoFar += p.calls.length;
            if (p.say) finalSay = p.say;
            patch(e => ({
              ...e,
              says: p.say ? [...e.says, p.say] : e.says,
              actions: [...e.actions, ...p.calls.map((c, j) => ({ tool: c.tool, args: c.args, status: (j === 0 ? 'running' : 'pending') as ActionView['status'] }))],
            }));
          } else {
            const idx = base[p.step] + p.call;
            patch(e => ({
              ...e,
              actions: e.actions.map((a, k) => (k === idx ? { ...a, status: p.outcome.result.ok ? 'ok' : 'error', summary: p.outcome.result.summary } : k === idx + 1 && a.status === 'pending' ? { ...a, status: 'running' } : a)),
              cards: p.outcome.card ? [...e.cards, p.outcome.card] : e.cards,
            }));
          }
        },
      });
      patch(e => ({ ...e, busy: false, actions: e.actions.map(a => (a.status === 'running' || a.status === 'pending' ? { ...a, status: ctrl.signal.aborted ? 'error' : a.status, summary: a.summary ?? (ctrl.signal.aborted ? 'Stopped' : undefined) } : a)) }));
      if (finalSay && !ctrl.signal.aborted) depsRef.current.onReply?.(finalSay);
    } catch (err) {
      const message = ctrl.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : 'OI could not answer.';
      patch(e => ({ ...e, busy: false, error: message, retry: ctrl.signal.aborted ? undefined : { text: said, mode }, actions: e.actions.map(a => (a.status === 'running' || a.status === 'pending' ? { ...a, status: 'error' } : a)) }));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }, [context]);

  const stop = useCallback(() => { abort.current?.abort(); }, []);

  const clear = useCallback(() => {
    abort.current?.abort();
    history.current = [];
    setEntries([]);
    depsRef.current.site.highlight(null);
  }, []);

  return { entries, busy, send, stop, clear };
}

export type AssistClient = ReturnType<typeof useAssist>;

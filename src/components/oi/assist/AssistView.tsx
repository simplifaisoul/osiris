'use client';
/**
 * OSIRIS OI Assist: the conversation.
 *
 * Talk to OI, typed or spoken, and it works the map for you: it flies there,
 * switches the layers on, finds what is live, marks it, and puts it on screen
 * as cards you can click through; it reads the markets, opens panels, and
 * starts forecasts. Each turn shows what OI did, step by step, as it does it.
 *
 * Assist is OI's friendly side, in the platform's blue: a greeting, things to
 * try, chat bubbles, and a composer that is always within reach. A forecast it
 * starts stays in Forecast's gold.
 */
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUp, ArrowUpRight, Cctv, Eraser, ExternalLink, Globe2, KeyRound, Layers, LayoutDashboard, List, Loader2, LocateFixed, MapPin, Mic, MousePointerClick, Navigation, Orbit, PanelRight,
  RotateCcw, ScanSearch, Search, Square, TrendingUp, Volume2, VolumeX, X, type LucideProps,
} from 'lucide-react';
import type { OiClient } from '@/lib/oi/client';
import type { ActionView, AssistClient, Entry } from '@/lib/oi/assist/client';
import type { Mode, ToolName } from '@/lib/oi/assist/protocol';
import type { Card } from '@/lib/oi/assist/tools';
import { currentAnswer } from '@/lib/oi/state';
import { LABEL, T, blue, gold, shortName } from '../theme';
import { OiMark, Segmented } from '../atoms';
import { canSpeak, useDictation } from './voice';

const TOOL_ICON: Record<ToolName, typeof Navigation> = {
  go_to: Navigation, layers: Layers, find: Search, scan: ScanSearch, camera: Cctv, highlight: MapPin, show: List, markets: TrendingUp,
  open: PanelRight, map_view: Globe2, forecast: Orbit, workspace: LayoutDashboard, select: MousePointerClick, clear: Eraser,
};

function ToolIcon({ tool, ...rest }: LucideProps & { tool: ToolName }) {
  return createElement(TOOL_ICON[tool], rest);
}

const MODES: { value: Mode; label: string; title: string }[] = [
  { value: 'auto', label: 'Auto', title: 'OI decides what to do' },
  { value: 'navigate', label: 'Navigate', title: 'Move the map and switch layers' },
  { value: 'research', label: 'Research', title: 'Gather live data and put it on screen' },
  { value: 'forecast', label: 'Forecast', title: 'Run the prediction engine on your question' },
];

/** What OI can do, each with something to try: a tile sends its example. */
const CAPABILITIES: { icon: typeof Navigation; title: string; mode: Mode; text: string }[] = [
  { icon: Navigation, title: 'Take me somewhere', mode: 'navigate', text: 'Take me to the Strait of Hormuz and show the shipping' },
  { icon: Search, title: 'Find what is live', mode: 'research', text: 'Military aircraft near the Baltic Sea' },
  { icon: MapPin, title: 'Mark it on the map', mode: 'research', text: 'Earthquakes above M5 in the last day' },
  { icon: ScanSearch, title: 'Explain my view', mode: 'research', text: 'What am I looking at?' },
  { icon: TrendingUp, title: 'Check the markets', mode: 'research', text: 'How are oil, gold and bitcoin trading?' },
  { icon: LayoutDashboard, title: 'Drive the workspace', mode: 'auto', text: 'Open the workspace on the graph' },
];

/** Assist hands a question to the prediction engine. */
const HANDOFF = 'Will OPEC+ announce a production cut before December 2026?';

/** What an action is doing, in words, before its result says what it did. */
function describe(a: ActionView): string {
  const g = (k: string) => (typeof a.args[k] === 'string' || typeof a.args[k] === 'number' ? String(a.args[k]) : '');
  switch (a.tool) {
    case 'go_to': return `Fly to ${g('place') || [g('lat'), g('lng')].filter(Boolean).join(', ') || 'a place'}`;
    case 'layers': return `Layers ${[Array.isArray(a.args.on) ? `on: ${(a.args.on as string[]).join(', ')}` : '', Array.isArray(a.args.off) ? `off: ${(a.args.off as string[]).join(', ')}` : ''].filter(Boolean).join(' · ')}`;
    case 'find': return `Find ${g('layer').replace('_', ' ')}${g('text') ? ` “${g('text')}”` : ''}${typeof a.args.near === 'string' ? ` near ${a.args.near}` : ''}`;
    case 'scan': return 'Scan what is in view';
    case 'camera': return `Look through ${typeof a.args.near === 'string' ? `a camera near ${a.args.near}` : 'a camera'}${Number(a.args.watch_seconds) > 0 ? ` for ${Number(a.args.watch_seconds)} s` : ''}`;
    case 'highlight': return `Mark ${Array.isArray(a.args.points) ? a.args.points.length : 0} places`;
    case 'show': return `Show ${g('title') || 'a list'}`;
    case 'markets': return `Read ${Array.isArray(a.args.symbols) ? (a.args.symbols as string[]).join(', ') : 'the markets'}`;
    case 'open': return `Open ${g('panel')}`;
    case 'map_view': return `Switch to ${[g('projection'), g('style')].filter(Boolean).join(', ')}`;
    case 'forecast': return `Forecast: ${g('question')}`;
    case 'workspace': return a.args.open === false ? 'Close the workspace' : `Open the workspace${g('view') ? ` on the ${g('view')}` : ''}`;
    case 'select': return `Open ${g('name')}`;
    case 'clear': return 'Clear the highlights';
  }
}

/** OI's face in the conversation: its mark in a soft blue ring that glows while it works. */
function Face({ busy = false, size = 28 }: { busy?: boolean; size?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center flex-shrink-0 border transition-shadow duration-300"
      style={{ width: size, height: size, background: blue(0.08), borderColor: blue(0.4), boxShadow: busy ? `0 0 0 4px ${blue(0.12)}` : undefined }}>
      <OiMark size={Math.round(size * 0.55)} live={busy} assist />
    </span>
  );
}

/** OI's words: paragraphs, and "- " lines as a list. */
function Prose({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) blocks.push(<ul key={`u${k}`} className="flex flex-col gap-1 pl-0.5">{bullets.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: T.blue }} /><span>{b}</span></li>)}</ul>);
    bullets = [];
  };
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (/^[-•*]\s+/.test(t)) bullets.push(t.replace(/^[-•*]\s+/, ''));
    else { flush(i); if (t) blocks.push(<p key={i}>{t}</p>); }
  });
  flush(-1);
  return <div className="flex flex-col gap-2 text-[12.5px] leading-[1.6] text-[var(--text-primary)]">{blocks}</div>;
}

/** Three dots, one after another: OI is thinking. */
function Thinking() {
  return (
    <span className="inline-flex items-center gap-2 h-8 px-3 rounded-2xl rounded-tl-md border text-[11.5px] text-[var(--text-secondary)]" style={{ borderColor: blue(0.2), background: blue(0.05) }}>
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {[0, 1, 2].map(i => (
          <motion.span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: T.blue }}
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.16 }} />
        ))}
      </span>
      Thinking
    </span>
  );
}

function ActionRow({ a }: { a: ActionView }) {
  const color = a.status === 'ok' || a.status === 'running' ? T.blue : a.status === 'error' ? T.red : T.mute;
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ color, background: a.status === 'pending' ? 'transparent' : blue(0.1), boxShadow: a.status === 'pending' ? 'inset 0 0 0 1px var(--border-primary)' : undefined }}>
        {a.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ToolIcon tool={a.tool} className="w-3 h-3" />}
      </span>
      <span className={`flex-1 min-w-0 pt-px text-[11px] leading-snug ${a.status === 'error' ? 'text-[var(--alert-red)]' : a.status === 'pending' ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
        {a.summary || describe(a)}
      </span>
    </div>
  );
}

function CardView({ card, oi, onLocate, onOpenForecast, onWorkspace }: {
  card: Card; oi: OiClient; onLocate: (lat: number, lng: number, zoom?: number) => void; onOpenForecast: () => void; onWorkspace?: () => void;
}) {
  const [all, setAll] = useState(false);
  if (card.kind === 'forecast') {
    // A forecast belongs to Forecast: it keeps Forecast's gold, even here.
    const live = oi.runId === card.runId ? oi.state : null;
    const answer = live ? currentAnswer(live) : '';
    return (
      <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: gold(0.3), background: gold(0.04) }}>
        <div className="flex items-center gap-2">
          <OiMark size={14} live={live?.status === 'running'} />
          <span className={`${LABEL} text-[var(--gold-primary)]`}>Forecast</span>
          {live && <span className="text-[10.5px] text-[var(--text-muted)] truncate">{live.status === 'running' ? live.phaseLabel : live.status === 'done' ? 'complete' : live.status}</span>}
        </div>
        <p className="text-[12px] font-semibold leading-snug text-[var(--text-heading)]">{card.title}</p>
        {answer && <p className="text-[20px] font-mono font-light tabular-nums text-[var(--text-heading)]" style={{ textShadow: `0 0 16px ${gold(0.3)}` }}>{answer}</p>}
        <div className="flex items-center gap-1.5">
          <button onClick={() => { if (card.runId && oi.runId !== card.runId) void oi.watch(card.runId); onOpenForecast(); }} className="oi-btn !h-7">
            <Orbit className="w-3 h-3" /> Open forecast
          </button>
          {onWorkspace && live && <button onClick={onWorkspace} className="oi-btn !h-7"><ExternalLink className="w-3 h-3" /> Workspace</button>}
        </div>
      </div>
    );
  }
  const shown = all ? card.items : card.items.slice(0, 8);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: blue(0.18), background: 'rgba(0,0,0,0.25)' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: blue(0.12), background: blue(0.04) }}>
        {createElement(card.kind === 'markets' ? TrendingUp : card.kind === 'place' ? MapPin : card.kind === 'camera' ? Cctv : List, { className: 'w-3.5 h-3.5 flex-shrink-0', style: { color: T.blue } })}
        <span className="text-[11.5px] font-medium text-[var(--text-heading)] truncate flex-1">{card.title}</span>
        {card.subtitle && <span className="text-[10px] font-mono text-[var(--text-muted)]">{card.subtitle}</span>}
      </div>
      {card.items.length === 0 && <p className="px-3 py-2.5 text-[11.5px] text-[var(--text-muted)]">Nothing matched.</p>}
      <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
        {shown.map((it, i) => {
          const placed = it.lat !== undefined && it.lng !== undefined;
          const body = (
            <>
              <span className="w-5 text-[10px] font-mono tabular-nums text-[var(--text-muted)] flex-shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] leading-snug truncate text-[var(--text-primary)]">{it.label}</span>
                {it.detail && <span className="block text-[10px] font-mono truncate text-[var(--text-muted)]">{it.detail}</span>}
              </span>
              {it.value && <span className="text-[11px] font-mono tabular-nums whitespace-pre flex-shrink-0" style={{ color: it.tone === 'up' ? T.green : it.tone === 'down' ? T.red : T.text }}>{it.value}</span>}
              {placed && <LocateFixed className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)] group-hover:text-[var(--cyan-primary)]" />}
            </>
          );
          return placed ? (
            <button key={i} onClick={() => onLocate(it.lat!, it.lng!, card.kind === 'place' ? undefined : card.kind === 'camera' ? 14 : 8)} title="Fly there"
              className="group flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[rgba(var(--cyan-rgb),0.06)]">{body}</button>
          ) : it.url ? (
            <a key={i} href={it.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[rgba(var(--cyan-rgb),0.06)]">{body}</a>
          ) : (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5">{body}</div>
          );
        })}
      </div>
      {card.items.length > 8 && (
        <button onClick={() => setAll(v => !v)} className="w-full h-8 text-[11px] text-[var(--cyan-primary)] hover:bg-[rgba(var(--cyan-rgb),0.06)] border-t border-[var(--border-secondary)]">
          {all ? 'Show fewer' : `Show all ${card.items.length}`}
        </button>
      )}
    </div>
  );
}

const MODE_WORD: Record<Mode, string> = { auto: '', navigate: 'Navigate', research: 'Research', forecast: 'Forecast' };

function Turn({ e, oi, onLocate, onOpenForecast, onWorkspace, onRetry }: {
  e: Entry; oi: OiClient; onLocate: (lat: number, lng: number, zoom?: number) => void; onOpenForecast: () => void; onWorkspace?: () => void; onRetry: (text: string, mode: Mode) => void;
}) {
  if (e.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="self-end max-w-[86%] flex flex-col items-end gap-1">
        {e.mode !== 'auto' && <span className="text-[10px] font-medium" style={{ color: e.mode === 'forecast' ? T.goldLight : T.blue }}>{MODE_WORD[e.mode]}</span>}
        <div className="rounded-2xl rounded-br-md px-3.5 py-2 text-[12.5px] leading-relaxed border text-[var(--text-heading)]" style={{ background: blue(0.12), borderColor: blue(0.28) }}>{e.text}</div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 max-w-full">
      <Face busy={e.busy} />
      <div className="flex-1 min-w-0 flex flex-col gap-2.5 pt-0.5">
        {e.says.map((s, i) => <Prose key={i} text={s} />)}
        {e.actions.length > 0 && (
          <div className="rounded-xl border px-2.5 py-1.5" style={{ borderColor: blue(0.15), background: blue(0.03) }}>
            {e.actions.map((a, i) => <ActionRow key={i} a={a} />)}
          </div>
        )}
        {e.cards.map((c, i) => <CardView key={i} card={c} oi={oi} onLocate={onLocate} onOpenForecast={onOpenForecast} onWorkspace={onWorkspace} />)}
        {e.busy && !e.says.length && !e.actions.length && <div><Thinking /></div>}
        {e.error && (
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="text-[var(--alert-red)]">{e.error}</span>
            {e.retry && <button onClick={() => onRetry(e.retry!.text, e.retry!.mode)} className="inline-flex items-center gap-1 text-[11px] text-[var(--cyan-primary)] hover:underline"><RotateCcw className="w-3 h-3" /> Try again</button>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export interface AssistViewProps {
  assist: AssistClient;
  oi: OiClient;
  ready: boolean;
  providerName: string;
  onKey: () => void;
  onSend: (text: string, mode: Mode) => void;
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  onOpenForecast: () => void;
  onWorkspace?: () => void;
  speakOn: boolean;
  onSpeak: (on: boolean) => void;
  /** Focus the composer on mount (opened from the keyboard). */
  autoFocus?: boolean;
}

export function AssistView(p: AssistViewProps) {
  const { assist } = p;
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const send = (t: string, m: Mode = mode) => {
    if (!t.trim() || !p.ready || assist.busy) return;
    p.onSend(t.trim(), m);
    setText('');
  };
  const dictation = useDictation(heard => send(heard));

  useEffect(() => { if (p.autoFocus) input.current?.focus(); }, [p.autoFocus]);
  const last = assist.entries[assist.entries.length - 1];
  const lastSize = last ? (last.role === 'oi' ? last.says.length + last.actions.length + last.cards.length + (last.busy ? 0 : 100) : 1) : 0;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [assist.entries.length, lastSize]);

  // The textarea grows with what is typed, up to five lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  }, [text]);

  // Without a key a tile fills the box instead of sending, and the box asks for one.
  const tryIt = (t: string, m: Mode) => { if (p.ready) send(t, m); else { setText(t); setMode(m); } };
  const canSend = Boolean(text.trim()) && !dictation.listening;

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-4">
        {assist.entries.length === 0 ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <Face size={40} />
              <div className="min-w-0 pt-0.5">
                <h3 className="text-[16px] font-semibold text-[var(--text-heading)]">Hey, I&apos;m your map assistant</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  Ask me about anything on the map, by typing or out loud. I&apos;ll fly you there, switch on the right layers and show you what&apos;s live.
                </p>
              </div>
            </div>
            <div>
              <span className="block mb-2 text-[11px] font-medium text-[var(--text-secondary)]">Try asking</span>
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map(c => (
                  <button key={c.title} onClick={() => tryIt(c.text, c.mode)} disabled={assist.busy} title={c.text}
                    className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border-secondary)] bg-white/[0.02] p-2.5 text-left transition-all hover:border-[rgba(var(--cyan-rgb),0.4)] hover:bg-[rgba(var(--cyan-rgb),0.05)] hover:-translate-y-px disabled:opacity-40 disabled:pointer-events-none">
                    <span className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: blue(0.12) }}>
                        {createElement(c.icon, { className: 'w-3.5 h-3.5', style: { color: T.blue } })}
                      </span>
                      <span className="text-[11.5px] font-medium text-[var(--text-heading)] truncate">{c.title}</span>
                    </span>
                    <span className="text-[10.5px] leading-snug text-[var(--text-muted)] line-clamp-2 group-hover:text-[var(--text-secondary)]">“{c.text}”</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => tryIt(HANDOFF, 'forecast')} disabled={assist.busy}
              className="group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-[rgba(var(--gold-rgb),0.08)] disabled:opacity-40 disabled:pointer-events-none"
              style={{ borderColor: gold(0.3), background: gold(0.04) }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: gold(0.12) }}>
                <Orbit className="w-3.5 h-3.5" style={{ color: T.goldLight }} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] font-medium text-[var(--text-heading)]">Or ask me to forecast something</span>
                <span className="block text-[10.5px] leading-snug text-[var(--text-muted)] truncate group-hover:text-[var(--text-secondary)]">“{HANDOFF}”</span>
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: T.goldLight }} />
            </button>
          </div>
        ) : assist.entries.map(e => (
          <Turn key={e.id} e={e} oi={p.oi} onLocate={p.onLocate} onOpenForecast={p.onOpenForecast} onWorkspace={p.onWorkspace} onRetry={(t, m) => send(t, m)} />
        ))}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 px-3 pt-2.5 pb-3 border-t flex flex-col gap-2" style={{ background: 'var(--oi-solid)', borderColor: blue(0.12) }}>
        <Segmented id="assist-mode" size="sm" accent="blue" value={mode} onChange={setMode} options={MODES} />
        {p.ready ? (
          <div className="flex items-end gap-1.5 rounded-2xl border border-[var(--border-primary)] bg-black/50 focus-within:border-[rgba(var(--cyan-rgb),0.5)] focus-within:shadow-[0_0_0_3px_rgba(var(--cyan-rgb),0.08)] transition-[border-color,box-shadow] pl-3.5 pr-1.5 py-1.5">
            <textarea ref={input} value={dictation.listening ? dictation.heard : text} rows={1}
              onChange={e => setText(e.target.value.slice(0, 2000))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
              placeholder={dictation.listening ? 'Listening…' : mode === 'forecast' ? 'What should I forecast?' : 'Ask me anything, or tell me where to go'}
              aria-label="Message to OI" readOnly={dictation.listening}
              className="flex-1 resize-none bg-transparent outline-none text-[12.5px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] py-1 max-h-[110px]" />
            {dictation.supported && (
              <button onClick={() => (dictation.listening ? dictation.stop() : dictation.start())} disabled={assist.busy} aria-pressed={dictation.listening}
                title={dictation.listening ? 'Stop listening' : 'Talk to OI'} aria-label={dictation.listening ? 'Stop listening' : 'Talk to OI'}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30 ${dictation.listening ? 'text-[var(--alert-red)] bg-[rgba(255,61,61,0.12)] animate-osiris-pulse' : 'text-[var(--text-secondary)] hover:text-[var(--cyan-primary)] hover:bg-[rgba(var(--cyan-rgb),0.08)]'}`}>
                <Mic className="w-4 h-4" />
              </button>
            )}
            {assist.busy ? (
              <button onClick={assist.stop} title="Stop" aria-label="Stop" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[var(--alert-red)] bg-[rgba(255,61,61,0.08)] hover:bg-[rgba(255,61,61,0.16)]"><Square className="w-3 h-3" /></button>
            ) : (
              <button onClick={() => send(text)} disabled={!canSend} title="Send (Enter)" aria-label="Send"
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-35 disabled:pointer-events-none"
                style={canSend ? { background: T.blue, color: '#04121a', boxShadow: `0 4px 14px ${blue(0.3)}` } : { color: T.blue, boxShadow: `inset 0 0 0 1px ${blue(0.4)}` }}>
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border px-3.5 py-3" style={{ borderColor: blue(0.25), background: blue(0.05) }}>
            <p className="text-[11.5px] leading-snug text-[var(--text-secondary)]">I run on your own AI key. It stays in this browser and is only used for your requests.</p>
            <button onClick={p.onKey} className="self-start inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[11.5px] font-medium transition-colors"
              style={{ background: T.blue, color: '#04121a' }}>
              <KeyRound className="w-3.5 h-3.5" /> Add your {shortName(p.providerName)} key
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
          {dictation.error ? <span className="text-[var(--alert-red)]">{dictation.error}</span> : <span>Enter to send · Shift+Enter for a new line</span>}
          <span className="ml-auto flex items-center gap-0.5">
            {canSpeak() && (
              <button onClick={() => p.onSpeak(!p.speakOn)} aria-pressed={p.speakOn} title={p.speakOn ? 'Stop reading replies aloud' : 'Read replies aloud'}
                className={`h-6 px-1.5 rounded-md flex items-center gap-1 transition-colors hover:bg-[rgba(var(--cyan-rgb),0.08)] ${p.speakOn ? 'text-[var(--cyan-primary)]' : 'hover:text-[var(--text-primary)]'}`}>
                {p.speakOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />} Voice
              </button>
            )}
            {assist.entries.length > 0 && (
              <button onClick={assist.clear} title="Start a new conversation" className="h-6 px-1.5 rounded-md flex items-center gap-1 transition-colors hover:bg-[rgba(var(--cyan-rgb),0.08)] hover:text-[var(--text-primary)]">
                <X className="w-3 h-3" /> New chat
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

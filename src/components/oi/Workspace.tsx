'use client';
/**
 * OSIRIS OI: the workspace.
 *
 * Full screen, OI becomes a command centre in the manner of an analysis
 * platform, with or without a forecast:
 *
 *   - the top bar: the run (or OI itself), its progress, the stage switch,
 *     the object search, the engine, and the run's controls;
 *   - on the left, the command column, with the same Forecast / Assist switch
 *     as the docked panel. Forecast is the ask form until there is a run, then
 *     the prediction with the report or the execution trace; Assist is the
 *     conversation, and OI can drive this whole workspace from it;
 *   - in the middle, the stage: the live globe, or for a run its research
 *     graph, the timeline of its simulated worlds, or the object tables;
 *   - on the right, once there is a run, whatever object is selected, or the
 *     simulation feed, the actors, the world model and the Q&A.
 *
 * Keys: 1–4 switch the stage, Ctrl+K (⌘K) or / searches the run, Esc closes
 * the selected object and then the workspace.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, GanttChart, Globe2, Minimize2, Network, Plus, Table2 } from 'lucide-react';
import type { OiClient } from '@/lib/oi/client';
import { workspaceLayout } from '@/lib/oi/layout';
import { resolve } from '@/lib/oi/research';
import type { RunState } from '@/lib/oi/state';
import { progressOf, traceOf } from '@/lib/oi/trace';
import ErrorBoundary from '@/components/ErrorBoundary';
import { KIND_LABEL, LABEL, SOLID, T, gold } from './theme';
import { IconButton, OiMark, Segmented } from './atoms';
import { Chip, Controls, InjectBox, UsageLine, Verdict } from './run';
import { ReportBody } from './report';
import { ContextList, Legend } from './lists';
import { ObjectView } from './ObjectView';
import { TraceView } from './TraceView';
import { GraphView } from './GraphView';
import { TimelineView } from './TimelineView';
import { TableView } from './TableView';
import { ObjectSearch, type ObjectSearchHandle } from './ObjectSearch';
import { ModeSwitch, modeTint, type OiMode } from './ModeSwitch';

export type Stage = 'globe' | 'graph' | 'timeline' | 'table';
export const STAGES: Stage[] = ['globe', 'graph', 'timeline', 'table'];
export type WorkspaceMode = OiMode;

export interface WorkspaceProps {
  /** The forecast, or null before there is one. */
  s: RunState | null;
  oi: OiClient;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  onAsk: (agentId: string) => void;
  onTheater?: (on: boolean) => void;
  focus?: boolean;
  onFocus?: () => void;
  following?: boolean;
  onFollow?: () => void;
  /** Forecast or Assist, shared with the docked panel. */
  mode: WorkspaceMode;
  onMode: (m: WorkspaceMode) => void;
  /** What the stage shows, which OI can change from the conversation. */
  stage: Stage;
  onStage: (s: Stage) => void;
  /** The simulation, actors, world and Q&A lists for a run, built by the panel so they share its tab state. */
  lists: ReactNode;
  errorBox: ReactNode;
  /** The conversation. */
  assistView: ReactNode;
  /** The ask form and past forecasts, for before there is a run. */
  askView: ReactNode;
  /** The engine pill, with its sheet. */
  engineMenu: ReactNode;
  onNewForecast: () => void;
  /** Whether OI is in the middle of a reply, for the mark in the top bar. */
  assistBusy?: boolean;
}

function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

const STAGE_OPTIONS = (hasRun: boolean) => [
  { value: 'globe' as Stage, label: 'Globe', icon: <Globe2 className="w-3 h-3" />, title: 'The live globe (1)' },
  { value: 'graph' as Stage, label: 'Graph', icon: <Network className="w-3 h-3" />, title: hasRun ? 'The research graph (2)' : 'Run a forecast to see its graph', disabled: !hasRun },
  { value: 'timeline' as Stage, label: 'Timeline', icon: <GanttChart className="w-3 h-3" />, title: hasRun ? 'The simulated worlds over time (3)' : 'Run a forecast to see its timeline', disabled: !hasRun },
  { value: 'table' as Stage, label: 'Table', icon: <Table2 className="w-3 h-3" />, title: hasRun ? 'Every object in tables (4)' : 'Run a forecast to see its objects', disabled: !hasRun },
];

export function Workspace(p: WorkspaceProps) {
  const { s, oi, selected, onSelect, stage, onStage } = p;
  const [leftTab, setLeftTab] = useState<'assessment' | 'trace' | null>(null);
  const [copied, setCopied] = useState(false);
  const search = useRef<ObjectSearchHandle>(null);
  const L = workspaceLayout(useWindowWidth());
  const selection = s ? resolve(s, selected) : null;
  const progress = useMemo(() => (s ? progressOf(traceOf(s)) : 0), [s]);
  // Until someone picks: the trace while the run works, the assessment once there is a report.
  const left = leftTab ?? (s?.report ? 'assessment' : 'trace');
  // Without a run the graph, timeline and tables have nothing to show: the stage is the globe.
  const shown: Stage = s ? stage : 'globe';

  const { onTheater } = p;
  const hasRun = Boolean(s);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
      if (hasRun && ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing))) {
        e.preventDefault();
        search.current?.focus();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (selected) onSelect(null);
        else onTheater?.(false);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= STAGES.length && (hasRun || n === 1)) onStage(STAGES[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect, onTheater, onStage, hasRun]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?oi=${oi.runId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const right = s ? L.right + L.gap * 2 : L.gap;
  const stageBox = { left: L.left + L.gap * 2, right, top: L.top, bottom: L.gap };

  return (
    <div className="fixed inset-0 z-[900] pointer-events-none" role="dialog" aria-label="OI workspace">
      <div className="absolute inset-x-0 top-0 h-[96px]" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.88) 45%, transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-[60px]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78) 40%, transparent)' }} />

      {/* ── Top bar ── */}
      <header className="glass-panel oi-glass absolute pointer-events-auto flex items-center gap-3 px-3" style={{ left: L.gap, right: L.gap, top: L.gap, height: 56 }}>
        <div className="flex items-center gap-2 flex-shrink-0 pl-1">
          <OiMark size={18} live={s?.status === 'running' || p.assistBusy} assist={p.mode === 'assist'} />
          <span className="hud-text text-[12px] text-[var(--text-heading)]">OI</span>
        </div>
        <span className="w-px h-7 bg-[var(--border-secondary)]" />
        <div className="min-w-0 flex-1">
          {s ? (
            <>
              <p className="text-[13px] font-semibold truncate text-[var(--text-heading)]" title={s.question}>{s.question}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[9.5px] font-mono tracking-[0.1em] uppercase text-[var(--text-muted)] min-w-0">
                {s.frame && <span className="flex-shrink-0 text-[var(--gold-primary)]">{KIND_LABEL[s.frame.kind]}</span>}
                {oi.runId && <span className="flex-shrink-0">Run {oi.runId.slice(0, 6)}</span>}
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === 'running' ? 'animate-osiris-pulse' : ''}`}
                    style={{ background: s.status === 'running' || s.status === 'done' ? T.gold : s.status === 'failed' ? T.red : T.mute, boxShadow: s.status === 'running' ? `0 0 6px ${gold(0.8)}` : undefined }} />
                  <span className="truncate normal-case tracking-[0.02em] text-[11px] font-sans text-[var(--text-secondary)]">{s.status === 'running' ? s.phaseLabel : s.status === 'done' ? 'Forecast complete' : s.status === 'failed' ? (s.message || 'Failed') : 'Stopped'}</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold truncate text-[var(--text-heading)]">OI command</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">No forecast yet. Run one, or ask OI to work the map.</p>
            </>
          )}
        </div>
        <div className="flex-shrink-0" style={{ width: 'min(400px, 30vw)' }}>
          <Segmented id="stage" value={shown} onChange={onStage} options={STAGE_OPTIONS(hasRun)} />
        </div>
        {s && <div className="flex-shrink-0 w-[200px]"><ObjectSearch ref={search} s={s} onPick={k => onSelect(k)} /></div>}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {p.engineMenu}
          {s && <Controls s={s} oi={oi} focus={p.focus} onFocus={p.onFocus} following={p.following} onFollow={p.onFollow} />}
          {s && <Chip onClick={share} on={copied} title="Copy a link that replays this run">{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Link'}</Chip>}
          {s && <IconButton title="New forecast" onClick={p.onNewForecast}><Plus className="w-3.5 h-3.5" /></IconButton>}
          <IconButton title="Leave full screen (Esc)" onClick={() => onTheater?.(false)}><Minimize2 className="w-3.5 h-3.5" /></IconButton>
        </div>
        {s && (
          <span className="absolute left-3 right-3 bottom-0 h-px bg-[var(--border-secondary)] overflow-hidden" aria-hidden>
            <span className="block h-full transition-[width] duration-700" style={{ width: `${progress * 100}%`, background: T.gold, boxShadow: `0 0 8px ${gold(0.8)}` }} />
          </span>
        )}
      </header>

      {/* ── Left: the command column ── */}
      <aside className="glass-panel oi-glass absolute pointer-events-auto flex flex-col overflow-hidden" style={{ left: L.gap, top: L.top, bottom: L.gap, width: L.left }} aria-label={p.mode === 'assist' ? 'OI Assist' : 'Forecast'}>
        <span className="absolute inset-x-0 top-0 h-px z-10" style={{ background: `linear-gradient(90deg, transparent, ${modeTint(p.mode)(0.75)} 30%, ${modeTint(p.mode)(0.75)} 70%, transparent)` }} aria-hidden />
        <div className="px-3 py-2.5 border-b border-[var(--border-secondary)] flex-shrink-0">
          <ModeSwitch id="ws" mode={p.mode} onMode={p.onMode} forecastLive={s?.status === 'running'} assistBusy={p.assistBusy} />
        </div>
        {p.mode === 'assist' ? (
          <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar flex flex-col">{p.assistView}</div>
        ) : s ? (
          <>
            <div className="px-4 pt-5 pb-4 border-b border-[var(--border-secondary)] flex flex-col gap-4 flex-shrink-0">
              <Verdict key={oi.runId ?? ''} s={s} large />
              {s.status === 'running' && oi.canSteer && <InjectBox oi={oi} s={s} />}
            </div>
            {p.errorBox}
            <div className="px-3 pt-3 flex-shrink-0">
              <Segmented id="left" size="sm" value={left} onChange={setLeftTab} options={[
                { value: 'assessment', label: s.report ? 'Report' : 'Sources' },
                { value: 'trace', label: 'Trace' },
              ]} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar p-4">
              {left === 'trace' ? <TraceView s={s} />
                : s.report ? <ReportBody s={s} runId={oi.runId} selected={selected} onSelect={onSelect} />
                  : <ContextList s={s} selected={selected} onSelect={onSelect} />}
            </div>
            <UsageLine s={s} />
          </>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar">
            {p.errorBox}
            {p.askView}
          </div>
        )}
      </aside>

      {/* ── Right: the selected object, or the run's lists ── */}
      {s && (
        <aside className="glass-panel oi-glass absolute pointer-events-auto flex flex-col overflow-hidden" style={{ right: L.gap, top: L.top, bottom: L.gap, width: L.right }} aria-label={selection ? 'Object' : 'Lists'}>
          {selection
            ? <ObjectView key={selection.key} s={s} sel={selection} onSelect={onSelect} onLocate={p.onLocate} onAsk={p.onAsk} onGraph={() => onStage('graph')} variant="panel" onBack={() => onSelect(null)} />
            : p.lists}
        </aside>
      )}

      {/* ── The stage ── */}
      <AnimatePresence>
        {s && shown !== 'globe' && (
          <motion.div key={shown} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.2 }}
            className="glass-panel oi-glass absolute pointer-events-auto overflow-hidden" style={{ ...stageBox, background: SOLID }}>
            <ErrorBoundary name={`OI ${shown}`}>
              {shown === 'graph' && <GraphView s={s} selected={selected} onSelect={onSelect} />}
              {shown === 'timeline' && <TimelineView s={s} selected={selected} onSelect={onSelect} />}
              {shown === 'table' && <TableView s={s} selected={selected} onSelect={onSelect} />}
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>
      {shown === 'globe' && (
        <div className="absolute flex justify-center pointer-events-none" style={{ left: stageBox.left, right: stageBox.right, bottom: L.gap + 12 }}>
          {s ? (
            <div className="pointer-events-auto"><Legend floating compact /></div>
          ) : (
            <div className="glass-panel oi-glass !rounded-full px-5 py-2.5 flex items-center gap-3 pointer-events-auto">
              <span className={LABEL} style={{ color: T.gold }}>Live globe</span>
              <span className="w-px h-3 bg-[var(--border-secondary)]" />
              <span className="text-[11px] text-[var(--text-secondary)]">Run a forecast to draw its analysis here, or ask OI to take you somewhere</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

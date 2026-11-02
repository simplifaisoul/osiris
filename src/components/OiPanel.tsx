'use client';
/**
 * OSIRIS OI: the panel.
 *
 * Two ways to use OI, on the reader's own model key. Assist (the default)
 * is a conversation: talk to OI and it works the map for you (flies there,
 * switches layers, finds what is live, marks it, puts it on screen, starts
 * forecasts, drives the workspace). Forecast is the prediction engine: set up
 * an engine, ask, watch the actors play it out in parallel worlds, read the
 * prediction and question the actors.
 *
 * Full screen, with or without a run, it opens the OI workspace
 * (oi/Workspace): the same Forecast / Assist column on the left, the globe,
 * research graph, timeline and object tables in the middle, and the run's
 * lists and object views on the right. Whatever is selected, from the globe,
 * the graph or a list, opens as that object.
 *
 * Forecast is gold and black, Assist the platform's blue (oi/theme); both
 * violet in Ghost. The run itself lives in the page (useOi), so closing this
 * panel leaves the globe drawing.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, History, Maximize2, Plus, X } from 'lucide-react';
import { PROVIDERS, providerInfo } from '@/lib/oi/providers';
import { loadEngine, loadKey, type Engine, type OiClient } from '@/lib/oi/client';
import { resolve } from '@/lib/oi/research';
import { T } from './oi/theme';
import { IconButton, OiMark } from './oi/atoms';
import { ModeSwitch, modeTint, type OiMode } from './oi/ModeSwitch';
import { AssistView } from './oi/assist/AssistView';
import type { AssistClient } from '@/lib/oi/assist/client';
import { AskForm, EnginePill, EngineSheet } from './oi/engine';
import { Connecting, InjectBox, RunHead, UsageLine, Verdict } from './oi/run';
import { HistoryList, RunTabs, type Tab } from './oi/lists';
import { ObjectView } from './oi/ObjectView';
import { Workspace, type Stage } from './oi/Workspace';

export interface OiPanelProps {
  oi: OiClient;
  /** What is selected: a node key, or "link:<id>" for an arc. */
  selected: string | null;
  onSelect: (key: string | null) => void;
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  onClose?: () => void;
  /** Inside another container (the phone drawer): no frame of its own, no full screen. */
  embedded?: boolean;
  /** Whether the other map layers are hidden so the analysis stands out, and the switch for it. */
  focus?: boolean;
  onFocus?: () => void;
  /** Full screen: the workspace. */
  theater?: boolean;
  onTheater?: (on: boolean) => void;
  /** Whether the camera is following the run, and the way to ask it to. */
  following?: boolean;
  onFollow?: () => void;
  /** The conversation (it lives in the page, so closing the panel keeps it). */
  assist: AssistClient;
  /** Which way of using OI is showing. */
  mode: OiMode;
  onMode: (m: OiMode) => void;
  /** Read OI's replies aloud. */
  speakOn: boolean;
  onSpeak: (on: boolean) => void;
  /** Put the cursor in the conversation's box when the panel opens. */
  autoFocus?: boolean;
  /** What the workspace's stage shows (globe, graph, timeline, table). */
  stage: Stage;
  onStage: (s: Stage) => void;
}

export type { OiMode };

/** The engine this browser last used, or OpenAI with its default model. */
function initialEngine(): Engine {
  const saved = loadEngine();
  if (saved && PROVIDERS.some(p => p.id === saved.provider)) return saved;
  return { provider: 'openai', model: providerInfo('openai').defaultModel, remember: false };
}

export default function OiPanel(props: OiPanelProps) {
  const { oi, selected, onSelect, embedded = false, theater = false } = props;
  // Settings come from this browser's storage. The panel only renders once opened, on the client.
  const [engine, setEngine] = useState<Engine>(initialEngine);
  const [key, setKey] = useState(() => loadKey(initialEngine().provider));
  // The engine sheet opens when asked: a first visit sees what OI does, and the Run and Send buttons ask for a key.
  const [engineOpen, setEngineOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Opened from a button lower down (Run, or Assist's composer), the sheet is brought into view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (engineOpen) scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [engineOpen]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [askTarget, setAskTarget] = useState('report');

  const s = oi.state;
  const info = providerInfo(engine.provider);
  const ready = !info.needsKey || key.length > 0;
  const selection = s ? resolve(s, selected) : null;
  // Until someone picks a tab: the simulation while it runs, the prediction once there is one.
  const activeTab: Tab = tab ?? (s?.report ? 'report' : 'sim');
  // A run is open but its first event has not arrived yet.
  const connecting = Boolean(oi.runId) && !s;

  // Asking an actor opens the Ask list; in the workspace that means stepping back from the object to the lists.
  const askActor = (id: string) => { setAskTarget(id); setTab('ask'); if (theater) onSelect(null); };
  const reset = () => { oi.clear(); onSelect(null); setShowHistory(false); setTab(null); };

  const errorBox = oi.error ? (
    <div role="alert" className="mx-4 mt-3 rounded-md pl-3 pr-2 py-2 text-[11.5px] leading-snug flex items-start gap-2 border-l-2" style={{ color: T.text, background: 'rgba(255,61,61,0.06)', borderColor: T.red }}>
      <span className="flex-1">{oi.error}</span>
      <button onClick={() => oi.setError('')} className="text-[var(--text-secondary)] hover:text-[var(--text-heading)]" aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : null;

  const tabs = s ? (
    <RunTabs
      s={s} tab={activeTab} setTab={setTab} oi={oi} engine={engine} keyValue={key} ready={ready}
      selected={selected} onSelect={onSelect} askTarget={askTarget} setAskTarget={setAskTarget} theater={theater}
    />
  ) : null;

  const assistView = (
    <AssistView assist={props.assist} oi={oi} ready={ready} providerName={info.name} onKey={() => setEngineOpen(true)}
      onSend={(text, m) => void props.assist.send(text, m, { engine, key })}
      onLocate={props.onLocate} onOpenForecast={() => props.onMode('forecast')}
      onWorkspace={!embedded && !theater && props.onTheater ? () => props.onTheater?.(true) : undefined}
      speakOn={props.speakOn} onSpeak={props.onSpeak} autoFocus={props.autoFocus} />
  );

  const askForm = (
    <AskForm ready={ready} providerName={info.name} onKey={() => setEngineOpen(true)} onRun={async (input) => {
      const id = await oi.start(input, engine, key);
      if (id) { setShowHistory(false); setTab(null); onSelect(null); }
      return Boolean(id);
    }} />
  );

  /* ── Full screen: the workspace, with or without a run ── */
  if (theater && !embedded) {
    const engineMenu = (
      <div className="relative">
        <EnginePill engine={engine} ready={ready} open={engineOpen} onClick={() => setEngineOpen(v => !v)} assist={props.mode === 'assist'} />
        <AnimatePresence>
          {engineOpen && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
              className="absolute right-0 top-[calc(100%+10px)] w-[380px] max-h-[70vh] overflow-y-auto styled-scrollbar rounded-lg border border-[var(--border-primary)] shadow-[0_18px_48px_rgba(0,0,0,0.7)] z-50"
              style={{ background: 'var(--oi-solid)' }}>
              <EngineSheet engine={engine} setEngine={setEngine} keyValue={key} setKey={setKey} onDone={() => setEngineOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
    const askView = connecting ? <Connecting onCancel={reset} /> : (
      <>
        {askForm}
        {oi.history.length > 0 && <div className="border-t border-[var(--border-secondary)]"><HistoryList oi={oi} onPick={id => { setTab(null); onSelect(null); void oi.watch(id); }} /></div>}
      </>
    );
    const node = (
      <Workspace s={s} oi={oi} selected={selected} onSelect={onSelect} onLocate={props.onLocate} onAsk={askActor}
        onTheater={props.onTheater} focus={props.focus} onFocus={props.onFocus} following={props.following} onFollow={props.onFollow}
        mode={props.mode} onMode={props.onMode} stage={props.stage} onStage={props.onStage}
        lists={tabs} errorBox={errorBox} assistView={assistView} askView={askView} engineMenu={engineMenu}
        onNewForecast={reset} assistBusy={props.assist.busy} />
    );
    return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
  }

  /* ── Docked, or in the phone drawer ── */
  const assisting = props.mode === 'assist';
  // The switch below says which mode is showing; the header is OI itself and its controls.
  const header = (
    <header className={`flex items-center gap-2.5 ${embedded ? 'pb-3' : 'h-[52px] pl-4 pr-2.5 border-b border-[var(--border-secondary)] bg-black/30'}`}>
      {!embedded && <OiMark size={18} live={s?.status === 'running' || props.assist.busy} assist={assisting} />}
      {!embedded && <span className="hud-text text-[12px] text-[var(--text-heading)]">OI</span>}
      <div className="ml-auto flex items-center gap-0.5">
        <EnginePill engine={engine} ready={ready} open={engineOpen} onClick={() => setEngineOpen(v => !v)} assist={assisting} />
        {!assisting && <IconButton title={showHistory ? 'Back' : 'Your predictions'} onClick={() => setShowHistory(v => !v)} active={showHistory}><History className="w-3.5 h-3.5" /></IconButton>}
        {!assisting && s && <IconButton title="New prediction" onClick={reset}><Plus className="w-3.5 h-3.5" /></IconButton>}
        {!embedded && props.onTheater && <IconButton title="Full screen: the OI workspace" onClick={() => props.onTheater?.(true)}><Maximize2 className="w-3.5 h-3.5" /></IconButton>}
        {props.onClose && !embedded && <IconButton title="Close (the run keeps going)" onClick={props.onClose}><X className="w-3.5 h-3.5" /></IconButton>}
      </div>
    </header>
  );

  const modeSwitch = (
    <div className={embedded ? 'pb-3' : 'px-3 py-2.5 border-b border-[var(--border-secondary)]'}>
      <ModeSwitch id={embedded ? 'm' : 'd'} mode={props.mode} onMode={props.onMode} forecastLive={s?.status === 'running'} assistBusy={props.assist.busy} />
    </div>
  );

  const body = assisting ? (
    <>
      <AnimatePresence initial={false}>
        {engineOpen && (
          <motion.div key="engine" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <EngineSheet engine={engine} setEngine={setEngine} keyValue={key} setKey={setKey} onDone={() => setEngineOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {assistView}
    </>
  ) : (
    <>
      <AnimatePresence initial={false}>
        {engineOpen && (
          <motion.div key="engine" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <EngineSheet engine={engine} setEngine={setEngine} keyValue={key} setKey={setKey} onDone={() => setEngineOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {errorBox}
      {showHistory ? (
        <HistoryList oi={oi} onPick={id => { setShowHistory(false); setTab(null); onSelect(null); void oi.watch(id); }} />
      ) : !s ? (
        connecting ? <Connecting onCancel={reset} /> : askForm
      ) : (
        <div className="flex flex-col">
          <div className="px-4 pt-4 pb-5 flex flex-col gap-6 border-b border-[var(--border-secondary)]">
            <RunHead s={s} oi={oi} focus={props.focus} onFocus={props.onFocus} following={props.following} onFollow={props.onFollow} />
            <Verdict key={oi.runId ?? ''} s={s} />
            {!embedded && props.onTheater && (
              <button onClick={() => props.onTheater?.(true)}
                className="group -mt-1 flex items-center gap-3 w-full rounded-lg border border-[var(--border-secondary)] bg-white/[0.015] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-active)] hover:bg-[var(--hover-accent)]">
                <Maximize2 className="w-4 h-4 flex-shrink-0 text-[var(--gold-primary)]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-heading)]">Open the workspace</span>
                  <span className="block text-[10.5px] text-[var(--text-muted)] truncate">The research graph, every world on a timeline, every object in tables</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--gold-light)]" />
              </button>
            )}
          </div>
          <AnimatePresence mode="wait">
            {selection && (
              <motion.div key={selection.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="px-4 pt-4">
                <ObjectView s={s} sel={selection} onSelect={onSelect} onLocate={props.onLocate} onAsk={askActor} />
              </motion.div>
            )}
          </AnimatePresence>
          {s.status === 'running' && oi.canSteer && <div className="px-4 pt-4"><InjectBox oi={oi} s={s} /></div>}
          <div className="pt-2">{tabs}</div>
          <UsageLine s={s} />
        </div>
      )}
    </>
  );

  if (embedded) return <div className="flex flex-col">{header}{modeSwitch}<div className="-mx-3">{body}</div></div>;

  return (
    <div className="glass-panel oi-glass relative overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
      {/* A thread along the top edge in the mode's colour: gold for Forecast, blue for Assist. */}
      <span className="absolute inset-x-0 top-0 h-px z-10 transition-[background] duration-500" style={{ background: `linear-gradient(90deg, transparent, ${modeTint(props.mode)(0.75)} 30%, ${modeTint(props.mode)(0.75)} 70%, transparent)` }} aria-hidden />
      {header}
      {modeSwitch}
      <div ref={scroller} className="min-h-0 overflow-y-auto styled-scrollbar">{body}</div>
    </div>
  );
}

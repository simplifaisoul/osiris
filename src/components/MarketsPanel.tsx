'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, BarChart3,
  Zap, Shield, Droplets, Gem, Bitcoin, LineChart, Maximize2, Minimize2,
  DollarSign, ArrowUpDown, AlertTriangle,
} from 'lucide-react';
import AiOverview from './AiOverview';

// Canvas charting has no business in the server bundle, and it only mounts
// once a ticker is actually opened.
const MarketChart = dynamic(() => import('./MarketChart'), { ssr: false });

interface Quote {
  name: string;
  symbol: string;
  price: number;
  change_percent: number;
  up: boolean;
  spark?: number[];
  currency?: string;
  market_open?: boolean;
}

interface MarketsPanelProps { data: any; spaceWeather?: any; }

const SECTIONS = [
  { key: 'indices', label: 'INDICES', icon: LineChart },
  { key: 'stocks', label: 'DEFENSE', icon: Shield },
  { key: 'oil', label: 'ENERGY', icon: Droplets },
  { key: 'commodities', label: 'COMMODITIES', icon: Gem },
  { key: 'crypto', label: 'CRYPTO', icon: Bitcoin },
  { key: 'fx', label: 'FX', icon: DollarSign },
];

const GREEN = 'var(--alert-green)';
const RED = 'var(--alert-red)';

/** Prices span 0.9 (FX) to 100,000 (BTC) — one formatter can't serve both. */
function formatPrice(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v / 1000).toFixed(1)}K`;
  if (abs >= 100) return v.toFixed(2);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

/**
 * A month of closes as a single path. Drawn in the direction colour so the
 * trend and the day's move read as one thing rather than two competing signals.
 */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const W = 46, H = 14;
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1; // a flat line would divide by zero
    const step = W / (points.length - 1);
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - ((p - min) / span) * H).toFixed(1)}`)
      .join(' ');
  }, [points]);

  if (!path) return <div style={{ width: W, height: H }} />;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={up ? GREEN : RED} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function Ticker({ quote, active, onSelect }: { quote: Quote; active: boolean; onSelect: () => void }) {
  const d = quote;
  return (
    <button
      onClick={onSelect}
      title={`${d.name} — open chart`}
      className={`w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded transition-colors ${active ? 'bg-[var(--hover-accent)] border border-[var(--border-primary)]' : 'border border-transparent hover:bg-[var(--hover-accent)]'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-mono text-[var(--text-secondary)] tracking-wide truncate">{d.name}</div>
        {d.symbol && d.symbol !== d.name && (
          <div className="text-[9px] font-mono text-[var(--text-muted)] truncate">{d.symbol}</div>
        )}
      </div>

      <Sparkline points={d.spark || []} up={d.up} />

      <div className="flex flex-col items-end shrink-0 w-[86px]">
        <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] tabular-nums">
          {formatPrice(d.price)}
        </span>
        <span
          className="text-[10px] font-mono font-bold flex items-center gap-0.5 tabular-nums"
          style={{ color: d.up ? GREEN : RED }}
        >
          {d.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {d.change_percent > 0 ? '+' : ''}{d.change_percent?.toFixed(2)}%
        </span>
      </div>
    </button>
  );
}

/** How long ago the feed was built, so a frozen panel is visibly frozen. */
function useFeedAge(timestamp?: string): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!timestamp) return null;
  const ms = now - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function MarketsPanel({ data, spaceWeather }: MarketsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [activeSection, setActiveSection] = useState('stocks');
  const [sortByMove, setSortByMove] = useState(false);
  /** The instrument whose chart is open, if any. */
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  // Memoised so the derived lists below don't recompute on every render.
  const markets = useMemo(() => data.markets || {}, [data.markets]);
  const age = useFeedAge(markets.timestamp);

  // Ensure portal only renders on client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fullscreen covers the map, so Escape has to get you out of it — closing
  // the chart first, since that is the nearer thing to dismiss.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else setMaximized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, selected]);

  /** Every instrument across every section — the basis for the breadth line. */
  const allQuotes = useMemo<Quote[]>(
    () => SECTIONS.flatMap(s => Object.values<Quote>(markets[s.key] || {})).filter(q => Number.isFinite(q?.change_percent)),
    [markets],
  );

  const breadth = useMemo(() => {
    if (!allQuotes.length) return null;
    const up = allQuotes.filter(q => q.change_percent > 0).length;
    const sorted = [...allQuotes].sort((a, b) => b.change_percent - a.change_percent);
    return { up, down: allQuotes.length - up, total: allQuotes.length, top: sorted[0], worst: sorted[sorted.length - 1] };
  }, [allQuotes]);

  const rows = useMemo<Quote[]>(() => {
    const list = Object.values<Quote>(markets[activeSection] || {});
    return sortByMove ? [...list].sort((a, b) => b.change_percent - a.change_percent) : list;
  }, [markets, activeSection, sortByMove]);

  // A section with no rows means the upstream refresh failed — say so, rather
  // than showing a "Loading…" that never resolves until the next 15m poll.
  const feedLoaded = Boolean(markets.timestamp || markets.error);
  const sessionOpen = rows.some(q => q.market_open);

  /* The blocks below are shared by both layouts. Docked stacks them in one
     column; fullscreen splits them across two, so they carry no margins of
     their own — the container that places them owns the spacing. */

  const breadthBlock = breadth && (
    <div className="px-2 py-1.5 rounded-lg border border-[var(--border-primary)] bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)]">BREADTH</span>
        <span className="text-[10px] font-mono tabular-nums">
          <span style={{ color: GREEN }}>{breadth.up}▲</span>
          <span className="text-[var(--text-muted)]"> / </span>
          <span style={{ color: RED }}>{breadth.down}▼</span>
          <span className="text-[var(--text-muted)]"> of {breadth.total}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-[var(--alert-red)]/30">
        <div className="h-full rounded-full" style={{ width: `${(breadth.up / breadth.total) * 100}%`, background: GREEN }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono">
        <span style={{ color: GREEN }}>▲ {breadth.top.name} +{breadth.top.change_percent.toFixed(2)}%</span>
        <span style={{ color: RED }}>▼ {breadth.worst.name} {breadth.worst.change_percent.toFixed(2)}%</span>
      </div>
    </div>
  );

  const spaceBlock = spaceWeather && (
    <div className="p-2 rounded-lg border" style={{ borderColor: `${spaceWeather.storm_color}33`, background: `${spaceWeather.storm_color}08` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3" style={{ color: spaceWeather.storm_color }} />
          <span className="text-[11px] font-mono tracking-widest text-[var(--text-muted)]">SPACE WEATHER</span>
        </div>
        <span className="text-[11px] font-mono font-bold" style={{ color: spaceWeather.storm_color }}>
          Kp {spaceWeather.kp_index} — {spaceWeather.storm_level}
        </span>
      </div>
      {spaceWeather.solar_flares?.length > 0 && (
        <div className="mt-1 text-[9px] font-mono text-[var(--text-muted)]">
          Latest flare: {spaceWeather.solar_flares[0].class}
        </div>
      )}
    </div>
  );

  const aiBlock = <AiOverview mode="markets" payload={{ markets, spaceWeather }} accent="#D4AF37" />;

  const scmBlock = markets.scm_alerts && markets.scm_alerts.length > 0 && (
    <div className="space-y-1">
      {markets.scm_alerts.map((alert: string, i: number) => (
        <div key={i} className="px-2 py-1.5 rounded border border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500] text-[10px] font-mono leading-tight shadow-[0_0_8px_rgba(255,149,0,0.15)]">
          {alert}
        </div>
      ))}
    </div>
  );

  const chartBlock = selected && (
    <MarketChart
      symbol={selected.symbol}
      name={selected.name}
      large={maximized}
      onClose={() => setSelected(null)}
    />
  );

  const tabsBar = (
    <div className="flex gap-0.5 overflow-x-auto styled-scrollbar">
      {SECTIONS.map(s => {
        const Icon = s.icon;
        const count = Object.keys(markets[s.key] || {}).length;
        return (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-mono tracking-wider whitespace-nowrap transition-all ${activeSection === s.key ? 'bg-[var(--hover-accent)] text-[var(--gold-primary)] border border-[var(--border-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'}`}>
            <Icon className="w-3 h-3" />
            {s.label}
            {count > 0 && <span className="text-[var(--text-muted)]">{count}</span>}
          </button>
        );
      })}
    </div>
  );

  const listHeader = rows.length > 0 && (
    <div className="flex items-center justify-between px-2 py-1 shrink-0">
      <span className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-[var(--text-muted)]">
        <span className="w-1 h-1 rounded-full" style={{ background: sessionOpen ? GREEN : 'var(--text-muted)' }} />
        {sessionOpen ? 'SESSION OPEN' : 'SESSION CLOSED'}
      </span>
      <button
        onClick={() => setSortByMove(v => !v)}
        className={`flex items-center gap-1 text-[9px] font-mono tracking-widest transition-colors ${sortByMove ? 'text-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
        title={sortByMove ? 'Listed by biggest move' : 'Listed in feed order'}
      >
        <ArrowUpDown className="w-2.5 h-2.5" />
        {sortByMove ? 'BY MOVE' : 'DEFAULT'}
      </button>
    </div>
  );

  const listRows = (
    <>
      {rows.map(q => (
        <Ticker
          key={q.symbol || q.name}
          quote={q}
          active={selected?.symbol === q.symbol}
          onSelect={() => setSelected(
            selected?.symbol === q.symbol ? null : { symbol: q.symbol, name: q.name },
          )}
        />
      ))}

      {rows.length === 0 && (
        feedLoaded ? (
          <div className="flex items-center justify-center gap-1.5 py-3 text-[10px] font-mono text-[var(--text-muted)]">
            <AlertTriangle className="w-3 h-3" />
            {activeSection.toUpperCase()} FEED UNAVAILABLE — RETRYING
          </div>
        ) : (
          <div className="text-center py-3 text-[11px] font-mono text-[var(--text-muted)]">Loading {activeSection}...</div>
        )
      )}
    </>
  );

  const content = (
    // The entry slide is opacity-only. A translateX here leaves a transform on
    // the element, and when the panel goes fullscreen that transform offsets a
    // `fixed` box away from its inset — the panel was landing 20px off the left
    // edge of the viewport, because the animation had never settled back to 0.
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} className={`glass-panel instrument-grid instrument-corners p-3 pointer-events-auto transition-all duration-300 flex flex-col ${
      // `relative` and `fixed` are both position utilities, so listing them
      // together lets CSS order decide the winner rather than the state —
      // which is what stopped the panel going fullscreen.
      maximized ? 'fixed inset-3 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : 'relative'
    }`}>
      {/* Header controls sit side by side, not nested — a button inside a
          button is invalid HTML and React fails hydration on it. */}
      <div className="flex items-center justify-between w-full mb-2">
        <button onClick={() => setExpanded(!expanded)} className="relative flex items-center gap-2 pl-2">
          {/* Same lit accent bar as the route planner, so the two panels read
              as one instrument set rather than two unrelated widgets. */}
          <span
            aria-hidden="true"
            className="absolute left-[-10px] top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r"
            style={{ background: 'var(--gold-primary)', boxShadow: '0 0 8px rgba(var(--gold-rgb),0.6)' }}
          />
          <BarChart3 className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="instrument-title">Markets &amp; Intel</span>
          <span className="instrument-chip" style={{ color: 'var(--alert-green)' }}>Live</span>
        </button>
        <div className="flex items-center gap-2">
          {age && <span className="text-[9px] font-mono text-[var(--text-muted)]">{age}</span>}
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
          <button onClick={() => { setMaximized(!maximized); if (!expanded && !maximized) setExpanded(true); }} className="p-1.5 -m-0.5 rounded hover:text-white hover:bg-white/10 transition-colors" title={maximized ? "Restore" : "Maximize"}>
            {maximized ? <Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
          <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
        </div>
      </div>
      <div className="instrument-rule mb-2 flex-shrink-0" />

      {/* Fades rather than animating height. Fullscreen makes this a flex child
          and docked lets it size to content; animating height across that
          switch stranded it at 0 with the content spilling out of the panel.
          The key remounts it per mode so the chart re-measures at the new size. */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key={maximized ? 'fullscreen' : 'docked'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={maximized ? 'flex-1 min-h-0 flex flex-col' : ''}
          >
            {maximized ? (
              /* Fullscreen: context and chart on the left, the list beside it.
                 Each column scrolls on its own, so a long list never pushes the
                 chart off-screen and the panel itself never overflows. Below
                 lg the columns stack and the whole body scrolls instead. */
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-3 overflow-y-auto lg:overflow-hidden styled-scrollbar">
                <div className="min-h-0 lg:overflow-y-auto styled-scrollbar space-y-2 lg:pr-1">
                  {chartBlock}
                  {breadthBlock}
                  {scmBlock}
                  {spaceBlock}
                  {aiBlock}
                </div>

                <div className="min-h-0 flex flex-col lg:border-l lg:border-[var(--border-primary)] lg:pl-3">
                  <div className="shrink-0 space-y-2">
                    {tabsBar}
                    {listHeader}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar space-y-0.5">
                    {listRows}
                  </div>
                </div>
              </div>
            ) : (
              /* Docked: one scroll region for the whole body, capped to the
                 viewport. With a chart open the content is taller than the
                 screen, and nested scrollers here would mean choosing which
                 one you meant to scroll. */
              <div className="space-y-2 overflow-y-auto styled-scrollbar max-h-[calc(100vh-9rem)] pr-0.5">
                {breadthBlock}
                {spaceBlock}
                {aiBlock}
                {tabsBar}
                {scmBlock}
                {chartBlock}
                <div>
                  {listHeader}
                  <div className="space-y-0.5">
                    {listRows}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (maximized && mounted && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}

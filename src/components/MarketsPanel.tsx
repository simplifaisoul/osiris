'use client';

import { useState, useEffect, useMemo, useCallback, type ComponentType, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  BarChart3, Bitcoin, ChevronDown, ChevronUp, DollarSign, Droplets, Gem, LineChart,
  Maximize2, Minimize2, Shield, Star, TriangleAlert,
} from 'lucide-react';
import AiOverview from './AiOverview';
import DonBotScan from './DonBotScan';
import DigitalDonMark from './DigitalDonMark';
import {
  FUNCTIONS, PULSE, WEI_REGIONS,
  exchangeClocks, formatMove, formatNet, formatPrice, formatVolume, heat, longName, monthChange,
  netChange, parseCommand, parseWatchlist, rangePosition, sortQuotes, suggest, toggleWatch, tradeTime,
  WATCHLIST_KEY,
  type FunctionCode, type MarketQuote as Quote, type SortKey, type Suggestion,
} from '@/lib/markets';

/**
 * OSIRIS — the markets terminal.
 *
 * Driven the way a market terminal is — a command line that takes a ticker or
 * a function code, numbered function keys, one dense monitor — and dressed in
 * OSIRIS's own glass, gold and theme colours, so it sits with RECON and the
 * rest of the HUD rather than apart from them. The monitor widens to more
 * columns as the panel does: price and move docked; net change, day range,
 * 52-week position, last trade and volume in full screen.
 *
 * Nothing here costs a request of its own: every column comes from the one
 * quote per instrument the feed already fetches.
 */

// Canvas charting has no business in the server bundle, and it only mounts
// once a security is loaded.
const MarketChart = dynamic(() => import('./MarketChart'), { ssr: false });

interface MarketsPanelProps { data: any; spaceWeather?: any; }

/** The theme's own colours, so Ghost and every other theme recolour this too. */
const T = {
  accent: 'var(--gold-primary)',
  text: 'var(--text-primary)',
  dim: 'var(--text-secondary)',
  faint: 'var(--text-muted)',
  line: 'var(--border-primary)',
  up: 'var(--alert-green)',
  down: 'var(--alert-red)',
  alert: 'var(--alert-orange)',
} as const;

/** One icon per function key, as RECON gives one to each tool. */
const ICONS: Record<FunctionCode, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  WEI: LineChart, DEF: Shield, NRG: Droplets, CMDTY: Gem, FX: DollarSign, CRYPTO: Bitcoin, WATCH: Star, DON: DigitalDonMark,
};

const SECTION_OF: Record<string, FunctionCode> = { indices: 'WEI', stocks: 'DEF', oil: 'NRG', commodities: 'CMDTY', fx: 'FX', crypto: 'CRYPTO' };
const FEED_SECTIONS = ['indices', 'stocks', 'oil', 'commodities', 'crypto', 'fx'] as const;

const moveColor = (pct: number | null | undefined) =>
  pct == null || !Number.isFinite(pct) ? T.faint : pct > 0 ? T.up : pct < 0 ? T.down : T.text;

/** The clock, ticking every `ms`. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** A month of closes as one thin path, coloured by the month's direction. */
function Spark({ points }: { points?: number[] }) {
  const W = 48, H = 14;
  const path = useMemo(() => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
    const step = W / (points.length - 1);
    return points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(H - ((p - min) / span) * H).toFixed(1)}`).join(' ');
  }, [points]);
  if (!path) return <span className="inline-block" style={{ width: W }} />;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block overflow-visible align-middle" aria-hidden="true">
      <path d={path} fill="none" stroke={moveColor(monthChange(points))} strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/** Where the price sits between two extremes: a hairline track and a tick. */
function RangeBar({ pos, title }: { pos: number | null; title: string }) {
  return (
    <span className="relative inline-block w-14 h-2 align-middle" title={title}>
      <span className="absolute inset-x-0 top-1/2 h-px rounded-full" style={{ background: T.line }} />
      {pos != null && <span className="absolute top-0 h-2 w-[2px] rounded-full" style={{ left: `calc(${(pos * 100).toFixed(1)}% - 1px)`, background: T.accent }} />}
    </span>
  );
}

function SortHeader({ label, k, sort, onSort, className = '' }: {
  label: string; k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th scope="col" className={`font-normal ${className}`} aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(k)} className="hover:text-[var(--text-primary)] transition-colors" style={{ color: active ? T.accent : undefined }}>
        {label}{active ? (sort.asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
}

/**
 * The monitor: one row per security. Columns appear as the table's own width
 * allows (container queries), so the same table is a compact board docked and
 * a full monitor in full screen.
 */
function SecurityTable({ groups, selected, watchlist, sort, onSort, onOpen, onStar, now }: {
  groups: { label?: string; rows: Quote[] }[];
  selected: string | null;
  watchlist: string[];
  sort: { key: SortKey; asc: boolean };
  onSort: (k: SortKey) => void;
  onOpen: (q: Quote) => void;
  onStar: (symbol: string) => void;
  now: number;
}) {
  return (
    <div className="@container">
      <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-[var(--bg-panel-solid)]">
          <tr className="text-[9px] tracking-wider text-left border-b border-[var(--border-secondary)] text-[var(--text-muted)]">
            <th scope="col" className="w-5 font-normal"><span className="sr-only">Watch</span></th>
            <SortHeader label="SECURITY" k="name" sort={sort} onSort={onSort} className="py-1.5" />
            <th scope="col" className="font-normal text-right pr-2">LAST</th>
            <th scope="col" className="font-normal text-right pr-2 hidden @2xl:table-cell">NET</th>
            <SortHeader label="%CHG" k="move" sort={sort} onSort={onSort} className="text-right pr-2" />
            <SortHeader label="1M" k="month" sort={sort} onSort={onSort} className="text-right pr-1 hidden @min-[20rem]:table-cell" />
            <th scope="col" className="font-normal text-center px-2 hidden @2xl:table-cell">DAY RANGE</th>
            <th scope="col" className="font-normal text-center px-2 hidden @3xl:table-cell">52W</th>
            <th scope="col" className="font-normal text-right pl-3 pr-2 hidden @4xl:table-cell">VOLUME</th>
            <th scope="col" className="font-normal text-right pl-3 pr-1 hidden @3xl:table-cell">TIME</th>
          </tr>
        </thead>
        {groups.map((g, gi) => (
          <tbody key={g.label ?? gi}>
            {g.label && (
              <tr>
                <td colSpan={10} className="pt-2.5 pb-1 pl-1 text-[9px] tracking-[0.2em]" style={{ color: T.accent }}>{g.label}</td>
              </tr>
            )}
            {g.rows.map(q => {
              const active = selected === q.symbol;
              const starred = watchlist.includes(q.symbol);
              const net = netChange(q);
              const month = monthChange(q.spark);
              return (
                <tr
                  key={q.symbol}
                  onClick={() => onOpen(q)}
                  className="cursor-pointer odd:bg-white/[0.015] hover:bg-[var(--hover-accent)] transition-colors"
                  style={active ? { background: 'var(--hover-accent)', boxShadow: `inset 2px 0 0 ${T.accent}` } : undefined}
                >
                  <td className="w-5 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); onStar(q.symbol); }}
                      aria-label={starred ? `Remove ${q.name} from watchlist` : `Add ${q.name} to watchlist`}
                      aria-pressed={starred}
                      className="p-0.5 align-middle"
                    >
                      <Star className="w-2.5 h-2.5" fill={starred ? 'currentColor' : 'none'} style={{ color: starred ? T.accent : T.faint }} />
                    </button>
                  </td>
                  <td className="py-[4px] pr-2 max-w-0 w-full">
                    <button
                      onClick={e => { e.stopPropagation(); onOpen(q); }}
                      className="flex items-baseline gap-1.5 min-w-0 w-full text-left"
                      title={`${q.description || q.name} — ${q.symbol}${q.exchange ? ` · ${q.exchange}` : ''}`}
                    >
                      <span className="font-bold truncate shrink-0 max-w-[60%]" style={{ color: active ? T.accent : T.text }}>{q.name}</span>
                      <span className="text-[9px] truncate" style={{ color: T.faint }}>{q.description && q.description !== q.name ? q.description : q.symbol}</span>
                    </button>
                  </td>
                  <td className="text-right pr-2 whitespace-nowrap" style={{ color: T.text }}>{formatPrice(q)}</td>
                  <td className="text-right pr-2 whitespace-nowrap hidden @2xl:table-cell" style={{ color: moveColor(net) }}>{formatNet(q, net)}</td>
                  <td className="text-right pr-2 whitespace-nowrap font-bold" style={{ color: moveColor(q.change_percent) }}>{formatMove(q.change_percent)}</td>
                  <td className="text-right pr-1 whitespace-nowrap hidden @min-[20rem]:table-cell" title={`One month ${formatMove(month)}`}><Spark points={q.spark} /></td>
                  <td className="text-center px-2 hidden @2xl:table-cell">
                    <RangeBar
                      pos={rangePosition(q.price, q.day_low, q.day_high)}
                      title={q.day_low != null && q.day_high != null ? `Day ${formatPrice(q, q.day_low)} – ${formatPrice(q, q.day_high)}` : 'No day range'}
                    />
                  </td>
                  <td className="text-center px-2 hidden @3xl:table-cell">
                    <RangeBar
                      pos={rangePosition(q.price, q.low_52w, q.high_52w)}
                      title={q.low_52w != null && q.high_52w != null ? `52 weeks ${formatPrice(q, q.low_52w)} – ${formatPrice(q, q.high_52w)}` : 'No 52-week range'}
                    />
                  </td>
                  <td className="text-right pl-3 pr-2 hidden @4xl:table-cell" style={{ color: T.dim }}>{formatVolume(q.volume)}</td>
                  <td className="text-right pl-3 pr-1 hidden @3xl:table-cell" style={{ color: q.market_open ? T.text : T.faint }}>{tradeTime(q.time, now)}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export default function MarketsPanel({ data, spaceWeather }: MarketsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  /** Starred symbols, kept in this browser only. */
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY)); } catch { return []; }
  });
  const [fn, setFn] = useState<FunctionCode | 'HELP'>(() => (watchlist.length ? 'WATCH' : 'WEI'));
  /** The security loaded into the chart, if any. */
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'feed', asc: false });
  const [command, setCommand] = useState('');
  const [pick, setPick] = useState(-1);
  const [miss, setMiss] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = useNow(30_000);
  const markets = useMemo(() => data.markets || {}, [data.markets]);

  /** Every instrument, tagged with its section. */
  const allQuotes = useMemo<Quote[]>(
    () => FEED_SECTIONS.flatMap(s => Object.values<Quote>(markets[s] || {}).map(q => ({ ...q, group: q.group ?? s })))
      .filter(q => Number.isFinite(q?.price) && Number.isFinite(q?.change_percent)),
    [markets],
  );
  const bySymbol = useMemo(() => new Map(allQuotes.map(q => [q.symbol, q])), [allQuotes]);
  const feedLoaded = Boolean(markets.timestamp || markets.error);

  const breadth = useMemo(() => {
    if (!allQuotes.length) return null;
    const up = allQuotes.filter(q => q.change_percent > 0).length;
    const down = allQuotes.filter(q => q.change_percent < 0).length;
    const sorted = [...allQuotes].sort((a, b) => b.change_percent - a.change_percent);
    return { up, down, flat: allQuotes.length - up - down, total: allQuotes.length, best: sorted.slice(0, 5), worst: sorted.slice(-5).reverse() };
  }, [allQuotes]);

  // Full screen covers the map, so Escape must get out of it — unloading the
  // chart first, the nearer thing to dismiss.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (selected) setSelected(null);
      else setMaximized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, selected]);

  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => setMiss(null), 2600);
    return () => clearTimeout(t);
  }, [miss]);

  const star = useCallback((symbol: string) => {
    setWatchlist(prev => {
      const next = toggleWatch(prev, symbol);
      try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  const open = useCallback((q: { symbol: string }) => {
    setSelected(prev => (prev === q.symbol ? null : q.symbol));
  }, []);

  /** Load a security: chart it, and bring up the function that lists it. */
  const load = useCallback((symbol: string) => {
    const q = bySymbol.get(symbol);
    if (!q) return;
    setSelected(symbol);
    if (q.group && SECTION_OF[q.group] && fn !== 'WATCH') setFn(SECTION_OF[q.group]);
  }, [bySymbol, fn]);

  const run = useCallback((s?: Suggestion) => {
    const typed = command;
    setCommand('');
    setPick(-1);
    if (s) {
      if (s.kind === 'function') setFn(s.value as FunctionCode);
      else load(s.value);
      return;
    }
    const cmd = parseCommand(typed, allQuotes);
    if (cmd.kind === 'function') setFn(cmd.code);
    else if (cmd.kind === 'security') load(cmd.symbol);
    else if (cmd.kind === 'help') setFn('HELP');
    else if (typed.trim()) setMiss(typed.trim().toUpperCase().slice(0, 24));
  }, [command, allQuotes, load]);

  const suggestions = useMemo(() => suggest(command, allQuotes), [command, allQuotes]);

  /** Names start A→Z and numbers biggest first; a second click reverses, a third goes back to feed order. */
  const onSort = useCallback((k: SortKey) => {
    setSort(prev => {
      const first = k === 'name';
      if (prev.key !== k) return { key: k, asc: first };
      if (prev.asc === first) return { key: k, asc: !first };
      return { key: 'feed', asc: false };
    });
  }, []);

  const current = fn === 'HELP' ? null : FUNCTIONS.find(f => f.code === fn)!;

  /** The rows for the function on screen, grouped by region on WEI. */
  const groups = useMemo<{ label?: string; rows: Quote[] }[]>(() => {
    if (!current || current.section === 'donbot') return [];
    if (current.section === 'watch') {
      return [{ rows: sortQuotes(watchlist.map(s => bySymbol.get(s)).filter((q): q is Quote => !!q), sort.key, sort.asc) }];
    }
    const rows = allQuotes.filter(q => q.group === current.section);
    if (current.code === 'WEI' && sort.key === 'feed') {
      return WEI_REGIONS
        .map(r => ({ label: r.label, rows: r.symbols.map(s => bySymbol.get(s)).filter((q): q is Quote => !!q) }))
        .filter(g => g.rows.length);
    }
    return [{ rows: sortQuotes(rows, sort.key, sort.asc) }];
  }, [current, allQuotes, bySymbol, watchlist, sort]);

  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const openCount = groups.reduce((n, g) => n + g.rows.filter(q => q.market_open).length, 0);
  const updated = markets.timestamp ? tradeTime(Date.parse(markets.timestamp) / 1000, now) : '—';
  /* Full screen always has a chart up: the one loaded, else the first benchmark. */
  const chartSymbol = selected ?? (maximized ? (bySymbol.has(PULSE[0].symbol) ? PULSE[0].symbol : allQuotes[0]?.symbol ?? null) : null);
  const chartQuote = chartSymbol ? bySymbol.get(chartSymbol) : undefined;

  /* ── The pieces, shared by both layouts ───────────────────── */

  const feedStatus = (
    <span className="text-[9px] font-mono tracking-wider tabular-nums whitespace-nowrap" style={{ color: T.faint }} title="When the feed was last built, UTC">
      UPD {updated}Z
    </span>
  );

  const clocks = (
    <div className="hidden xl:flex items-center gap-3 text-[10px] font-mono tabular-nums" title="Regular sessions, local time. Holidays and early closes are not shown.">
      {exchangeClocks(new Date(now)).map(c => (
        <span key={c.code} className="flex items-center gap-1">
          <span style={{ color: T.faint }}>{c.code}</span>
          <span style={{ color: T.dim }}>{c.time}</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.open ? T.up : T.faint, opacity: c.open ? 1 : 0.5 }} title={c.open ? 'Open' : 'Closed'} />
        </span>
      ))}
    </div>
  );

  const commandLine = (
    <form onSubmit={e => { e.preventDefault(); run(pick >= 0 ? suggestions[pick] : undefined); }} className="relative flex gap-1.5">
      <div className="flex-1 relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold" style={{ color: T.accent }} aria-hidden="true">&gt;</span>
        <input
          value={command}
          onChange={e => { setCommand(e.target.value); setPick(-1); setMiss(null); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setPick(p => (p + 1) % suggestions.length); }
            else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setPick(p => (p <= 0 ? suggestions.length - 1 : p - 1)); }
            else if (e.key === 'Escape' && command) { e.preventDefault(); setCommand(''); setPick(-1); }
          }}
          placeholder={miss ? `No match for ${miss}` : 'Ticker or function · LMT · gold · FX · help'}
          aria-label="Markets command: a ticker or function code"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className={`w-full bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg pl-6 pr-2 py-1.5 text-[11px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-active)] transition-colors ${
            miss ? 'placeholder:text-[var(--alert-red)]' : 'placeholder:text-[var(--text-muted)]'
          }`}
          style={{ caretColor: T.accent }}
        />
      </div>
      <button
        type="submit"
        className="px-3 rounded-lg text-[10px] font-mono font-bold tracking-wider border border-[var(--border-active)] bg-[var(--hover-accent)] text-[var(--gold-primary)] hover:bg-[rgba(var(--gold-rgb),0.16)] transition-colors"
      >
        GO
      </button>
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel-solid)] shadow-xl overflow-hidden text-[10px] font-mono" role="listbox">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}:${s.value}`} role="option" aria-selected={i === pick}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); run(s); }}
                onMouseEnter={() => setPick(i)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
                style={{ background: i === pick ? 'var(--hover-accent)' : undefined }}
              >
                <span className="w-14 shrink-0 font-bold truncate" style={{ color: s.kind === 'function' ? T.accent : T.text }}>{s.kind === 'function' ? s.label : s.hint}</span>
                <span className="truncate" style={{ color: T.dim }}>{s.kind === 'function' ? s.hint : s.label}</span>
                <span className="ml-auto text-[8px] tracking-widest" style={{ color: T.faint }}>{s.kind === 'function' ? 'FUNCTION' : 'SECURITY'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );

  const functionKeys = (
    <div className={`grid gap-1 ${maximized ? 'grid-cols-4 lg:grid-cols-8' : 'grid-cols-4'}`}>
      {FUNCTIONS.map(f => {
        const active = fn === f.code;
        const Icon = ICONS[f.code];
        return (
          <button
            key={f.code}
            onClick={() => setFn(f.code)}
            aria-pressed={active}
            title={`${f.key} · ${f.code} — ${f.title}`}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[9px] font-mono tracking-wider transition-colors ${
              active
                ? 'bg-[var(--hover-accent)] border-[var(--border-active)] text-[var(--gold-primary)]'
                : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:bg-[var(--hover-accent)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate">{f.code}</span>
            <span className="ml-auto text-[8px] opacity-50">{f.key}</span>
          </button>
        );
      })}
    </div>
  );

  /** The benchmarks everyone checks first, one tile each. */
  const monitor = allQuotes.length > 0 && (
    <div className={`grid gap-1 ${maximized ? 'grid-cols-4 xl:grid-cols-8' : 'grid-cols-4'}`}>
      {PULSE.map(({ symbol, label }) => {
        const q = bySymbol.get(symbol);
        const active = chartSymbol === symbol;
        return (
          <button
            key={symbol}
            onClick={() => q && open(q)}
            disabled={!q}
            title={q ? `${longName(q)} — chart it` : `${label} — no reading`}
            className={`min-w-0 px-2 py-1.5 rounded-md border text-left font-mono transition-colors disabled:opacity-40 ${
              active ? 'border-[var(--border-active)] bg-[var(--hover-accent)]' : 'border-[var(--border-secondary)] bg-white/[0.02] hover:bg-[var(--hover-accent)]'
            }`}
          >
            <div className="text-[8px] tracking-widest truncate" style={{ color: T.dim }}>{label}</div>
            <div className="text-[11px] font-bold tabular-nums truncate" style={{ color: T.text }}>{q ? formatPrice(q) : '—'}</div>
            <div className="text-[9px] font-bold tabular-nums" style={{ color: moveColor(q?.change_percent) }}>{formatMove(q?.change_percent)}</div>
          </button>
        );
      })}
    </div>
  );

  const breadthCard = breadth && (
    <div className="px-2.5 py-2 rounded-lg border border-[var(--border-secondary)] bg-white/[0.02] font-mono text-[10px] tabular-nums">
      <div className="flex items-center gap-2">
        <span className="text-[9px] tracking-widest" style={{ color: T.faint }}>BREADTH</span>
        <span style={{ color: T.up }}>{breadth.up}▲</span>
        <span style={{ color: T.down }}>{breadth.down}▼</span>
        {breadth.flat > 0 && <span style={{ color: T.dim }}>{breadth.flat} unch</span>}
        <span className="flex-1 h-1 rounded-full flex overflow-hidden" aria-hidden="true">
          <span style={{ width: `${(breadth.up / breadth.total) * 100}%`, background: T.up }} />
          <span style={{ width: `${(breadth.flat / breadth.total) * 100}%`, background: T.faint }} />
          <span style={{ width: `${(breadth.down / breadth.total) * 100}%`, background: T.down }} />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <button className="truncate hover:underline" onClick={() => open(breadth.best[0])} style={{ color: T.up }}>▲ {breadth.best[0].name} {formatMove(breadth.best[0].change_percent)}</button>
        <button className="truncate hover:underline" onClick={() => open(breadth.worst[0])} style={{ color: T.down }}>▼ {breadth.worst[0].name} {formatMove(breadth.worst[0].change_percent)}</button>
      </div>
    </div>
  );

  const alerts = Array.isArray(markets.scm_alerts) && markets.scm_alerts.length > 0 && (
    <div className="space-y-1">
      {markets.scm_alerts.map((alert: string, i: number) => (
        <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded-md border border-[var(--alert-orange)]/40 bg-[var(--alert-orange)]/10 text-[10px] font-mono leading-snug" style={{ color: T.alert }}>
          <TriangleAlert className="w-3 h-3 mt-px shrink-0" />
          <span>{String(alert).replace(/^\W+\s*/u, '')}</span>
        </div>
      ))}
    </div>
  );

  const chart = chartSymbol && chartQuote && (
    <MarketChart key={chartSymbol} symbol={chartSymbol} name={longName(chartQuote)} large={maximized} onClose={() => setSelected(null)} />
  );

  const help = (
    <div className="p-2.5 rounded-lg border border-[var(--border-secondary)] bg-white/[0.02] text-[10px] font-mono leading-relaxed space-y-2" style={{ color: T.dim }}>
      <div className="text-[9px] tracking-widest" style={{ color: T.accent }}>TYPE A FUNCTION OR A SECURITY, THEN GO</div>
      <table className="w-full">
        <tbody>
          {FUNCTIONS.map(f => (
            <tr key={f.code}>
              <td className="pr-2 w-16 font-bold whitespace-nowrap" style={{ color: T.accent }}>{f.key} · {f.code}</td>
              <td style={{ color: T.text }}>{f.title}</td>
              <td className="text-right" style={{ color: T.faint }}>{f.aliases.slice(0, 2).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        Securities by ticker or name: <span style={{ color: T.text }}>LMT</span>, <span style={{ color: T.text }}>lmt us equity</span>, <span style={{ color: T.text }}>gold</span>, <span style={{ color: T.text }}>eurusd</span>, <span style={{ color: T.text }}>nikkei</span>.
        ↑↓ picks a suggestion, Esc clears, ★ adds a row to WATCH, and a column head sorts.
      </div>
    </div>
  );

  const content = fn === 'HELP' ? help
    : current?.section === 'donbot' ? <DonBotScan />
    : (
      <div className="rounded-lg border border-[var(--border-secondary)] bg-black/20 overflow-hidden">
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-secondary)] text-[9px] font-mono tracking-wider">
          <span style={{ color: T.accent }}>{current?.title.toUpperCase()}</span>
          {rowCount > 0 && current?.section !== 'crypto' && (
            <span style={{ color: T.faint }}>{openCount ? <><span style={{ color: T.up }}>●</span> {openCount} OF {rowCount} TRADING</> : `${rowCount} · SESSIONS CLOSED`}</span>
          )}
        </div>
        {rowCount > 0 ? (
          <div className="px-1 pb-1">
            <SecurityTable groups={groups} selected={chartSymbol} watchlist={watchlist} sort={sort} onSort={onSort} onOpen={open} onStar={star} now={now} />
          </div>
        ) : (
          <div className="py-4 text-center text-[10px] font-mono tracking-wider" style={{ color: T.faint }}>
            {current?.section === 'watch' ? 'Nothing on watch yet — ★ a row to add it.'
              : feedLoaded ? 'FEED UNAVAILABLE — RETRYING' : 'LOADING…'}
          </div>
        )}
      </div>
    );

  const heatmap = allQuotes.length > 0 && (
    <div className="p-2.5 rounded-lg border border-[var(--border-secondary)] bg-white/[0.02]">
      <div className="text-[9px] font-mono tracking-widest pb-1.5" style={{ color: T.faint }}>HEATMAP · TODAY&apos;S MOVE</div>
      <div className="space-y-1">
        {FEED_SECTIONS.map(s => {
          const quotes = allQuotes.filter(q => q.group === s);
          if (!quotes.length) return null;
          return (
            <div key={s} className="flex items-stretch gap-1">
              <button onClick={() => setFn(SECTION_OF[s])} className="w-12 shrink-0 text-left text-[9px] font-mono tracking-wider pt-1 hover:text-[var(--text-primary)]" style={{ color: T.faint }}>{SECTION_OF[s]}</button>
              <div className="flex flex-wrap gap-1 flex-1">
                {quotes.map(q => {
                  const tint = heat(q.change_percent);
                  return (
                    <button
                      key={q.symbol}
                      onClick={() => open(q)}
                      title={`${longName(q)} ${formatMove(q.change_percent)}`}
                      className="w-[92px] px-1.5 py-1 rounded-sm border text-left font-mono transition-transform hover:scale-[1.03]"
                      style={{ background: tint.background, borderColor: chartSymbol === q.symbol ? T.accent : tint.border }}
                    >
                      <div className="text-[9px] truncate" style={{ color: T.text }}>{q.name}</div>
                      <div className="text-[10px] font-bold tabular-nums" style={{ color: moveColor(q.change_percent) }}>{formatMove(q.change_percent)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const movers = breadth && (
    <div className="p-2.5 rounded-lg border border-[var(--border-secondary)] bg-white/[0.02]">
      <div className="text-[9px] font-mono tracking-widest pb-1.5" style={{ color: T.faint }}>MOVERS · ALL MARKETS</div>
      <div className="grid grid-cols-2 gap-3 text-[10px] font-mono tabular-nums">
        {[breadth.best, breadth.worst].map((list, col) => (
          <div key={col}>
            {list.map(q => (
              <button key={q.symbol} onClick={() => open(q)} className="w-full flex justify-between gap-2 px-1 py-[3px] rounded hover:bg-[var(--hover-accent)]">
                <span className="truncate" style={{ color: T.text }}>{q.name}</span>
                <span style={{ color: moveColor(q.change_percent) }}>{formatMove(q.change_percent)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 text-[9px] font-mono tracking-wider" style={{ color: T.faint }}>
      {spaceWeather ? (
        <span className="truncate">
          SPACE WX{' '}
          <span style={{ color: spaceWeather.storm_color || T.text }}>
            {spaceWeather.kp_index == null ? 'no reading' : `Kp ${spaceWeather.kp_index} — ${spaceWeather.storm_level}`}
          </span>
          {spaceWeather.solar_flares?.length > 0 && <> · flare {spaceWeather.solar_flares[0].class}</>}
        </span>
      ) : <span />}
      <span className="shrink-0">YAHOO · NOAA</span>
    </div>
  );

  // AiOverview builds tints by appending alpha to the colour, so it needs a hex.
  const ai = <AiOverview mode="markets" payload={{ markets, spaceWeather }} accent="#D4AF37" />;

  const toggleMax = () => { setMaximized(m => !m); setExpanded(true); };

  if (maximized && mounted && typeof document !== 'undefined') {
    /* Full screen, built like RECON's: a window over a dimmed map, the
       monitor and the day's heatmap on the left, the chart and what moved
       beside it. Each column scrolls on its own. */
    return createPortal(
      <div className="fixed inset-4 z-[999] flex items-center justify-center">
        <div className="absolute inset-[-1rem] bg-black/60 backdrop-blur-sm" onClick={() => setMaximized(false)} />
        <div className="relative w-full h-full max-w-[1500px] glass-panel bg-[#0a0a09]/97 backdrop-blur-2xl border border-[var(--gold-primary)]/40 rounded-xl flex flex-col overflow-hidden shadow-2xl" role="region" aria-label="Markets terminal">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-[var(--border-secondary)] bg-[#111] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <BarChart3 className="w-5 h-5 shrink-0" style={{ color: T.accent }} />
              <span className="hud-text text-[16px] text-[var(--text-primary)] whitespace-nowrap">OSIRIS MARKETS</span>
              <span className="gotham-tag gotham-tag--classified" style={{ fontSize: '9px' }}>{allQuotes.length} INSTRUMENTS</span>
              <span className="text-[var(--text-muted)]/40">/</span>
              <span className="text-[11px] font-mono font-bold tracking-wider truncate" style={{ color: T.accent }}>
                {current ? `${current.code} · ${current.title.toUpperCase()}` : 'HELP'}
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {clocks}
              {feedStatus}
              <button onClick={toggleMax} className="p-2 hover:bg-white/5 rounded transition-colors text-[var(--text-muted)] hover:text-white" title="Exit full screen (Esc)" aria-label="Restore">
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2.5 shrink-0">
              {commandLine}
              {functionKeys}
            </div>
            {monitor}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,34%)] gap-4 overflow-y-auto lg:overflow-hidden styled-scrollbar">
              <div className="min-h-0 lg:overflow-y-auto styled-scrollbar space-y-2.5 pr-1">
                {content}
                {heatmap}
              </div>
              <div className="min-h-0 lg:overflow-y-auto styled-scrollbar space-y-2.5 lg:border-l lg:border-[var(--border-secondary)] lg:pl-4">
                {chart}
                {breadthCard}
                {alerts}
                {movers}
                {footer}
                {ai}
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    // Opacity only on entry: a transform left behind here offsets the `fixed`
    // full-screen box away from its inset.
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
      className="glass-panel relative flex flex-col overflow-hidden pointer-events-auto"
      role="region"
      aria-label="Markets terminal"
    >
      {/* The same header RECON wears: icon, title, a tag for what is on screen. */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)] hover:bg-[var(--hover-accent)] transition-colors shrink-0">
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-3.5 h-3.5 shrink-0" style={{ color: T.accent }} />
          <span className="hud-text text-[11px] text-[var(--text-primary)]">MARKETS</span>
          <span className="gotham-tag gotham-tag--classified truncate" style={{ fontSize: '9px', padding: '1px 5px' }}>{current ? current.code : 'HELP'}</span>
        </button>
        <div className="flex items-center gap-2.5 shrink-0">
          {feedStatus}
          <button onClick={toggleMax} className="p-1.5 -m-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors" title="Full screen" aria-label="Full screen">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: markets.error ? T.down : T.accent }} />
          <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
        </div>
      </div>
      {expanded && (
        /* One scroll region, capped so the panel ends above the status bar. */
        <div className="space-y-2 px-3 py-3 overflow-y-auto styled-scrollbar max-h-[calc(100vh-11rem)]">
          {commandLine}
          {functionKeys}
          {monitor}
          {breadthCard}
          {alerts}
          {chart}
          {content}
          {footer}
          {ai}
        </div>
      )}
    </motion.div>
  );
}

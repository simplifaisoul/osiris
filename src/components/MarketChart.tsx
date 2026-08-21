'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, CandlestickSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { X, Loader2, AlertTriangle } from 'lucide-react';

interface Candle {
  time: number;
  open: number; high: number; low: number; close: number; volume: number;
}

interface MarketChartProps {
  symbol: string;
  name: string;
  onClose: () => void;
  /** Taller layout for the maximized panel, where there is room for it. */
  large?: boolean;
}

/* Lowercase m is minutes, uppercase M is months — the convention every
   trading tool uses, and what the API's range keys mean. */
const RANGES = ['1m', '15m', '24H', '1W', '1M', '6M', '1Y'] as const;
type Range = typeof RANGES[number];

/** Bars finer than a day need the clock on the axis, not just the date. */
const INTRADAY: Record<Range, boolean> = {
  '1m': true, '15m': true, '24H': true, '1W': true,
  '1M': false, '6M': false, '1Y': false,
};

const UP = '#26A69A';
const DOWN = '#D32F2F';
const GRID = 'rgba(255,255,255,0.04)';
const AXIS = 'rgba(255,255,255,0.12)';

/** Prices here span FX pairs to Bitcoin — pick the precision from the value. */
function priceFormat(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

export default function MarketChart({ symbol, name, onClose, large = false }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [range, setRange] = useState<Range>('1M');
  /* Keyed by the request it answers, so status is derived rather than set on
     the way in — a synchronous setState in the effect body would cascade. */
  const [result, setResult] = useState<{ key: string; rows: Candle[] | null }>({ key: '', rows: null });
  /** Whatever the crosshair is currently over — falls back to the last bar. */
  const [hover, setHover] = useState<Candle | null>(null);

  const height = large ? 420 : 200;

  // ── Chart instance. Built once; data and axis formatting are applied later
  //    so that changing range never tears down the canvas.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      // The library measures the container itself. Sizing the canvases by
      // hand left their bitmaps at the 300x150 default — laid out, but never
      // painted.
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#78909C',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 9,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: AXIS, scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: { borderColor: AXIS, secondsVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(212,175,55,0.4)', labelBackgroundColor: '#D4AF37' },
        horzLine: { color: 'rgba(212,175,55,0.4)', labelBackgroundColor: '#D4AF37' },
      },
      handleScale: { axisPressedMouseMove: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN,
      wickUpColor: UP, wickDownColor: DOWN,
      borderVisible: false,
    });

    // Volume sits in the bottom quarter, on its own invisible scale so it
    // never distorts the price axis.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(candleSeries) as Candle | undefined;
      setHover(d && param.time ? { ...d, time: param.time as number, volume: d.volume ?? 0 } : null);
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // Only intraday bars need the clock on the axis. Applied separately so
  // switching range never tears down the canvas.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ timeVisible: INTRADAY[range] });
  }, [range]);

  const requestKey = `${symbol}|${range}`;
  const status: 'loading' | 'ready' | 'error' =
    result.key !== requestKey ? 'loading' : result.rows === null ? 'error' : 'ready';
  const candles = useMemo(
    () => (result.key === requestKey && result.rows ? result.rows : []),
    [result, requestKey],
  );

  // ── Data ──
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/markets/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        const rows: Candle[] = d.candles || [];
        setResult({ key: `${symbol}|${range}`, rows: rows.length ? rows : null });
      })
      .catch(() => { if (!cancelled) setResult({ key: `${symbol}|${range}`, rows: null }); });

    return () => { cancelled = true; };
  }, [symbol, range]);

  // Push data once both the series and the rows exist.
  useEffect(() => {
    if (status !== 'ready' || !candleRef.current || !volumeRef.current) return;

    candleRef.current.setData(candles.map(c => ({
      time: c.time as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    volumeRef.current.setData(candles.map(c => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(38,166,154,0.28)' : 'rgba(211,47,47,0.28)',
    })));

    chartRef.current?.timeScale().fitContent();
  }, [candles, status]);

  // ── Range summary: first open to last close across the window shown ──
  const last = candles[candles.length - 1];
  const first = candles[0];
  const rangeChange = first && last ? ((last.close - first.open) / first.open) * 100 : null;
  const shown = hover || last;
  const high = candles.length ? Math.max(...candles.map(c => c.high)) : null;
  const low = candles.length ? Math.min(...candles.map(c => c.low)) : null;

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-black/30 p-2">
      {/* Identity + range performance */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate">{name}</span>
            <span className="text-[9px] font-mono text-[var(--text-muted)]">{symbol}</span>
          </div>
          {rangeChange !== null && (
            <div className="text-[10px] font-mono tabular-nums" style={{ color: rangeChange >= 0 ? UP : DOWN }}>
              {rangeChange >= 0 ? '+' : ''}{rangeChange.toFixed(2)}% over {range}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors shrink-0" title="Close chart">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* OHLC readout — tracks the crosshair, resting on the latest bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-[9px] font-mono tabular-nums">
        {shown ? (
          <>
            <span className="text-[var(--text-muted)]">O <span className="text-[var(--text-secondary)]">{priceFormat(shown.open)}</span></span>
            <span className="text-[var(--text-muted)]">H <span style={{ color: UP }}>{priceFormat(shown.high)}</span></span>
            <span className="text-[var(--text-muted)]">L <span style={{ color: DOWN }}>{priceFormat(shown.low)}</span></span>
            <span className="text-[var(--text-muted)]">C <span className="text-[var(--text-primary)] font-bold">{priceFormat(shown.close)}</span></span>
            {shown.volume > 0 && <span className="text-[var(--text-muted)]">V <span className="text-[var(--text-secondary)]">{formatVolume(shown.volume)}</span></span>}
          </>
        ) : <span className="text-[var(--text-muted)]">—</span>}
      </div>

      {/* Canvas, with loading and failure drawn over the same box so the
          panel never changes height while a range is fetching. */}
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="w-full" style={{ height }} />

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 text-[10px] font-mono text-[var(--text-muted)]">
            {status === 'loading'
              ? <><Loader2 className="w-3 h-3 animate-spin" /> LOADING {range}</>
              : <><AlertTriangle className="w-3 h-3" /> NO {range} DATA FOR {symbol}</>}
          </div>
        )}
      </div>

      {/* Window extremes + range selector */}
      <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
        <div className="text-[9px] font-mono text-[var(--text-muted)] tabular-nums">
          {high !== null && low !== null && <>H {priceFormat(high)} · L {priceFormat(low)}</>}
        </div>
        {/* Seven ranges will not fit one line in the docked panel — let them wrap. */}
        <div className="flex gap-0.5 flex-wrap justify-end">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider transition-all ${
                range === r
                  ? 'bg-[var(--hover-accent)] text-[var(--gold-primary)] border border-[var(--border-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { CarFront, Eye, Loader2, ScanSearch, Timer, X } from 'lucide-react';
import { VEHICLES, type Detection, type Label } from '@/lib/vision/detect';
import { countWords, describeWatch, labelWord } from '@/lib/vision/analysis';
import type { Colour } from '@/lib/vision/colour';
import { identityWords, pickVehicles, type Identity } from '@/lib/vision/identify';
import { clearLook, identifyVehicles, look, sourceOf, useLook, type VisionCamera } from '@/lib/vision/store';

/**
 * OSIRIS — the camera's analysis overlay.
 *
 * AI Analyze counts what is in the current frame and reads each vehicle's
 * colour; Watch follows the feed for half a minute and reports how it changed.
 * Both run on the reader's own device, free, with the detector in a worker.
 * Identify asks the reader's own AI model to name the largest vehicles' makes
 * and models. OI Assist looks through the same overlay, so whatever it is
 * counting appears here too.
 *
 * The analysed frame is drawn with its boxes in one SVG, so the boxes sit on
 * the picture exactly whether the viewer crops it (cover) or fits it (contain).
 */

const WATCH_SECONDS = 30;

/** People in the platform's gold, vehicles in OI's blue, the rest in white. */
function tone(label: Label): string {
  if (label === 'person') return 'var(--gold-primary)';
  return (VEHICLES as readonly string[]).includes(label) ? 'var(--cyan-primary)' : 'rgba(255,255,255,0.85)';
}

/** What each colour looks like on a swatch. */
const SWATCH: Record<Colour, string> = {
  white: '#f4f4f5', silver: '#c4c8cc', grey: '#7c8087', black: '#0d0d0f', red: '#d33b3b', orange: '#f08a24',
  yellow: '#f2c230', green: '#3f9a4a', blue: '#2f6fd6', purple: '#8a4fc0', brown: '#7a5236',
};

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(11, 19)}Z`;
};

/** A vehicle's number, as tagged on its box. */
const Tag = ({ n }: { n: number }) => (
  <span className="px-1 border text-[8px] leading-tight" style={{ borderColor: 'var(--cyan-primary)', color: 'var(--cyan-primary)' }}>{n}</span>
);

/** Where a box's tag sits: as numbered in the identify answer. */
const tagOf = (byIndex: Record<number, Identity> | undefined, i: number) => byIndex?.[i]?.n;

function Boxes({ detections, at, width, byIndex }: { detections: Detection[]; at: string; width: number; byIndex?: Record<number, Identity> }) {
  // Sized against the frame's width, so tags read the same on a small camera as on a large one.
  const fs = width / 42;
  const chip = width / 70;
  return (
    <>
      {detections.map((d, i) => {
        const [x, y, w, h] = d.box;
        const id = byIndex?.[i];
        const tag = tagOf(byIndex, i);
        const title = [d.label, d.colour, id ? identityWords(id) + (id.make ? ` (${id.confidence})` : '') : '', `${Math.round(d.score * 100)}%`, `seen ${clock(at)}`].filter(Boolean).join(' · ');
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill="none" stroke={tone(d.label)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeOpacity={0.55 + d.score * 0.45}>
              <title>{title}</title>
            </rect>
            {d.colour && w > chip * 2.2 && (
              <rect x={x + w - chip * 1.4} y={y + chip * 0.4} width={chip} height={chip} fill={SWATCH[d.colour]} stroke="rgba(255,255,255,0.75)" strokeWidth={0.75} vectorEffect="non-scaling-stroke">
                <title>{title}</title>
              </rect>
            )}
            {tag !== undefined && (
              <g>
                <rect x={x} y={Math.max(0, y - fs * 1.35)} width={fs * 1.3} height={fs * 1.3} fill="rgba(0,0,0,0.85)" stroke="var(--cyan-primary)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <text x={x + fs * 0.65} y={Math.max(0, y - fs * 1.35) + fs * 1.0} fontSize={fs} textAnchor="middle" fill="var(--cyan-primary)" fontFamily="ui-monospace, monospace" fontWeight={700}>{tag}</text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}

export default function CameraVision({ camera, fit, ready }: { camera: VisionCamera; fit: 'cover' | 'contain'; ready: boolean }) {
  const state = useLook(camera.id);
  const source = sourceOf(camera);
  if (!source) return null;

  const busy = state?.status === 'working';
  const a = state?.analysis;
  const start = (watch: number) => { look(camera, { watch, by: 'you' }).catch(() => {}); };
  const vehicles = a ? a.detections.filter(d => (VEHICLES as readonly string[]).includes(d.label)).length : 0;
  const identifiable = a ? pickVehicles(a.detections).length : 0;
  const ids = state?.identify;
  const named = ids?.status === 'done' ? Object.values(ids.byIndex).sort((x, y) => x.n - y.n) : [];

  return (
    <>
      {/* The analysed frame and its boxes, over the live picture. */}
      {state?.frame && a && (
        <svg
          viewBox={`0 0 ${a.width} ${a.height}`}
          preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
          className="absolute inset-0 w-full h-full z-[25] bg-[#020202]"
          role="img"
          aria-label={`Analysed frame: ${countWords(a.counts)}`}
        >
          <image href={state.frame} width={a.width} height={a.height} preserveAspectRatio="none" />
          <Boxes detections={a.detections} at={a.at} width={a.width} byIndex={ids?.byIndex} />
        </svg>
      )}

      {/* OI is looking: say so while it does. */}
      {state?.by === 'oi' && busy && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2 py-1 bg-black/80 border text-[9px] font-mono tracking-[0.2em]"
          style={{ borderColor: 'var(--cyan-primary)', color: 'var(--cyan-primary)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--cyan-primary)' }} /> OI IS LOOKING
        </div>
      )}

      {/* The controls, until there is something to show. */}
      {ready && !a && !busy && state?.status !== 'error' && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1">
          <button onClick={() => start(0)} aria-label="AI analyze this frame"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/75 border text-[9px] font-mono font-bold tracking-[0.2em] transition-colors hover:bg-[var(--gold-primary)]/20"
            style={{ borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' }} title="Count what is in view and read the vehicles' colours: free, on this device">
            <ScanSearch className="w-3 h-3" /> AI ANALYZE
          </button>
          <button onClick={() => start(WATCH_SECONDS)} aria-label={`Watch for ${WATCH_SECONDS} seconds`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/75 border border-white/15 text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] transition-colors hover:text-white hover:border-white/40"
            title={`Follow the feed for ${WATCH_SECONDS} seconds and see how it changes`}>
            <Timer className="w-3 h-3" /> WATCH {WATCH_SECONDS}S
          </button>
        </div>
      )}

      {/* Working: one frame, or a watch with its progress. */}
      {busy && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 px-2.5 py-1.5 bg-black/80 border border-white/15 text-[9px] font-mono tracking-[0.2em] text-white">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--gold-primary)' }} />
          {state.mode === 'watch' && state.watch
            ? <span>WATCHING {Math.round(state.watch.elapsed)} / {state.watch.seconds}S{a ? ` · ${countWords(a.counts).toUpperCase()}` : ''}</span>
            : <span>ANALYSING…</span>}
          <button onClick={() => clearLook(camera.id)} aria-label="Stop" className="ml-1 text-[var(--text-muted)] hover:text-white"><X className="w-3 h-3" /></button>
        </div>
      )}
      {busy && state.mode === 'watch' && state.watch && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-30 bg-white/10">
          <div className="h-full transition-[width] duration-700" style={{ width: `${(state.watch.elapsed / state.watch.seconds) * 100}%`, background: 'var(--gold-primary)' }} />
        </div>
      )}

      {/* What it found. */}
      {a && !busy && (
        <div className="absolute bottom-0 left-0 right-0 z-[31] px-3 py-1.5 bg-black/85 border-t border-white/10 backdrop-blur-sm" aria-live="polite">
          <div className="flex items-center gap-2 text-[9px] font-mono tracking-[0.18em] text-white/70">
            <Eye className="w-3 h-3 flex-shrink-0" style={{ color: state.by === 'oi' ? 'var(--cyan-primary)' : 'var(--gold-primary)' }} />
            <span className="truncate">{state.by === 'oi' ? 'OI LOOKED' : 'ANALYSED'} {clock(a.at)} · ON THIS DEVICE · {a.light.toUpperCase()}</span>
            {identifiable > 0 && ids?.status !== 'done' && (
              <button onClick={() => { identifyVehicles(camera).catch(() => {}); }} disabled={ids?.status === 'working'} aria-label="Identify the vehicles' makes and models"
                title="Ask your own AI model to name the largest vehicles' makes and models (never number plates)"
                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 border text-[9px] tracking-[0.18em] transition-colors hover:bg-[var(--cyan-primary)]/15 disabled:opacity-70"
                style={{ borderColor: 'var(--cyan-primary)', color: 'var(--cyan-primary)' }}>
                {ids?.status === 'working' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CarFront className="w-2.5 h-2.5" />}
                {ids?.status === 'working' ? 'IDENTIFYING…' : 'IDENTIFY'}
              </button>
            )}
            <button onClick={() => clearLook(camera.id)} aria-label="Back to the live feed"
              className={`${identifiable > 0 && ids?.status !== 'done' ? '' : 'ml-auto '}flex items-center gap-1 px-1.5 py-0.5 border border-white/15 text-white hover:border-white/40`}>
              <X className="w-2.5 h-2.5" /> LIVE
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-white">
            {(Object.entries(a.counts) as [Label, number][]).sort((x, y) => y[1] - x[1]).map(([label, n]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5" style={{ background: tone(label) }} />{n} {labelWord(label, n).toUpperCase()}
              </span>
            ))}
            {!Object.keys(a.counts).length && <span className="text-[var(--text-secondary)]">NOTHING IN VIEW IT CAN COUNT</span>}
          </div>
          {vehicles > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] font-mono tracking-wide text-[var(--text-secondary)]">
              {a.colours ? (
                <>
                  <span className="text-white/50 tracking-[0.18em]">BY COLOUR</span>
                  {(Object.entries(a.colours) as [Colour, number][]).sort((x, y) => y[1] - x[1]).map(([c, n]) => (
                    <span key={c} className="flex items-center gap-1">
                      <span className="w-2 h-2 border border-white/40" style={{ background: SWATCH[c] }} />{n} {c.toUpperCase()}
                    </span>
                  ))}
                </>
              ) : <span>COLOURS UNREADABLE: THIS PICTURE HAS NO COLOUR (INFRARED OR NIGHT)</span>}
            </div>
          )}
          {named.length > 0 && (
            // One line, scrolling sideways, so naming never pushes the strip up over the picture.
            <div className="mt-0.5 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap text-[9px] font-mono tracking-wide [scrollbar-width:none]">
              <span className="text-white/50 tracking-[0.18em]">NAMED</span>
              {named.filter(id => id.make).map(id => (
                <span key={id.n} className="flex items-center gap-1 text-white">
                  <Tag n={id.n} />{identityWords(id).toUpperCase()}
                  <span className="text-[var(--text-muted)]">· {id.confidence.toUpperCase()}</span>
                </span>
              ))}
              {named.some(id => !id.make) && (
                <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                  {named.filter(id => !id.make).map(id => <Tag key={id.n} n={id.n} />)} UNCLEAR
                </span>
              )}
            </div>
          )}
          {ids?.status === 'error' && <div className="mt-0.5 text-[9px] font-mono tracking-wide text-red-300">{ids.error}</div>}
          {state.watch?.summary && (
            <div className="mt-0.5 text-[9px] font-mono tracking-wide text-[var(--text-secondary)]">{describeWatch(state.watch.summary)}</div>
          )}
        </div>
      )}

      {state?.status === 'error' && !busy && (
        <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center gap-2 px-2.5 py-1.5 bg-black/85 border border-red-500/40 text-[9px] font-mono tracking-wider text-red-300">
          <span className="truncate">{state.error}</span>
          <button onClick={() => clearLook(camera.id)} aria-label="Dismiss" className="ml-auto text-[var(--text-muted)] hover:text-white"><X className="w-3 h-3" /></button>
        </div>
      )}
    </>
  );
}

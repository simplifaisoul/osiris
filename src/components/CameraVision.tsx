'use client';

import { Eye, Loader2, ScanSearch, Timer, X } from 'lucide-react';
import { VEHICLES, type Detection, type Label } from '@/lib/vision/detect';
import { countWords, describeWatch, labelWord } from '@/lib/vision/analysis';
import { clearLook, look, sourceOf, useLook, type VisionCamera } from '@/lib/vision/store';

/**
 * OSIRIS — the camera's analysis overlay.
 *
 * Analyze counts what is in the current frame; Watch follows the feed for half
 * a minute and reports how it changed. Either runs on the reader's own device,
 * free, with the detector in a worker. OI Assist looks through the same
 * overlay, so whatever it is counting appears here too.
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

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(11, 19)}Z`;
};

function Boxes({ detections }: { detections: Detection[] }) {
  return (
    <>
      {detections.map((d, i) => (
        <rect
          key={i}
          x={d.box[0]} y={d.box[1]} width={d.box[2]} height={d.box[3]}
          fill="none" stroke={tone(d.label)} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
          strokeOpacity={0.55 + d.score * 0.45}
        >
          <title>{`${d.label} · ${Math.round(d.score * 100)}%`}</title>
        </rect>
      ))}
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
          <Boxes detections={a.detections} />
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
            style={{ borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' }} title="Count what is in view: free, on this device">
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
        <div className="absolute bottom-0 left-0 right-0 z-[31] px-3 py-2 bg-black/85 border-t border-white/10 backdrop-blur-sm" aria-live="polite">
          <div className="flex items-center gap-2 text-[9px] font-mono tracking-[0.18em] text-white/70">
            <Eye className="w-3 h-3" style={{ color: state.by === 'oi' ? 'var(--cyan-primary)' : 'var(--gold-primary)' }} />
            <span>{state.by === 'oi' ? 'OI LOOKED' : 'ANALYSED'} {clock(a.at)} · ON THIS DEVICE · {a.light.toUpperCase()}</span>
            <button onClick={() => clearLook(camera.id)} aria-label="Back to the live feed"
              className="ml-auto flex items-center gap-1 px-1.5 py-0.5 border border-white/15 text-white hover:border-white/40">
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

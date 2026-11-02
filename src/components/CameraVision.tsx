'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { CarFront, Eye, Loader2, ScanSearch, Timer, X } from 'lucide-react';
import { VEHICLES, type Detection, type Label } from '@/lib/vision/detect';
import { countWords, describeWatch, labelWord, type FrameAnalysis } from '@/lib/vision/analysis';
import type { Colour } from '@/lib/vision/colour';
import { identityWords, pickVehicles, type Identity } from '@/lib/vision/identify';
import { clearLook, identifyVehicles, look, prime, sourceOf, useLook, type Look, type VisionCamera } from '@/lib/vision/store';

/**
 * OSIRIS — AI Analyze on a camera.
 *
 * AI Analyze counts what is in the current frame and reads each vehicle's
 * colour; Watch follows the feed for half a minute and reports how it changed.
 * Both run on the reader's own device, free, with the detector in a worker.
 * Identify asks the reader's own AI model to name the largest vehicles' makes
 * and models. OI Assist looks through the same overlay, so whatever it is
 * counting appears here too.
 *
 * The frame freezes under a scanning grid while the detector reads it, the
 * part being read marked out pass by pass; then a sweep crosses it, lifting the
 * veil, and each box locks on as the line passes. The frame and its boxes are
 * one SVG, so the boxes sit on the picture exactly whether the viewer crops it
 * (cover) or fits it (contain). What it found is told below the picture, in
 * VisionReport, so nothing covers the road.
 */

const WATCH_SECONDS = 30;
/** How long the reveal's sweep takes to cross the frame, ms. */
const REVEAL_MS = 1100;

const isVehicle = (label: Label) => (VEHICLES as readonly string[]).includes(label);

/** People in the platform's gold, vehicles in OI's blue, the rest in white. */
function tone(label: Label): string {
  if (label === 'person') return 'var(--gold-primary)';
  return isVehicle(label) ? 'var(--cyan-primary)' : 'rgba(255,255,255,0.85)';
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

/** A target's four corners, each arm `l` long. */
const corners = (x: number, y: number, w: number, h: number, l: number) =>
  `M${x} ${y + l}V${y}H${x + l}M${x + w - l} ${y}H${x + w}V${y + l}M${x + w} ${y + h - l}V${y + h}H${x + w - l}M${x + l} ${y + h}H${x}V${y + h - l}`;

/**
 * When the reveal's sweep line reaches the middle of a box, ms. The line is the
 * leading edge of a band a fifth of the frame tall, which travels 1.2 frames
 * so as to leave it entirely.
 */
const reachedAt = (box: Detection['box'], height: number) => Math.round(REVEAL_MS * Math.min(1, (box[1] + box[3] / 2) / (height * 1.2)));

/** The frame's pixels per pixel on screen, as the SVG is drawn now: so labels read the same size on any camera. */
function useFramePixel(el: SVGSVGElement | null, width: number, height: number, fit: 'cover' | 'contain'): number | null {
  const [px, setPx] = useState<number | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect;
      if (cw && ch) setPx(1 / (fit === 'cover' ? Math.max(cw / width, ch / height) : Math.min(cw / width, ch / height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, width, height, fit]);
  return px;
}

/** A number that counts up to `to` over `ms`, from wherever it stood (at once for a reader who asks for less motion). */
function useCountUp(to: number, ms: number): number {
  const [shown, setShown] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = last.current;
    // Timed from the first frame's own clock: the page's clock can run ahead of it.
    let started = -1;
    let raf = 0;
    const tick = (t: number) => {
      if (started < 0) started = t;
      const k = still || ms <= 0 ? 1 : Math.min(1, Math.max(0, (t - started) / ms));
      last.current = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      setShown(last.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return shown;
}

interface Place { x: number; y: number; w: number; h: number }

/**
 * Where a box's label goes: above it, else inside its top, else below it,
 * wherever it clears the labels already placed; null when nowhere does.
 * Sized in screen pixels (`px` frame pixels each), so it reads the same on any camera.
 */
function placeChip(box: Detection['box'], text: string, tagged: boolean, px: number, frameWidth: number, placed: Place[] | null): Place | null {
  const h = 14 * px;
  // A monospace character is about 0.6 of its size wide, and the label is spaced a little.
  const w = (tagged ? h : 0) + 8 * px + text.length * 9 * px * 0.68;
  const x = Math.max(0, Math.min(box[0], frameWidth - w));
  for (const y of [box[1] - h - 2 * px, box[1] + 2 * px, box[1] + box[3] + 2 * px]) {
    if (y < 0) continue;
    const here = { x, y, w, h };
    if (placed?.some(p => p.x < x + w && x < p.x + p.w && p.y < y + h && y < p.y + p.h)) continue;
    placed?.push(here);
    return here;
  }
  return null;
}

/** A label pinned to a box, as placed by placeChip. */
function Chip({ at: { x, y, w, h }, text, colour, n, px, delay }: { at: Place; text: string; colour: string; n?: number; px: number; delay?: number }) {
  const fs = 9 * px;
  const tag = n !== undefined ? h : 0;
  return (
    <g className={delay !== undefined ? 'vision-chip' : undefined} style={{ '--at': `${delay ?? 0}ms` } as CSSProperties} pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="rgba(0,0,0,0.85)" style={{ stroke: colour }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {n !== undefined && (
        <>
          <rect x={x} y={y} width={tag} height={h} style={{ fill: colour }} />
          <text x={x + tag / 2} y={y + h * 0.73} fontSize={fs} textAnchor="middle" fill="#000" fontWeight={700} className="font-mono">{n}</text>
        </>
      )}
      <text x={x + tag + 4 * px} y={y + h * 0.73} fontSize={fs} style={{ fill: colour }} letterSpacing={fs * 0.06} className="font-mono">{text}</text>
    </g>
  );
}

/** What a box is, in a word or three: "silver car", or its make and model once named. */
function chipText(d: Detection, id?: Identity): string {
  if (id?.make) return identityWords(id).toUpperCase();
  return `${d.colour ? `${d.colour} ` : ''}${labelWord(d.label, 1)}`.toUpperCase();
}

function Targets({ a, reveal, px, byIndex }: { a: FrameAnalysis; reveal: boolean; px: number | null; byIndex?: Record<number, Identity> }) {
  const [focus, setFocus] = useState<number | null>(null);
  const { width: W, height: H, detections } = a;
  // The largest boxes are drawn first, so a small one inside a large one can still be pointed at.
  const order = detections.map((_, i) => i).sort((x, y) => detections[y].box[2] * detections[y].box[3] - detections[x].box[2] * detections[x].box[3]);
  const dot = px ? 7 * px : W / 70;
  return (
    <g onPointerLeave={() => setFocus(null)}>
      {order.map(i => {
        const d = detections[i];
        const [x, y, w, h] = d.box;
        const colour = tone(d.label);
        const at = reveal ? reachedAt(d.box, H) : 0;
        const arm = Math.max(Math.min(w, h) * 0.28, Math.min(w, h, (px ?? 1) * 5));
        return (
          <g key={i} style={{ opacity: focus !== null && focus !== i ? 0.22 : 1, transition: 'opacity 0.2s' }}
            onPointerEnter={() => setFocus(i)} onClick={e => { e.stopPropagation(); setFocus(focus === i ? null : i); }}>
            <g className={reveal ? 'vision-lock' : undefined} style={{ '--at': `${at}ms` } as CSSProperties}>
              <rect x={x} y={y} width={w} height={h} opacity={0} className={reveal ? 'vision-flash' : undefined} style={{ fill: colour, '--at': `${at}ms` } as CSSProperties} pointerEvents="all" />
              <rect x={x} y={y} width={w} height={h} fill="none" style={{ stroke: colour }} strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={corners(x, y, w, h, arm)} fill="none" style={{ stroke: colour }} strokeWidth={focus === i ? 2.5 : 2} vectorEffect="non-scaling-stroke" />
              {d.colour && w > dot * 2.6 && h > dot * 2 && (
                <rect x={x + w - dot * 1.5} y={y + dot * 0.5} width={dot} height={dot} style={{ fill: SWATCH[d.colour] }} stroke="rgba(255,255,255,0.8)" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          </g>
        );
      })}
      {px && (() => {
        // While one box is pointed at, it alone is labelled, in full.
        if (focus !== null && detections[focus]) {
          const d = detections[focus];
          const id = byIndex?.[focus];
          const text = [chipText(d, id), id?.make ? id.confidence.toUpperCase() : `${Math.round(d.score * 100)}%`, clock(a.at)].join(' · ');
          const at = placeChip(d.box, text, id !== undefined, px, W, null);
          return at && <Chip at={at} text={text} n={id?.n} colour={tone(d.label)} px={px} />;
        }
        const placed: Place[] = [];
        return pickVehicles(detections).map(i => {
          const d = detections[i];
          const id = byIndex?.[i];
          const text = chipText(d, id);
          const at = placeChip(d.box, text, id !== undefined, px, W, placed);
          return at && <Chip key={i} at={at} text={text} n={id?.n} colour={tone(d.label)} px={px} delay={reveal ? reachedAt(d.box, H) : undefined} />;
        });
      })()}
    </g>
  );
}

/** The frozen frame: scanning while the detector reads it, then revealed with its boxes. */
function Frame({ state, fit }: { state: Look; fit: 'cover' | 'contain' }) {
  const [el, setEl] = useState<SVGSVGElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const a = state.analysis;
  const scan = a ? undefined : state.scan;
  const W = a?.width ?? scan?.width ?? 1, H = a?.height ?? scan?.height ?? 1;
  const px = useFramePixel(el, W, H, fit);
  const cell = Math.max(W, H) / 16;
  const sweep = <rect y={-H * 0.2} width={W} height={H * 0.2} style={{ fill: `url(#${uid}s)` }} />;
  const veil = (
    <>
      <rect width={W} height={H} fill="#000" opacity={0.5} />
      <rect width={W} height={H} style={{ fill: `url(#${uid}g)` }} />
    </>
  );
  return (
    <svg
      ref={setEl}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
      className="absolute inset-0 w-full h-full z-[25] bg-[#020202]"
      role="img"
      aria-label={a ? `Analysed frame: ${countWords(a.counts)}` : 'Reading the frame'}
    >
      <defs>
        <clipPath id={`${uid}c`}><rect width={W} height={H} /></clipPath>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--gold-primary)', stopOpacity: 0 }} />
          <stop offset="0.75" style={{ stopColor: 'var(--gold-primary)', stopOpacity: 0.1 }} />
          <stop offset="0.97" style={{ stopColor: 'var(--gold-primary)', stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: '#fff8dc', stopOpacity: 0.95 }} />
        </linearGradient>
        <pattern id={`${uid}g`} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <path d={`M${cell} 0H0V${cell}`} fill="none" style={{ stroke: 'var(--gold-primary)' }} strokeOpacity={0.16} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      {state.frame && <image href={state.frame} width={W} height={H} preserveAspectRatio="none" />}
      <g clipPath={`url(#${uid}c)`}>
        {scan && (
          <>
            {veil}
            <g className="vision-sweep-loop">{sweep}</g>
            {scan.region && (
              <g className="vision-region" style={{ transform: `translate(${scan.region[0]}px, ${scan.region[1]}px)` }}>
                <rect width={scan.region[2]} height={scan.region[3]} style={{ fill: 'var(--gold-primary)' }} opacity={0.07} />
                <path d={corners(0, 0, scan.region[2], scan.region[3], Math.min(scan.region[2], scan.region[3]) * 0.08)} fill="none"
                  style={{ stroke: 'var(--gold-primary)' }} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </>
        )}
        {/* The veil slides off behind the sweep line: above it the frame is clear, below it still being read. */}
        {a && state.reveal && <g key={a.at} className="vision-sweep" style={{ '--sweep': `${REVEAL_MS}ms` } as CSSProperties}>{sweep}{veil}</g>}
      </g>
      {a && <Targets key={a.at} a={a} reveal={!!state.reveal} px={px} byIndex={state.identify?.byIndex} />}
    </svg>
  );
}

/** What the look is doing, in a few words. */
function doing(state: Look): string {
  if (state.mode === 'watch' && state.watch && state.analysis) return `WATCHING ${Math.round(state.watch.elapsed)} / ${state.watch.seconds}S`;
  if (!state.frame) return 'ACQUIRING FRAME';
  if (state.scan) {
    if (!state.scan.pass) return 'LOADING DETECTOR';
    const found = state.scan.found ? ` · ${state.scan.found} FOUND` : '';
    return state.scan.of > 1 ? `READING · PASS ${state.scan.pass}/${state.scan.of}${found}` : 'READING FRAME';
  }
  return 'ANALYSING';
}

export default function CameraVision({ camera, fit, ready }: { camera: VisionCamera; fit: 'cover' | 'contain'; ready: boolean }) {
  const state = useLook(camera.id);
  const source = sourceOf(camera);
  if (!source) return null;

  const busy = state?.status === 'working';
  const a = state?.analysis;
  const oi = state?.by === 'oi';
  const start = (watch: number) => { look(camera, { watch, by: 'you' }).catch(() => {}); };
  const warm = () => prime(camera);
  const accent = oi ? 'var(--cyan-primary)' : 'var(--gold-primary)';

  return (
    <>
      {state?.frame && (a || state.scan) && <Frame state={state} fit={fit} />}

      {/* Fetching the frame: a sweep over the live picture until it is in hand. */}
      {busy && !state.frame && (
        <div className="absolute inset-0 z-[24] pointer-events-none overflow-hidden">
          <div className="vision-acquire h-1/5 w-full" style={{ background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${accent} 22%, transparent) 85%, ${accent})` }} />
        </div>
      )}

      {/* The controls, until there is something to show. */}
      {ready && !a && !busy && state?.status !== 'error' && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1">
          <button onClick={() => start(0)} onPointerEnter={warm} onFocus={warm} onTouchStart={warm} aria-label="AI analyze this frame"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/80 border text-[9px] font-mono font-bold tracking-[0.2em] transition-all hover:bg-[var(--gold-primary)] hover:text-black hover:shadow-[0_0_18px_var(--gold-primary)]"
            style={{ borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' }} title="Count what is in view and read the vehicles' colours: free, on this device">
            <ScanSearch className="w-3 h-3" /> AI ANALYZE
          </button>
          <button onClick={() => start(WATCH_SECONDS)} onPointerEnter={warm} onFocus={warm} onTouchStart={warm} aria-label={`Watch for ${WATCH_SECONDS} seconds`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/75 border border-white/15 text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)] transition-colors hover:text-white hover:border-white/40"
            title={`Follow the feed for ${WATCH_SECONDS} seconds and see how it changes`}>
            <Timer className="w-3 h-3" /> WATCH {WATCH_SECONDS}S
          </button>
        </div>
      )}

      {/* Working: who is looking, and how far along. */}
      {busy && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2 px-2.5 py-1.5 bg-black/85 border text-[9px] font-mono tracking-[0.2em] text-white"
          style={{ borderColor: `color-mix(in srgb, ${accent} 60%, transparent)` }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <span>{oi && <span style={{ color: accent }}>OI IS LOOKING · </span>}{doing(state)}</span>
          <button onClick={() => clearLook(camera.id)} aria-label="Stop" className="ml-1 text-[var(--text-muted)] hover:text-white"><X className="w-3 h-3" /></button>
        </div>
      )}
      {busy && state.mode === 'watch' && state.watch && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-30 bg-white/10">
          <div className="h-full transition-[width] duration-700" style={{ width: `${(state.watch.elapsed / state.watch.seconds) * 100}%`, background: accent }} />
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

/* ───────────── What it found, below the picture ───────────── */

function Big({ n, word, colour, ms }: { n: number; word: string; colour: string; ms: number }) {
  const shown = useCountUp(n, ms);
  return (
    <div className="flex flex-col">
      <span className="text-[28px] leading-none font-mono font-bold tabular-nums" style={{ color: colour, textShadow: `0 0 18px color-mix(in srgb, ${colour} 55%, transparent)` }}>{shown}</span>
      <span className="mt-1 text-[8px] font-mono tracking-[0.3em] text-white/55">{word}</span>
    </div>
  );
}

/** A vehicle's number, as tagged on its box. */
const Tag = ({ n }: { n: number }) => (
  <span className="px-1 text-[8px] leading-tight font-bold text-black" style={{ background: 'var(--cyan-primary)' }}>{n}</span>
);

function Report({ camera, state, a }: { camera: VisionCamera; state: Look; a: FrameAnalysis }) {
  const busy = state.status === 'working';
  const ms = state.reveal ? REVEAL_MS : 400;
  const vehicles = a.detections.filter(d => isVehicle(d.label)).length;
  const people = a.counts.person ?? 0;
  const kinds = (Object.entries(a.counts) as [Label, number][]).filter(([l]) => l !== 'person').sort((x, y) => y[1] - x[1]);
  const colours = a.colours ? (Object.entries(a.colours) as [Colour, number][]).sort((x, y) => y[1] - x[1]) : [];
  const identifiable = pickVehicles(a.detections).length;
  const ids = state.identify;
  const named = ids?.status === 'done' ? Object.values(ids.byIndex).sort((x, y) => x.n - y.n) : [];
  const canIdentify = identifiable > 0 && !busy && ids?.status !== 'done';
  const accent = state.by === 'oi' ? 'var(--cyan-primary)' : 'var(--gold-primary)';
  return (
    <div className="vision-rise relative bg-black px-3 pt-2 pb-2.5 border-t" style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }} aria-live="polite">
      <div className="flex items-center gap-2 text-[9px] font-mono tracking-[0.18em] text-white/60">
        <Eye className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
        <span className="truncate">{state.by === 'oi' ? 'OI LOOKED' : 'ANALYSED'} {clock(a.at)} · {a.light.toUpperCase()}</span>
        {canIdentify && (
          <button onClick={() => { identifyVehicles(camera).catch(() => {}); }} disabled={ids?.status === 'working'} aria-label="Identify the vehicles' makes and models"
            title="Ask your own AI model to name the largest vehicles' makes and models (never number plates)"
            className="ml-auto flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 border text-[9px] tracking-[0.18em] transition-colors hover:bg-[var(--cyan-primary)]/15 disabled:opacity-70"
            style={{ borderColor: 'var(--cyan-primary)', color: 'var(--cyan-primary)' }}>
            {ids?.status === 'working' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CarFront className="w-2.5 h-2.5" />}
            {ids?.status === 'working' ? 'IDENTIFYING…' : 'IDENTIFY'}
          </button>
        )}
        {!busy && (
          <button onClick={() => clearLook(camera.id)} aria-label="Back to the live feed"
            className={`${canIdentify ? '' : 'ml-auto '}flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 border border-white/15 text-white hover:border-white/40`}>
            <X className="w-2.5 h-2.5" /> LIVE
          </button>
        )}
      </div>

      <div className="mt-2 flex items-end gap-5">
        <Big n={vehicles} word={vehicles === 1 ? 'VEHICLE' : 'VEHICLES'} colour="var(--cyan-primary)" ms={ms} />
        <Big n={people} word={people === 1 ? 'PERSON' : 'PEOPLE'} colour="var(--gold-primary)" ms={ms} />
        <div className="ml-auto pb-0.5 text-right text-[9px] font-mono tracking-wide text-[var(--text-secondary)] leading-relaxed">
          <div>{kinds.length ? kinds.map(([l, n]) => `${n} ${labelWord(l, n)}`).join(' · ').toUpperCase() : vehicles + people ? '' : 'NOTHING IN VIEW IT CAN COUNT'}</div>
          <div className="text-white/45" title="Read by a detector running in this browser: nothing is sent anywhere">
            {a.passes > 1 ? `${a.passes} PASSES · ` : ''}<span style={{ color: accent }}>{a.ms < 1000 ? `${a.ms} MS` : `${(a.ms / 1000).toFixed(1)} S`}</span> · ON THIS DEVICE
          </div>
        </div>
      </div>

      {vehicles > 0 && (a.colours ? (
        <div className="mt-2">
          <div className="vision-grow flex h-1.5 gap-px" style={{ '--sweep': `${ms}ms` } as CSSProperties}>
            {colours.map(([c, n]) => (
              <span key={c} title={`${n} ${c}`} className="h-full transition-[flex-grow] duration-500" style={{ flexGrow: n, background: SWATCH[c], boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)' }} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[9px] font-mono tracking-wide text-[var(--text-secondary)]">
            {colours.map(([c, n]) => (
              <span key={c} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5" style={{ background: SWATCH[c], boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)' }} />{n} {c.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-[9px] font-mono tracking-wide text-[var(--text-secondary)]">COLOURS UNREADABLE: THIS PICTURE HAS NO COLOUR (INFRARED OR NIGHT)</div>
      ))}

      {named.length > 0 && (
        // One line, scrolling sideways, so naming never makes the report much taller.
        <div className="mt-1.5 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap text-[9px] font-mono tracking-wide [scrollbar-width:none]">
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
      {ids?.status === 'error' && <div className="mt-1 text-[9px] font-mono tracking-wide text-red-300">{ids.error}</div>}
      {state.watch?.summary && (
        <div className="mt-1 text-[9px] font-mono tracking-wide text-[var(--text-secondary)]">{describeWatch(state.watch.summary)}</div>
      )}
    </div>
  );
}

/** What the analysis found, told beneath the picture so that nothing covers it. */
export function VisionReport({ camera }: { camera: VisionCamera }) {
  const state = useLook(camera.id);
  if (!state?.analysis) return null;
  return <Report camera={camera} state={state} a={state.analysis} />;
}

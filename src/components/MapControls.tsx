'use client';

import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react';
import type { Map as MlMap } from 'maplibre-gl';

/**
 * OSIRIS — on-screen map controls
 *
 * On a desktop the camera could only be driven by the two mouse gestures: the
 * wheel to zoom, a held drag to pan. Neither is available on a trackpad-less
 * machine, a touchscreen kiosk, or to anyone driving the map from the
 * keyboard, so the map was simply stuck for them.
 *
 * These mirror those gestures rather than adding new ones: the +/- pair is the
 * wheel, the pad is a held drag. A tap moves one step; holding keeps moving
 * for as long as the button is down, the way a wheel spun or a drag held
 * would.
 *
 * Phones are deliberately left out — pinch and drag already work there, and
 * the pad would cost a quarter of the screen to duplicate them.
 *
 * Continuous motion is a chain of short overlapping `easeTo` calls rather than
 * a per-frame camera write. Both look the same, but a per-frame write fires
 * `moveend` sixty times a second, and the page re-renders on every one.
 */

/** Zoom levels, and screen pixels, covered per second of holding. */
const ZOOM_RATE = 1.6;
const PAN_RATE = 640;
/** What a single tap is worth. */
const ZOOM_STEP = 1;
const PAN_STEP = 220;
/** How long the tap's own animation runs. */
const STEP_MS = 240;
/** Grace period before a press turns into a hold, so a tap is only ever one step. */
const HOLD_DELAY_MS = 280;
/**
 * Each continuous leg is started twice as often as it is long, so the next one
 * always interrupts the last mid-flight and the camera never pauses between
 * them. Halving it keeps the resulting speed at exactly the rates above.
 */
const TICK_MS = 200;
const LEG_MS = TICK_MS * 2;

const linear = (t: number) => t;

type Move =
  /** Wheel equivalent: which way, in zoom levels. */
  | { kind: 'zoom'; dir: 1 | -1 }
  /** Drag equivalent: which way, as a unit vector in screen space. */
  | { kind: 'pan'; dx: number; dy: number };

interface MapControlsProps {
  mapRef: React.RefObject<MlMap | null>;
  /** Called when the operator drives the camera, to hand back a follow lock. */
  onInteract?: () => void;
}

export default function MapControls({ mapRef, onInteract }: MapControlsProps) {
  /** The pending hold timer and its repeat, cleared on release and on unmount. */
  const holdRef = useRef<{ delay: number; repeat: number } | null>(null);

  const release = useCallback(() => {
    const hold = holdRef.current;
    if (!hold) return;
    holdRef.current = null;
    window.clearTimeout(hold.delay);
    // Only a hold has a leg in flight worth cutting, and cutting it is what
    // stops the camera under the finger rather than a beat later. A tap must
    // be left alone: `stop()` there would abort the step's own animation
    // partway and leave the map short of the level it was asked for.
    if (hold.repeat) {
      window.clearInterval(hold.repeat);
      mapRef.current?.stop();
    }
  }, [mapRef]);

  useEffect(() => release, [release]);

  /** One step's worth of movement — what a tap, or a keyboard press, gives. */
  const step = useCallback((move: Move) => {
    const map = mapRef.current;
    if (!map) return;
    onInteract?.();
    if (move.kind === 'zoom') map.easeTo({ zoom: map.getZoom() + move.dir * ZOOM_STEP, duration: STEP_MS });
    else map.panBy([move.dx * PAN_STEP, move.dy * PAN_STEP], { duration: STEP_MS });
  }, [mapRef, onInteract]);

  const press = useCallback((move: Move) => {
    const map = mapRef.current;
    if (!map) return;
    release();
    step(move);

    const leg = () => {
      const m = mapRef.current;
      if (!m) return;
      if (move.kind === 'zoom') {
        m.easeTo({ zoom: m.getZoom() + move.dir * ZOOM_RATE * (LEG_MS / 1000), duration: LEG_MS, easing: linear });
      } else {
        const d = PAN_RATE * (LEG_MS / 1000);
        m.panBy([move.dx * d, move.dy * d], { duration: LEG_MS, easing: linear });
      }
    };

    const delay = window.setTimeout(() => {
      leg();
      const repeat = window.setInterval(leg, TICK_MS);
      if (holdRef.current) holdRef.current.repeat = repeat;
      else window.clearInterval(repeat);
    }, HOLD_DELAY_MS);
    holdRef.current = { delay, repeat: 0 };
  }, [mapRef, release, step]);

  return (
    <motion.div
      /* Desktop, laptop and fullscreen only. A phone already has pinch and
         drag, and the pad would only crowd a 390px screen; `desktop-only` is
         the app's own definition of that line, landscape phones included.
         The entrance owns this element's opacity, so the resting dim below
         has to live on the panel inside it. */
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="desktop-only absolute right-2 bottom-12 z-[240] pointer-events-auto"
      /* The Style Studio's off switch hides the pad through this. */
      data-map-controls
    >
      {/* The pad sits back, and comes forward as the cursor approaches it or a
          key focuses it. */}
      <div
        className="flex items-center gap-[3px] p-[3px] rounded-xl border border-[var(--border-secondary)] bg-black/35 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-[opacity,border-color] duration-300 opacity-60 hover:opacity-100 focus-within:opacity-100 hover:border-[var(--border-primary)] focus-within:border-[var(--border-primary)]"
        role="group"
        aria-label="Map camera controls"
      >
        {/* The wheel's two directions, stacked the way every zoom control is.
            The pad is kept to three rows in all: the tool rail above reaches
            this far down on a short window, and taller would run into it. */}
        <div className="flex flex-col gap-[3px]">
          <Btn label="Zoom in" move={{ kind: 'zoom', dir: 1 }} icon={Plus} press={press} release={release} step={step} />
          <Btn label="Zoom out" move={{ kind: 'zoom', dir: -1 }} icon={Minus} press={press} release={release} step={step} />
        </div>

        <div aria-hidden="true" className="self-stretch w-px mx-1 bg-gradient-to-b from-transparent via-[var(--border-secondary)] to-transparent" />

        {/* A held drag, laid out as the compass it stands for rather than a list. */}
        <div className="grid grid-cols-3 grid-rows-3 gap-[3px]">
          <Btn cell="col-start-2 row-start-1" label="Pan north" move={{ kind: 'pan', dx: 0, dy: -1 }} icon={ChevronUp} press={press} release={release} step={step} />
          <Btn cell="col-start-1 row-start-2" label="Pan west" move={{ kind: 'pan', dx: -1, dy: 0 }} icon={ChevronLeft} press={press} release={release} step={step} />
          <Btn cell="col-start-3 row-start-2" label="Pan east" move={{ kind: 'pan', dx: 1, dy: 0 }} icon={ChevronRight} press={press} release={release} step={step} />
          <Btn cell="col-start-2 row-start-3" label="Pan south" move={{ kind: 'pan', dx: 0, dy: 1 }} icon={ChevronDown} press={press} release={release} step={step} />
        </div>
      </div>
    </motion.div>
  );
}

function Btn({ cell = '', label, icon: Icon, move, press, release, step }: {
  /** Grid placement, for the compass buttons that need one. */
  cell?: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  move: Move;
  press: (m: Move) => void;
  release: () => void;
  step: (m: Move) => void;
}) {
  return (
    <button
      type="button"
      title={`${label} — hold to keep going`}
      aria-label={label}
      className={`${cell} w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--text-primary)] hover:bg-[rgba(var(--gold-rgb),0.06)] active:text-[var(--gold-light)] active:bg-[rgba(var(--gold-rgb),0.12)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] touch-none select-none`}
      onPointerDown={(e) => {
        // Only the primary button drives the camera, and the press has to keep
        // receiving its own pointerup even once the cursor leaves the target.
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(move);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      // Losing the capture without a pointerup — the button unmounting under
      // the cursor, say — would otherwise leave the camera moving on its own.
      onLostPointerCapture={release}
      // A keyboard press never sends pointer events, so it lands here instead —
      // and `detail` is 0 only for those, which keeps clicks from stepping twice.
      onClick={(e) => { if (e.detail === 0) step(move); }}
    >
      <Icon className="w-3 h-3" strokeWidth={1.5} />
    </button>
  );
}

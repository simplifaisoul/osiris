'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react';
import type { Map as MlMap } from 'maplibre-gl';
import { createMapCameraControls, type CameraMove } from '@/lib/map-camera-controls';

interface MapControlsProps {
  mapRef: React.RefObject<MlMap | null>;
  onInteract?: () => void;
}

/** Compact zoom on phones; desktop also gets the held-pan pad. */
export default function MapControls({ mapRef, onInteract }: MapControlsProps) {
  const controller = useRef<ReturnType<typeof createMapCameraControls> | null>(null);
  const interact = useRef(onInteract);
  const [limits, setLimits] = useState({ min: false, max: false });
  useEffect(() => { interact.current = onInteract; }, [onInteract]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const controls = createMapCameraControls(map, () => interact.current?.(),
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    controller.current = controls;
    const updateLimits = () => setLimits({ min: map.getZoom() <= map.getMinZoom() + 0.001, max: map.getZoom() >= map.getMaxZoom() - 0.001 });
    const onHidden = () => { if (document.hidden) controls.release(); };
    updateLimits();
    map.on('zoomend', updateLimits);
    window.addEventListener('blur', controls.release);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      controls.dispose();
      controller.current = null;
      map.off('zoomend', updateLimits);
      window.removeEventListener('blur', controls.release);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [mapRef]);

  const step = useCallback((move: CameraMove) => controller.current?.step(move), []);
  const press = useCallback((move: CameraMove) => controller.current?.press(move), []);
  const release = useCallback(() => controller.current?.release(), []);
  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.4 }}
      className="absolute right-2 bottom-[112px] md:bottom-12 z-[240] pointer-events-auto" data-map-controls>
      <div role="group" aria-label="Map camera controls"
        className="flex items-center gap-[3px] p-[3px] rounded-xl border border-[var(--border-secondary)] bg-black/60 backdrop-blur-md shadow-lg transition-opacity opacity-85 hover:opacity-100 focus-within:opacity-100">
        <div className="flex flex-col gap-[3px]">
          <Btn label="Zoom in" move={{ kind: 'zoom', dir: 1 }} icon={Plus} disabled={limits.max} press={press} release={release} step={step} />
          <Btn label="Zoom out" move={{ kind: 'zoom', dir: -1 }} icon={Minus} disabled={limits.min} press={press} release={release} step={step} />
        </div>
        <div className="desktop-only flex items-center gap-1">
          <div aria-hidden="true" className="h-12 w-px mx-1 bg-[var(--border-secondary)]" />
          <div className="grid grid-cols-3 grid-rows-3 gap-[3px]">
            <Btn cell="col-start-2 row-start-1" label="Pan north" move={{ kind: 'pan', dx: 0, dy: -1 }} icon={ChevronUp} press={press} release={release} step={step} />
            <Btn cell="col-start-1 row-start-2" label="Pan west" move={{ kind: 'pan', dx: -1, dy: 0 }} icon={ChevronLeft} press={press} release={release} step={step} />
            <Btn cell="col-start-3 row-start-2" label="Pan east" move={{ kind: 'pan', dx: 1, dy: 0 }} icon={ChevronRight} press={press} release={release} step={step} />
            <Btn cell="col-start-2 row-start-3" label="Pan south" move={{ kind: 'pan', dx: 0, dy: 1 }} icon={ChevronDown} press={press} release={release} step={step} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Btn({ cell = '', label, icon: Icon, move, disabled = false, press, release, step }: {
  cell?: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  move: CameraMove; disabled?: boolean;
  press: (m: CameraMove) => void; release: () => void; step: (m: CameraMove) => void;
}) {
  return (
    <button type="button" title={`${label} — hold to keep going`} aria-label={label} disabled={disabled}
      className={`${cell} w-10 h-10 md:w-8 md:h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-accent)] active:text-[var(--gold-light)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)] disabled:opacity-25 touch-none select-none`}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(move);
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onClick={e => { if (e.detail === 0) step(move); }}>
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
    </button>
  );
}

'use client';

import { useMemo } from 'react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Scale Bar
   Dynamic map scale indicator
   ═══════════════════════════════════════════════════════════════ */

interface ScaleBarProps {
  zoom: number;
  latitude: number;
}

const SCALE_STEPS = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

export default function ScaleBar({ zoom, latitude }: ScaleBarProps) {
  const scaleInfo = useMemo(() => {
    // Meters per pixel at given zoom and latitude
    const metersPerPx = 156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);
    const maxWidth = 120; // Max bar width in pixels
    const maxMeters = metersPerPx * maxWidth;
    const maxKm = maxMeters / 1000;

    // Find the best scale step
    let bestStep = SCALE_STEPS[0];
    for (const step of SCALE_STEPS) {
      if (step <= maxKm) { bestStep = step; break; }
    }

    const barWidth = Math.round((bestStep * 1000) / metersPerPx);
    const label = bestStep >= 1 ? `${bestStep} km` : `${bestStep * 1000} m`;

    return { barWidth, label };
  }, [zoom, latitude]);

  return (
    <div className="flex items-end gap-2 pointer-events-none">
      <div className="flex flex-col items-start">
        <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-wider mb-0.5">
          {scaleInfo.label}
        </span>
        <div
          className="h-[2px] bg-[var(--gold-primary)] rounded-full"
          style={{ width: scaleInfo.barWidth }}
        />
        <div className="flex justify-between w-full">
          <div className="w-[1px] h-1 bg-[var(--gold-primary)]" />
          <div className="w-[1px] h-1 bg-[var(--gold-primary)]" />
        </div>
      </div>
    </div>
  );
}

'use client';

import * as maplibregl from 'maplibre-gl';
import { Minus, Navigation2, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ESRI_IMAGERY_CREDIT,
  ESRI_IMAGERY_TILES,
  VIEW_ZOOMS,
  baseFovDeg,
  footprintKm,
  fovAtZoom,
  zoomForWidth,
} from '@/lib/satellite-view';

/**
 * OSIRIS — what the selected satellite or aircraft is over
 *
 * A small globe of Esri World Imagery looking straight down from the
 * satellite or aircraft, the way a camera underneath would. It follows it
 * every second with the direction of travel at the top, so the ground slides
 * underneath. The width of the picture is a lens: 60° from an aircraft or a
 * low orbit (about 13 km of ground from cruising height, 490 km from the ISS),
 * the whole Earth from geostationary height, narrowed by the zoom steps.
 *
 * The imagery is Esri's archive mosaic, not a live frame, and the picture
 * says so.
 */
export default function ViewBelow({ lat, lng, altKm, headingDeg, accent, corner }: {
  lat: number;
  lng: number;
  altKm: number;
  /** Direction of travel; null keeps north up (a geostationary satellite). */
  headingDeg: number | null;
  accent: string;
  /** The picture toggle, drawn in the bottom-left corner. */
  corner?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [step, setStep] = useState(0);
  const widthKm = footprintKm(altKm, fovAtZoom(baseFovDeg(altKm), VIEW_ZOOMS[step]));
  const bearing = headingDeg ?? 0;

  // Read by the map's constructor only; the effect below moves it after that.
  const startRef = useRef({ lat, lng, widthKm, bearing });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const start = startRef.current;
    const map = new maplibregl.Map({
      container: box,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          esri: { type: 'raster', tiles: [ESRI_IMAGERY_TILES], tileSize: 256, maxzoom: 18 },
        },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      },
      center: [start.lng, start.lat],
      zoom: zoomForWidth(start.widthKm, start.lat, box.clientWidth),
      bearing: start.bearing,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // A new position arrives every second; easing over that second keeps the
  // ground moving continuously instead of jumping once a second.
  useEffect(() => {
    const map = mapRef.current;
    const box = boxRef.current;
    if (!map || !box) return;
    map.easeTo({
      center: [lng, lat],
      zoom: zoomForWidth(widthKm, lat, box.clientWidth),
      bearing,
      duration: 1000,
      easing: (t: number) => t,
    });
  }, [lat, lng, widthKm, bearing]);

  const zoom = VIEW_ZOOMS[step];
  return (
    <div className="border-t border-[var(--border-secondary)]">
      <div
        className="relative h-[150px] w-full overflow-hidden bg-black md:h-[168px]"
        title="Esri World Imagery under its live position. Archive imagery, not a live camera feed."
      >
        {/* Sized by height and width, not by inset: MapLibre makes its container
            position: relative, which would collapse an inset-only box to nothing. */}
        <div ref={boxRef} className="h-full w-full" />

        {/* The point straight below the satellite. */}
        <svg className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 28 28" aria-hidden>
          <g stroke={accent} strokeWidth="1.25" strokeLinecap="round" opacity="0.9">
            <path d="M14 2v7M14 19v7M2 14h7M19 14h7" />
          </g>
          <circle cx="14" cy="14" r="1.5" fill={accent} />
        </svg>

        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-mono tracking-[0.14em] text-white/85">
          VIEW BELOW · {widthKm >= 100 ? Math.round(widthKm).toLocaleString() : widthKm.toFixed(1)} KM ACROSS
        </div>

        {/* North, turned with the picture: travel is up, so north is wherever the track leaves it. */}
        <div
          className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60"
          aria-label={`North is ${Math.round(bearing)}° to the left of up`}
        >
          <Navigation2
            className="h-3 w-3 text-white/85"
            style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 1s linear' }}
          />
        </div>

        <div className="absolute bottom-1.5 right-1.5 flex items-center overflow-hidden rounded bg-black/60 text-white/85">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="p-1 transition-colors hover:bg-white/15 disabled:opacity-30"
            aria-label="Zoom the view out"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
          <span className="w-6 text-center text-[8px] font-mono tabular-nums">{zoom}×</span>
          <button
            onClick={() => setStep(s => Math.min(VIEW_ZOOMS.length - 1, s + 1))}
            disabled={step === VIEW_ZOOMS.length - 1}
            className="p-1 transition-colors hover:bg-white/15 disabled:opacity-30"
            aria-label="Zoom the view in"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        </div>

        {corner && <div className="absolute bottom-1.5 left-1.5">{corner}</div>}
      </div>
      <div className="px-2.5 py-1 text-[7px] leading-snug text-[var(--text-muted)]">{ESRI_IMAGERY_CREDIT}</div>
    </div>
  );
}

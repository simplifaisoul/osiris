/**
 * OSIRIS OI Assist: what the assistant marks on the map.
 *
 * Labelled points (what it found, or places it named) and, optionally, the
 * circle of the area it searched, drawn above every other layer in the
 * theme's cyan, Assist's colour. New marks pulse a few times as they land,
 * then hold still: a map that repaints itself forever for a highlight is a
 * map that drains a laptop. The marks re-add themselves after a basemap change.
 */
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Highlight } from './assist/tools';

export interface Highlighter {
  set(h: Highlight | null): void;
  destroy(): void;
}

const POINTS = 'oi-hl-points';
const AREA = 'oi-hl-area';
const LAYERS = ['oi-hl-area-fill', 'oi-hl-area-line', 'oi-hl-halo', 'oi-hl-core', 'oi-hl-label', 'oi-hl-area-label'] as const;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** A circle of a radius on the ground, as a polygon (good enough for a highlight at any latitude). */
export function circle(lat: number, lng: number, radiusKm: number, steps = 96): GeoJSON.Polygon {
  const r = radiusKm / 6371;
  const φ1 = (lat * Math.PI) / 180, λ1 = (lng * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(r) + Math.cos(φ1) * Math.sin(r) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(r) * Math.cos(φ1), Math.cos(r) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([((((λ2 * 180) / Math.PI) + 540) % 360) - 180, (φ2 * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

export function highlightData(h: Highlight | null): { points: GeoJSON.FeatureCollection; area: GeoJSON.FeatureCollection } {
  if (!h) return { points: EMPTY, area: EMPTY };
  return {
    points: {
      type: 'FeatureCollection',
      features: h.points.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { label: p.label, n: i + 1 } })),
    },
    area: h.area ? {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: circle(h.area.lat, h.area.lng, h.area.radiusKm), properties: { kind: 'ring' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [h.area.lng, h.area.lat] }, properties: { kind: 'centre', label: h.area.label } },
      ],
    } : EMPTY,
  };
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v) ? v : fallback;
}

export function attachHighlights(map: MlMap): Highlighter {
  let current: Highlight | null = null;
  let pulse = 0;

  const ensure = () => {
    // Assist's colour: cyan in Core, the theme's accent in Ghost.
    const accent = themeColor('--cyan-primary', '#00E5FF');
    if (!map.getSource(AREA)) map.addSource(AREA, { type: 'geojson', data: EMPTY });
    if (!map.getSource(POINTS)) map.addSource(POINTS, { type: 'geojson', data: EMPTY });
    if (!map.getLayer('oi-hl-area-fill')) {
      map.addLayer({ id: 'oi-hl-area-fill', type: 'fill', source: AREA, filter: ['==', ['get', 'kind'], 'ring'], paint: { 'fill-color': accent, 'fill-opacity': 0.06 } });
    }
    if (!map.getLayer('oi-hl-area-line')) {
      map.addLayer({ id: 'oi-hl-area-line', type: 'line', source: AREA, filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': accent, 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [2, 2] } });
    }
    if (!map.getLayer('oi-hl-halo')) {
      map.addLayer({ id: 'oi-hl-halo', type: 'circle', source: POINTS, paint: { 'circle-radius': 13, 'circle-color': accent, 'circle-opacity': 0.22, 'circle-blur': 0.5, 'circle-pitch-alignment': 'map' } });
    }
    if (!map.getLayer('oi-hl-core')) {
      map.addLayer({ id: 'oi-hl-core', type: 'circle', source: POINTS, paint: { 'circle-radius': 4.5, 'circle-color': accent, 'circle-stroke-color': 'rgba(4,4,10,0.9)', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } });
    }
    if (!map.getLayer('oi-hl-label')) {
      map.addLayer({
        id: 'oi-hl-label', type: 'symbol', source: POINTS,
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 14 },
        paint: { 'text-color': '#F5F0E0', 'text-halo-color': 'rgba(4,4,10,0.9)', 'text-halo-width': 1.6 },
      });
    }
    if (!map.getLayer('oi-hl-area-label')) {
      map.addLayer({
        id: 'oi-hl-area-label', type: 'symbol', source: AREA, filter: ['==', ['get', 'kind'], 'centre'],
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Bold'], 'text-size': 10, 'text-letter-spacing': 0.2, 'text-transform': 'uppercase', 'text-offset': [0, -1.4] },
        paint: { 'text-color': accent, 'text-halo-color': 'rgba(4,4,10,0.9)', 'text-halo-width': 1.4 },
      });
    }
    // Above everything drawn since.
    for (const id of LAYERS) if (map.getLayer(id)) map.moveLayer(id);
    const d = highlightData(current);
    (map.getSource(POINTS) as GeoJSONSource).setData(d.points);
    (map.getSource(AREA) as GeoJSONSource).setData(d.area);
  };

  /** Three pulses as new marks land, then still. */
  const land = () => {
    cancelAnimationFrame(pulse);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 700;
      if (!map.getLayer('oi-hl-halo')) return;
      if (t >= 3) {
        map.setPaintProperty('oi-hl-halo', 'circle-radius', 13);
        map.setPaintProperty('oi-hl-halo', 'circle-opacity', 0.22);
        return;
      }
      const k = t % 1;
      map.setPaintProperty('oi-hl-halo', 'circle-radius', 8 + 18 * k);
      map.setPaintProperty('oi-hl-halo', 'circle-opacity', 0.5 * (1 - k));
      pulse = requestAnimationFrame(tick);
    };
    pulse = requestAnimationFrame(tick);
  };

  const onStyle = () => { if (map.isStyleLoaded() && !map.getSource(POINTS)) ensure(); };
  map.on('styledata', onStyle);
  if (map.isStyleLoaded()) ensure();

  return {
    set(h) {
      current = h;
      if (!map.isStyleLoaded()) return;
      ensure();
      if (h) land();
    },
    destroy() {
      cancelAnimationFrame(pulse);
      map.off('styledata', onStyle);
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [POINTS, AREA]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}

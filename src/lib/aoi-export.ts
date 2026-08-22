import type { DrawnShape } from './draw';
import type { AoiReport } from './aoi';

/**
 * OSIRIS — AOI persistence and export
 *
 * Two jobs that sound unrelated but are the same problem: getting a drawn area,
 * and what was found inside it, out of volatile memory. One goes to
 * localStorage so a refresh does not destroy an afternoon's work; the other
 * goes to a file so the finding can leave the tool at all.
 */

/* ── Export ─────────────────────────────────────────────────────────────── */

/** All shapes as one FeatureCollection, measurements carried in properties. */
export function shapesToGeoJSON(shapes: DrawnShape[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shapes.map(s => ({
      ...s.geojson,
      properties: {
        name: s.name,
        kind: s.kind,
        area_km2: Number(s.areaKm2.toFixed(4)),
        perimeter_km: Number(s.perimeterKm.toFixed(4)),
        color: s.color,
        created: new Date(s.createdAt).toISOString(),
        ...(s.meta?.radiusKm != null ? { radius_km: Number(s.meta.radiusKm.toFixed(4)) } : {}),
      },
    })),
  };
}

/** Objects found inside one AOI, as points carrying their layer and label. */
export function contentsToGeoJSON(shape: DrawnShape, report: AoiReport): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: report.groups.flatMap(g =>
      g.items.map(item => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [item.lng, item.lat] },
        properties: {
          aoi: shape.name,
          layer: g.key,
          layer_label: g.label,
          label: item.label,
          detail: item.detail ?? '',
        },
      })),
    ),
  };
}

/** RFC 4180 quoting: double the quotes, wrap anything with a separator. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Objects found inside one AOI as CSV — the format a finding actually leaves
 * in, because the next stop is usually a spreadsheet rather than a map.
 */
export function contentsToCSV(shape: DrawnShape, report: AoiReport): string {
  const rows = [['aoi', 'layer', 'label', 'detail', 'lat', 'lng']];
  for (const g of report.groups) {
    for (const item of g.items) {
      rows.push([
        shape.name, g.label, item.label, item.detail ?? '',
        item.lat.toFixed(6), item.lng.toFixed(6),
      ]);
    }
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ── Persistence ────────────────────────────────────────────────────────── */

export const STORAGE_KEY = 'osiris.aoi.shapes.v1';

/** Only what is needed to rebuild a shape; derived values are recomputed. */
interface StoredShape {
  id: string; name: string; kind: DrawnShape['kind'];
  geojson: DrawnShape['geojson'];
  areaKm2: number; perimeterKm: number;
  color: string; createdAt: number;
  meta?: DrawnShape['meta'];
}

export function serializeShapes(shapes: DrawnShape[]): string {
  const stored: StoredShape[] = shapes.map(s => ({
    id: s.id, name: s.name, kind: s.kind, geojson: s.geojson,
    areaKm2: s.areaKm2, perimeterKm: s.perimeterKm,
    color: s.color, createdAt: s.createdAt, meta: s.meta,
  }));
  return JSON.stringify(stored);
}

/**
 * Rebuild shapes from storage, discarding anything malformed.
 *
 * Storage is shared with older builds and with whatever a user pasted into it,
 * so every field is checked. One bad record must not cost the whole set —
 * losing every AOI because a single entry lacks geometry is a worse failure
 * than quietly dropping that entry.
 */
export function deserializeShapes(raw: string | null): DrawnShape[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: DrawnShape[] = [];
  for (const s of parsed as any[]) {
    if (!s || typeof s !== 'object') continue;
    const geom = s.geojson?.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'LineString')) continue;
    if (!Array.isArray(geom.coordinates) || geom.coordinates.length === 0) continue;
    if (typeof s.id !== 'string' || typeof s.name !== 'string') continue;

    out.push({
      id: s.id,
      name: s.name,
      kind: s.kind ?? 'polygon',
      geojson: s.geojson,
      areaKm2: Number(s.areaKm2) || 0,
      perimeterKm: Number(s.perimeterKm) || 0,
      color: typeof s.color === 'string' ? s.color : '#00E5FF',
      createdAt: Number(s.createdAt) || Date.now(),
      meta: s.meta,
    });
  }
  return out;
}

/** Trigger a client-side download. No-ops outside the browser. */
export function downloadFile(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

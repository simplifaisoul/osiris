/**
 * OSIRIS — Area of Interest analysis
 *
 * Turns a drawn polygon into an answer to "what is inside this?". Every tracked
 * layer is swept, the hits are grouped by kind, and the result is what the
 * drawing panel reports.
 *
 * The work is pure and synchronous on purpose: the sweep re-runs whenever live
 * data refreshes (aircraft move every 90 seconds), so it has to be cheap enough
 * to sit in a render path. A bounding-box rejection runs first because the
 * common case is a city-sized polygon against ~19k satellites and ~9k aircraft,
 * where almost everything fails on a pair of numeric comparisons.
 */

export interface AoiEntity {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Layer-specific extras worth showing in the readout. */
  detail?: string;
}

export interface AoiGroup {
  key: string;
  label: string;
  color: string;
  count: number;
  /** Capped — a polygon over Europe can hold thousands of aircraft. */
  items: AoiEntity[];
  /**
   * Every member id, uncapped. `items` is a display sample, so anything that
   * needs to reason about membership — a tripwire diff, in particular — must
   * use this instead: diffing the capped list makes the truncation window
   * shifting look like objects arriving and leaving.
   */
  memberIds: string[];
}

export interface AoiReport {
  total: number;
  groups: AoiGroup[];
}

/** Per-group cap. The count stays exact; only the listing is truncated. */
export const MAX_ITEMS_PER_GROUP = 50;

interface LayerSpec {
  key: string;
  label: string;
  color: string;
  /** Field holding a human-readable name, first match wins. */
  labelFields: string[];
  detail?: (e: any) => string | undefined;
}

/**
 * Which collections get swept. Keys match the shape page.tsx already holds, so
 * adding a layer here is the only step needed to make it selectable.
 */
export const AOI_LAYERS: LayerSpec[] = [
  { key: 'commercial_flights', label: 'Commercial aircraft', color: '#00E5FF', labelFields: ['callsign', 'icao24'],
    detail: e => [e.model, e.alt ? `${e.alt} m` : null].filter(Boolean).join(' · ') || undefined },
  { key: 'private_flights', label: 'Private aircraft', color: '#76FF03', labelFields: ['callsign', 'icao24'],
    detail: e => e.model || undefined },
  { key: 'private_jets', label: 'Private jets', color: '#FFD500', labelFields: ['callsign', 'icao24'],
    detail: e => e.model || undefined },
  { key: 'military_flights', label: 'Military aircraft', color: '#FF3D3D', labelFields: ['callsign', 'icao24'],
    detail: e => e.model || undefined },
  { key: 'maritime_ships', label: 'Vessels', color: '#448AFF', labelFields: ['name', 'mmsi', 'imo'],
    detail: e => e.destination || e.flag || undefined },
  { key: 'satellites', label: 'Satellites', color: '#E040FB', labelFields: ['name', 'noradId'],
    detail: e => (e.altitude ? `${Math.round(e.altitude)} km` : undefined) },
  { key: 'cameras', label: 'CCTV cameras', color: '#00E676', labelFields: ['name', 'id'],
    detail: e => [e.city, e.country].filter(Boolean).join(', ') || undefined },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF9500', labelFields: ['place', 'id'],
    detail: e => (e.magnitude != null ? `M${e.magnitude}` : undefined) },
  { key: 'infrastructure', label: 'Nuclear facilities', color: '#FFEE58', labelFields: ['name', 'id'],
    detail: e => e.country || undefined },
  { key: 'gdelt', label: 'Global incidents', color: '#FF6B1A', labelFields: ['name', 'id'],
    detail: e => e.type || undefined },
  { key: 'weather_events', label: 'Severe weather', color: '#7E57C2', labelFields: ['title', 'name', 'id'],
    detail: e => e.category || undefined },
];

/**
 * Ray casting. `ring` is [lng, lat] pairs; the ring may be open or closed.
 *
 * A vertex-crossing rule is used (lower bound inclusive, upper exclusive) so a
 * point sitting exactly on a shared horizontal edge is counted once rather than
 * twice, which is what makes a point on the boundary stable instead of
 * flickering between in and out as the polygon is redrawn.
 */
export function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const straddles = (yi > lat) !== (yj > lat);
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounds, used to reject the overwhelming majority cheaply. */
export function bboxOf(ring: number[][]): { west: number; south: number; east: number; north: number } {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

function pickLabel(e: any, fields: string[]): string {
  for (const f of fields) {
    const v = e?.[f];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return 'Unknown';
}

/**
 * Sweep every registered layer against the ring.
 *
 * `data` is the live store from page.tsx; missing or non-array keys are skipped
 * rather than treated as empty, so a layer that has not loaded yet simply does
 * not appear instead of reporting a confident zero.
 */
export function selectInPolygon(ring: number[][], data: Record<string, any>): AoiReport {
  if (!ring || ring.length < 3) return { total: 0, groups: [] };

  const box = bboxOf(ring);
  const groups: AoiGroup[] = [];
  let total = 0;

  for (const spec of AOI_LAYERS) {
    const rows = data?.[spec.key];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const items: AoiEntity[] = [];
    const memberIds: string[] = [];
    let count = 0;

    for (const e of rows) {
      const lat = typeof e?.lat === 'number' ? e.lat : null;
      const lng = typeof e?.lng === 'number' ? e.lng : null;
      if (lat === null || lng === null) continue;
      // Cheap rejection before the ray cast.
      if (lng < box.west || lng > box.east || lat < box.south || lat > box.north) continue;
      if (!pointInPolygon(lng, lat, ring)) continue;

      count++;
      const entityId = String(e.id ?? e.icao24 ?? e.mmsi ?? e.noradId ?? `${lat},${lng}`);
      memberIds.push(entityId);
      if (items.length < MAX_ITEMS_PER_GROUP) {
        items.push({
          id: entityId,
          label: pickLabel(e, spec.labelFields),
          lat, lng,
          detail: spec.detail?.(e),
        });
      }
    }

    if (count > 0) {
      groups.push({ key: spec.key, label: spec.label, color: spec.color, count, items, memberIds });
      total += count;
    }
  }

  groups.sort((a, b) => b.count - a.count);
  return { total, groups };
}

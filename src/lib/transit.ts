/**
 * OSIRIS — Live transit: the shared shapes and the map-side helpers.
 *
 * Buses (and, where an operator's feed includes them, trams, metros, trains
 * and ferries) come from operators' own GTFS-Realtime vehicle-position feeds,
 * catalogued in transit-feeds.generated.ts. The server reads the feeds that
 * cover the part of the world on screen (transit-live.ts); this file holds
 * what both sides need, and nothing that pulls the catalogue into the browser.
 */

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export interface TransitFeed {
  id: string;
  /** The operator or publisher, as the catalogue names it. */
  provider: string;
  /** ISO 3166-1 alpha-2, when the catalogue knows it. */
  country: string;
  /** City or region the feed serves, when known. */
  region: string;
  url: string;
  /** Request headers the feed asks for (an identifying client name, never a secret). */
  headers?: Record<string, string>;
  /** Where the feed's vehicles run: the area to read it for. */
  bbox: number[];
  /** The fleet's median position, [lng, lat]: where the map marks the feed. */
  center: number[];
  /** Where most of the fleet runs: what the map flies to. */
  core: number[];
  /** The publisher's terms or licence page. */
  license?: string;
  /** Mobility Database source id. */
  mdb?: string;
  /** How many vehicles the feed reported when the catalogue was built. */
  vehiclesAtProbe: number;
  /** The body is a ZIP archive holding the FeedMessage (the UK's nationwide file). */
  format?: 'zip';
  /** How long one read is shared, when the feed is too big to read every 20 s. */
  ttlMs?: number;
  /**
   * The feed needs a key. It is read from the server's environment and put
   * where the operator expects it; without it the feed is left out entirely.
   */
  key?: TransitFeedKey;
  /** The transit mode most of the fleet is, when the timetable does not say per route. */
  defaultMode?: TransitMode;
}

export interface TransitFeedKey {
  /** The environment variable holding it. */
  env: string;
  /** Sent in this request header... */
  header?: string;
  /** ...after this, e.g. "apikey " for Transport for NSW. */
  prefix?: string;
  /** ...or as this query parameter. */
  query?: string;
  /** Where a key is had, for the docs and the layer panel. */
  signup: string;
}

export const TRANSIT_MODES = ['bus', 'tram', 'metro', 'rail', 'ferry', 'cable', 'unknown'] as const;
export type TransitMode = (typeof TRANSIT_MODES)[number];

/**
 * GTFS route_type to mode. The basic types 0–12 and the extended (Hierarchical
 * Vehicle Type) ranges both appear in the wild: 700s are buses, 900s trams and
 * so on, so a range is read by its hundreds.
 */
export function modeForRouteType(type: number | undefined): TransitMode {
  if (type === undefined || !Number.isFinite(type)) return 'unknown';
  switch (type) {
    case 0: return 'tram';
    case 1: return 'metro';
    case 2: return 'rail';
    case 3: case 11: return 'bus';
    case 4: return 'ferry';
    case 5: case 6: case 7: return 'cable';
    case 12: return 'rail';
  }
  const band = Math.floor(type / 100);
  if (band === 1 || band === 3) return 'rail';
  if (band === 2 || band === 7 || band === 8) return 'bus';
  if (band === 4 || band === 5 || band === 6) return 'metro';
  if (band === 9) return 'tram';
  if (band === 10 || band === 12) return 'ferry';
  if (band === 13 || band === 14) return 'cable';
  return 'unknown';
}

/** One colour per mode, chosen to stay apart from flights, ships and cameras. */
export const TRANSIT_MODE_COLORS: Record<TransitMode, string> = {
  bus: '#5EEAD4',
  tram: '#FBBF24',
  metro: '#F87171',
  rail: '#C4B5FD',
  ferry: '#7DD3FC',
  cable: '#F9A8D4',
  unknown: '#CBD5E1',
};

export const TRANSIT_MODE_WORDS: Record<TransitMode, string> = {
  bus: 'Bus', tram: 'Tram', metro: 'Metro', rail: 'Train', ferry: 'Ferry', cable: 'Cable car', unknown: 'Transit vehicle',
};

/** One vehicle, as /api/transit sends it. */
export interface TransitVehicle {
  /** Feed id. */
  f: string;
  id: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from north. */
  b?: number;
  /** Speed, m/s. */
  s?: number;
  /** The route as the feed identifies it; often an internal key. */
  route?: string;
  /** The route as riders know it ("39", "Red Line"), from the operator's timetable. */
  name?: string;
  /** From the route's type in the timetable, else the feed's usual mode. */
  mode?: TransitMode;
  label?: string;
  trip?: string;
  /** Position time, seconds since the epoch. */
  t?: number;
  /** GTFS-Realtime OccupancyStatus. */
  occ?: number;
  /**
   * Its fixes before this one in the same trip, [time s, lat, lng], oldest
   * first: kept by the server so a map can play it back from the first poll.
   */
  h?: [number, number, number][];
}

/** Feed metadata the map shows in a vehicle's popup. */
export interface TransitFeedInfo {
  id: string;
  provider: string;
  region: string;
  country: string;
  license?: string;
}

/** The layer's colour: a teal no other layer uses. */
export const TRANSIT_COLOR = '#5EEAD4';

/** Below this zoom the map shows where coverage is, not every vehicle. */
export const TRANSIT_VEHICLE_ZOOM = 5;
/** How often the map asks again while the layer is on; operators update every 10–30 s. */
export const TRANSIT_POLL_MS = 20_000;

/** Whether two boxes overlap. A box whose west is greater than its east crosses the antimeridian. */
export function bboxIntersects(a: BBox | number[], b: BBox | number[]): boolean {
  const spans = (x: BBox | number[]): [number, number][] =>
    x[0] <= x[2] ? [[x[0], x[2]]] : [[x[0], 180], [-180, x[2]]];
  if (a[1] > b[3] || b[1] > a[3]) return false;
  return spans(a).some(([aw, ae]) => spans(b).some(([bw, be]) => aw <= be && bw <= ae));
}

/** Whether a point lies in a box, the antimeridian included. */
export function inBBox(lng: number, lat: number, b: BBox | number[]): boolean {
  if (lat < b[1] || lat > b[3]) return false;
  return b[0] <= b[2] ? lng >= b[0] && lng <= b[2] : lng >= b[0] || lng <= b[2];
}

/**
 * The map's visible bounds as a box. MapLibre reports longitudes past ±180
 * once the world has been panned round; a view wider than the world is the
 * whole world.
 */
export function viewBBox(west: number, south: number, east: number, north: number): BBox {
  const s = Math.max(-90, south), n = Math.min(90, north);
  if (east - west >= 360) return [-180, s, 180, n];
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  return [wrap(west), s, wrap(east) === -180 && east > west ? 180 : wrap(east), n];
}

/** Parses `west,south,east,north`, or null when it is not four numbers in range. */
export function parseBBox(raw: string | null): BBox | null {
  if (!raw) return null;
  const p = raw.split(',').map(Number);
  if (p.length !== 4 || !p.every(Number.isFinite)) return null;
  const [w, s, e, n] = p;
  if (Math.abs(w) > 180 || Math.abs(e) > 180 || s < -90 || n > 90 || s > n) return null;
  return [w, s, e, n];
}

const OCCUPANCY = ['Empty', 'Many seats free', 'Few seats free', 'Standing room only', 'Crushed standing room only', 'Full', 'Not accepting passengers', 'No data', 'Not boarding'];

/** What a GTFS-Realtime occupancy code means to a rider, or undefined when unknown. */
export function occupancyLabel(code: number | undefined): string | undefined {
  return code === undefined || code === 7 ? undefined : OCCUPANCY[code];
}

/** "12 s ago", "3 min ago": how old a position is, from its own timestamp. */
export function positionAge(t: number | undefined, nowMs = Date.now()): string | undefined {
  if (!t) return undefined;
  const s = Math.max(0, Math.round(nowMs / 1000 - t));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

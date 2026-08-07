import { NextResponse } from 'next/server';
import { httpJson, optional } from '@/lib/httpJson';

export const maxDuration = 30;

/**
 * OSIRIS — Turn-by-turn Directions API
 *
 * Primary:  Valhalla (valhalla1.openstreetmap.de) — returns ready-made narrative
 *           instructions ("Turn right onto Torstraße.") and supports auto /
 *           bicycle / pedestrian costing.
 * Fallback: OSRM demo (router.project-osrm.org) — driving only, no instruction
 *           text, so maneuvers are rendered from type + modifier + street name
 *           the same way osrm-text-instructions does.
 *
 * Both are keyless public OSM services. Responses from either engine are
 * normalised to the same shape so the client never branches on provider.
 */

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de';
const VALHALLA = `${VALHALLA_BASE}/route`;
const OSRM = 'https://router.project-osrm.org/route/v1';

export type TravelMode = 'auto' | 'bicycle' | 'pedestrian';

/** Minimal shapes of the upstream payloads — only the fields OSIRIS reads. */
interface ValhallaManeuver {
  type?: number;
  instruction?: string;
  length?: number;
  time?: number;
  begin_shape_index?: number;
}
interface ValhallaLeg {
  shape?: string;
  maneuvers?: ValhallaManeuver[];
}
interface ValhallaTrip {
  legs?: ValhallaLeg[];
  summary?: {
    length?: number;
    time?: number;
    has_highway?: boolean;
    has_toll?: boolean;
    has_ferry?: boolean;
  };
}
export interface ValhallaResponse {
  trip?: ValhallaTrip;
  /** Populated when `alternates` is requested and the network offers a choice. */
  alternates?: Array<{ trip?: ValhallaTrip }>;
}

export interface OsrmStep {
  name?: string;
  distance?: number;
  duration?: number;
  maneuver?: { type?: string; modifier?: string; exit?: number; location?: [number, number] };
}
export interface OsrmResponse {
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: Array<{ steps?: OsrmStep[] }>;
  }>;
}

export interface DirectionStep {
  instruction: string;
  distance: number; // metres
  duration: number; // seconds
  location: [number, number]; // [lng, lat]
  type: string;
}

export interface ElevationPoint {
  /** Metres travelled from the start of the route. */
  distance: number;
  /** Metres above sea level. */
  height: number;
}

export interface DirectionsResult {
  provider: 'valhalla' | 'osrm';
  mode: TravelMode;
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  steps: DirectionStep[];
  /** True when the engine reports the route uses a motorway / toll road. */
  hasHighway?: boolean;
  hasToll?: boolean;
  hasFerry?: boolean;
  /** Terrain profile — only requested for walking and cycling. */
  elevation?: ElevationPoint[];
  ascent?: number;
  descent?: number;
}

/** What the operator asked the router to keep off the route. */
export interface AvoidOptions {
  tolls?: boolean;
  highways?: boolean;
  ferries?: boolean;
}

/**
 * Decode an encoded polyline. Valhalla uses precision 6, OSRM's polyline
 * default is 5 — the caller passes the right one.
 */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / factor, lat / factor]);
  }

  return coords;
}

/** Valhalla maneuver type -> a coarse icon key the UI can switch on. */
export function valhallaManeuverKind(type: number): string {
  if (type === 4 || type === 5 || type === 6) return 'arrive';
  if (type === 1 || type === 2 || type === 3) return 'depart';
  if (type === 15 || type === 16 || type === 17 || type === 18 || type === 19 || type === 20) return 'roundabout';
  if ([9, 10, 11].includes(type)) return 'right';
  if ([13, 14, 15].includes(type)) return 'left';
  if (type === 7 || type === 8) return 'straight';
  if (type === 25 || type === 26 || type === 27) return 'merge';
  return 'straight';
}

export function normalizeValhalla(json: ValhallaResponse, mode: TravelMode): DirectionsResult | null {
  return normalizeValhallaTrip(json?.trip, mode);
}

/** Primary route plus any alternates the engine offered, best first. */
export function normalizeValhallaAll(json: ValhallaResponse, mode: TravelMode): DirectionsResult[] {
  const out: DirectionsResult[] = [];
  const primary = normalizeValhallaTrip(json?.trip, mode);
  if (primary) out.push(primary);
  for (const alt of json?.alternates || []) {
    const r = normalizeValhallaTrip(alt?.trip, mode);
    if (r) out.push(r);
  }
  return out;
}

function normalizeValhallaTrip(trip: ValhallaTrip | undefined, mode: TravelMode): DirectionsResult | null {
  if (!trip || !Array.isArray(trip.legs) || trip.legs.length === 0) return null;

  const coordinates: [number, number][] = [];
  const steps: DirectionStep[] = [];

  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape || '', 6);
    // avoid duplicating the shared vertex between consecutive legs
    coordinates.push(...(coordinates.length ? shape.slice(1) : shape));

    for (const m of leg.maneuvers || []) {
      const at = shape[m.begin_shape_index ?? 0] || shape[0] || [0, 0];
      steps.push({
        instruction: m.instruction || '',
        distance: (m.length || 0) * 1000, // Valhalla reports km when units=kilometers
        duration: m.time || 0,
        location: at,
        type: valhallaManeuverKind(m.type ?? 0),
      });
    }
  }

  if (coordinates.length === 0) return null;

  return {
    provider: 'valhalla',
    mode,
    distance: (trip.summary?.length || 0) * 1000,
    duration: trip.summary?.time || 0,
    geometry: { type: 'LineString', coordinates },
    steps,
    hasHighway: trip.summary?.has_highway,
    hasToll: trip.summary?.has_toll,
    hasFerry: trip.summary?.has_ferry,
  };
}

/** Build human text for an OSRM maneuver — OSRM ships no instruction strings. */
export function osrmInstruction(step: OsrmStep): string {
  const type: string = step?.maneuver?.type || '';
  const modifier: string = step?.maneuver?.modifier || '';
  const road: string = (step?.name || '').trim();
  const onto = road ? ` onto ${road}` : '';

  switch (type) {
    case 'depart':
      return road ? `Head out on ${road}` : 'Depart';
    case 'arrive':
      return 'You have arrived at your destination';
    case 'roundabout':
    case 'rotary':
      return step?.maneuver?.exit
        ? `At the roundabout, take exit ${step.maneuver.exit}${onto}`
        : `Enter the roundabout${onto}`;
    case 'merge':
      return `Merge${modifier ? ` ${modifier}` : ''}${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'fork':
      return `Keep ${modifier || 'straight'}${onto}`;
    case 'end of road':
      return `Turn ${modifier || 'straight'}${onto}`;
    case 'continue':
      return modifier && modifier !== 'straight' ? `Keep ${modifier}${onto}` : `Continue${onto}`;
    case 'new name':
      return `Continue${onto}`;
    case 'turn':
    default:
      return modifier ? `Turn ${modifier}${onto}` : `Continue${onto}`;
  }
}

export function normalizeOsrm(json: OsrmResponse, mode: TravelMode): DirectionsResult | null {
  const route = json?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;

  const steps: DirectionStep[] = [];
  for (const leg of route.legs || []) {
    for (const s of leg.steps || []) {
      steps.push({
        instruction: osrmInstruction(s),
        distance: s.distance || 0,
        duration: s.duration || 0,
        location: (s.maneuver?.location as [number, number]) || [0, 0],
        type: s.maneuver?.modifier || s.maneuver?.type || 'straight',
      });
    }
  }

  return {
    provider: 'osrm',
    mode,
    distance: route.distance || 0,
    duration: route.duration || 0,
    geometry: { type: 'LineString', coordinates: route.geometry.coordinates },
    steps,
  };
}

function parsePoint(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [a, b] = raw.split(',').map((n) => parseFloat(n.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/**
 * Valhalla expresses avoidance as a 0..1 preference rather than a hard ban, so
 * 0 means "only if there is no other way" — which is the behaviour a user
 * expects from an "avoid tolls" switch.
 */
export function buildCostingOptions(mode: TravelMode, avoid: AvoidOptions): Record<string, unknown> {
  const o: Record<string, number> = {};
  if (avoid.tolls) o.use_tolls = 0;
  if (avoid.highways) o.use_highways = 0;
  if (avoid.ferries) o.use_ferry = 0;
  return Object.keys(o).length ? { [mode]: o } : {};
}

async function tryValhalla(
  points: Array<{ lat: number; lng: number }>,
  mode: TravelMode,
  avoid: AvoidOptions,
): Promise<DirectionsResult[]> {
  const costingOptions = buildCostingOptions(mode, avoid);
  const body = {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing: mode,
    ...(Object.keys(costingOptions).length ? { costing_options: costingOptions } : {}),
    // Give the operator a choice the way a consumer mapping app does; the
    // engine only returns these when the network genuinely offers one.
    alternates: 2,
    directions_options: { units: 'kilometers' },
  };
  const url = `${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`;
  return normalizeValhallaAll(await httpJson<ValhallaResponse>(url), mode);
}

async function tryOsrm(
  points: Array<{ lat: number; lng: number }>,
  mode: TravelMode,
): Promise<DirectionsResult[]> {
  // The public OSRM demo only carries the driving profile.
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM}/driving/${coords}?steps=true&overview=full&geometries=geojson`;
  const r = normalizeOsrm(await httpJson<OsrmResponse>(url), mode);
  return r ? [r] : [];
}

/**
 * Terrain profile for a route, sampled along its shape.
 *
 * Only worth asking for on foot or by bike, where the climb is the thing that
 * decides whether a route is actually viable — and it costs an extra upstream
 * call, so driving skips it.
 */
async function fetchElevation(
  coords: [number, number][],
): Promise<{ elevation: ElevationPoint[]; ascent: number; descent: number } | null> {
  // Valhalla caps the shape it will accept; ~120 samples describes the terrain
  // without a huge request.
  const MAX = 120;
  const stride = Math.max(1, Math.ceil(coords.length / MAX));
  const shape = coords.filter((_, i) => i % stride === 0).map(([lon, lat]) => ({ lat, lon }));
  if (shape.length < 2) return null;

  const url = `${VALHALLA_BASE}/height?json=${encodeURIComponent(JSON.stringify({ range: true, shape }))}`;
  const json = await httpJson<{ range_height?: [number, number][] }>(url, { timeoutMs: 10000 });
  const pairs = json?.range_height;
  if (!Array.isArray(pairs) || pairs.length < 2) return null;

  const elevation: ElevationPoint[] = [];
  let ascent = 0;
  let descent = 0;
  let prev: number | null = null;
  for (const [distance, height] of pairs) {
    if (!Number.isFinite(distance) || !Number.isFinite(height)) continue;
    elevation.push({ distance, height });
    if (prev !== null) {
      const d = height - prev;
      // Ignore sub-metre wobble so SRTM noise doesn't inflate the totals.
      if (d > 1) ascent += d;
      else if (d < -1) descent += -d;
    }
    prev = height;
  }
  if (elevation.length < 2) return null;
  return { elevation, ascent: Math.round(ascent), descent: Math.round(descent) };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = parsePoint(searchParams.get('from'));
    const to = parsePoint(searchParams.get('to'));
    const requested = (searchParams.get('mode') || 'auto') as TravelMode;
    const mode: TravelMode = ['auto', 'bicycle', 'pedestrian'].includes(requested) ? requested : 'auto';

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from and to are required as "lat,lng"' },
        { status: 400 },
      );
    }

    // Intermediate stops, in order: ?via=lat,lng|lat,lng
    const via = (searchParams.get('via') || '')
      .split('|')
      .map((s) => parsePoint(s))
      .filter((p): p is { lat: number; lng: number } => p !== null);

    const avoidParam = (searchParams.get('avoid') || '').split(',').map((s) => s.trim());
    const avoid: AvoidOptions = {
      tolls: avoidParam.includes('tolls'),
      highways: avoidParam.includes('highways'),
      ferries: avoidParam.includes('ferries'),
    };

    const points = [from, ...via, to];

    // The public Valhalla demo intermittently refuses bursts, so give it one
    // retry before falling back — otherwise walking/cycling (which OSRM's demo
    // cannot serve) would fail on an entirely recoverable blip.
    let routes: DirectionsResult[] = [];
    for (let attempt = 0; attempt < 2 && routes.length === 0; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
      try {
        routes = await tryValhalla(points, mode, avoid);
      } catch {
        routes = [];
      }
    }

    // OSRM has no walking/cycling profile on the demo server, so only fall back
    // for driving — a car route served for a walking request would be wrong.
    if (routes.length === 0 && mode === 'auto') {
      try {
        routes = await tryOsrm(points, mode);
      } catch {
        routes = [];
      }
    }

    if (routes.length === 0) {
      return NextResponse.json(
        { error: 'No route found between those points' },
        { status: 502 },
      );
    }

    // Terrain matters on foot and by bike; skip the extra call when driving.
    if (mode !== 'auto') {
      const profile = await optional(fetchElevation(routes[0].geometry.coordinates));
      if (profile) Object.assign(routes[0], profile);
    }

    // `routes` is the full set, best first; the top-level fields mirror routes[0]
    // so anything reading a single route still works.
    return NextResponse.json({ ...routes[0], routes }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] Directions error:', error);
    return NextResponse.json({ error: 'Routing failed' }, { status: 500 });
  }
}

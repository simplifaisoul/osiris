/**
 * OSIRIS OI Assist: what the assistant can see and switch on.
 *
 * The page keeps its live data in one bag (flights, ships, quakes, news and
 * the rest, each under its own key). This module names the parts the
 * assistant may search, turns each into one plain shape (a title, a detail
 * line, a place, a time and a figure), and finds, filters and ranks them. It
 * also lists the map layers the assistant may switch, with words a model can
 * choose by, and the panels it may open. Pure and client-safe.
 */

/** Something on the map, in one shape whatever feed it came from. */
export interface Entity {
  id: string;
  layer: FindLayer;
  title: string;
  detail: string;
  lat: number | null;
  lng: number | null;
  /** ms since the epoch, where the feed dates it. */
  time: number | null;
  /** The feed's headline figure: a magnitude, an altitude, fire power. */
  value: number | null;
  url?: string;
}

export type FindLayer =
  | 'flights' | 'military_flights' | 'ships' | 'ports' | 'chokepoints' | 'earthquakes' | 'news'
  | 'incidents' | 'weather' | 'fires' | 'cameras' | 'satellites';

interface Source {
  /** What a model reads to choose it. */
  about: string;
  /** Map layers that show it (and make the page fetch it). */
  layers: string[];
  /** Where it sits in the page's data. */
  keys: string[];
  /** What `value` means, for `min` and sorting by largest. */
  value?: string;
  normalize: (row: Row, i: number) => Entity | null;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const time = (v: unknown): number | null => {
  const n = num(v);
  if (n !== null) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : null;
};
const coords = (lat: unknown, lng: unknown): { lat: number | null; lng: number | null } => {
  const a = num(lat), b = num(lng);
  return a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lng: b } : { lat: null, lng: null };
};
const join = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(' · ');
/** A feed's link, if it is a web address: nothing else becomes a link in a card. */
const link = (v: unknown): string | undefined => (/^https?:\/\/[^\s]+$/i.test(str(v)) ? str(v) : undefined);

function flight(layer: FindLayer) {
  return (r: Row, i: number): Entity | null => {
    const at = coords(r.lat, r.lng);
    const alt = num(r.alt);
    return {
      id: str(r.icao24) || `${layer}-${i}`, layer, ...at,
      title: str(r.callsign) || str(r.registration) || str(r.icao24) || 'Unidentified aircraft',
      detail: join(str(r.category), str(r.model) !== 'Unknown' ? r.model : '', alt !== null ? `${Math.round(alt).toLocaleString()} m` : '', num(r.speed_knots) !== null ? `${Math.round(num(r.speed_knots)!)} kn` : '', str(r.registration) !== 'N/A' ? r.registration : ''),
      time: null, value: alt,
    };
  };
}

export const SOURCES: Record<FindLayer, Source> = {
  flights: {
    about: 'Civil aircraft in the air now (airliners, private planes, business jets), from ADS-B. value = altitude in metres.',
    layers: ['flights', 'private', 'jets'], keys: ['commercial_flights', 'private_flights', 'private_jets'], value: 'altitude (m)',
    normalize: flight('flights'),
  },
  military_flights: {
    about: 'Military aircraft broadcasting ADS-B. value = altitude in metres.',
    layers: ['military'], keys: ['military_flights'], value: 'altitude (m)',
    normalize: flight('military_flights'),
  },
  ships: {
    about: 'Ships reporting AIS positions (may be empty when the AIS feed is quiet).',
    layers: ['maritime'], keys: ['maritime_ships'],
    normalize: (r, i) => ({ id: str(r.mmsi) || `ship-${i}`, layer: 'ships', ...coords(r.lat, r.lng), title: str(r.name) || `MMSI ${str(r.mmsi)}`, detail: join(r.type, r.destination ? `to ${str(r.destination)}` : '', num(r.speed) !== null ? `${num(r.speed)} kn` : ''), time: null, value: num(r.speed) }),
  },
  ports: {
    about: 'Major container and energy ports with congestion. ',
    layers: ['maritime'], keys: ['maritime_ports'],
    normalize: (r, i) => ({ id: `port-${str(r.name) || i}`, layer: 'ports', ...coords(r.lat, r.lng), title: str(r.name), detail: join(r.country, r.type, r.congestion ? `congestion ${str(r.congestion).toLowerCase()}` : '', r.volume), time: null, value: num(r.rank) }),
  },
  chokepoints: {
    about: 'Maritime chokepoints (Hormuz, Suez, Malacca…) with traffic and risk.',
    layers: ['maritime'], keys: ['maritime_chokepoints'],
    normalize: (r, i) => ({ id: `choke-${str(r.name) || i}`, layer: 'chokepoints', ...coords(r.lat, r.lng), title: str(r.name), detail: join(r.traffic, r.risk ? `risk ${str(r.risk).toLowerCase()}` : ''), time: null, value: null }),
  },
  earthquakes: {
    about: 'Earthquakes of magnitude 2.5+ in the last day, from USGS. value = magnitude.',
    layers: ['earthquakes'], keys: ['earthquakes'], value: 'magnitude',
    normalize: (r, i) => {
      const m = num(r.magnitude);
      return { id: str(r.id) || `eq-${i}`, layer: 'earthquakes', ...coords(r.lat, r.lng), title: `M${m?.toFixed(1) ?? '?'} ${str(r.place)}`.trim(), detail: join(num(r.depth) !== null ? `${Math.round(num(r.depth)!)} km deep` : '', num(r.tsunami) ? 'tsunami flag' : '', r.alert ? `PAGER ${str(r.alert)}` : ''), time: time(r.time), value: m, url: link(r.url) };
    },
  },
  news: {
    about: 'Live news and OSINT reports (Telegram channels, wires). Some are placed on the map where they name a place. value = keyword risk score.',
    layers: [], keys: ['news'], value: 'risk score',
    normalize: (r, i) => {
      const place = (r.place && typeof r.place === 'object' ? r.place : {}) as Row;
      return { id: str(r.id) || `news-${i}`, layer: 'news', ...coords(place.lat, place.lng), title: str(r.title), detail: join(r.source_name || r.source, place.name || place.label), time: time(r.published), value: num(r.risk_score), url: link(r.link) };
    },
  },
  incidents: {
    about: 'Global disaster and crisis alerts (GDACS: floods, cyclones, droughts, volcanoes).',
    layers: ['global_incidents'], keys: ['gdelt'],
    normalize: (r, i) => ({ id: str(r.id) || `inc-${i}`, layer: 'incidents', ...coords(r.lat, r.lng), title: str(r.name), detail: join(r.type), time: null, value: null, url: link(r.url) }),
  },
  weather: {
    about: 'Official weather and hazard events (NOAA/NWS warnings, NASA EONET storms, wildfires, volcanoes).',
    layers: ['weather'], keys: ['weather_events'],
    normalize: (r, i) => ({ id: str(r.id) || `wx-${i}`, layer: 'weather', ...coords(r.lat, r.lng), title: str(r.title), detail: join(r.type, r.severity ? `${str(r.severity)} severity` : '', r.provider), time: time(r.date), value: null }),
  },
  fires: {
    about: 'Active fire detections from NASA FIRMS satellites. value = fire radiative power (MW).',
    layers: ['fires'], keys: ['fires'], value: 'fire power (MW)',
    normalize: (r, i) => ({ id: `fire-${i}`, layer: 'fires', ...coords(r.lat, r.lng), title: `Fire, ${num(r.frp) ?? '?'} MW`, detail: join(r.confidence ? `${str(r.confidence)} confidence` : '', r.date), time: time(r.date), value: num(r.frp) }),
  },
  cameras: {
    about: 'Live public traffic and city cameras.',
    layers: ['cctv'], keys: ['cameras'],
    normalize: (r, i) => ({ id: str(r.id) || `cam-${i}`, layer: 'cameras', ...coords(r.lat, r.lng), title: str(r.name) || 'Camera', detail: join(r.city, r.country, r.source), time: null, value: null }),
  },
  satellites: {
    about: 'Satellites in orbit now, by mission. value = altitude in km.',
    layers: ['satellites'], keys: ['satellites'], value: 'altitude (km)',
    normalize: (r, i) => ({ id: str(r.noradId) || `sat-${i}`, layer: 'satellites', ...coords(r.lat, r.lng), title: str(r.name), detail: join(r.category, r.mission), time: null, value: num(r.alt) }),
  },
};

export const FIND_LAYERS = Object.keys(SOURCES) as FindLayer[];

/** Every entity of a layer the page has loaded. */
export function entitiesOf(data: Record<string, unknown>, layer: FindLayer): Entity[] {
  const src = SOURCES[layer];
  const out: Entity[] = [];
  for (const key of src.keys) {
    const rows = data[key];
    if (!Array.isArray(rows)) continue;
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const e = src.normalize(r as Row, out.length + i);
      if (e && e.title) out.push(e);
    });
  }
  return out;
}

/** Whether the page has loaded a layer's data at all. */
export function loaded(data: Record<string, unknown>, layer: FindLayer): boolean {
  return SOURCES[layer].keys.some(k => Array.isArray(data[k]));
}

/* ───────────── Geometry ───────────── */

export interface Point { lat: number; lng: number }

/** Great-circle distance in km. */
export function km(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A camera that shows every point: their middle, and a zoom wide enough for the spread. */
export function frame(points: Point[], fallbackZoom = 9): { lat: number; lng: number; zoom: number } | null {
  const ps = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!ps.length) return null;
  if (ps.length === 1) return { lat: ps[0].lat, lng: ps[0].lng, zoom: fallbackZoom };
  const lats = ps.map(p => p.lat), lngs = ps.map(p => p.lng);
  let west = Math.min(...lngs), east = Math.max(...lngs);
  // Points either side of the antimeridian sit closer across it.
  const shifted = lngs.map(l => (l < 0 ? l + 360 : l));
  if (Math.max(...shifted) - Math.min(...shifted) < east - west) { west = Math.min(...shifted); east = Math.max(...shifted); }
  const south = Math.min(...lats), north = Math.max(...lats);
  const span = Math.max(east - west, (north - south) * 1.6, 0.02);
  const zoom = Math.max(1.6, Math.min(12, Math.log2(360 / span) - 0.2));
  let lng = (west + east) / 2;
  if (lng > 180) lng -= 360;
  return { lat: (south + north) / 2, lng, zoom: Math.round(zoom * 10) / 10 };
}

/* ───────────── Finding ───────────── */

export interface FindQuery {
  layer: FindLayer;
  /** Words that must appear in the title or detail. */
  text?: string;
  /** Around a point, within a radius. */
  near?: Point | null;
  radiusKm?: number;
  /** At least this `value` (a magnitude, an altitude, fire power). */
  min?: number;
  /** Only things dated within the last so many hours. */
  withinHours?: number;
  sort?: 'nearest' | 'newest' | 'largest';
  limit?: number;
}

export interface Found {
  layer: FindLayer;
  /** How many the layer holds, and how many matched. */
  total: number;
  matched: number;
  items: (Entity & { km?: number })[];
}

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function find(data: Record<string, unknown>, q: FindQuery, now = Date.now()): Found {
  const all = entitiesOf(data, q.layer);
  const words = q.text ? fold(q.text).split(/\s+/).filter(w => w.length > 1) : [];
  const radius = q.radiusKm ?? (q.near ? 500 : Infinity);
  let hits: (Entity & { km?: number })[] = [];
  for (const e of all) {
    if (words.length) {
      const hay = fold(`${e.title} ${e.detail}`);
      if (!words.every(w => hay.includes(w))) continue;
    }
    if (q.min !== undefined && (e.value === null || e.value < q.min)) continue;
    if (q.withinHours !== undefined && (e.time === null || now - e.time > q.withinHours * 3_600_000)) continue;
    if (q.near) {
      if (e.lat === null || e.lng === null) continue;
      const d = km(q.near, { lat: e.lat, lng: e.lng });
      if (d > radius) continue;
      hits.push({ ...e, km: Math.round(d) });
    } else hits.push(e);
  }
  const sort = q.sort ?? (q.near ? 'nearest' : SOURCES[q.layer].value ? 'largest' : 'newest');
  if (sort === 'nearest') hits.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  else if (sort === 'newest') hits.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity));
  else hits.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const matched = hits.length;
  hits = hits.slice(0, Math.max(1, Math.min(25, q.limit ?? 10)));
  return { layer: q.layer, total: all.length, matched, items: hits };
}

/* ───────────── What is in view ───────────── */

export interface Bounds { west: number; south: number; east: number; north: number }

/** Whether a point is in the view, including a view that crosses the antimeridian or wraps the world. */
export function inBounds(p: Point, b: Bounds): boolean {
  if (p.lat < b.south || p.lat > b.north) return false;
  if (b.east - b.west >= 360) return true;
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  const w = wrap(b.west), e = wrap(b.east), x = wrap(p.lng);
  return w <= e ? x >= w && x <= e : x >= w || x <= e;
}

export interface ScanRow { layer: FindLayer; count: number; top: Entity[] }

/** How much of each live layer is in view, the biggest (or newest) few of each, busiest layer first. */
export function scan(data: Record<string, unknown>, bounds: Bounds, layers: FindLayer[] = FIND_LAYERS): ScanRow[] {
  const rows: ScanRow[] = [];
  for (const layer of layers) {
    if (!loaded(data, layer)) continue;
    const inView = entitiesOf(data, layer).filter(e => e.lat !== null && e.lng !== null && inBounds({ lat: e.lat, lng: e.lng }, bounds));
    if (!inView.length) continue;
    const byValue = SOURCES[layer].value !== undefined;
    inView.sort((a, b) => (byValue ? (b.value ?? -Infinity) - (a.value ?? -Infinity) : (b.time ?? -Infinity) - (a.time ?? -Infinity)));
    rows.push({ layer, count: inView.length, top: inView.slice(0, 3) });
  }
  return rows.sort((a, b) => b.count - a.count);
}

/* ───────────── Layers and panels the assistant may switch ───────────── */

/** Map layers by the page's own keys, with words a model can choose by. */
export const LAYERS: Record<string, string> = {
  flights: 'commercial airliners',
  private: 'private planes',
  jets: 'business jets',
  military: 'military aircraft',
  maritime: 'ships, ports and chokepoints',
  transit: 'live buses, trams and trains from city transit operators (vehicles show from zoom 5; fly to a city)',
  satellites: 'satellites in orbit',
  cctv: 'live public cameras',
  live_news: 'live news broadcasts placed on the map',
  earthquakes: 'earthquakes',
  fires: 'active fires (NASA FIRMS)',
  weather: 'weather warnings and storms',
  radiation: 'radiation monitoring stations',
  infrastructure: 'critical infrastructure (power plants, nuclear sites)',
  global_incidents: 'disaster alerts (GDACS)',
  alert_pins: 'news reports pinned to the places they name',
  war_alerts: 'war and air-raid alerts',
  day_night: 'day and night shading',
  cables: 'undersea internet cables',
  live_clouds: 'live satellite cloud cover',
  terrain_3d: '3D terrain',
  cyber_attacks: 'cyber attack indicators',
  gdelt_events: 'GDELT news events',
  cf_outages: 'internet outages (Cloudflare Radar)',
  malware: 'malware command-and-control servers',
  balloons: 'high-altitude balloons',
};

/** Panels the assistant may open. */
export const PANELS: Record<string, string> = {
  markets: 'markets terminal: indices, commodities, crypto, FX',
  alerts: 'live alerts feed with the AI overview',
  intel: 'OSINT recon tools (IP, domain, username lookups)',
  layers: 'the layer panel',
  directions: 'driving directions',
  forecast: 'the OI forecast panel (the prediction engine)',
  workspace: 'the full-screen OI workspace for the current forecast',
};

/**
 * OSIRIS OI Assist: carrying out what the model asks.
 *
 * The model's actions run in the page, against a small bridge the page
 * provides (Site): fly the camera, switch layers, mark places, open panels,
 * read the live data it holds. Each action is checked here before it touches
 * the map: unknown layers and panels are refused, coordinates are bounded,
 * places are looked up. Each comes back as a one-line result for the model
 * and, where there is something to see, a card for the reader.
 */
import type { Call, CallResult } from './protocol';
import { FIND_LAYERS, LAYERS, PANELS, SOURCES, find, frame, loaded, scan, type Bounds, type Entity, type FindLayer, type Point } from './catalog';
import { countWords, describeFrame, describeWatch, forModel, type FrameAnalysis, type WatchSummary } from '../../vision/analysis';
import { sourceOf, type VisionCamera } from '../../vision/source';
import { haversine } from '../../geo';

export interface HighlightPoint { lat: number; lng: number; label: string }
export interface Highlight {
  points: HighlightPoint[];
  area: { lat: number; lng: number; radiusKm: number; label: string } | null;
}

export interface Place { name: string; lat: number; lng: number; kind?: string }

export type Depth = 'quick' | 'standard' | 'deep';

/** What the page lets the assistant do. */
export interface Site {
  data(): Record<string, unknown>;
  view(): { lat: number; lng: number; zoom: number; projection: 'globe' | 'mercator'; style: string; bounds?: Bounds };
  layers(): Record<string, boolean>;
  flyTo(lat: number, lng: number, zoom?: number): void;
  setLayers(on: string[], off: string[]): void;
  highlight(h: Highlight | null): void;
  openPanel(panel: string): void;
  setView(v: { projection?: 'globe' | 'mercator'; style?: 'dark' | 'satellite' }): void;
  geocode(query: string): Promise<Place | null>;
  forecast(question: string, depth: Depth): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  /** Open or close the full-screen workspace, and set what its stage shows. */
  workspace?(o: { open?: boolean; view?: WorkspaceView }): { ok: true; summary: string } | { ok: false; error: string };
  /** Open an object of the current forecast by name. */
  select?(name: string): { ok: true; summary: string } | { ok: false; error: string };
  /** Open a camera for the reader and look through it with the built-in analysis: one frame, or `watch` seconds of them. */
  camera?(camera: CameraRecord, watch: number): Promise<{ analysis: FrameAnalysis; watch?: WatchSummary }>;
}

/** A camera as the page holds it. */
export interface CameraRecord extends VisionCamera {
  lat: number;
  lng: number;
  name?: string;
  city?: string;
  country?: string;
  source?: string;
}

export type WorkspaceView = 'globe' | 'graph' | 'timeline' | 'table';

/** Something for the reader to look at in the conversation. */
export interface Card {
  kind: 'find' | 'show' | 'markets' | 'forecast' | 'place' | 'scan' | 'camera';
  title: string;
  subtitle?: string;
  items: { label: string; detail?: string; lat?: number; lng?: number; url?: string; value?: string; tone?: 'up' | 'down' }[];
  /** A forecast card follows the run it started. */
  runId?: string;
}

export interface Outcome { result: CallResult; card?: Card }

const ok = (tool: Call['tool'], summary: string, data?: unknown, card?: Card): Outcome => ({ result: { tool, ok: true, summary, ...(data !== undefined ? { data } : {}) }, card });
const fail = (tool: Call['tool'], summary: string): Outcome => ({ result: { tool, ok: false, summary } });

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const numIn = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const point = (v: unknown): Point | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const lat = numIn(r.lat, -90, 90), lng = numIn(r.lng ?? r.lon, -180, 180);
  return lat !== null && lng !== null ? { lat, lng } : null;
};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => str(x, 60).toLowerCase()).filter(Boolean);

/** How close to come for a kind of place the geocoder found. */
export function zoomFor(kind = ''): number {
  const k = kind.toLowerCase();
  if (/country/.test(k)) return 4;
  if (/state|region|province|continent|sea|ocean/.test(k)) return 5.5;
  if (/strait|bay|gulf|island|archipelago|county|district/.test(k)) return 7;
  if (/city|town|capital|municipality/.test(k)) return 9.5;
  if (/village|suburb|neighbourhood|quarter/.test(k)) return 12;
  if (/street|road|building|house|airport|aerodrome|station|stadium|tower|monument|attraction|port/.test(k)) return 14;
  return 9;
}

/** Layer names a model is likely to use, mapped to the catalogue's. */
const LAYER_ALIASES: Record<string, FindLayer> = {
  flight: 'flights', planes: 'flights', aircraft: 'flights', airliners: 'flights', jets: 'flights', private: 'flights',
  military: 'military_flights', military_aircraft: 'military_flights', mil: 'military_flights',
  ship: 'ships', vessels: 'ships', boats: 'ships', maritime: 'ships', port: 'ports', chokepoint: 'chokepoints',
  quake: 'earthquakes', quakes: 'earthquakes', earthquake: 'earthquakes', seismic: 'earthquakes',
  headlines: 'news', reports: 'news', osint: 'news', alerts: 'news',
  incident: 'incidents', disasters: 'incidents', gdacs: 'incidents', storms: 'weather', hazards: 'weather', warnings: 'weather',
  fire: 'fires', wildfires: 'fires', camera: 'cameras', cctv: 'cameras', webcams: 'cameras', satellite: 'satellites', sats: 'satellites',
};

export function findLayer(v: unknown): FindLayer | null {
  const s = str(v, 40).toLowerCase().replace(/[\s-]+/g, '_');
  if ((FIND_LAYERS as string[]).includes(s)) return s as FindLayer;
  return LAYER_ALIASES[s] ?? null;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });
}

/** Waits for the page to load a layer it has just switched on, up to `ms`. */
async function waitForData(site: Site, layer: FindLayer, signal?: AbortSignal, ms = 12_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (!loaded(site.data(), layer)) {
    if (Date.now() > until) return false;
    await sleep(250, signal);
  }
  return true;
}

/** A place from a name or coordinates. */
async function placeOf(site: Site, v: unknown): Promise<Place | null> {
  const p = point(v);
  if (p) return { name: `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`, ...p };
  const name = typeof v === 'string' ? str(v, 120) : v && typeof v === 'object' ? str((v as Record<string, unknown>).place, 120) : '';
  return name ? site.geocode(name) : null;
}

const row = (e: Entity & { km?: number }) => ({
  name: e.title,
  ...(e.detail ? { detail: e.detail } : {}),
  ...(e.lat !== null && e.lng !== null ? { lat: Math.round(e.lat * 1000) / 1000, lng: Math.round(e.lng * 1000) / 1000 } : {}),
  ...(e.km !== undefined ? { km: e.km } : {}),
  ...(e.time ? { when: new Date(e.time).toISOString().slice(0, 16).replace('T', ' ') } : {}),
});

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 3 : 2 }));

/** The cameras the page holds, as records the camera tool can open. */
export function camerasIn(data: Record<string, unknown>): CameraRecord[] {
  const raw = Array.isArray(data.cameras) ? data.cameras : [];
  const out: CameraRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const c = r as Record<string, unknown>;
    const id = typeof c.id === 'number' ? String(c.id) : typeof c.id === 'string' ? c.id : '';
    const lat = Number(c.lat), lng = Number(c.lng);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ ...(c as object), id, lat, lng } as CameraRecord);
  }
  return out;
}

/** Flattens the page's markets bag into quotes. */
export function quotesOf(markets: unknown): { name: string; symbol: string; group: string; price: number; change: number | null; currency: string }[] {
  if (!markets || typeof markets !== 'object') return [];
  const out: ReturnType<typeof quotesOf> = [];
  for (const [group, quotes] of Object.entries(markets as Record<string, unknown>)) {
    if (!quotes || typeof quotes !== 'object' || Array.isArray(quotes)) continue;
    for (const q of Object.values(quotes as Record<string, unknown>)) {
      if (!q || typeof q !== 'object') continue;
      const r = q as Record<string, unknown>;
      const price = typeof r.price === 'number' ? r.price : NaN;
      if (!Number.isFinite(price) || typeof r.name !== 'string') continue;
      out.push({ name: r.name, symbol: str(r.symbol, 20), group, price, change: typeof r.change_percent === 'number' ? r.change_percent : null, currency: str(r.currency, 8) });
    }
  }
  return out;
}

export async function runCall(call: Call, site: Site, signal?: AbortSignal): Promise<Outcome> {
  const a = call.args;
  switch (call.tool) {
    case 'go_to': {
      const coords = point(a);
      const place = coords ? { name: str(a.place) || `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`, ...coords } : await placeOf(site, a.place);
      if (!place) return fail('go_to', `Could not find "${str(a.place)}" on the map`);
      const zoom = numIn(a.zoom, 1, 18) ?? zoomFor(place.kind);
      site.flyTo(place.lat, place.lng, zoom);
      return ok('go_to', `Flew to ${place.name} (${place.lat.toFixed(2)}, ${place.lng.toFixed(2)}), zoom ${zoom}`, undefined,
        { kind: 'place', title: place.name, items: [{ label: place.name, detail: `${place.lat.toFixed(3)}, ${place.lng.toFixed(3)}`, lat: place.lat, lng: place.lng }] });
    }

    case 'layers': {
      const known = site.layers();
      const on = strings(a.on).filter(k => k in LAYERS && k in known);
      const off = strings(a.off).filter(k => k in LAYERS && k in known);
      const unknown = [...strings(a.on), ...strings(a.off)].filter(k => !(k in LAYERS) || !(k in known));
      if (!on.length && !off.length) return fail('layers', unknown.length ? `No such layers: ${unknown.join(', ')}` : 'No layers named');
      site.setLayers(on, off);
      return ok('layers', [on.length ? `on: ${on.join(', ')}` : '', off.length ? `off: ${off.join(', ')}` : '', unknown.length ? `unknown: ${unknown.join(', ')}` : ''].filter(Boolean).join(' · '));
    }

    case 'find': {
      const layer = findLayer(a.layer);
      if (!layer) return fail('find', `Unknown layer "${str(a.layer)}". Use one of: ${FIND_LAYERS.join(', ')}`);
      const src = SOURCES[layer];
      const off = src.layers.filter(k => !site.layers()[k]);
      if (off.length) site.setLayers(off, []);
      if (!(await waitForData(site, layer, signal))) return fail('find', `The ${layer} feed has not loaded yet; try again in a moment`);
      let near: Place | null = null;
      if (a.near !== undefined && a.near !== null && a.near !== '') {
        near = await placeOf(site, a.near);
        if (!near) return fail('find', `Could not find "${str(a.near)}" on the map`);
      }
      const radiusKm = numIn(a.radius_km, 1, 20_000) ?? undefined;
      const found = find(site.data(), {
        layer,
        text: str(a.text, 120) || undefined,
        near,
        radiusKm,
        min: numIn(a.min, -1e9, 1e9) ?? undefined,
        withinHours: numIn(a.within_hours, 0.1, 24 * 60) ?? undefined,
        sort: a.sort === 'nearest' || a.sort === 'newest' || a.sort === 'largest' ? a.sort : undefined,
        limit: numIn(a.limit, 1, 25) ?? undefined,
      });
      const placed = found.items.filter(e => e.lat !== null && e.lng !== null) as (Entity & { lat: number; lng: number; km?: number })[];
      if (a.show !== false && placed.length) {
        site.highlight({
          points: placed.map(e => ({ lat: e.lat, lng: e.lng, label: e.title.length > 34 ? `${e.title.slice(0, 33)}…` : e.title })),
          area: near ? { lat: near.lat, lng: near.lng, radiusKm: radiusKm ?? 500, label: near.name } : null,
        });
        const view = near
          ? { lat: near.lat, lng: near.lng, zoom: Math.max(2, Math.min(11, Math.log2(40_000 / Math.max(5, (radiusKm ?? 500) * 2.4)))) }
          : frame(placed);
        if (view) site.flyTo(view.lat, view.lng, Math.round(view.zoom * 10) / 10);
      }
      const where = near ? ` within ${Math.round(radiusKm ?? 500)} km of ${near.name}` : '';
      const summary = `${found.matched} of ${found.total.toLocaleString('en-US')} ${layer.replace('_', ' ')}${where} matched${found.matched > found.items.length ? `, showing the top ${found.items.length}` : ''}`;
      return ok('find', summary, { layer, value: src.value, items: found.items.map(row) }, {
        kind: 'find',
        title: `${found.matched.toLocaleString('en-US')} ${layer.replace('_', ' ')}${where}`,
        subtitle: src.value && found.items.length ? `by ${src.value}` : undefined,
        items: found.items.map(e => ({
          label: e.title, detail: [e.detail, e.km !== undefined ? `${e.km} km` : ''].filter(Boolean).join(' · ') || undefined,
          ...(e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : {}), url: e.url,
        })),
      });
    }

    case 'scan': {
      const bounds = site.view().bounds;
      if (!bounds) return fail('scan', 'The map has not said what is in view yet');
      const wanted = (Array.isArray(a.layers) ? a.layers : []).map(findLayer).filter((l): l is FindLayer => l !== null);
      const rows = scan(site.data(), bounds, wanted.length ? wanted : undefined);
      if (!rows.length) return ok('scan', 'Nothing live from the loaded layers is in view', []);
      const label = (l: FindLayer) => l.replace('_', ' ');
      return ok('scan', rows.map(r => `${r.count.toLocaleString('en-US')} ${label(r.layer)}`).join(', '),
        rows.map(r => ({ layer: r.layer, count: r.count, top: r.top.map(row) })),
        {
          kind: 'scan', title: 'In view now',
          items: rows.map(r => ({
            label: `${r.count.toLocaleString('en-US')} ${label(r.layer)}`,
            detail: r.top.map(e => e.title).join(' · '),
            ...(r.top[0]?.lat !== null && r.top[0]?.lng !== null ? { lat: r.top[0].lat!, lng: r.top[0].lng! } : {}),
          })),
        });
    }

    case 'camera': {
      if (!site.camera) return fail('camera', 'Cameras cannot be looked through here');
      const off = SOURCES.cameras.layers.filter(k => !site.layers()[k]);
      if (off.length) site.setLayers(off, []);
      if (!(await waitForData(site, 'cameras', signal))) return fail('camera', 'The cameras have not loaded yet; try again in a moment');
      const all = camerasIn(site.data());
      const id = str(a.id, 200);
      let cam: CameraRecord | undefined;
      let km: number | undefined;
      if (id) {
        cam = all.find(c => c.id === id);
        if (!cam) return fail('camera', `No camera with id "${id}". Use find with layer cameras for ids`);
      } else if (a.near !== undefined && a.near !== null && a.near !== '') {
        const place = await placeOf(site, a.near);
        if (!place) return fail('camera', `Could not find "${str(a.near)}" on the map`);
        const radius = numIn(a.radius_km, 1, 300) ?? 30;
        const near = all
          .filter(c => sourceOf(c))
          .map(c => ({ c, km: haversine([place.lng, place.lat], [c.lng, c.lat]) }))
          .filter(x => x.km <= radius)
          .sort((x, y) => x.km - y.km)[0];
        if (!near) return fail('camera', `No camera that can be analysed within ${radius} km of ${place.name}`);
        cam = near.c;
        km = Math.round(near.km * 10) / 10;
      } else {
        return fail('camera', 'Give a camera id (from find) or near: a place');
      }
      if (!sourceOf(cam)) return fail('camera', `${cam.name ?? 'That camera'} is a web player, so its picture cannot be read. Try another camera nearby`);
      const watch = numIn(a.watch_seconds, 0, 60) ?? 0;
      site.flyTo(cam.lat, cam.lng, 14);
      let looked: { analysis: FrameAnalysis; watch?: WatchSummary };
      try {
        looked = await site.camera(cam, watch);
      } catch (err) {
        return fail('camera', `${cam.name ?? 'The camera'}: ${err instanceof Error ? err.message : 'could not be analysed'}`);
      }
      const name = cam.name || 'Camera';
      const where = [cam.city, cam.country].filter(Boolean).join(', ');
      const seen = describeFrame(looked.analysis);
      return ok('camera', `${name}: ${seen}${looked.watch ? `; ${describeWatch(looked.watch)}` : ''}`, {
        camera: { id: cam.id, name, ...(where ? { where } : {}), ...(cam.source ? { source: cam.source } : {}), lat: cam.lat, lng: cam.lng, ...(km !== undefined ? { km } : {}) },
        ...forModel(looked.analysis, looked.watch),
      }, {
        kind: 'camera', title: name, subtitle: where || undefined,
        items: [
          { label: countWords(looked.analysis.counts), detail: `in view, ${looked.analysis.light} · ${looked.analysis.at.slice(11, 16)} UTC`, lat: cam.lat, lng: cam.lng },
          ...(looked.watch ? [{ label: `Over ${looked.watch.seconds} s`, detail: describeWatch(looked.watch), lat: cam.lat, lng: cam.lng }] : []),
        ],
      });
    }

    case 'highlight': {
      const pts = (Array.isArray(a.points) ? a.points : []).slice(0, 30).map(p => {
        const at = point(p);
        return at ? { ...at, label: str((p as Record<string, unknown>).label, 60) } : null;
      }).filter((p): p is HighlightPoint => p !== null);
      const ar = point(a.area);
      const area = ar ? { ...ar, radiusKm: numIn((a.area as Record<string, unknown>).radius_km, 1, 5000) ?? 100, label: str((a.area as Record<string, unknown>).label, 60) } : null;
      if (!pts.length && !area) return fail('highlight', 'Nothing to highlight: give points with lat and lng');
      site.highlight({ points: pts, area });
      if (a.frame !== false) {
        const view = frame([...pts, ...(area ? [area] : [])], area ? Math.max(3, Math.min(11, Math.log2(40_000 / (area.radiusKm * 2.4)))) : 9);
        if (view) site.flyTo(view.lat, view.lng, view.zoom);
      }
      return ok('highlight', `Marked ${pts.length} place${pts.length === 1 ? '' : 's'}${area ? ` and an area round ${area.label || 'a point'}` : ''}`);
    }

    case 'show': {
      const items = (Array.isArray(a.items) ? a.items : []).slice(0, 30).map(it => {
        const r = (it && typeof it === 'object' ? it : { label: it }) as Record<string, unknown>;
        const at = point(r);
        return { label: str(r.label ?? r.name ?? r.title, 160), detail: str(r.detail, 240) || undefined, ...(at ?? {}) };
      }).filter(it => it.label);
      if (!items.length) return fail('show', 'Nothing to show');
      return ok('show', `Showed ${items.length} item${items.length === 1 ? '' : 's'}`, undefined, { kind: 'show', title: str(a.title, 120) || 'Results', items });
    }

    case 'markets': {
      const quotes = quotesOf(site.data().markets);
      if (!quotes.length) return fail('markets', 'Market data has not loaded yet');
      const want = strings(a.symbols).map(s => s.toLowerCase());
      const pick = want.length
        ? quotes.filter(q => want.some(w => q.name.toLowerCase().includes(w) || q.symbol.toLowerCase() === w || q.symbol.toLowerCase().replace(/[=^]/g, '').startsWith(w)))
        : quotes.filter(q => q.group === 'indices' || q.group === 'commodities' || q.group === 'crypto').slice(0, 14);
      if (!pick.length) return fail('markets', `No quotes for ${want.join(', ')}`);
      const rows = pick.slice(0, 20).map(q => ({ name: q.name, symbol: q.symbol, price: q.price, change_pct: q.change === null ? null : Math.round(q.change * 100) / 100, currency: q.currency }));
      return ok('markets', `${rows.length} quote${rows.length === 1 ? '' : 's'}`, rows, {
        kind: 'markets', title: want.length ? 'Quotes' : 'Markets now',
        items: pick.slice(0, 20).map(q => ({
          label: q.name, detail: q.symbol, value: `${fmt(q.price)}${q.currency && q.currency !== 'USD' ? ` ${q.currency}` : ''}${q.change === null ? '' : `  ${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}%`}`,
          tone: q.change === null ? undefined : q.change >= 0 ? 'up' : 'down',
        })),
      });
    }

    case 'open': {
      const panel = str(a.panel, 30).toLowerCase();
      if (!(panel in PANELS)) return fail('open', `No panel "${panel}". Panels: ${Object.keys(PANELS).join(', ')}`);
      site.openPanel(panel);
      return ok('open', `Opened ${panel}`);
    }

    case 'map_view': {
      const projection = a.projection === 'flat' || a.projection === 'mercator' ? 'mercator' : a.projection === 'globe' ? 'globe' : undefined;
      const style = a.style === 'satellite' || a.style === 'dark' ? a.style : undefined;
      if (!projection && !style) return fail('map_view', 'Give projection ("globe" or "flat") or style ("dark" or "satellite")');
      site.setView({ projection, style });
      return ok('map_view', [projection ? (projection === 'globe' ? 'globe' : 'flat map') : '', style ? `${style} basemap` : ''].filter(Boolean).join(', '));
    }

    case 'forecast': {
      const question = str(a.question, 500);
      if (question.length < 8) return fail('forecast', 'A forecast needs a question of a few words');
      const depth: Depth = a.depth === 'quick' || a.depth === 'deep' ? a.depth : 'standard';
      const started = await site.forecast(question, depth);
      if (!started.ok) return fail('forecast', started.error);
      return ok('forecast', `Started a ${depth} forecast (run ${started.id.slice(0, 8)})`, undefined, { kind: 'forecast', title: question, items: [], runId: started.id });
    }

    case 'workspace': {
      if (!site.workspace) return fail('workspace', 'The workspace is not available here');
      const view = a.view === 'globe' || a.view === 'graph' || a.view === 'timeline' || a.view === 'table' ? a.view : undefined;
      const open = a.open === false || a.open === 'false' ? false : a.open === true || a.open === 'true' || view ? true : undefined;
      if (open === undefined && !view) return fail('workspace', 'Say open (true or false) or a view');
      const out = site.workspace({ open, view });
      return out.ok ? ok('workspace', out.summary) : fail('workspace', out.error);
    }

    case 'select': {
      if (!site.select) return fail('select', 'There is nothing to select here');
      const name = str(a.name, 120);
      if (!name) return fail('select', 'Give the name of the object to open');
      const out = site.select(name);
      return out.ok ? ok('select', out.summary) : fail('select', out.error);
    }

    case 'clear':
      site.highlight(null);
      return ok('clear', 'Cleared the highlights');
  }
}

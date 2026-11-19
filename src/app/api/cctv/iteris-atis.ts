import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — South Dakota and Montana cameras, from their 511 maps (sd511.org,
 * 511mt.net). Both are Iteris builds, like South Carolina's (see
 * ./southcarolina), and read their camera layers keyless from Iteris' CDN:
 *
 *   https://<state>.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson
 *   https://<state>.cdn.iteris-atis.com/geojson/icons/metadata/icons.rwis.geojson
 *
 * The second is the road-weather stations, most of which carry cameras, often
 * on passes nothing else watches. Montana's first layer is its neighbours'
 * cameras (Alberta's, Wyoming's, Idaho's, North Dakota's) and the national
 * parks' entrances, shown near its borders, so only MDT's own stations are
 * read there. Each site has several views (north, south,
 * the road surface…), all at one spot, so the map shows one per site — a view
 * of the road ahead in preference to the pavement — as it does for Alaska's.
 * Pictures are 1280×720 or 1920×1080 stills, renewed every 10–30 minutes; a
 * site whose newest picture is older than STALE_MS has stopped and is left off.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
/** Every few minutes to half an hour per picture; three hours without one means the camera has stopped. */
export const STALE_MS = 3 * 60 * 60 * 1000;

export interface IterisState {
  /** The CDN's subdomain, e.g. `sd`. */
  code: string;
  state: string;
  source: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** The camera's name, from its site and the view shown. The two maps word these differently. */
  label: (site: IterisSiteProps, view: IterisView) => string;
  /** Which of the CDN's layers hold this state's own cameras. */
  layers: Array<'cameras' | 'rwis'>;
}

export interface IterisView {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  image?: string | null;
  /** Unix seconds. */
  updateTime?: number | null;
}

export interface IterisSiteProps {
  name?: string | null;
  description?: string | null;
  route?: string | null;
  cameras?: IterisView[] | null;
}

export interface IterisSite {
  id?: string | number | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: IterisSiteProps | null;
}

/** Views that show the pavement or a lamp rather than the road. */
const NOT_THE_ROAD = /surface|roadway|pavement|illuminator/i;

const tidy = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || '';

export const SOUTH_DAKOTA: IterisState = {
  code: 'sd',
  state: 'South Dakota',
  source: 'SD511',
  bounds: { minLat: 42.4, maxLat: 46.0, minLng: -104.1, maxLng: -96.4 },
  // "Watertown-north of town along I-29 @ MP 179 looking south"
  label: (site, view) => tidy(view.description) || [tidy(site.name), tidy(view.name)].filter(Boolean).join(' — '),
  layers: ['cameras', 'rwis'],
};

export const MONTANA: IterisState = {
  code: 'mt',
  state: 'Montana',
  source: 'Montana 511',
  bounds: { minLat: 44.3, maxLat: 49.1, minLng: -116.1, maxLng: -104.0 },
  // "Rogers Pass" + "MT-200 MP 90.8"
  label: site => [tidy(site.name), tidy(site.description)].filter(Boolean).join(', '),
  layers: ['rwis'],
};

/** The view to show for a site, or null when none has a current picture on the state's CDN. */
export function pickView(views: IterisView[] | null | undefined, cdn: string, now: number): IterisView | null {
  const current = (views ?? []).filter(v =>
    typeof v?.image === 'string' && v.image.startsWith(cdn)
    && typeof v.updateTime === 'number' && now - v.updateTime * 1000 < STALE_MS);
  return current.find(v => !NOT_THE_ROAD.test(`${v.name ?? ''} ${v.description ?? ''}`)) ?? current[0] ?? null;
}

/** Map one site to a camera, or null when it is misplaced or has no current picture. Exported for tests. */
export function mapIterisSite(site: IterisSite, st: IterisState, now = Date.now()): CctvCamera | null {
  const p = site?.properties;
  const siteId = String(site?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!p || !siteId) return null;

  const coords = site.geometry?.coordinates;
  if (!Array.isArray(coords)) return null;
  const [lng, lat] = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const b = st.bounds;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return null;

  const view = pickView(p.cameras, `https://${st.code}.cdn.iteris-atis.com/`, now);
  if (!view) return null;

  return {
    id: `${st.code}-${siteId}`,
    lat,
    lng,
    name: st.label(p, view) || `${st.state} camera`,
    city: st.state,
    country: 'US',
    feed_url: view.image!,
    source: st.source,
  };
}

async function layer(st: IterisState, file: 'cameras' | 'rwis'): Promise<IterisSite[]> {
  const url = `https://${st.code}.cdn.iteris-atis.com/geojson/icons/metadata/icons.${file}.geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${st.source} ${file} HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

export async function loadIterisCameras(st: IterisState): Promise<CctvCamera[]> {
  /* Either layer can fail on its own; the other still loads. */
  const results = await Promise.allSettled(st.layers.map(file => layer(st, file)));
  for (const r of results) if (r.status === 'rejected') console.warn('[OSIRIS]', r.reason instanceof Error ? r.reason.message : r.reason);
  if (results.every(r => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;

  const now = Date.now();
  const seen = new Set<string>();
  const cams = results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .map(site => mapIterisSite(site, st, now))
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
  console.log(`[OSIRIS] ${st.state} cameras — ${st.source}: ${cams.length}`);
  return cams;
}

export const fetchSouthDakotaCameras = cachedSource('south-dakota', () => loadIterisCameras(SOUTH_DAKOTA));
export const fetchMontanaCameras = cachedSource('montana', () => loadIterisCameras(MONTANA));

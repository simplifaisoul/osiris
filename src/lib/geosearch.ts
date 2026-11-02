/**
 * OSIRIS — place lookups, shared by the browser and /api/geosearch.
 *
 * Search, directions search and OI's place lookups show the built-in place
 * list's matches the moment a key is pressed, then ask one of two online
 * sources and merge what it finds in front of them:
 *
 *   • the OSIRIS geocoder, through /api/geosearch and lib/geocoder.ts: the
 *     deployment's own (OSIRIS_GEOCODER_URL) or, for a copy that runs none,
 *     the one osirisai.live shares. It searches OpenStreetMap data, with
 *     streets and addresses, biased toward where the map is looking;
 *   • when that cannot answer, Wikipedia and Wikidata, asked straight from the browser with
 *     no key. Wikipedia is typo tolerant and ranked by how much each place is
 *     read about, so "heathrow" is the airport; Wikidata adds the streets and
 *     smaller places Wikipedia has no position for. Both limit each browser
 *     on its own (Wikimedia's API rate limits), so a busy site does not pool
 *     its visitors into one allowance. When one refuses (429) it is left
 *     alone for as long as it asks.
 *
 * The geocoder failing for a search sends that search to Wikipedia and
 * Wikidata too; when everything online is out of reach, the built-in list
 * (lib/places.ts: towns, regions and countries, offline) answers alone.
 *
 * The point under the cursor and the place a dossier is about are named from
 * the built-in list only: no request leaves the browser for them.
 */
import { fold, loadPlaces, nearestTown, placeLabel, searchIndex, type Place } from './places';

const GEOCODER = '/api/geosearch';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

/** Wikimedia asks browser code to say who is calling, in this header. */
const API_USER_AGENT = 'OSIRIS place search (https://github.com/simplifaisoul/osiris)';

/** Both answer type-ahead in well under a second; past this, the built-in list answers. */
const TIMEOUT_MS = 4_000;
/** A little past the server's own wait on the geocoder (lib/geocoder.ts), which answers 503 when it gives up. */
const GEOCODER_TIMEOUT_MS = 9_000;
/** How long to leave a source alone after it says too many, when it does not say itself. */
const REST_MS = 60_000;
/** How many results a search shows, and how many of them Wikipedia may take. */
const LIMIT = 8;
const FROM_WIKIPEDIA = 6;

export interface GeoResult {
  name: string;
  context: string;
  lat: number;
  lng: number;
  kind: string;
}

/** Where a point is, as the readout and the dossier name it. */
export interface PlaceName {
  city?: string;
  state?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode?: string;
  /** "City, State, Country", without repeats. */
  label: string;
}

/** One Wikipedia page from a prefix search — only the fields OSIRIS reads. */
export interface WikiPage {
  title?: string;
  index?: number;
  description?: string;
  pageprops?: { disambiguation?: string };
  coordinates?: { lat?: number; lon?: number; type?: string; dim?: number }[];
}

/** One Wikidata item from a search — only the fields OSIRIS reads. */
export interface WikidataItem {
  index?: number;
  coordinates?: { lat?: number; lon?: number }[];
  entityterms?: { label?: string[]; description?: string[] };
}

const STREET = new Set(['street', 'road', 'avenue', 'boulevard', 'square', 'lane', 'highway', 'thoroughfare']);
const REGION = new Set(['oblast', 'province', 'state', 'region', 'county', 'governorate', 'prefecture', 'department', 'canton', 'raion', 'district', 'territory']);
const CITY = new Set(['city', 'town', 'village', 'municipality', 'commune', 'hamlet', 'settlement', 'suburb', 'neighbourhood', 'neighborhood', 'council', 'capital', 'metropolis', 'locality']);
/** What happened somewhere rather than where: "Battle of Enerhodar", "Ongoing nuclear safety crisis". */
const EVENT = new Set(['battle', 'siege', 'attack', 'bombing', 'crisis', 'massacre', 'offensive', 'shelling', 'explosion', 'incident', 'disaster', 'election', 'protest', 'riot', 'uprising', 'assassination', 'earthquake', 'shooting', 'raid', 'invasion', 'war']);
/** A unit of a state that no longer exists: "governorate of the Russian Empire". */
const GONE_STATE = /\b(?:russian empire|ottoman empire|holy roman empire|austria-hungary|austro-hungarian|grand duchy|soviet union|ussr|polish–lithuanian|kingdom of poland)\b/i;
const OLD_UNIT = new Set([...REGION, 'voivodeship', 'subdivision', 'duchy', 'principality', 'kingdom', 'guberniya', 'uyezd']);

/**
 * What a description says a thing is: the noun that ends the part before
 * "in", "of" or "serving". "New York City Subway station in Manhattan" is a
 * station, not a city; "Cathedral city in Northern Ireland" is a city.
 */
function describedNoun(description: string): { head: string; noun: string } {
  const head = description.toLowerCase().split(/\s+(?:in|of|on|at|near|serving|during|for|between)\s+/)[0].replace(/[()]/g, ' ').trim();
  return { head, noun: head.split(/\s+/).pop() ?? '' };
}

/** The kind of place, from how it is described: "street in Manhattan", "oblast of Ukraine", "Palestinian village in Tubas". */
export function describedKind(description = ''): string {
  const { head, noun } = describedNoun(description);
  if (noun === 'country' || /sovereign state$/.test(head)) return 'country';
  if (STREET.has(noun)) return 'street';
  if (REGION.has(noun)) return 'region';
  if (CITY.has(noun)) return 'city';
  return 'poi';
}

/** An event, or a unit of a state that is gone: not somewhere to fly to, and it would push the real place off the list. */
export function notAPlace(title: string, description = ''): boolean {
  const { noun } = describedNoun(description);
  if (EVENT.has(noun) || /^(?:\d{4}\s|battle of|siege of|shelling of|bombing of|attack on)/i.test(title)) return true;
  return OLD_UNIT.has(noun) && GONE_STATE.test(description);
}

/**
 * The kind of place: from the coordinate's type where the article gives one,
 * else from its short description, else from its size (a country is drawn a
 * thousand kilometres across, a landmark one).
 */
export function wikiKind(type?: string, dim?: number, description?: string): string {
  if (type === 'country') return 'country';
  if (type && /^adm[1-3]|^state$/.test(type)) return 'region';
  if (type === 'city') return 'city';
  if (type && ['landmark', 'airport', 'railwaystation', 'edu', 'building'].includes(type)) return 'poi';
  if (type) return 'place';
  const described = describedKind(description);
  if (described !== 'poi') return described;
  if ((dim ?? 0) >= 500_000) return 'country';
  if ((dim ?? 0) >= 50_000) return 'region';
  if ((dim ?? 0) >= 5_000) return 'city';
  return 'poi';
}

/**
 * History, not somewhere to fly to: a span of years or a year in the title
 * ("State in Germany (1806–1918)", "Kiev offensive (1920)"), a description
 * that opens with a year ("1919 unrecognized socialist state"), or a former one.
 */
const HISTORICAL = /\b\d{3,4}\s*[–-]\s*\d{2,4}\b|^\d{3,4}\b|^former\b|^historical\b/i;
const DATED_TITLE = /\(\d{3,4}(?:\s*[–-]\s*\d{2,4})?\)/;

export function normalizeWikiPage(p: WikiPage): GeoResult | null {
  const c = p?.coordinates?.[0];
  if (!p?.title || !c || typeof c.lat !== 'number' || typeof c.lon !== 'number') return null;
  const description = p.description ?? '';
  if (p.pageprops?.disambiguation !== undefined || HISTORICAL.test(description) || DATED_TITLE.test(p.title) || notAPlace(p.title, description)) return null;
  return { name: p.title, context: description, lat: c.lat, lng: c.lon, kind: wikiKind(c.type, c.dim, description) };
}

export function normalizeWikidataItem(item: WikidataItem): GeoResult | null {
  const c = item?.coordinates?.[0];
  const name = item?.entityterms?.label?.[0];
  if (!name || !c || typeof c.lat !== 'number' || typeof c.lon !== 'number') return null;
  const description = item.entityterms?.description?.[0] ?? '';
  if (HISTORICAL.test(description) || DATED_TITLE.test(name) || notAPlace(name, description)) return null;
  return { name, context: description, lat: c.lat, lng: c.lon, kind: describedKind(description) };
}

export function wikipediaUrl(q: string): string {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'prefixsearch', gpssearch: q, gpslimit: '10',
    // "Kiev" is a redirect with no position of its own; follow it to Kyiv.
    redirects: '1',
    prop: 'coordinates|description|pageprops', ppprop: 'disambiguation',
    coprimary: 'primary', coprop: 'type|dim',
  });
  return `${WIKIPEDIA}?${params}`;
}

export function wikidataUrl(q: string): string {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'wbsearch', gwbssearch: q, gwbslanguage: 'en', gwbslimit: '8',
    prop: 'coordinates|entityterms', wbetterms: 'label|description', wbetlanguage: 'en',
    coprimary: 'primary',
  });
  return `${WIKIDATA}?${params}`;
}

/** One geocoder hit — only the fields OSIRIS reads. */
export interface GeocoderFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

/** Collapse OSM class/value pairs into the handful of kinds the UI icons. */
export function classifyKind(key?: string, value?: string): string {
  if (!key) return 'place';
  if (key === 'place' && ['country'].includes(value || '')) return 'country';
  if (key === 'place' && ['state', 'region', 'province', 'county'].includes(value || '')) return 'region';
  if (key === 'place' && ['city', 'town', 'village', 'hamlet', 'municipality'].includes(value || '')) return 'city';
  if (key === 'boundary') return 'region';
  if (key === 'highway' || key === 'street') return 'street';
  if (key === 'building' || key === 'address' || value === 'house') return 'address';
  if (['amenity', 'tourism', 'shop', 'leisure', 'historic', 'office', 'railway', 'aeroway', 'natural', 'man_made'].includes(key)) {
    return 'poi';
  }
  return 'place';
}

export function normalizeFeature(f: GeocoderFeature): GeoResult | null {
  const c = f?.geometry?.coordinates;
  const p = f?.properties;
  if (!c || c.length < 2 || !p) return null;
  const [lng, lat] = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // The geocoder splits an address across name/housenumber/street
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name || street || p.city || p.country || 'Unnamed place';
  const context = [p.name && street ? street : null, p.district, p.city, p.state, p.country]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3)
    .join(', ');

  return { name, context, lat, lng, kind: classifyKind(p.osm_key, p.osm_value) };
}

/**
 * Where the operator is looking, to the nearest tenth of a degree (about
 * 11 km). That is all the geocoder's bias needs, and it lets everyone looking
 * at the same city share one cached answer instead of one per pixel of map.
 */
export function biasOf(near?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  if (!near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng)) return null;
  if (Math.abs(near.lat) > 90 || Math.abs(near.lng) > 180) return null;
  return { lat: Math.round(near.lat * 10) / 10, lng: Math.round(near.lng * 10) / 10 };
}

/** A built-in list entry as a search result. */
export function fromPlace(p: Place): GeoResult {
  const where = p.kind === 'country' ? 'Country' : [p.kind === 'city' ? p.region : '', p.country].filter(Boolean).join(', ');
  return { name: p.name, context: where, lat: p.lat, lng: p.lng, kind: p.kind };
}

/** Rough distance in km, plenty for telling two results apart. */
function km(a: GeoResult, b: GeoResult): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return 111.2 * Math.hypot(dLat, dLng);
}

/** The words that make a name, without the ones that only say what kind of place it is. */
const GENERIC = new Set(['oblast', 'province', 'region', 'governorate', 'county', 'district', 'city', 'municipality']);
const words = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !GENERIC.has(w)));

/** How far apart one place can be found by two sources: a region's middle is placed loosely, a building exactly. */
const SAME_WITHIN_KM: Record<string, number> = { country: 500, region: 150, city: 10 };
/** Two sources can place one named thing this far apart: the Gaza Strip's middle, a few kilometres off. */
const SAME_NAME_WITHIN_KM = 50;

/**
 * Whether two results are the same place, found twice. The same name and
 * kind within a few tens of kilometres; the same name, of another kind, within
 * the looser of their two distances (a city and its namesake region from the
 * built-in list); or, for two of the same kind, one name inside the other ("Heathrow
 * Airport" and "London Heathrow Airport"; "Kharkiv Oblast" and "Kharkiv" the
 * region). Different kinds stay apart however close: Wall Street the street
 * and Wall Street the station are both worth listing.
 */
export function samePlace(a: GeoResult, b: GeoResult): boolean {
  const d = km(a, b);
  const sameName = fold(a.name) === fold(b.name);
  if (sameName && a.kind === b.kind && d <= Math.max(SAME_NAME_WITHIN_KM, SAME_WITHIN_KM[a.kind] ?? 0)) return true;
  if (d > Math.max(SAME_WITHIN_KM[a.kind] ?? 1, SAME_WITHIN_KM[b.kind] ?? 1)) return false;
  if (sameName) return true;
  if (a.kind !== b.kind) return false;
  const [wa, wb] = [words(a.name), words(b.name)];
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  return small.size > 0 && [...small].every(w => large.has(w));
}

/**
 * Wikipedia first, then what Wikidata adds, then the built-in list; no place
 * twice. The geocoder's answer, when there is one, goes in Wikipedia's place.
 * A city and its namesake region count as one place, and the city is the one
 * kept: the geocoder lists Lisbon the district before Lisbon the city.
 */
export function mergeResults(wikipedia: GeoResult[], wikidata: GeoResult[], local: GeoResult[]): GeoResult[] {
  const out: GeoResult[] = [];
  const add = (r: GeoResult) => {
    const i = out.findIndex(o => samePlace(o, r));
    if (i < 0) {
      if (out.length < LIMIT) out.push(r);
    } else if (r.kind === 'city' && out[i].kind === 'region' && fold(r.name) === fold(out[i].name)) {
      out[i] = r;
    }
  };
  wikipedia.slice(0, FROM_WIKIPEDIA).forEach(add);
  wikidata.forEach(add);
  wikipedia.slice(FROM_WIKIPEDIA).forEach(add);
  local.forEach(add);
  return out;
}

/** Until when each Wikimedia site has asked to be left alone. */
const restUntil = new Map<string, number>();
/** Set once the deployment says it has no geocoder of its own, so later searches go straight to Wikimedia. */
let noGeocoder = false;

/**
 * GET a JSON body, or null if it fails or takes longer than `ms`, with the
 * status it came with (0 when nothing came back). Throws only when `signal`
 * aborts, so a superseded search stops instead of answering.
 */
async function getJson<T>(
  url: string,
  signal: AbortSignal | undefined,
  ms: number,
  headers?: Record<string, string>,
): Promise<{ status: number; retryAfter: string | null; body: T | null }> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    return { status: res.status, retryAfter: res.headers.get('Retry-After'), body: res.ok ? ((await res.json()) as T) : null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { status: 0, retryAfter: null, body: null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** A Wikimedia API's answer, or null. A refusal (429) rests that site for as long as it asks. */
async function askWikimedia<T>(url: string, signal: AbortSignal | undefined): Promise<T | null> {
  const host = new URL(url).host;
  if ((restUntil.get(host) ?? 0) > Date.now()) return null;
  const { status, retryAfter, body } = await getJson<T>(url, signal, TIMEOUT_MS, { 'Api-User-Agent': API_USER_AGENT });
  if (status === 429) {
    const wait = Number(retryAfter) * 1000;
    restUntil.set(host, Date.now() + (Number.isFinite(wait) && wait > 0 ? wait : REST_MS));
  }
  return body;
}

/** The deployment's geocoder's answer, or null when it has none or did not answer this time. */
async function askGeocoder(q: string, near: { lat: number; lng: number } | null | undefined, signal: AbortSignal | undefined): Promise<GeoResult[] | null> {
  if (noGeocoder) return null;
  const bias = biasOf(near);
  const url = `${GEOCODER}?q=${encodeURIComponent(q)}${bias ? `&lat=${bias.lat}&lng=${bias.lng}` : ''}`;
  const { status, body } = await getJson<{ results?: GeoResult[] }>(url, signal, GEOCODER_TIMEOUT_MS);
  if (status === 501) noGeocoder = true;
  return body?.results ?? null;
}

/**
 * What the online sources found, as mergeResults takes it: the geocoder's
 * answer, or Wikipedia's and Wikidata's when it has none to give.
 */
async function searchOnline(q: string, near: { lat: number; lng: number } | null | undefined, signal: AbortSignal | undefined): Promise<[GeoResult[], GeoResult[]]> {
  const found = await askGeocoder(q, near, signal);
  if (found?.length) return [found, []];
  const [wp, wd] = await Promise.all([
    askWikimedia<{ query?: { pages?: WikiPage[] } }>(wikipediaUrl(q), signal),
    askWikimedia<{ query?: { pages?: WikidataItem[] } }>(wikidataUrl(q), signal),
  ]);
  const byIndex = <P extends { index?: number }>(pages?: P[]) => [...(pages ?? [])].sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  return [
    byIndex(wp?.query?.pages).map(normalizeWikiPage).filter((r): r is GeoResult => r !== null),
    byIndex(wd?.query?.pages).map(normalizeWikidataItem).filter((r): r is GeoResult => r !== null),
  ];
}

const abandoned = () => new DOMException('Search abandoned', 'AbortError');

/**
 * Places matching what was typed, ranked toward `near` (where the map is
 * looking) when the deployment's geocoder answers. The built-in list's
 * matches go to `onPartial` as soon as they are known, so the list never
 * waits on the network; the merged answer is returned once the online
 * sources have answered or timed out. Throws only when `signal` aborts.
 */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal,
  onPartial?: (results: GeoResult[]) => void,
): Promise<GeoResult[]> {
  const online = searchOnline(q, near, signal);
  // Settle the online half's rejection here too, so an abort while the list loads is not unhandled.
  online.catch(() => {});

  const index = await loadPlaces().catch(() => null);
  if (signal?.aborted) throw abandoned();
  const local = index ? searchIndex(index, q).map(fromPlace) : [];
  if (local.length) onPartial?.(local);

  const [main, more] = await online;
  return mergeResults(main, more, local);
}

/** The town a point is in or near, from the built-in list; null at sea or far from any town. */
export async function placeAt(lat: number, lng: number): Promise<PlaceName | null> {
  const index = await loadPlaces().catch(() => null);
  const t = index && nearestTown(index, lat, lng);
  if (!t) return null;
  return { city: t.name, state: t.region || undefined, country: t.country || undefined, countryCode: t.countryCode, label: placeLabel(t) };
}

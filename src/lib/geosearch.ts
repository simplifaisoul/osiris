/**
 * OSIRIS — place lookups, in the visitor's browser, with no key.
 *
 * Search, directions search and OI's place lookups ask three sources, all
 * keyless, and merge what they find:
 *
 *   • the built-in place list (lib/places.ts): towns, regions and countries,
 *     offline, so its matches show the moment a key is pressed;
 *   • Wikipedia (en.wikipedia.org): typo tolerant and ranked by how much each
 *     place is read about, so "heathrow" is the airport and "sydny opera" is
 *     the Sydney Opera House; it knows landmarks, stations and villages;
 *   • Wikidata (www.wikidata.org): the streets and smaller places Wikipedia
 *     has no position for, such as Wall Street or Rue de Rivoli.
 *
 * Wikipedia and Wikidata are asked straight from the browser. They need no
 * key and limit each browser on its own (Wikimedia's API rate limits), so a
 * busy site does not pool its visitors into one allowance. When one refuses
 * (429) it is left alone for as long as it asks; when both are out of reach,
 * the built-in list answers alone.
 *
 * The point under the cursor and the place a dossier is about are named from
 * the built-in list only: no request leaves the browser for them.
 *
 * The public Photon and Nominatim servers are not used. Their operators asked
 * OSIRIS to stop: their fair-use limits do not cover a public site's traffic.
 */
import { fold, loadPlaces, nearestTown, placeLabel, searchIndex, type Place } from './places';

const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

/** Wikimedia asks browser code to say who is calling, in this header. */
const API_USER_AGENT = 'OSIRIS place search (https://github.com/simplifaisoul/osiris)';

/** Both answer type-ahead in well under a second; past this, the built-in list answers. */
const TIMEOUT_MS = 4_000;
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

/** Wikipedia first, then what Wikidata adds, then the built-in list; no place twice. */
export function mergeResults(wikipedia: GeoResult[], wikidata: GeoResult[], local: GeoResult[]): GeoResult[] {
  const out: GeoResult[] = [];
  const add = (r: GeoResult) => {
    if (out.length < LIMIT && !out.some(o => samePlace(o, r))) out.push(r);
  };
  wikipedia.slice(0, FROM_WIKIPEDIA).forEach(add);
  wikidata.forEach(add);
  wikipedia.slice(FROM_WIKIPEDIA).forEach(add);
  local.forEach(add);
  return out;
}

/** Until when each Wikimedia site has asked to be left alone. */
const restUntil = new Map<string, number>();

/**
 * GET a JSON body from a Wikimedia API, or null if it fails, refuses or
 * takes longer than TIMEOUT_MS. A refusal (429) rests that site for as long
 * as it asks. Throws only when `signal` aborts, so a superseded search stops
 * instead of answering.
 */
async function askWikimedia<T>(url: string, signal: AbortSignal | undefined): Promise<T | null> {
  const host = new URL(url).host;
  if ((restUntil.get(host) ?? 0) > Date.now()) return null;
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Api-User-Agent': API_USER_AGENT } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After')) * 1000;
      restUntil.set(host, Date.now() + (Number.isFinite(wait) && wait > 0 ? wait : REST_MS));
    }
    return res.ok ? ((await res.json()) as T) : null;
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

const abandoned = () => new DOMException('Search abandoned', 'AbortError');

/**
 * Places matching what was typed. The built-in list's matches go to
 * `onPartial` as soon as they are known, so the list never waits on the
 * network; the merged answer is returned once Wikipedia and Wikidata have
 * answered or timed out. Throws only when `signal` aborts.
 */
export async function searchPlaces(
  q: string,
  signal?: AbortSignal,
  onPartial?: (results: GeoResult[]) => void,
): Promise<GeoResult[]> {
  const online = Promise.all([
    askWikimedia<{ query?: { pages?: WikiPage[] } }>(wikipediaUrl(q), signal),
    askWikimedia<{ query?: { pages?: WikidataItem[] } }>(wikidataUrl(q), signal),
  ]);
  // Settle the online half's rejection here too, so an abort while the list loads is not unhandled.
  online.catch(() => {});

  const index = await loadPlaces().catch(() => null);
  if (signal?.aborted) throw abandoned();
  const local = index ? searchIndex(index, q).map(fromPlace) : [];
  if (local.length) onPartial?.(local);

  const [wp, wd] = await online;
  const byIndex = <P extends { index?: number }>(pages?: P[]) => [...(pages ?? [])].sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const wikipedia = byIndex(wp?.query?.pages).map(normalizeWikiPage).filter((r): r is GeoResult => r !== null);
  const wikidata = byIndex(wd?.query?.pages).map(normalizeWikidataItem).filter((r): r is GeoResult => r !== null);
  return mergeResults(wikipedia, wikidata, local);
}

/** The town a point is in or near, from the built-in list; null at sea or far from any town. */
export async function placeAt(lat: number, lng: number): Promise<PlaceName | null> {
  const index = await loadPlaces().catch(() => null);
  const t = index && nearestTown(index, lat, lng);
  if (!t) return null;
  return { city: t.name, state: t.region || undefined, country: t.country || undefined, countryCode: t.countryCode, label: placeLabel(t) };
}

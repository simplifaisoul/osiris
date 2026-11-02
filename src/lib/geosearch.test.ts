import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  wikiKind, describedKind, notAPlace, normalizeWikiPage, normalizeWikidataItem, wikipediaUrl, wikidataUrl,
  samePlace, mergeResults, type WikiPage, type WikidataItem, type GeoResult,
} from './geosearch';

const PLACES = readFileSync(join(process.cwd(), 'public', 'places.json'), 'utf8');

describe('wikiKind', () => {
  it('reads the coordinate type an article gives', () => {
    expect(wikiKind('country')).toBe('country');
    expect(wikiKind('adm1st')).toBe('region');
    expect(wikiKind('city')).toBe('city');
    expect(wikiKind('landmark')).toBe('poi');
    expect(wikiKind('airport')).toBe('poi');
    expect(wikiKind('mountain')).toBe('place');
  });

  it('falls back to the short description, then to the size the article is drawn at', () => {
    expect(wikiKind(undefined, 1000, 'Palestinian village in Tubas Governorate, West Bank')).toBe('city');
    expect(wikiKind(undefined, 1_000_000, 'District in Krasnoyarsk Krai, Russia')).toBe('region');
    expect(wikiKind(undefined, 1_000_000)).toBe('country');
    expect(wikiKind(undefined, 100_000)).toBe('region');
    expect(wikiKind(undefined, 10_000)).toBe('city');
    expect(wikiKind(undefined, 1000)).toBe('poi');
  });
});

describe('describedKind', () => {
  it('reads the kind from how Wikidata describes a place', () => {
    expect(describedKind('street in Manhattan, New York, USA')).toBe('street');
    expect(describedKind('oblast of Ukraine')).toBe('region');
    expect(describedKind('capital city of Kharkiv Oblast in Ukraine')).toBe('city');
    expect(describedKind('village council in Tubas Governorate')).toBe('city');
    expect(describedKind('country in Western Europe')).toBe('country');
    expect(describedKind('main airport serving London, England')).toBe('poi');
  });

  it('goes by the noun the description ends on, not any word in it', () => {
    expect(describedKind('New York City Subway station in Manhattan')).toBe('poi');
    expect(describedKind('Cathedral city in Northern Ireland')).toBe('city');
    expect(describedKind('Oblast (region) of Ukraine')).toBe('region');
    expect(describedKind('sovereign state in Western Europe')).toBe('country');
  });

  it('looks only at what the place is, not where', () => {
    // "university in Kharkiv" is not a city because a city is named after "in".
    expect(describedKind('university in the city of Kharkiv')).toBe('poi');
  });
});

describe('notAPlace', () => {
  it('drops events, which push the place itself off the list', () => {
    expect(notAPlace('Zaporizhzhia Nuclear Power Plant crisis', 'Ongoing nuclear safety crisis during the Russo-Ukrainian war')).toBe(true);
    expect(notAPlace('Battle of Enerhodar', 'Battle of the Russian invasion of Ukraine')).toBe(true);
    expect(notAPlace('2010 Times Square car bombing attempt', 'Attempted terrorist attack in New York City')).toBe(true);
  });

  it('drops units of states that are gone', () => {
    expect(notAPlace('Kiev Governorate', 'governorate of the Russian Empire')).toBe(true);
    expect(notAPlace('Kiev Voivodeship', 'Subdivision of the Grand Duchy of Lithuania and the Kingdom of Poland')).toBe(true);
  });

  it('keeps places, including ones named after a war or an empire', () => {
    expect(notAPlace('Zaporizhzhia Nuclear Power Plant', 'Nuclear-power plant in Enerhodar, Ukraine')).toBe(false);
    expect(notAPlace('National War Memorial', 'War memorial in Ottawa, Canada')).toBe(false);
    expect(notAPlace('Süleymaniye Mosque', 'Ottoman imperial mosque in Istanbul, Turkey')).toBe(false);
  });
});

describe('normalizing', () => {
  const page = (over: Partial<WikiPage>): WikiPage => ({
    title: 'Lisbon', description: 'Capital and largest city of Portugal',
    coordinates: [{ lat: 38.7, lon: -9.14, type: 'city', dim: 10000 }], ...over,
  });
  const item = (over: Partial<WikidataItem>): WikidataItem => ({
    coordinates: [{ lat: 40.706, lon: -74.009 }],
    entityterms: { label: ['Wall Street'], description: ['street in Manhattan, New York, USA'] }, ...over,
  });

  it('turns an article with a position into a result', () => {
    expect(normalizeWikiPage(page({}))).toEqual({
      name: 'Lisbon', context: 'Capital and largest city of Portugal', lat: 38.7, lng: -9.14, kind: 'city',
    });
  });

  it('turns a Wikidata item with a position into a result', () => {
    expect(normalizeWikidataItem(item({}))).toEqual({
      name: 'Wall Street', context: 'street in Manhattan, New York, USA', lat: 40.706, lng: -74.009, kind: 'street',
    });
  });

  it('drops what has no position or no name, disambiguation pages and history', () => {
    expect(normalizeWikiPage(page({ coordinates: undefined }))).toBeNull();
    expect(normalizeWikiPage(page({ pageprops: { disambiguation: '' } }))).toBeNull();
    expect(normalizeWikiPage(page({ title: 'Kingdom of Bavaria', description: 'State in Germany (1806–1918)' }))).toBeNull();
    expect(normalizeWikiPage(page({ title: 'Kiev offensive (1920)', description: 'Part of the Polish–Soviet War' }))).toBeNull();
    expect(normalizeWikiPage(page({ title: 'Bavarian Soviet Republic', description: '1919 unrecognized socialist state in Germany' }))).toBeNull();
    expect(normalizeWikidataItem(item({ coordinates: undefined }))).toBeNull();
    expect(normalizeWikidataItem(item({ entityterms: { description: ['street'] } }))).toBeNull();
    expect(normalizeWikidataItem(item({ entityterms: { label: ['Heathrow'], description: ['former hamlet in Harmondsworth'] } }))).toBeNull();
  });
});

describe('request urls', () => {
  it('asks Wikipedia for a prefix search with positions, following redirects, from any origin', () => {
    const u = new URL(wikipediaUrl('kiev'));
    expect(u.origin + u.pathname).toBe('https://en.wikipedia.org/w/api.php');
    expect(u.searchParams.get('generator')).toBe('prefixsearch');
    expect(u.searchParams.get('gpssearch')).toBe('kiev');
    expect(u.searchParams.get('redirects')).toBe('1');
    expect(u.searchParams.get('origin')).toBe('*');
  });

  it('asks Wikidata for items with their position, English name and description, in one request', () => {
    const u = new URL(wikidataUrl('wall street'));
    expect(u.origin + u.pathname).toBe('https://www.wikidata.org/w/api.php');
    expect(u.searchParams.get('generator')).toBe('wbsearch');
    expect(u.searchParams.get('gwbssearch')).toBe('wall street');
    expect(u.searchParams.get('prop')).toBe('coordinates|entityterms');
    expect(u.searchParams.get('origin')).toBe('*');
  });
});

const r = (name: string, lat: number, lng: number, kind = 'poi'): GeoResult => ({ name, context: '', lat, lng, kind });

describe('samePlace and mergeResults', () => {
  it('knows one place found twice under different names', () => {
    expect(samePlace(r('Heathrow Airport', 51.47, -0.4543), r('London Heathrow Airport', 51.477, -0.461))).toBe(true);
    // Wikipedia's oblast and the built-in list's region: their middles are placed tens of kilometres apart.
    expect(samePlace(r('Kharkiv Oblast', 49.59, 36.43, 'region'), r('Kharkiv', 49.85, 36.6, 'region'))).toBe(true);
    expect(samePlace(r('Lisbon', 38.708, -9.139, 'city'), r('Lisbon', 38.72, -9.14, 'city'))).toBe(true);
    // Wikipedia and Wikidata place the Gaza Strip's middle a few kilometres apart.
    expect(samePlace(r('Gaza Strip', 31.4, 34.38, 'region'), r('Gaza Strip', 31.43, 34.42, 'region'))).toBe(true);
    expect(samePlace(r('Gaza Strip', 31.4, 34.38), r('Gaza Strip', 31.43, 34.42))).toBe(true);
  });

  it('keeps apart a city and its region, a street and its station, and two places of the same name', () => {
    expect(samePlace(r('Kharkiv', 49.992, 36.231, 'city'), r('Kharkiv Oblast', 49.59, 36.43, 'region'))).toBe(false);
    expect(samePlace(r('Wall Street station (IRT Lexington Avenue Line)', 40.708, -74.012), r('Wall Street', 40.706, -74.009, 'street'))).toBe(false);
    expect(samePlace(r('Paris', 48.85, 2.35, 'city'), r('Paris', 33.66, -95.56, 'city'))).toBe(false);
  });

  it('puts Wikipedia first, then what Wikidata adds, then the built-in list, eight at most', () => {
    // As live: Wikipedia has the station (its street article has no position), Wikidata has the street, twice.
    const merged = mergeResults(
      [r('Wall Street station', 40.708, -74.012)],
      [r('Wall Street', 40.706, -74.009, 'street'), r('Wall Street', 40.7061, -74.0091, 'street'), r('Wall Street', 34.05, -118.24, 'street')],
      [r('Wallsend', 54.99, -1.53, 'city')],
    );
    expect(merged.map(m => `${m.name} ${m.lat}`)).toEqual(['Wall Street station 40.708', 'Wall Street 40.706', 'Wall Street 34.05', 'Wallsend 54.99']);
    const many = Array.from({ length: 20 }, (_, i) => r(`P${i}`, i, i));
    expect(mergeResults(many, many, many)).toHaveLength(8);
  });

  it('leaves Wikidata room when Wikipedia has a lot', () => {
    const wp = Array.from({ length: 10 }, (_, i) => r(`WP${i}`, i, i));
    const merged = mergeResults(wp, [r('Rue de Rivoli', 48.857, 2.354, 'street')], []);
    expect(merged.map(m => m.name)).toContain('Rue de Rivoli');
  });
});

describe('lookups from the browser', () => {
  const fetchMock = vi.fn();
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Promise.resolve({ ok: status < 400, status, headers: new Headers(headers), json: async () => body });
  /** The place list is served as the browser would fetch it; the rest is up to each test. */
  const serve = (wikipedia: () => Promise<unknown>, wikidata: () => Promise<unknown>) => fetchMock.mockImplementation((url: string) =>
    url === '/places.json' ? json(JSON.parse(PLACES))
      : url.startsWith('https://en.wikipedia.org/') ? wikipedia()
        : url.startsWith('https://www.wikidata.org/') ? wikidata()
          : Promise.reject(new Error(`unexpected request: ${url}`)));

  /* The module keeps the loaded list and each site's rest in module state, so
     each test loads a fresh copy. */
  let geo: typeof import('./geosearch');
  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.resetModules();
    geo = await import('./geosearch');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the built-in list at once, then merges Wikipedia and Wikidata, saying who is asking', async () => {
    serve(
      () => json({ query: { pages: [{ title: 'Lisbon', index: 1, description: 'Capital of Portugal', coordinates: [{ lat: 38.708, lon: -9.139, type: 'city' }] }] } }),
      () => json({ query: { pages: [{ index: 1, coordinates: [{ lat: 38.769, lon: -9.128 }], entityterms: { label: ['Lisbon Airport'], description: ['international airport in Portugal'] } }] } }),
    );
    const partial = vi.fn();

    const found = await geo.searchPlaces('lisb', undefined, partial);

    expect(partial.mock.calls[0][0][0]).toMatchObject({ name: 'Lisbon', kind: 'city' });
    expect(found.map(f => f.name).slice(0, 2)).toEqual(['Lisbon', 'Lisbon Airport']);
    const asked = fetchMock.mock.calls.filter(([url]) => url !== '/places.json');
    expect(asked).toHaveLength(2);
    for (const [, init] of asked) expect(init.headers['Api-User-Agent']).toContain('OSIRIS');
  });

  it('answers from the built-in list when both sites are out of reach', async () => {
    serve(() => Promise.reject(new TypeError('offline')), () => json({}, 503));
    expect((await geo.searchPlaces('lisb'))[0]).toMatchObject({ name: 'Lisbon', kind: 'city' });
  });

  it('leaves a site alone for as long as it asks after a refusal', async () => {
    serve(() => json({}, 429, { 'Retry-After': '120' }), () => json({ query: { pages: [] } }));
    await geo.searchPlaces('lisb');
    await geo.searchPlaces('lisbo');

    const toWikipedia = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://en.wikipedia.org/'));
    expect(toWikipedia).toHaveLength(1);
  });

  it('throws when the search is abandoned, instead of answering late', async () => {
    const ctrl = new AbortController();
    const hang = () => new Promise((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    serve(hang, hang);
    const pending = geo.searchPlaces('pari', ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toThrow();
  });

  it('names the point under the cursor from the list alone', async () => {
    serve(() => Promise.reject(new Error('nothing else may be asked')), () => Promise.reject(new Error('nothing else may be asked')));

    expect((await geo.placeAt(48.8566, 2.3522))?.label).toBe('Paris, Île-de-France, France');
    expect(await geo.placeAt(0, -30)).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => url === '/places.json')).toBe(true);
  });
});

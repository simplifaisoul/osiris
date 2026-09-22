import { NextResponse } from 'next/server';
import { ATTRIBUTION, nominatim } from '@/lib/nominatim';
import { httpJson } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Region Dossier API
 * Provides country intelligence for any coordinate (right-click on map)
 * Fix #115: Steps 2-4 now run in parallel via Promise.allSettled
 */

/*
 * The country facts come from Wikidata, read through its REST API rather than
 * query.wikidata.org.
 *
 * The SPARQL endpoint refuses or times out far more often than it answers — on
 * 21 Sep 2026 it did not respond at all within 25s — and when it failed it took
 * the whole country block of this panel down with it, so a right-click showed
 * nothing but a place name. An item's own statements answer the same questions
 * in one request, and a country's facts change slowly, so each is kept for a day.
 */

const WD_REST = 'https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items';
const WD_TTL_MS = 24 * 60 * 60 * 1000;
const WD_TIMEOUT_MS = 8000;
/** Qualifier: the date a statement stopped being true. */
const ENDED = 'P582';

export interface WdStatement {
  rank?: string;
  qualifiers?: { property: { id: string } }[];
  value?: { content?: unknown };
}
type WdStatements = Record<string, WdStatement[]>;

/** The statements that still hold — a president who left office is not the president. */
export const stillHolding = (list: WdStatement[] = []) =>
  list.filter(s => !s.qualifiers?.some(q => q.property.id === ENDED));

/** The one that holds now: Wikidata's own preferred rank, else one that has not ended. */
export const current = (list?: WdStatement[]): WdStatement | undefined =>
  list?.find(s => s.rank === 'preferred') ?? stillHolding(list)[0] ?? list?.[0];

/** A statement points at another item by id, or carries a quantity. */
export const itemId = (s?: WdStatement): string => (typeof s?.value?.content === 'string' ? s.value.content : '');
export const amountOf = (s?: WdStatement): number | undefined => {
  const raw = (s?.value?.content as { amount?: string } | undefined)?.amount;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const statementsOf = (id: string, property?: string) =>
  httpJson<WdStatements>(`${WD_REST}/${id}/statements${property ? `?property=${property}` : ''}`, { timeoutMs: WD_TIMEOUT_MS });

/** English names for a batch of item ids, in one request. */
async function labelsFor(ids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return {};
  const json = await httpJson<{ entities?: Record<string, { labels?: { en?: { value?: string } } }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=en&format=json&ids=${wanted.join('|')}`,
    { timeoutMs: WD_TIMEOUT_MS },
  );
  const out: Record<string, string> = {};
  for (const [id, entity] of Object.entries(json.entities ?? {})) {
    if (entity.labels?.en?.value) out[id] = entity.labels.en.value;
  }
  return out;
}

interface CountryFacts {
  country: {
    name: string;
    official_name: string;
    capital?: string;
    population?: number;
    area?: number;
    region?: string;
    subregion?: string;
    languages: string[];
    currencies: string[];
    flag_url?: string;
    timezones: string[];
  };
  head_of_state: { name: string; position: string } | null;
}

/** What Wikidata knows about a country, as the panel wants it. */
async function readCountry(countryName: string): Promise<CountryFacts[]> {
  // The English Wikipedia article for a place names the Wikidata item for it.
  const pages = await httpJson<{ query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(countryName)}`,
    { timeoutMs: WD_TIMEOUT_MS },
  );
  const qid = Object.values(pages.query?.pages ?? {})[0]?.pageprops?.wikibase_item;
  if (!qid) return [];

  const s = await statementsOf(qid);
  const capital = itemId(current(s.P36));
  const continent = itemId(current(s.P30));
  const languages = stillHolding(s.P37).map(itemId).filter(Boolean).slice(0, 4);
  const currencies = stillHolding(s.P38).map(itemId).filter(Boolean).slice(0, 3);
  const leader = itemId(current(s.P35));
  /* The office is read from the country, not from the person. Charles III holds
     several crowns at once, and his own item lists the British one first, which
     would caption a dossier about Australia "monarch of the United Kingdom". */
  const position = itemId(current(s.P1906));
  const flagFile = itemId(current(s.P41));

  const name = await labelsFor([capital, continent, leader, position, ...languages, ...currencies]);

  return [{
    country: {
      name: countryName,
      official_name: countryName,
      capital: name[capital],
      population: amountOf(current(s.P1082)),
      area: amountOf(current(s.P2046)),
      region: name[continent],
      subregion: name[continent],
      languages: languages.map(id => name[id]).filter(Boolean),
      currencies: currencies.map(id => name[id]).filter(Boolean),
      flag_url: flagFile ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(flagFile)}` : undefined,
      timezones: [],
    },
    head_of_state: leader && name[leader]
      ? { name: name[leader], position: name[position] || 'Head of State' }
      : null,
  }];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');

  try {
    /* Step 1: Reverse geocode to get country (must complete first — other steps depend on it).
       Through lib/nominatim.ts, which holds one budget and one cache for the whole app.
       Kept to ~100 m: a whole degree is up to 78 km, which put Gaza in the sea and
       Singapore in Indonesia. A right-click is deliberate and rare, and the cache
       answers a second click on the same spot for free. */
    const geoData = await nominatim<{ address?: Record<string, string>; display_name?: string }>('reverse', {
      lat: lat.toFixed(3),
      lon: lng.toFixed(3),
      /* Zoom 5 answers with a region and no country at all for a territory —
         a click in Gaza came back "Gaza Strip" and nothing else, so the panel
         had no country to look up and showed one line. Zoom 10 names the place
         and the country it is in. */
      zoom: '10',
      addressdetails: '1',
    });

    let countryName = '';
    let countryCode = '';
    let locationInfo: any = {};

    if (geoData) {
      const addr = geoData.address || {};
      countryName = addr.country || '';
      countryCode = addr.country_code?.toUpperCase() || '';
      locationInfo = {
        city: addr.city || addr.town || addr.village || '',
        state: addr.state || addr.region || '',
        country: countryName,
        country_code: countryCode,
        display_name: geoData.display_name,
      };
    }

    // Steps 2-3: Run in PARALLEL after geocode
    const [wikiResult, wdResult] = await Promise.allSettled([

      // Step 2: Fetch Wikipedia summary
      (async () => {
        const wikiQuery = locationInfo.city || countryName;
        if (!wikiQuery) return null;
        try {
          const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiQuery)}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (res.ok) {
            const wiki = await res.json();
            return {
              title: wiki.title,
              extract: wiki.extract?.substring(0, 500),
              thumbnail: wiki.thumbnail?.source,
            };
          }
        } catch (e) { console.warn('[OSIRIS] Wikipedia fetch error:', e instanceof Error ? e.message : e); }
        return null;
      })(),

      /* Step 3: Country facts and head of state. Cached for a day per country,
         which also keeps a burst of right-clicks off Wikidata. */
      countryName
        ? cachedSource<CountryFacts>(`dossier:wd:${countryName}`, () => readCountry(countryName), WD_TTL_MS)()
            .then(rows => rows[0] ?? null)
        : Promise.resolve(null),
    ]);

    const wikiSummary = wikiResult.status === 'fulfilled' ? wikiResult.value : null;
    const facts       = wdResult.status   === 'fulfilled' ? wdResult.value   : null;

    const countryData = facts?.country ?? null;
    const headOfState = facts?.head_of_state ?? null;

    return NextResponse.json({
      coordinates: { lat, lng },
      location: locationInfo,
      country: countryData,
      head_of_state: headOfState,
      wikipedia: wikiSummary,
      /** The place this dossier is about was named by OpenStreetMap. */
      attribution: ATTRIBUTION,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Region dossier error:', error);
    return NextResponse.json({ error: 'Failed to fetch region data' }, { status: 500 });
  }
}

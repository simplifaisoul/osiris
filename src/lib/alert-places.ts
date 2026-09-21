import { nominatim } from '@/lib/nominatim';
import { classify, type AlertKind } from '@/lib/alert-digest';

export type { AlertKind };

/**
 * OSIRIS — pins a Live Alerts report to the place it names.
 *
 * The feed used to pin every report to one of fifteen country centroids, by
 * keyword. Reports name their places — "the village of Tayasir, northeast of
 * Tubas", "an explosion in Riyadh", "Russian attack on Sumy" — so this reads
 * those names and resolves them against OpenStreetMap, and a report lands on
 * the town it is about.
 *
 * A town is the ceiling. A post names a village, not a street, and the pin
 * carries the name it was placed on so a reader can judge it.
 *
 * Two passes keep a common name from landing in the wrong country. First the
 * names are looked up inside the countries of the theatre the report is about
 * ("Al-Mughayir" is a village near Ramallah, and also one in Iraq). Only if
 * none resolves there is the name looked up worldwide, and then only a major
 * city is accepted — "Amsterdam police arrested…" is about Amsterdam, but a
 * hamlet that happens to share a word with a headline is not. The same rule
 * holds inside the theatre for a name the post does not introduce as a place:
 * "in Tayasir" may be a village, but a bare capitalised word must be a city.
 */

export interface AlertPlace {
  /** The name as the post gives it. */
  name: string;
  /** OpenStreetMap's name for it, with its region and country. */
  label: string;
  lat: number;
  lng: number;
  /** 'settlement' is a city, town or village; 'region' an oblast or province. */
  precision: 'settlement' | 'region';
}

/* ───────────────────────────── What happened ───────────────────────────── */

/* Whole English words ("grad" is not "gradually"); the Russian stem takes any ending. */
const ROCKET_RX = /(?<![\p{L}\p{N}])(?:(?:rockets?|missiles?|ballistic|barrages?|salvos?|iskanders?|kinzhals?|kalibrs?|katyushas?|grad|mlrs|himars|atacms|storm shadow)(?![\p{L}\p{N}])|ракет)/iu;
const EVENT_TOPICS = new Set(['strikes', 'drones', 'air-defence', 'ground', 'casualties']);
const EVENT_RX = /(?<![\p{L}\p{N}])(?:attack(?:s|ed)?|raid(?:s|ed)?|clash(?:es|ed)?|shooting|gunfire|explosions?|blasts?|arrest(?:s|ed)?|set fire|arson|vandali[sz]ed|stormed|demolish(?:ed)?|evacuat(?:e|ed|ion))(?![\p{L}\p{N}])/iu;

/**
 * Rocket: a missile or rocket is in the report. Event: something happened
 * on the ground — a strike, a drone, an attack, casualties. News: the rest.
 */
export function alertKind(title: string, text: string): AlertKind {
  // The headline and lead say what a report is about; a missile named in the
  // fifth paragraph of a column about budgets does not make it a rocket alert.
  const lead = text.slice(0, 300);
  const hay = `${title}\n${lead}`;
  if (ROCKET_RX.test(hay)) return 'rocket';
  if (classify({ title, text: lead }).topics.some(t => EVENT_TOPICS.has(t)) || EVENT_RX.test(hay)) return 'event';
  return 'news';
}

/* ────────────────────────────── Place names ────────────────────────────── */

/** Countries each theatre's places can be in, as ISO codes for the lookup. */
export const THEATRE_COUNTRIES: Record<string, string[]> = {
  'russia-ukraine': ['ua', 'ru', 'by', 'md'],
  'israel-gaza-lebanon': ['ps', 'il', 'lb', 'sy', 'jo', 'eg'],
  'iran-gulf': ['ir', 'sa', 'ae', 'qa', 'bh', 'om', 'kw', 'iq'],
  'yemen-red-sea': ['ye', 'sa', 'er', 'dj', 'so', 'sd', 'eg'],
  'syria-iraq': ['sy', 'iq', 'tr', 'lb', 'jo'],
  'china-pacific': ['cn', 'tw', 'jp', 'ph', 'vn', 'hk', 'sg', 'my', 'id'],
  'korea': ['kp', 'kr'],
  'south-asia': ['in', 'pk', 'af', 'bd', 'np', 'lk'],
  'africa': ['sd', 'ss', 'so', 'et', 'er', 'ml', 'ne', 'bf', 'cd', 'ly', 'ng', 'ke', 'td', 'cf', 'mz', 'mw', 'zw', 'ug'],
  'americas': ['ve', 'co', 'mx', 'br', 'ar', 'cu', 'ht', 'pa', 'ec', 'pe'],
  'europe-nato': ['de', 'fr', 'pl', 'fi', 'ee', 'lv', 'lt', 'ro', 'md', 'rs', 'xk', 'hu', 'se', 'gb', 'be', 'nl', 'dk', 'no', 'it', 'es'],
  'us-policy': ['us'],
};

/*
 * Capitalised words that are not place names: sentence openers, titles,
 * institutions, demonyms, calendar words, and the facility nouns that follow a
 * place ("Findel Airport", "Kharkiv Region"). A phrase is cut at any of these,
 * so "Sumy Oblast Governor Oleh Hryhorov" yields "Sumy" and "Oleh Hryhorov".
 * Country names are here too: they are never a settlement, and a report that
 * names only its country keeps the country anchor it had before.
 */
const NOT_PLACES = new Set(`
  a an the this that these those it its he she they we i you his her their our there here
  after before during despite according among around amid last early late earlier later today yesterday
  tonight overnight meanwhile however also and but or for with from by as at in on of to into over under
  about against between while when where what who why how if not no all some several many more most other
  another first second third one two three pm
  monday tuesday wednesday thursday friday saturday sunday january february march april may june july
  august september october november december jan feb mar apr jun jul aug sep sept oct nov dec
  prime ministry foreign affairs defence defense army armed forces force air navy naval
  royal military government state department office council security assembly parliament senate congress duma
  court police agency authority service services guard guards corps brigade battalion division regiment
  group network news media times post report reports reported telegram truth social watch breaking update
  video footage photo photos map live urgent exclusive chronicles digest main points special operation
  region oblast governorate province district county city village town camp base airport port station
  complex strait strip sea gulf ocean river bay coast island islands east west north south eastern western northern
  atlantic pacific arctic mediterranean caribbean baltic
  southern central occupied greater upper lower
  israeli israelis palestinian palestinians russian russians ukrainian ukrainians iranian iranians american
  americans syrian lebanese yemeni saudi saudis arabia chinese european europeans western british french
  german italian turkish iraqi jordanian egyptian qatari emirati pakistani indian afghan korean japanese
  taiwanese polish belarusian algerian algerians danish dutch australian canadian african arab arabs persian
  persians kurdish nigerian nigerians malawian houthi houthis jewish muslim christian
  un us u.s uk eu nato idf irgc hamas hezbollah ansar allah ansarallah centcom pentagon kremlin white house
  cnn bbc afp reuters tass ria iaea unrwa osce x
  trump putin zelensky zelenskyy netanyahu biden lukashenko erdogan khamenei macron starmer xi jinping kim
  modi hegseth rubio vance araghchi vladimir volodymyr
  ukraine russia israel iran syria iraq lebanon yemen china taiwan japan india pakistan afghanistan turkey
  türkiye egypt jordan qatar oman bahrain italy france germany poland denmark greenland europe africa asia
  america mexico venezuela australia canada algeria belarus moldova finland sweden norway britain england
  palestine united states kingdom emirates nations republic
`.trim().split(/\s+/));

/*
 * Titles. The names after one belong to a person, or to something named for
 * a person — "Governor Oleh Hryhorov", "King Fahd Air Base" — never to a
 * place, so the rest of the run is skipped rather than looked up. ("King Fahd"
 * is also a neighbourhood of Mecca, 80 km from the air base in Ta'if.)
 */
const TITLES = new Set(`
  president minister governor mayor general brigadier colonel lieutenant commander chief secretary
  spokesperson spokesman ambassador envoy senator chancellor professor mr mrs ms dr
  king queen prince princess sheikh sheikha emir sultan imam ayatollah pope
`.trim().split(/\s+/));

/* A word of a place name: "Kharkiv", "Ta'if", "al-Mandeb", "Beit-Hanoun". */
const WORD = String.raw`(?:(?:al|el|ad|an|ar|as|ash|at|az|ed|ez|ul)-)?\p{Lu}[\p{L}\p{M}'’]*(?:-[\p{L}\p{M}'’]+)*`;
/* Particles that sit inside a name: "Deir al Balah", "Rostov on Don". */
const JOIN = String.raw`\s+(?:(?:al|el|de|del|da|di|la|le|bin|bint|ibn|abu|ben|am|on)\s+)?`;
const PHRASE_RX = new RegExp(`${WORD}(?:${JOIN}${WORD}){0,3}`, 'gu');
/* A place introduced as one: "in Kharkiv", "near the village of", "over Riyadh". */
const PREPOSITIONS = ['in', 'near', 'at', 'on', 'over', 'outside', 'around', 'across', 'into', 'toward', 'towards', 'from', 'within', 'inside', 'along', 'through'];
const LOCATIVE_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${[...PREPOSITIONS, 'hit', 'struck', 'targeted'].join('|')})\\s+(?:the\\s+)?$`, 'iu');
/*
 * "of" introduces a place only after a word for one, or after a bearing:
 * "the village of Tayasir", "northeast of Tubas". On its own it introduces
 * anything at all — "the path of Islamic Resistance", "the opening of the
 * Land of the Two Holy Mosques" — and "Resistance" and "Land" are both
 * settlements somewhere, so a bare "of" is not enough to trust a name.
 */
const OF_PLACE = String.raw`village|town|city|capital|port|district|suburb|neighbourhood|neighborhood|camp|outskirts|centre|center|province|governorate|oblast|region|island|emirate|republic|state|coast|border|out|north|south|east|west|north-?east|north-?west|south-?east|south-?west`;
const LOCATIVE_OF_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${OF_PLACE})\\s+of\\s+(?:the\\s+)?$`, 'iu');

const MAX_CANDIDATES = 3;

export interface PlaceCandidate {
  name: string;
  /** Introduced as a place: "in Sumy", "near the village of Tayasir". */
  locative: boolean;
}

const PARTICLE = /^(?:al|el|ad|an|ar|as|ash|at|az|ed|ez|ul)$/;

/** A word that cannot be part of a place name, even inside a capitalised run. */
function notPlaceWord(word: string): boolean {
  const bare = word.replace(/['’]s$/, '').replace(/['’]+$/, '');
  if (NOT_PLACES.has(bare.toLowerCase())) return true;
  if (/['’](?:re|m|ll|ve|d|t)$/i.test(word)) return true; // They're, I'm
  // "Shahed-type", "UK-led", "Palestinian-owned" are compounds, not names;
  // "al-Mandeb" and "Beit-Hanoun" are names.
  const parts = bare.split('-');
  return parts.slice(1).some((part, i) =>
    NOT_PLACES.has(parts[i].toLowerCase()) || (/^\p{Ll}/u.test(part) && !PARTICLE.test(parts[i].toLowerCase())));
}

/**
 * The place names a report mentions, those introduced as places ("in X",
 * "near X") first, then any other capitalised name, in reading order.
 */
export function placeCandidates(text: string): PlaceCandidate[] {
  const hay = text.slice(0, 600);
  const found: { name: string; locative: boolean; at: number }[] = [];

  let prevEnd = -1;
  let prevLocative = false;
  for (const m of hay.matchAll(PHRASE_RX)) {
    // "in Kharkiv, Sumy and Odesa": a name listed after a place is a place too.
    const listed = prevLocative && /^(?:\s*,\s*(?:and\s+)?|\s+and\s+)$/.test(hay.slice(prevEnd, m.index));
    /* Cut the phrase at every word that is not part of a place name. A run is
       locative when the text before the phrase says so, or when the word that
       cut it is a preposition: a sentence that opens "In Al-Bureij refugee
       camp" puts the capitalised "In" inside the phrase. */
    const before = hay.slice(Math.max(0, m.index! - 30), m.index);
    let runLocative: boolean = listed || LOCATIVE_BEFORE.test(before) || LOCATIVE_OF_BEFORE.test(before);
    let lastLocative = false;
    let run: string[] = [];
    const flush = () => {
      const name = run.join(' ').replace(/['’]s$/, '');
      if (name.length >= 3 && !/^[\p{Lu}.]{2,4}$/u.test(name)) found.push({ name, locative: runLocative, at: m.index! });
      if (run.length) {
        lastLocative = runLocative;
        runLocative = false;
      }
      run = [];
    };
    let afterTitle = false;
    for (const word of m[0].split(/\s+/)) {
      if (TITLES.has(word.toLowerCase())) { flush(); afterTitle = true; continue; }
      if (notPlaceWord(word)) {
        flush();
        afterTitle = false;
        if (PREPOSITIONS.includes(word.toLowerCase())) runLocative = true;
        continue;
      }
      if (afterTitle) continue;
      run.push(word.replace(/['’]+$/, ''));
      // "Luxembourg's Findel Airport": a possessive ends the name.
      if (/['’]s$/.test(word)) flush();
    }
    flush();
    prevEnd = m.index! + m[0].length;
    prevLocative = lastLocative;
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => Number(b.locative) - Number(a.locative) || a.at - b.at)
    .filter(f => {
      const key = f.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES)
    .map(({ name, locative }) => ({ name, locative }));
}

/* ───────────────────────────── The lookup ───────────────────────────── */

/** One Nominatim search row — only the fields we consume. */
export interface GeoRow {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  addresstype?: string;
  importance?: number;
}

/* How specific a result is: a village pins a report closer than a city. */
const SPECIFICITY: Record<string, number> = {
  hamlet: 3, village: 3, suburb: 3, quarter: 3, neighbourhood: 3, isolated_dwelling: 3, locality: 3,
  town: 2, city_district: 2, borough: 2,
  city: 1, municipality: 1,
};

/** Compare names loosely: case, accents and punctuation aside. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '');
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !['al', 'el', 'the'].includes(w));

/**
 * Whether a result is plausibly the place that was asked for. Spellings
 * differ — "Khan Younis" is "Khan Yunis" in OSM, "Ta'if" is "At Ta'if" — so a
 * shared word, or a shared four-letter start, is enough; a result that shares
 * nothing with the query is the search being creative.
 */
function sameName(query: string, found: string): boolean {
  const a = words(query);
  const b = words(found);
  return a.some(x => b.some(y => x === y || (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4))));
}

const REGION_TYPES = new Set(['state', 'region', 'province', 'county', 'district', 'state_district']);

export interface RowPick { row: GeoRow; specificity: number; precision: AlertPlace['precision'] }

/*
 * Nominatim importance a city needs before a name is trusted without "in" or
 * "near" in front of it. Worldwide the bar is higher: Pretoria (0.66) and
 * Ceuta (0.65) clear it, Independence, Missouri (0.57) — "the War of
 * Independence" — does not.
 */
const THEATRE_MIN_IMPORTANCE = 0.5;
const WORLD_MIN_IMPORTANCE = 0.6;

/**
 * The row to pin a name to. Nominatim ranks same-named places by prominence,
 * so the first acceptable row wins — "Kohat" is the Pakistani city before the
 * Indian hamlet — and a settlement beats a region of the same name.
 *
 * With `minImportance`, only a city or town at least that prominent is
 * trusted: for a name that was not introduced as a place, and for every
 * worldwide lookup, because a capitalised word — "Bank", "War", "Donald" — is
 * a village somewhere.
 */
export function pickRow(query: string, rows: GeoRow[], minImportance?: number): RowPick | null {
  let region: RowPick | null = null;
  for (const row of rows) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!row.lat || !row.lon || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!sameName(query, row.name || row.display_name || '')) continue;

    const type = row.addresstype || '';
    if (minImportance !== undefined) {
      if ((type === 'city' || type === 'town') && (row.importance ?? 0) >= minImportance) {
        return { row, specificity: SPECIFICITY[type], precision: 'settlement' };
      }
    } else if (type in SPECIFICITY) {
      return { row, specificity: SPECIFICITY[type], precision: 'settlement' };
    } else if (!region && REGION_TYPES.has(type)) {
      region = { row, specificity: 0, precision: 'region' };
    }
  }
  return region;
}

/**
 * Search one name through the app's single door to Nominatim, which holds the
 * request budget and the cache for every caller — see lib/nominatim.ts.
 * Resolves null when the lookup could not be made, so a caller can tell "not
 * on the map" from "could not ask".
 */
function search(name: string, countries: string[] | null, cacheOnly = false): Promise<GeoRow[] | null> {
  return nominatim<GeoRow[]>('search', {
    q: name,
    limit: '5',
    featureType: 'settlement',
    ...(countries ? { countrycodes: countries.join(',') } : {}),
  }, { cacheOnly });
}

/**
 * A lookup that may ask Nominatim at most `max` questions it does not already
 * know the answer to. Anything past that is answered from the cache or not at
 * all, so one refresh of a feed of a hundred reports cannot turn into a
 * hundred requests to somebody else's server. What went unasked this time is
 * asked on a later refresh, and once asked it is remembered for a month.
 */
export function budgetedLookup(max: number): (name: string, countries: string[] | null) => Promise<GeoRow[] | null> {
  let left = max;
  return async (name, countries) => {
    const known = await search(name, countries, true);
    if (known !== null) return known;
    if (left <= 0) return null;
    left--;
    return search(name, countries);
  };
}

/**
 * "Tayasir, Tubas, West Bank, Palestinian Territories" → "Tayasir, Tubas,
 * Palestinian Territories": the place, the first area it sits in, the
 * country. An area OSM only names in its own script ("Кременчуцька міська
 * громада") is skipped rather than shown to an English reader.
 */
function placeLabel(displayName: string): string {
  const parts = displayName.split(', ');
  if (parts.length <= 2) return parts.join(', ');
  const area = parts.slice(1, -1).find(part => /^[\p{Script=Latin}\p{N}\s'’.()-]+$/u.test(part));
  return [parts[0], area, parts[parts.length - 1]].filter(Boolean).join(', ');
}

/**
 * The place a report is about, or null when it names none that resolves.
 *
 * Also null when a lookup failed: the answer could be a better place than the
 * ones that did resolve ("Al-Bureij refugee camp", not "Gaza"), so the report
 * keeps its country anchor until the name can be asked again.
 *
 * `lookup` is injectable for tests; it defaults to the Nominatim search, which
 * goes through the app's shared budget. Pass `cachedOnly` for a report that may
 * be placed from names already known but must not spend a request of its own.
 */
export async function locateReport(
  title: string,
  text: string,
  lookup: (name: string, countries: string[] | null) => Promise<GeoRow[] | null> = search,
): Promise<AlertPlace | null> {
  const candidates = placeCandidates(`${title}\n${text}`);
  if (!candidates.length) return null;

  const countries = [...new Set(classify({ title, text }).theatres.flatMap(t => THEATRE_COUNTRIES[t] ?? []))];

  const passes: { countries: string[] | null; scope: 'theatre' | 'world' }[] = [
    ...(countries.length ? [{ countries, scope: 'theatre' as const }] : []),
    { countries: null, scope: 'world' },
  ];

  for (const pass of passes) {
    let best: { name: string; locative: boolean; pick: RowPick } | null = null;
    for (const { name, locative } of candidates) {
      const rows = await lookup(name, pass.countries);
      if (rows === null) return null;
      const minImportance = pass.scope === 'world' ? WORLD_MIN_IMPORTANCE : locative ? undefined : THEATRE_MIN_IMPORTANCE;
      const pick = pickRow(name, rows, minImportance);
      if (!pick) continue;
      /* A name introduced as a place ("in Sumy") always beats a capitalised
         word that is merely a city elsewhere. Among equals, a village beats
         the city it is "northeast of"; otherwise the earlier mention stands. */
      const better = !best
        || (locative && !best.locative)
        || (locative === best.locative && pick.specificity > best.pick.specificity);
      if (better) best = { name, locative, pick };
    }
    if (best) {
      const { row, precision } = best.pick;
      return {
        name: best.name,
        label: placeLabel(row.display_name || row.name || best.name),
        lat: Number(row.lat),
        lng: Number(row.lon),
        precision,
      };
    }
  }
  return null;
}

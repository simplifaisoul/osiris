/**
 * OSIRIS — the built-in place list: towns, countries and regions, looked up
 * without asking any outside service.
 *
 * public/places.json comes from GeoNames (CC BY 4.0) through
 * tools/build-places.mjs: every town of 5,000 people or more, every country
 * and every first-level region. It names the point under the cursor, the
 * place a dossier is about and the town a news report names, and place search
 * falls back to it when Wikipedia cannot answer (see lib/geosearch.ts).
 *
 * The browser loads it on first use (loadPlaces); the server reads it from
 * disk (lib/places-server.ts). Everything else here is plain lookups.
 */

type Row = [name: string, lat: number, lng: number, cc: string, region: string, population: number];

export interface PlaceList {
  countries: Record<string, string>;
  regions: Record<string, string>;
  places: [...Row, capital: number][];
  areas: [...Row, kind: 'country' | 'region'][];
}

export interface Place {
  name: string;
  /** The name folded for matching: lower case, no accents or apostrophes. */
  key: string;
  lat: number;
  lng: number;
  countryCode: string;
  country: string;
  /** The first-level region it is in (a state, province or oblast), or itself for a region. */
  region: string;
  /** People living there; for a country or region, in its towns on the list. */
  population: number;
  kind: 'city' | 'region' | 'country';
  capital: boolean;
}

export interface PlaceIndex {
  /** Countries and regions, then towns; each largest first. */
  all: Place[];
  towns: Place[];
  byKey: Map<string, Place[]>;
}

/** Compare names loosely: case, accents and apostrophes aside. */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '').trim();

export function indexPlaces(list: PlaceList): PlaceIndex {
  const country = (cc: string) => list.countries[cc] || '';
  const towns: Place[] = list.places.map(([name, lat, lng, cc, a1, population, capital]) => ({
    name, key: fold(name), lat, lng, countryCode: cc, country: country(cc),
    region: (a1 && list.regions[`${cc}.${a1}`]) || '', population, kind: 'city', capital: capital === 1,
  }));
  const areas: Place[] = list.areas.map(([name, lat, lng, cc, , population, kind]) => ({
    name, key: fold(name), lat, lng, countryCode: cc, country: country(cc),
    region: kind === 'region' ? name : '', population, kind, capital: false,
  }));
  const all = [...areas, ...towns];
  const byKey = new Map<string, Place[]>();
  for (const p of all) {
    const same = byKey.get(p.key);
    if (same) same.push(p); else byKey.set(p.key, [p]);
  }
  return { all, towns, byKey };
}

/** Of two places with the same name, a country, then a city, then a region: "Lisbon" is the city, not its district. */
const KIND_ORDER: Record<Place['kind'], number> = { country: 0, city: 1, region: 2 };

/**
 * Places whose name starts with what was typed, or has a word that does.
 * An exact name leads, then a name that starts so, then a word inside one;
 * among equals the larger place wins, so "par" is Paris before Parma.
 */
export function searchIndex(index: PlaceIndex, q: string, limit = 8): Place[] {
  const f = fold(q);
  if (f.length < 2) return [];
  const found: { p: Place; rank: number }[] = [];
  for (const p of index.all) {
    const rank = p.key === f ? 0 : p.key.startsWith(f) ? 1 : p.key.includes(` ${f}`) || p.key.includes(`-${f}`) ? 2 : -1;
    if (rank >= 0) found.push({ p, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank
      || (a.p.key === b.p.key ? KIND_ORDER[a.p.kind] - KIND_ORDER[b.p.kind] : 0)
      || b.p.population - a.p.population)
    .slice(0, limit)
    .map(({ p }) => p);
}

/**
 * The town a point is in, within `maxKm`; null in open sea or empty land.
 * The list holds city districts as well as cities, so the nearest is not
 * always the answer: distance is weighed against size (divided by the cube
 * root of the population). A point in central Paris is Paris, not its 4th
 * arrondissement, and a point in a suburb is still the suburb.
 */
export function nearestTown(index: PlaceIndex, lat: number, lng: number, maxKm = 50): Place | null {
  const band = maxKm / 111;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best: Place | null = null;
  let bestScore = Infinity;
  for (const t of index.towns) {
    const dLat = t.lat - lat;
    if (dLat > band || dLat < -band) continue;
    let dLng = t.lng - lng;
    if (dLng > 180) dLng -= 360;
    else if (dLng < -180) dLng += 360;
    const km = 111.2 * Math.hypot(dLat, dLng * cosLat);
    if (km > maxKm) continue;
    const score = km / Math.cbrt(Math.max(1, t.population));
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/** Places with exactly this name (loosely compared), in any of `countries` when given, largest first. */
export function placesNamed(index: PlaceIndex, name: string, countries?: string[] | null): Place[] {
  const all = index.byKey.get(fold(name)) ?? [];
  const wanted = countries?.length ? new Set(countries.map((c) => c.toUpperCase())) : null;
  return all.filter((p) => !wanted || wanted.has(p.countryCode)).sort((a, b) => b.population - a.population);
}

/** "Town, Region, Country", without saying a city-state twice. */
export function placeLabel(p: Pick<Place, 'name' | 'region' | 'country'>): string {
  return [...new Set([p.name, p.region, p.country].filter(Boolean))].join(', ');
}

let loading: Promise<PlaceIndex> | null = null;

/** The list in the browser: fetched once, on first use. A failed fetch is tried again next time. */
export function loadPlaces(): Promise<PlaceIndex> {
  loading ??= fetch('/places.json')
    .then((res) => {
      if (!res.ok) throw new Error(`places.json HTTP ${res.status}`);
      return res.json() as Promise<PlaceList>;
    })
    .then(indexPlaces)
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

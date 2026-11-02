import { describe, it, expect, vi, afterEach } from 'vitest';
import { classifyKind, normalizePhoton, normalizeNominatim, mergeResults, searchPlaces, type GeoResult } from './geosearch';

describe('classifyKind', () => {
  it('separates the kinds the UI gives distinct icons', () => {
    expect(classifyKind('place', 'country')).toBe('country');
    expect(classifyKind('place', 'state')).toBe('region');
    expect(classifyKind('place', 'city')).toBe('city');
    expect(classifyKind('highway', 'residential')).toBe('street');
    expect(classifyKind('building', 'yes')).toBe('address');
    expect(classifyKind('tourism', 'attraction')).toBe('poi');
    expect(classifyKind('man_made', 'tower')).toBe('poi');
  });

  it('falls back to a generic place', () => {
    expect(classifyKind(undefined, undefined)).toBe('place');
    expect(classifyKind('something_odd', 'x')).toBe('place');
  });
});

describe('normalizePhoton', () => {
  const eiffel = {
    geometry: { coordinates: [2.2945, 48.8584] as [number, number] },
    properties: {
      name: 'Eiffel Tower', street: 'Avenue Anatole France', housenumber: '5',
      city: 'Paris', state: 'Île-de-France', country: 'France',
      osm_key: 'man_made', osm_value: 'tower',
    },
  };

  it('maps a POI, putting the street into the context line', () => {
    expect(normalizePhoton(eiffel)).toEqual({
      name: 'Eiffel Tower',
      context: 'Avenue Anatole France 5, Paris, Île-de-France',
      lat: 48.8584,
      lng: 2.2945,
      kind: 'poi',
      source: 'photon',
    });
  });

  it('uses the street as the name when a feature has none', () => {
    const addr = {
      geometry: { coordinates: [13.3777, 52.5163] as [number, number] },
      properties: { street: 'Pariser Platz', housenumber: '1', city: 'Berlin', osm_key: 'building' },
    };
    expect(normalizePhoton(addr)?.name).toBe('Pariser Platz 1');
  });

  it('rejects features without usable geometry', () => {
    expect(normalizePhoton({ properties: { name: 'X' } })).toBeNull();
    expect(normalizePhoton({ geometry: { coordinates: [2.29] as unknown as [number, number] }, properties: {} })).toBeNull();
  });
});

describe('normalizeNominatim', () => {
  it('splits display_name into a name and a context line', () => {
    const r = normalizeNominatim({
      display_name: 'Brandenburger Tor, 1, Pariser Platz, Mitte, Berlin, Germany',
      lat: '52.5163', lon: '13.3777', class: 'tourism', type: 'attraction',
    })!;
    expect(r.name).toBe('Brandenburger Tor');
    expect(r.context).toBe('1, Pariser Platz, Mitte');
    expect(r.kind).toBe('poi');
    expect(r.source).toBe('nominatim');
  });

  it('rejects rows without coordinates', () => {
    expect(normalizeNominatim({ display_name: 'X' })).toBeNull();
  });
});

describe('mergeResults', () => {
  const hit = (name: string, lat: number, lng: number, source: 'photon' | 'nominatim' = 'photon'): GeoResult =>
    ({ name, context: '', lat, lng, kind: 'poi', source });

  it('keeps the primary provider first', () => {
    const merged = mergeResults([hit('A', 1, 1)], [hit('B', 2, 2, 'nominatim')]);
    expect(merged.map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('drops a duplicate that both providers returned', () => {
    // same name, ~50 m apart — one place, two indexes
    const merged = mergeResults([hit('Eiffel Tower', 48.8584, 2.2945)],
      [hit('eiffel tower', 48.85845, 2.29455, 'nominatim')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('photon');
  });

  it('keeps same-named places that are genuinely far apart', () => {
    // Paris, France vs Paris, Texas
    const merged = mergeResults([hit('Paris', 48.8566, 2.3522)],
      [hit('Paris', 33.6609, -95.5555, 'nominatim')]);
    expect(merged).toHaveLength(2);
  });

  // "heathrow": Photon ranks the Florida town first, Nominatim scores the
  // London airport 0.606 against the town's 0.352.
  it('promotes a globally prominent hit above the primary ordering', () => {
    const florida = hit('Heathrow', 28.76, -81.37);
    const airport: GeoResult = {
      name: 'London Heathrow Airport', context: 'London', lat: 51.47, lng: -0.454,
      kind: 'poi', source: 'nominatim', score: 0.606,
    };
    expect(mergeResults([florida], [airport])[0].name).toBe('London Heathrow Airport');
  });

  it('leaves ordering alone when nothing clears the prominence bar', () => {
    const a = hit('A', 1, 1);
    const weak: GeoResult = { name: 'B', context: '', lat: 2, lng: 2, kind: 'poi', source: 'nominatim', score: 0.31 };
    expect(mergeResults([a], [weak]).map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('respects the result limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => hit(`P${i}`, i, i));
    expect(mergeResults(many, [], 8)).toHaveLength(8);
  });
});

describe('searchPlaces', () => {
  const feature = (name: string, lng: number, lat: number) =>
    ({ geometry: { coordinates: [lng, lat] }, properties: { name, osm_key: 'place', osm_value: 'city' } });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  afterEach(() => vi.unstubAllGlobals());

  it('asks Photon from the browser and stops there when it has enough', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      json({ features: [feature('London', -0.13, 51.51), feature('London', -81.25, 42.98), feature('Londonderry', -7.31, 54.99)] }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPlaces('london', { lat: 51.5, lng: -0.1 });

    expect(results.map((r) => r.name)).toEqual(['London', 'London', 'Londonderry']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/photon\.komoot\.io\/api\/\?q=london.*&lat=51\.5&lon=-0\.1$/);
  });

  it('falls back to our route when Photon is unreachable', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://photon')) throw new TypeError('Failed to fetch');
      return json({ results: [{ name: 'Sumy', context: 'Ukraine', lat: 50.9, lng: 34.8, kind: 'city', source: 'nominatim' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPlaces('sumy');

    expect(results.map((r) => r.name)).toEqual(['Sumy']);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/geosearch?q=sumy');
  });

  it('shows a thin Photon answer at once, then merges the supplement', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('https://photon')
      ? json({ features: [feature('Heathrow', -81.37, 28.76)] })
      : json({ results: [{ name: 'London Heathrow Airport', context: 'London', lat: 51.47, lng: -0.454, kind: 'poi', source: 'nominatim', score: 0.606 }] })));
    const partial = vi.fn();

    const results = await searchPlaces('heathrow', null, undefined, partial);

    expect(partial).toHaveBeenCalledWith([expect.objectContaining({ name: 'Heathrow' })]);
    expect(results.map((r) => r.name)).toEqual(['London Heathrow Airport', 'Heathrow']);
  });

  it('gives up on Photon after its timeout instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.startsWith('https://photon')
        ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
        : Promise.resolve(json({ results: [] }))));

      const pending = searchPlaces('nowhere');
      await vi.advanceTimersByTimeAsync(5_000);

      expect(await pending).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when the search is superseded, so it never overwrites a newer one', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));

    const pending = searchPlaces('par', null, ctrl.signal);
    ctrl.abort();

    await expect(pending).rejects.toThrow();
  });
});

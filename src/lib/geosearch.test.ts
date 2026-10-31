import { describe, it, expect, vi, afterEach } from 'vitest';
import { biasOf, classifyKind, normalizePhoton, searchPlaces } from './geosearch';

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

describe('biasOf', () => {
  it('rounds where the map is looking to a tenth of a degree, so answers can be shared', () => {
    expect(biasOf({ lat: 41.230154255243164, lng: -72.86821861538982 })).toEqual({ lat: 41.2, lng: -72.9 });
  });

  it('drops a bias it cannot use', () => {
    expect(biasOf(null)).toBeNull();
    expect(biasOf({ lat: NaN, lng: 1 })).toBeNull();
    expect(biasOf({ lat: 91, lng: 1 })).toBeNull();
  });
});

describe('searchPlaces', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  afterEach(() => vi.unstubAllGlobals());

  it('asks our own route, never a geocoder, with a rounded bias', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      json({ results: [{ name: 'London', context: 'England, United Kingdom', lat: 51.51, lng: -0.13, kind: 'city' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPlaces('london', { lat: 51.5072, lng: -0.1276 });

    expect(results.map((r) => r.name)).toEqual(['London']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/geosearch?q=london&lat=51.5&lng=-0.1');
  });

  it('answers an empty list when the route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await searchPlaces('sumy')).toEqual([]);
  });

  it('gives up after its timeout instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));

      const pending = searchPlaces('nowhere');
      await vi.advanceTimersByTimeAsync(8_000);

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

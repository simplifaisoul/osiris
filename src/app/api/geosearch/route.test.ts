import { describe, it, expect } from 'vitest';
import { classifyKind, normalizePhoton, normalizeNominatim, mergeResults, type GeoResult } from './route';

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

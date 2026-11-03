import { describe, it, expect } from 'vitest';
import { indexPlaces, searchIndex, nearestTown, placesNamed, placeLabel, fold, type PlaceList } from './places';
import { serverPlaces } from './places-server';

const list: PlaceList = {
  countries: { FR: 'France', IT: 'Italy', US: 'United States', SG: 'Singapore' },
  regions: { 'FR.11': 'Île-de-France', 'IT.05': 'Emilia-Romagna', 'US.TX': 'Texas' },
  places: [
    ['Paris', 48.853, 2.349, 'FR', '11', 2_138_551, 1],
    ['Singapore', 1.29, 103.85, 'SG', '', 5_638_700, 1],
    ['Parma', 44.801, 10.328, 'IT', '05', 175_895, 0],
    ['Pantin', 48.894, 2.409, 'FR', '11', 54_831, 0],
    ['Paris', 33.661, -95.556, 'US', 'TX', 24_782, 0],
    ['Saint-Denis', 48.936, 2.358, 'FR', '11', 111_135, 0],
  ],
  areas: [
    ['France', 47.2, 2.75, 'FR', '', 41_907_946, 'country'],
    ['Texas', 31.1, -97.6, 'US', 'TX', 20_000_000, 'region'],
  ],
};
const index = indexPlaces(list);

describe('fold', () => {
  it('compares names without case, accents or apostrophes', () => {
    expect(fold("Île-de-France")).toBe('ile-de-france');
    expect(fold("Ta'if")).toBe('taif');
  });
});

describe('searchIndex', () => {
  it('puts the larger place first among names that start the same', () => {
    expect(searchIndex(index, 'par').map(p => `${p.name} ${p.countryCode}`)).toEqual(['Paris FR', 'Parma IT', 'Paris US']);
  });

  it('lets an exact name lead a longer one', () => {
    expect(searchIndex(index, 'paris')[0].countryCode).toBe('FR');
  });

  it('finds a word inside a name, and countries and regions too', () => {
    expect(searchIndex(index, 'denis').map(p => p.name)).toEqual(['Saint-Denis']);
    expect(searchIndex(index, 'fra')[0]).toMatchObject({ name: 'France', kind: 'country' });
    expect(searchIndex(index, 'tex')[0]).toMatchObject({ name: 'Texas', kind: 'region' });
  });

  it('needs two letters', () => {
    expect(searchIndex(index, 'p')).toEqual([]);
  });
});

describe('nearestTown', () => {
  it('names the town a point is in', () => {
    expect(nearestTown(index, 48.857, 2.352)?.name).toBe('Paris');
    expect(nearestTown(index, 48.9, 2.41)?.name).toBe('Pantin');
  });

  it('names nothing far from any town', () => {
    expect(nearestTown(index, 0, -30)).toBeNull();
  });

  it('measures across the antimeridian', () => {
    // A town just west of 180°, and a point 15 km away just east of it.
    const fiji = indexPlaces({ countries: {}, regions: {}, areas: [], places: [['Rabi', -16.5, 179.95, 'FJ', '', 6_000, 0]] });
    expect(nearestTown(fiji, -16.5, -179.91)?.name).toBe('Rabi');
  });

  it('names the city for a point inside it, not the district the point is in', () => {
    const city = indexPlaces({ countries: {}, regions: {}, areas: [], places: [
      ['Paris', 48.853, 2.349, 'FR', '11', 2_138_551, 1],
      ['Paris 04 Hôtel-de-Ville', 48.856, 2.355, 'FR', '11', 28_088, 0],
    ] });
    expect(nearestTown(city, 48.8566, 2.3522)?.name).toBe('Paris');
  });
});

describe('placesNamed and placeLabel', () => {
  it('finds every place of a name, in the countries asked, largest first', () => {
    expect(placesNamed(index, 'paris').map(p => p.countryCode)).toEqual(['FR', 'US']);
    expect(placesNamed(index, 'Paris', ['us']).map(p => p.region)).toEqual(['Texas']);
  });

  it('says a city-state once', () => {
    expect(placeLabel(placesNamed(index, 'Singapore')[0])).toBe('Singapore');
    expect(placeLabel(placesNamed(index, 'Pantin')[0])).toBe('Pantin, Île-de-France, France');
  });
});

describe('the list OSIRIS ships', () => {
  const real = serverPlaces();

  it('holds towns, countries and regions', () => {
    expect(real.towns.length).toBeGreaterThan(50_000);
    expect(real.all.filter(p => p.kind === 'country').length).toBeGreaterThan(200);
  });

  it('answers the lookups the app makes', () => {
    expect(searchIndex(real, 'lisb')[0]).toMatchObject({ name: 'Lisbon', countryCode: 'PT' });
    expect(nearestTown(real, 51.5074, -0.1278)?.country).toBe('United Kingdom');
    expect(placesNamed(real, 'Sumy', ['ua'])[0]?.country).toBe('Ukraine');
  });
});

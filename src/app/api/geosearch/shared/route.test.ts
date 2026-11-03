import { describe, it, expect, vi, beforeEach } from 'vitest';

const geocoder = vi.fn();
const geocoderConfigured = vi.fn();
const sharedSearch = vi.fn();
vi.mock('@/lib/geocoder', () => ({
  geocoder: (...args: unknown[]) => geocoder(...args),
  geocoderConfigured: () => geocoderConfigured(),
  sharedSearch: (...args: unknown[]) => sharedSearch(...args),
  sharedSearchConfigured: () => true,
}));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch/shared?${query}`));

describe('GET /api/geosearch/shared', () => {
  beforeEach(() => {
    geocoder.mockReset();
    sharedSearch.mockReset();
    geocoderConfigured.mockReset().mockReturnValue(true);
  });

  it('answers from this deployment’s own geocoder, with the bias', async () => {
    geocoder.mockResolvedValue({ features: [{ geometry: { coordinates: [-9.14, 38.72] }, properties: { name: 'Lisbon', country: 'Portugal', osm_key: 'place', osm_value: 'city' } }] });

    const res = await ask('q=lisbon&lat=38.7&lng=-9.1');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([{ name: 'Lisbon', context: 'Portugal', lat: 38.72, lng: -9.14, kind: 'city' }]);
    expect(geocoder).toHaveBeenCalledWith({ q: 'lisbon', limit: '8', lat: '38.7', lon: '-9.1' });
  });

  it('never asks anywhere else, and passes on only the query and the bias', async () => {
    geocoderConfigured.mockReturnValue(false);
    expect((await ask('q=lisbon')).status).toBe(501);

    geocoderConfigured.mockReturnValue(true);
    geocoder.mockResolvedValue({ features: [] });
    await ask('q=lisbon&source=elsewhere');

    expect(sharedSearch).not.toHaveBeenCalled();
    expect(geocoder).toHaveBeenCalledWith({ q: 'lisbon', limit: '8' });
  });
});

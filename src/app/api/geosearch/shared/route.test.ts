import { describe, it, expect, vi, beforeEach } from 'vitest';

const photon = vi.fn();
const photonConfigured = vi.fn();
const sharedSearch = vi.fn();
vi.mock('@/lib/photon', () => ({
  photon: (...args: unknown[]) => photon(...args),
  photonConfigured: () => photonConfigured(),
  sharedSearch: (...args: unknown[]) => sharedSearch(...args),
  sharedSearchConfigured: () => true,
}));

const nominatim = vi.fn();
vi.mock('@/lib/nominatim', () => ({
  nominatim: (...args: unknown[]) => nominatim(...args),
  nominatimConfigured: () => true,
}));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch/shared?${query}`));

describe('GET /api/geosearch/shared', () => {
  beforeEach(() => {
    photon.mockReset();
    sharedSearch.mockReset();
    nominatim.mockReset();
    photonConfigured.mockReset().mockReturnValue(true);
  });

  it('answers from this deployment’s own geocoder, with the bias', async () => {
    photon.mockResolvedValue({ features: [{ geometry: { coordinates: [-9.14, 38.72] }, properties: { name: 'Lisbon', country: 'Portugal', osm_key: 'place', osm_value: 'city' } }] });

    const res = await ask('q=lisbon&lat=38.7&lng=-9.1');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([{ name: 'Lisbon', context: 'Portugal', lat: 38.72, lng: -9.14, kind: 'city' }]);
    expect(photon).toHaveBeenCalledWith({ q: 'lisbon', limit: '8', lat: '38.7', lon: '-9.1' });
  });

  it('never asks anywhere else: not another shared search, not Nominatim', async () => {
    photonConfigured.mockReturnValue(false);
    expect((await ask('q=lisbon')).status).toBe(501);

    photonConfigured.mockReturnValue(true);
    photon.mockResolvedValue({ features: [] });
    await ask('q=lisbon&source=nominatim');

    expect(sharedSearch).not.toHaveBeenCalled();
    expect(nominatim).not.toHaveBeenCalled();
  });
});

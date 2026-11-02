import { describe, it, expect, vi, beforeEach } from 'vitest';

const photon = vi.fn();
const photonConfigured = vi.fn();
vi.mock('@/lib/photon', () => ({
  photon: (...args: unknown[]) => photon(...args),
  photonConfigured: () => photonConfigured(),
}));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch?${query}`));
const city = (name: string, lng: number, lat: number) =>
  ({ geometry: { coordinates: [lng, lat] }, properties: { name, country: 'Ukraine', osm_key: 'place', osm_value: 'city' } });

describe('GET /api/geosearch', () => {
  beforeEach(() => {
    photon.mockReset();
    photonConfigured.mockReset().mockReturnValue(true);
  });

  it('answers from the geocoder and lets the edge cache a real answer', async () => {
    photon.mockResolvedValue({ features: [city('Sumy', 34.8, 50.9)] });

    const res = await ask('q=sumy');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([{ name: 'Sumy', context: 'Ukraine', lat: 50.9, lng: 34.8, kind: 'city' }]);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=600');
  });

  it('passes the bias on, rounded, so nearby views share an answer', async () => {
    photon.mockResolvedValue({ features: [city('Lviv', 24.03, 49.84)] });

    await ask('q=lviv&lat=49.8412&lng=24.0311');

    expect(photon).toHaveBeenCalledWith({ q: 'lviv', limit: '8', lat: '49.8', lon: '24' });
  });

  it('says so, without asking anything, when the deployment has no geocoder', async () => {
    photonConfigured.mockReturnValue(false);

    const res = await ask('q=kharkiv');

    expect(res.status).toBe(501);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(photon).not.toHaveBeenCalled();
  });

  it('tells a failed or refused lookup apart from no matches, and never lets it be kept', async () => {
    photon.mockResolvedValueOnce(null).mockResolvedValueOnce({ features: [] });

    const failed = await ask('q=odesa');
    const none = await ask('q=xqzzy');

    expect(failed.status).toBe(503);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
    expect(none.status).toBe(200);
    expect((await none.json()).results).toEqual([]);
  });
});

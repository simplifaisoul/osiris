import { describe, it, expect, vi, beforeEach } from 'vitest';

const geocoder = vi.fn();
const geocoderConfigured = vi.fn();
const sharedSearch = vi.fn();
const sharedSearchConfigured = vi.fn();
vi.mock('@/lib/geocoder', () => ({
  geocoder: (...args: unknown[]) => geocoder(...args),
  geocoderConfigured: () => geocoderConfigured(),
  sharedSearch: (...args: unknown[]) => sharedSearch(...args),
  sharedSearchConfigured: () => sharedSearchConfigured(),
}));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch?${query}`));
const city = (name: string, lng: number, lat: number) =>
  ({ geometry: { coordinates: [lng, lat] }, properties: { name, country: 'Ukraine', osm_key: 'place', osm_value: 'city' } });

describe('GET /api/geosearch', () => {
  beforeEach(() => {
    geocoder.mockReset();
    geocoderConfigured.mockReset().mockReturnValue(true);
    sharedSearch.mockReset();
    sharedSearchConfigured.mockReset().mockReturnValue(true);
  });

  it('answers from the geocoder and lets the edge cache a real answer', async () => {
    geocoder.mockResolvedValue({ features: [city('Sumy', 34.8, 50.9)] });

    const res = await ask('q=sumy');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([{ name: 'Sumy', context: 'Ukraine', lat: 50.9, lng: 34.8, kind: 'city' }]);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=600');
  });

  it('passes the bias on, rounded, so nearby views share an answer', async () => {
    geocoder.mockResolvedValue({ features: [city('Lviv', 24.03, 49.84)] });

    await ask('q=lviv&lat=49.8412&lng=24.0311');

    expect(geocoder).toHaveBeenCalledWith({ q: 'lviv', limit: '8', lat: '49.8', lon: '24' });
  });

  it('asks the shared search, with the rounded bias, when this copy has no geocoder', async () => {
    geocoderConfigured.mockReturnValue(false);
    const lviv = { name: 'Lviv', context: 'Ukraine', lat: 49.84, lng: 24.03, kind: 'city' };
    sharedSearch.mockResolvedValue({ results: [lviv, { name: 'broken', lat: 'x' }] });

    const res = await ask('q=lviv&lat=49.8412&lng=24.0311');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([lviv]);
    expect(sharedSearch).toHaveBeenCalledWith({ q: 'lviv', lat: '49.8', lng: '24' });
    expect(geocoder).not.toHaveBeenCalled();
  });

  it('tells a shared search that did not answer apart, and never lets it be kept', async () => {
    geocoderConfigured.mockReturnValue(false);
    sharedSearch.mockResolvedValue(null);

    const res = await ask('q=kharkiv');

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('says so, without asking anything, when there is no geocoder and the shared search is off', async () => {
    geocoderConfigured.mockReturnValue(false);
    sharedSearchConfigured.mockReturnValue(false);

    const res = await ask('q=kharkiv');

    expect(res.status).toBe(501);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(geocoder).not.toHaveBeenCalled();
    expect(sharedSearch).not.toHaveBeenCalled();
  });

  it('tells a failed or refused lookup apart from no matches, and never lets it be kept', async () => {
    geocoder.mockResolvedValueOnce(null).mockResolvedValueOnce({ features: [] });

    const failed = await ask('q=odesa');
    const none = await ask('q=xqzzy');

    expect(failed.status).toBe(503);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
    expect(none.status).toBe(200);
    expect((await none.json()).results).toEqual([]);
  });
});

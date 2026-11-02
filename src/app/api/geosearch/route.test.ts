import { describe, it, expect, vi, beforeEach } from 'vitest';

const photon = vi.fn();
vi.mock('@/lib/photon', () => ({ photon: (...args: unknown[]) => photon(...args) }));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch?${query}`));
const city = (name: string, lng: number, lat: number) =>
  ({ geometry: { coordinates: [lng, lat] }, properties: { name, country: 'Ukraine', osm_key: 'place', osm_value: 'city' } });

describe('GET /api/geosearch', () => {
  beforeEach(() => photon.mockReset());

  it('answers from the geocoder and lets the edge cache a real answer', async () => {
    photon.mockResolvedValue({ features: [city('Sumy', 34.8, 50.9)] });

    const res = await ask('q=sumy');

    expect((await res.json()).results.map((r: { name: string }) => r.name)).toEqual(['Sumy']);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=600');
  });

  it('passes the bias on, rounded, so nearby views share an answer', async () => {
    photon.mockResolvedValue({ features: [city('Lviv', 24.03, 49.84)] });

    await ask('q=lviv&lat=49.8412&lng=24.0311');

    expect(photon).toHaveBeenCalledWith('api', { q: 'lviv', limit: '8', lat: '49.8', lon: '24' });
  });

  it('never lets a browser or the edge keep an empty answer', async () => {
    photon.mockResolvedValue(null); // no geocoder, queue full, or the lookup failed

    const res = await ask('q=kharkiv');

    expect((await res.json()).results).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks again after an empty answer instead of remembering it', async () => {
    photon.mockResolvedValueOnce(null).mockResolvedValueOnce({ features: [city('Odesa', 30.72, 46.48)] });

    await ask('q=odesa');
    const res = await ask('q=odesa');

    expect((await res.json()).results.map((r: { name: string }) => r.name)).toEqual(['Odesa']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const photon = vi.fn();
const photonConfigured = vi.fn();
const sharedSearch = vi.fn();
const sharedSearchConfigured = vi.fn();
vi.mock('@/lib/photon', () => ({
  photon: (...args: unknown[]) => photon(...args),
  photonConfigured: () => photonConfigured(),
  sharedSearch: (...args: unknown[]) => sharedSearch(...args),
  sharedSearchConfigured: () => sharedSearchConfigured(),
}));

const nominatim = vi.fn();
const nominatimConfigured = vi.fn();
vi.mock('@/lib/nominatim', () => ({
  nominatim: (...args: unknown[]) => nominatim(...args),
  nominatimConfigured: () => nominatimConfigured(),
}));

import { GET } from './route';

const ask = (query: string) => GET(new Request(`https://osiris.test/api/geosearch?${query}`));
const city = (name: string, lng: number, lat: number) =>
  ({ geometry: { coordinates: [lng, lat] }, properties: { name, country: 'Ukraine', osm_key: 'place', osm_value: 'city' } });

describe('GET /api/geosearch', () => {
  beforeEach(() => {
    photon.mockReset();
    photonConfigured.mockReset().mockReturnValue(true);
    sharedSearch.mockReset();
    sharedSearchConfigured.mockReset().mockReturnValue(true);
    nominatim.mockReset();
    nominatimConfigured.mockReset().mockReturnValue(false);
  });

  describe('the Nominatim backup', () => {
    beforeEach(() => nominatimConfigured.mockReturnValue(true));

    it('says on every answer whether it is on, so the search box knows to offer it', async () => {
      photon.mockResolvedValue({ features: [] });
      expect((await ask('q=sumy')).headers.get('X-OSIRIS-Nominatim')).toBe('on');

      nominatimConfigured.mockReturnValue(false);
      photonConfigured.mockReturnValue(false);
      expect((await ask('q=sumy')).headers.get('X-OSIRIS-Nominatim')).toBe('off');
    });

    it('is never asked while someone types, even when it is on', async () => {
      photon.mockResolvedValue({ features: [] });
      await ask('q=12%20rue%20de%20rivoli');
      photonConfigured.mockReturnValue(false);
      await ask('q=12%20rue%20de%20rivoli');
      expect(nominatim).not.toHaveBeenCalled();
    });

    it('answers when chosen, from Nominatim alone', async () => {
      nominatim.mockResolvedValue([{ name: '', display_name: '12, Rue de Rivoli, Paris, France', lat: '48.8556', lon: '2.3589', category: 'place', type: 'house' }]);

      const res = await ask('source=nominatim&q=12%20rue%20de%20rivoli');

      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([{ name: '12 Rue de Rivoli', context: 'Paris, France', lat: 48.8556, lng: 2.3589, kind: 'address' }]);
      expect(nominatim).toHaveBeenCalledWith({ q: '12 rue de rivoli', limit: '8' });
      expect(photon).not.toHaveBeenCalled();
    });

    it('says so, without asking, when the operator has not turned it on', async () => {
      nominatimConfigured.mockReturnValue(false);
      const res = await ask('source=nominatim&q=paris');
      expect(res.status).toBe(501);
      expect(nominatim).not.toHaveBeenCalled();
    });

    it('tells a failed or refused lookup apart, and never lets it be kept', async () => {
      nominatim.mockResolvedValue(null);
      const res = await ask('source=nominatim&q=paris');
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
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

  it('asks the shared search, with the rounded bias, when this copy has no geocoder', async () => {
    photonConfigured.mockReturnValue(false);
    const lviv = { name: 'Lviv', context: 'Ukraine', lat: 49.84, lng: 24.03, kind: 'city' };
    sharedSearch.mockResolvedValue({ results: [lviv, { name: 'broken', lat: 'x' }] });

    const res = await ask('q=lviv&lat=49.8412&lng=24.0311');

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([lviv]);
    expect(sharedSearch).toHaveBeenCalledWith({ q: 'lviv', lat: '49.8', lng: '24' });
    expect(photon).not.toHaveBeenCalled();
  });

  it('tells a shared search that did not answer apart, and never lets it be kept', async () => {
    photonConfigured.mockReturnValue(false);
    sharedSearch.mockResolvedValue(null);

    const res = await ask('q=kharkiv');

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('says so, without asking anything, when there is no geocoder and the shared search is off', async () => {
    photonConfigured.mockReturnValue(false);
    sharedSearchConfigured.mockReturnValue(false);

    const res = await ask('q=kharkiv');

    expect(res.status).toBe(501);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(photon).not.toHaveBeenCalled();
    expect(sharedSearch).not.toHaveBeenCalled();
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

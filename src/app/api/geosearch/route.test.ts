import { describe, it, expect, vi, beforeEach } from 'vitest';

const nominatim = vi.fn();
vi.mock('@/lib/nominatim', () => ({ nominatim: (...args: unknown[]) => nominatim(...args) }));

import { GET } from './route';

const ask = (q: string) => GET(new Request(`https://osiris.test/api/geosearch?q=${encodeURIComponent(q)}`));

describe('GET /api/geosearch', () => {
  beforeEach(() => nominatim.mockReset());

  it('answers from Nominatim and lets the edge cache a real answer', async () => {
    nominatim.mockResolvedValue([{ name: 'Sumy', display_name: 'Sumy, Sumy Oblast, Ukraine', lat: '50.9', lon: '34.8', class: 'place', type: 'city' }]);

    const res = await ask('sumy');

    expect((await res.json()).results.map((r: { name: string }) => r.name)).toEqual(['Sumy']);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=600');
  });

  it('never lets a browser or the edge keep an empty answer', async () => {
    nominatim.mockResolvedValue(null); // queue full, or the lookup failed

    const res = await ask('kharkiv');

    expect((await res.json()).results).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks again after an empty answer instead of remembering it', async () => {
    nominatim.mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ name: 'Odesa', display_name: 'Odesa, Ukraine', lat: '46.48', lon: '30.72', class: 'place', type: 'city' }]);

    await ask('odesa');
    const res = await ask('odesa');

    expect((await res.json()).results.map((r: { name: string }) => r.name)).toEqual(['Odesa']);
  });
});

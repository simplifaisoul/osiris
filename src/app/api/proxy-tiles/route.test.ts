import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const tile = (url: string) =>
  GET(new NextRequest(`http://localhost:3000/api/proxy-tiles?url=${encodeURIComponent(url)}`));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/proxy-tiles', () => {
  it('fetches basemap tiles', async () => {
    const fetchMock = vi.fn(async () => new Response('tile', { headers: { 'content-type': 'application/x-protobuf' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await tile('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt');
    expect(res.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt');
  });

  it('drops the query string and fragment', async () => {
    const fetchMock = vi.fn(async () => new Response('tile'));
    vi.stubGlobal('fetch', fetchMock);

    await tile('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt?bust=123#x');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt');
  });

  it.each([
    'http://tiles-a.basemaps.cartocdn.com/x.mvt',
    'https://tiles-a.basemaps.cartocdn.com:8443/x.mvt',
    'https://user:pass@tiles-a.basemaps.cartocdn.com/x.mvt',
    'https://cartocdn.com/x',
    'https://other.cartocdn.com/x',
    'https://basemaps.cartocdn.com.example.com/x',
    'https://example.com/x',
  ])('refuses %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await tile(url)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, resolveQueryUrl } from './route';

const ROOT = 'https://services1.arcgis.com/abc/arcgis/rest/services/Transmission_Line/FeatureServer';
const EMPTY = { type: 'FeatureCollection', features: [] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* Answers the service root from `root` and every query with `EMPTY`, and
   keeps the URLs so a test can see which layer was asked. */
function stubService(root: Response) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    return url.includes('/query?') ? json(EMPTY) : root;
  }));
  return urls;
}

describe('GET /api/arcgis?service=', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the service root which layer to query instead of assuming 0', async () => {
    const urls = stubService(json({ layers: [{ id: 100, name: 'Transmission_Line', geometryType: 'esriGeometryPolyline' }] }));
    const res = await GET(new NextRequest(`http://localhost/api/arcgis?service=${encodeURIComponent(ROOT)}&bbox=-109,31,-103,37`));
    expect(res.status).toBe(200);
    expect(urls[0]).toBe(`${ROOT}?f=json`);
    expect(urls[1]).toMatch(new RegExp(`^${ROOT}/100/query\\?`));
    const query = new URL(urls[1]).searchParams;
    expect(query.get('f')).toBe('geojson');
    expect(query.get('geometry')).toBe('-109,31,-103,37');
  });

  it('skips the lookup when the URL already names a layer', async () => {
    const urls = stubService(json({}));
    await GET(new NextRequest(`http://localhost/api/arcgis?service=${encodeURIComponent(`${ROOT}/3/`)}`));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(new RegExp(`^${ROOT}/3/query\\?`));
  });

  it('passes over group layers, which have no geometry', async () => {
    const urls = stubService(json({ layers: [{ id: 0, type: 'Group Layer' }, { id: 7, geometryType: 'esriGeometryPoint' }] }));
    await GET(new NextRequest(`http://localhost/api/arcgis?service=${encodeURIComponent(ROOT)}`));
    expect(urls[1]).toMatch(new RegExp(`^${ROOT}/7/query\\?`));
  });

  it('says so when a catalog hit is not a REST service at all', async () => {
    const urls = stubService(new Response('<!doctype html><title>Experience</title>', { status: 200 }));
    const res = await GET(new NextRequest('http://localhost/api/arcgis?service=https%3A%2F%2Fexperience.arcgis.com%2Fexperience%2Fabc'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Not an ArcGIS REST service');
    expect(urls).toHaveLength(1);
  });

  it('reports a service with nothing to query, and a root that errors', async () => {
    stubService(json({ layers: [], tables: [{ id: 0 }] }));
    expect(await resolveQueryUrl(ROOT)).toEqual({ error: 'Service has no layers to query', status: 400 });
    stubService(json({ error: { code: 499, message: 'Token Required' } }));
    expect(await resolveQueryUrl(ROOT)).toEqual({ error: 'Token Required', status: 502 });
    stubService(json({}, 404));
    expect(await resolveQueryUrl(ROOT)).toEqual({ error: 'Feature Service lookup failed (404)', status: 404 });
  });
});

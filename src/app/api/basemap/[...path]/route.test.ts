import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const SERVER = 'http://tiles.internal:3000';

function get(path: string, headers: Record<string, string> = { host: 'www.osirisai.live' }) {
  const req = new Request(`http://localhost:3000/api/basemap/${path}`, { headers });
  return GET(req, { params: Promise.resolve({ path: path.split('/') }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/basemap without a tile server', () => {
  it('serves no style and sends nobody to another map source', async () => {
    const res = await get('style');
    expect(res.status).toBe(503);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).error).toMatch(/BASEMAP_URL/);
  });

  it('serves no tiles', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await get('tiles/protomaps-1/3/4/2')).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/basemap with a tile server', () => {
  beforeEach(() => {
    vi.stubEnv('BASEMAP_URL', `${SERVER}/`);
    vi.stubEnv('BASEMAP_TILESET', 'protomaps-20261125');
    // The tile server's TileJSON for the tileset: a world map to zoom 10.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ tilejson: '3.0.0', minzoom: 0, maxzoom: 10 })));
  });

  it('serves the style with this site’s address and the tileset in every URL', async () => {
    const res = await get('style');
    expect(res.status).toBe(200);
    const style = await res.json();
    expect(style.sources.protomaps.tiles).toEqual(['https://www.osirisai.live/api/basemap/tiles/protomaps-20261125/{z}/{x}/{y}']);
    expect(String((vi.mocked(fetch).mock.calls[0] as unknown[])[0])).toBe(`${SERVER}/protomaps-20261125`);
    expect(style.sprite).toBe('https://www.osirisai.live/api/basemap/sprite');
    expect(style.glyphs).toBe('https://www.osirisai.live/api/basemap/fonts/{fontstack}/{range}');
    expect(JSON.stringify(style)).not.toMatch(/@origin@|@tileset@|cartocdn/);
  });

  it('sizes the style to the zooms the tileset holds, so the map enlarges its deepest tiles', async () => {
    const style = await (await get('style')).json();
    expect(style.sources.protomaps.maxzoom).toBe(10);
  });

  it('keeps the style’s own zoom range when the tile server can’t say', async () => {
    vi.stubEnv('BASEMAP_TILESET', 'protomaps-unanswered');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));
    const style = await (await get('style')).json();
    expect(style.sources.protomaps.maxzoom).toBe(14);
  });

  it('uses http only on localhost', async () => {
    const style = await (await get('style', { host: 'localhost:3000' })).json();
    expect(style.sprite).toBe('http://localhost:3000/api/basemap/sprite');
  });

  it('ignores forwarded host and scheme headers, which could poison the cached style', async () => {
    const style = await (await get('style', { host: 'www.osirisai.live', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' })).json();
    expect(style.sprite).toBe('https://www.osirisai.live/api/basemap/sprite');
  });

  it('relays a tile and lets it be cached for a year', async () => {
    const fetchMock = vi.fn(async () => new Response('tile', { headers: { 'content-type': 'application/x-protobuf' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await get('tiles/protomaps-20261125/3/4/2');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('tile');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${SERVER}/protomaps-20261125/3/4/2`);
  });

  it('keeps an empty tile empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    const res = await get('tiles/protomaps-20261125/14/1/1');
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it.each([
    'tiles/protomaps-20261125/15/0/0',
    'tiles/protomaps-20261125/3/8/0',
    'tiles/protomaps-20261125/3/-1/0',
    'tiles/..%2Fcatalog/3/4/2',
    'tiles/protomaps-20261125/3/4',
    'fonts/Open Sans Regular/0-254',
    'fonts/Open Sans Regular/100-355',
    'fonts/..%2F..%2Fcatalog/0-255',
    'sprite.svg',
    'catalog',
  ])('refuses %s without asking the tile server', async path => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await get(path)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks for a font stack with its fonts merged in order', async () => {
    const fetchMock = vi.fn(async () => new Response('glyphs'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await get(`fonts/${encodeURIComponent('Montserrat Medium,Open Sans Regular')}/256-511`);
    expect(res.status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${SERVER}/font/Montserrat%20Medium%2COpen%20Sans%20Regular/256-511`);
  });

  it('asks for the retina icon sheet', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await get('sprite@2x.json')).status).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${SERVER}/sprite/osiris@2x.json`);
  });

  it('answers 502, uncached, when the tile server is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));
    const res = await get('tiles/protomaps-20261125/3/4/2');
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

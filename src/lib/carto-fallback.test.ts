import { describe, it, expect } from 'vitest';
import { CARTO_PROTOCOL, cartoLoader, cartoRequestUrl } from './carto-fallback';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const TILE = 'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt';
const viaProxy = (url: string) => `/api/proxy-tiles?url=${encodeURIComponent(url)}`;

/** A fetch that answers each URL from the table, and notes what was asked. */
function fakeFetch(answers: Record<string, Response | Error>) {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected request: ${url}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  return { asked, fetcher };
}

const load = (fetcher: typeof fetch, url: string, type: 'json' | 'arrayBuffer', abort = new AbortController()) =>
  cartoLoader(fetcher)({ url: cartoRequestUrl(url), type }, abort);

describe('naming CARTO’s files for the map', () => {
  it('puts CARTO’s hosts under the CARTO scheme and leaves every other URL alone', () => {
    expect(cartoRequestUrl(STYLE)).toBe(`${CARTO_PROTOCOL}://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`);
    expect(cartoRequestUrl(TILE)).toBe(`${CARTO_PROTOCOL}://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt`);
    expect(cartoRequestUrl('https://server.arcgisonline.com/x/1/2/3')).toBe('https://server.arcgisonline.com/x/1/2/3');
    expect(cartoRequestUrl('https://notcartocdn.com/style.json')).toBe('https://notcartocdn.com/style.json');
    expect(cartoRequestUrl('https://cartocdn.com.example.org/style.json')).toBe('https://cartocdn.com.example.org/style.json');
  });
});

describe('loading a CARTO file', () => {
  it('takes it from the tile proxy when the proxy has it', async () => {
    const { asked, fetcher } = fakeFetch({ [viaProxy(TILE)]: new Response(new Uint8Array([1, 2, 3]), { headers: { 'Cache-Control': 'max-age=60' } }) });
    const out = await load(fetcher, TILE, 'arrayBuffer');
    expect(asked).toEqual([viaProxy(TILE)]);
    expect(new Uint8Array(out.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(out.cacheControl).toBe('max-age=60');
  });

  it('asks CARTO directly when CARTO refuses the proxy', async () => {
    const { asked, fetcher } = fakeFetch({
      [viaProxy(STYLE)]: new Response('Forbidden', { status: 403 }),
      [STYLE]: new Response(JSON.stringify({ version: 8, layers: [] })),
    });
    const out = await load(fetcher, STYLE, 'json');
    expect(asked).toEqual([viaProxy(STYLE), STYLE]);
    expect(out.data).toEqual({ version: 8, layers: [] });
  });

  it('asks CARTO directly when the proxy can’t be reached at all', async () => {
    const { asked, fetcher } = fakeFetch({ [viaProxy(TILE)]: new TypeError('Failed to fetch'), [TILE]: new Response(new Uint8Array([7])) });
    await load(fetcher, TILE, 'arrayBuffer');
    expect(asked).toEqual([viaProxy(TILE), TILE]);
  });

  it('fails the file when CARTO refuses both ways', async () => {
    const { fetcher } = fakeFetch({ [viaProxy(TILE)]: new Response('', { status: 403 }), [TILE]: new Response('', { status: 404 }) });
    await expect(load(fetcher, TILE, 'arrayBuffer')).rejects.toThrow(`CARTO answered 404 for ${TILE}`);
  });

  it('asks nothing more once the map has cancelled the file', async () => {
    const abort = new AbortController();
    abort.abort();
    const { asked, fetcher } = fakeFetch({ [viaProxy(TILE)]: new DOMException('aborted', 'AbortError') });
    await expect(load(fetcher, TILE, 'arrayBuffer', abort)).rejects.toThrow('aborted');
    expect(asked).toEqual([viaProxy(TILE)]);
  });
});

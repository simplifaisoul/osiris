import { describe, it, expect } from 'vitest';
import { CARTO_PROTOCOL, cartoLoader, cartoRequestUrl } from './carto-fallback';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const TILE = 'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt';
const viaProxy = (url: string) => `/api/proxy-tiles?url=${encodeURIComponent(url)}`;

/** A fetch that answers each URL from the table ('hang' never answers), stops when its signal does, and notes what was asked. */
function fakeFetch(answers: Record<string, Response | Error | 'hang'>) {
  const asked: string[] = [];
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(url);
    const answer = answers[url];
    return new Promise<Response>((resolve, reject) => {
      const stopped = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (init?.signal?.aborted) return stopped();
      init?.signal?.addEventListener('abort', stopped);
      if (!answer) reject(new Error(`unexpected request: ${url}`));
      else if (answer instanceof Error) reject(answer);
      else if (answer !== 'hang') resolve(answer);
    });
  }) as typeof fetch;
  return { asked, fetcher };
}

/** A 200 whose body breaks off partway, as when a connection drops mid-download. */
const cutOff = () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"vers')); c.error(new TypeError('network error')); } }));

const load = (fetcher: typeof fetch, url: string, type: 'json' | 'arrayBuffer', abort = new AbortController(), waitMs?: number) =>
  cartoLoader(fetcher, waitMs)({ url: cartoRequestUrl(url), type }, abort);

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

  it('asks CARTO directly when the proxy hasn’t started answering in time', async () => {
    const { asked, fetcher } = fakeFetch({ [viaProxy(TILE)]: 'hang', [TILE]: new Response(new Uint8Array([7])) });
    await load(fetcher, TILE, 'arrayBuffer', new AbortController(), 20);
    expect(asked).toEqual([viaProxy(TILE), TILE]);
  });

  it('asks CARTO directly when the proxy’s answer is cut off', async () => {
    const { asked, fetcher } = fakeFetch({ [viaProxy(STYLE)]: cutOff(), [STYLE]: new Response('{"version":8}') });
    const out = await load(fetcher, STYLE, 'json');
    expect(asked).toEqual([viaProxy(STYLE), STYLE]);
    expect(out.data).toEqual({ version: 8 });
  });

  it('fails the file when CARTO refuses both ways', async () => {
    const { fetcher } = fakeFetch({ [viaProxy(TILE)]: new Response('', { status: 403 }), [TILE]: new Response('', { status: 404 }) });
    await expect(load(fetcher, TILE, 'arrayBuffer')).rejects.toThrow(`CARTO answered 404 for ${TILE}`);
  });

  it('asks nothing more once the map has cancelled the file', async () => {
    const { asked, fetcher } = fakeFetch({ [viaProxy(TILE)]: 'hang' });
    const abort = new AbortController();
    const loading = load(fetcher, TILE, 'arrayBuffer', abort);
    abort.abort();
    await expect(loading).rejects.toThrow('aborted');
    expect(asked).toEqual([viaProxy(TILE)]);

    const before = new AbortController();
    before.abort();
    await expect(load(fetcher, TILE, 'arrayBuffer', before)).rejects.toThrow('aborted');
    expect(asked).toEqual([viaProxy(TILE), viaProxy(TILE)]);
  });
});

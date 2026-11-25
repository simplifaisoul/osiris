import { describe, it, expect } from 'vitest';
import { BASEMAP_PROTOCOL, CARTO_BACKUP_TILES, basemapRequestUrl, basemapTileLoader, cartoBackupUrl } from './tile-backup';

const ORIGIN = 'https://www.osirisai.live';
const PATH = '/api/basemap/tiles/protomaps-20261125/12/2046/1362';
const BACKUP = `/api/proxy-tiles?url=${encodeURIComponent(`${CARTO_BACKUP_TILES}/12/2046/1362.mvt`)}`;

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

const tile = (...bytes: number[]) => new Response(new Uint8Array(bytes), { headers: { 'Cache-Control': 'max-age=60' } });
/** A 200 whose body breaks off partway, as when a connection drops mid-download. */
const cutOff = () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.error(new TypeError('network error')); } }));

const load = (fetcher: typeof fetch, abort = new AbortController(), waitMs?: number) =>
  basemapTileLoader(fetcher, waitMs)({ url: basemapRequestUrl(`${ORIGIN}${PATH}`, ORIGIN), type: 'arrayBuffer' }, abort);
const bytes = (out: { data: unknown }) => [...new Uint8Array(out.data as ArrayBuffer)];

describe('naming basemap tiles for the map', () => {
  it('puts this site’s basemap tiles under the basemap scheme and leaves every other URL alone', () => {
    expect(basemapRequestUrl(`${ORIGIN}${PATH}`, ORIGIN)).toBe(`${BASEMAP_PROTOCOL}://${PATH}`);
    expect(basemapRequestUrl(`${ORIGIN}/api/basemap/sprite.json`, ORIGIN)).toBe(`${ORIGIN}/api/basemap/sprite.json`);
    expect(basemapRequestUrl(`https://elsewhere.example${PATH}`, ORIGIN)).toBe(`https://elsewhere.example${PATH}`);
  });

  it('finds CARTO’s copy of a tile only for basemap tiles', () => {
    expect(cartoBackupUrl(PATH)).toBe(BACKUP);
    expect(cartoBackupUrl('/api/basemap/fonts/Open Sans Regular/0-255')).toBeNull();
  });
});

describe('loading a basemap tile', () => {
  it('takes it from our tile server when it has it', async () => {
    const { asked, fetcher } = fakeFetch({ [PATH]: tile(1, 2, 3) });
    const out = await load(fetcher);
    expect(asked).toEqual([PATH]);
    expect(bytes(out)).toEqual([1, 2, 3]);
    expect(out.cacheControl).toBe('max-age=60');
  });

  it('treats no content as an empty tile, without asking CARTO', async () => {
    const { asked, fetcher } = fakeFetch({ [PATH]: new Response(null, { status: 204 }) });
    expect(bytes(await load(fetcher))).toEqual([]);
    expect(asked).toEqual([PATH]);
  });

  it('takes CARTO’s copy when our tile server answers with an error', async () => {
    const { asked, fetcher } = fakeFetch({ [PATH]: new Response(null, { status: 502 }), [BACKUP]: tile(9) });
    expect(bytes(await load(fetcher))).toEqual([9]);
    expect(asked).toEqual([PATH, BACKUP]);
  });

  it('takes CARTO’s copy when our tile server can’t be reached', async () => {
    const { fetcher } = fakeFetch({ [PATH]: new TypeError('Failed to fetch'), [BACKUP]: tile(9) });
    expect(bytes(await load(fetcher))).toEqual([9]);
  });

  it('takes CARTO’s copy when our tile server hasn’t started answering in time', async () => {
    const { fetcher } = fakeFetch({ [PATH]: 'hang', [BACKUP]: tile(9) });
    expect(bytes(await load(fetcher, new AbortController(), 20))).toEqual([9]);
  });

  it('takes CARTO’s copy when our tile server’s answer is cut off', async () => {
    const { fetcher } = fakeFetch({ [PATH]: cutOff(), [BACKUP]: tile(9) });
    expect(bytes(await load(fetcher))).toEqual([9]);
  });

  it('fails the tile when neither has it', async () => {
    const { fetcher } = fakeFetch({ [PATH]: new Response(null, { status: 502 }), [BACKUP]: new Response(null, { status: 403 }) });
    await expect(load(fetcher)).rejects.toThrow(`Basemap answered 403 for ${BACKUP}`);
  });

  it('asks nothing more once the map has cancelled the tile', async () => {
    const abort = new AbortController();
    const { asked, fetcher } = fakeFetch({ [PATH]: 'hang' });
    const pending = load(fetcher, abort);
    abort.abort();
    await expect(pending).rejects.toThrow();
    expect(asked).toEqual([PATH]);
  });
});

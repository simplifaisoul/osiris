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

describe('GET /api/proxy-tiles when CARTO refuses', () => {
  type Get = typeof GET;
  const tileAt = (n: number) => `https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/9/${n}/1.mvt`;
  const ask = (get: Get, n: number) =>
    get(new NextRequest(`http://localhost:3000/api/proxy-tiles?url=${encodeURIComponent(tileAt(n))}`));
  // A fresh module per case, so one case's refusals never carry into the next.
  const freshGet = async (): Promise<Get> => {
    vi.resetModules();
    return (await import('./route')).GET;
  };
  /** CARTO refuses everything; a pre-aborted signal behaves as it does in Next: no network, unless cached. */
  const refusingCarto = (cached: Set<string> = new Set()) =>
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        if (cached.has(String(input))) return new Response('cached tile', { headers: { 'content-type': 'application/x-protobuf' } });
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return new Response('refused', { status: 403 });
    });
  const lastSignal = (fetchMock: ReturnType<typeof refusingCarto>) =>
    (fetchMock.mock.calls.at(-1) as [unknown, RequestInit | undefined])[1]?.signal;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops asking after 20 refusals in a minute, and asks again once the pause ends', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = refusingCarto();
    vi.stubGlobal('fetch', fetchMock);
    const get = await freshGet();

    for (let n = 0; n < 20; n++) expect((await ask(get, n)).status).toBe(403);
    expect(lastSignal(fetchMock)?.aborted).toBe(false);

    const paused = await ask(get, 20);
    expect(paused.status).toBe(403);
    expect(await paused.json()).toEqual({ error: 'Failed to fetch tile' });
    expect(lastSignal(fetchMock)?.aborted).toBe(true);

    vi.setSystemTime(Date.now() + 61_000);
    expect((await ask(get, 21)).status).toBe(403);
    expect(lastSignal(fetchMock)?.aborted).toBe(false);
  });

  it('keeps serving cached tiles during the pause', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = refusingCarto(new Set([tileAt(5)]));
    vi.stubGlobal('fetch', fetchMock);
    const get = await freshGet();

    for (let n = 100; n < 120; n++) await ask(get, n);
    const cached = await ask(get, 5);
    expect(cached.status).toBe(200);
    expect(await cached.text()).toBe('cached tile');
    expect(lastSignal(fetchMock)?.aborted).toBe(true);
  });

  it('does not pause for refusals spread over more than a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = refusingCarto();
    vi.stubGlobal('fetch', fetchMock);
    const get = await freshGet();

    for (let n = 0; n < 25; n++) {
      await ask(get, n);
      vi.setSystemTime(Date.now() + 5_000);
    }
    expect(lastSignal(fetchMock)?.aborted).toBe(false);
  });
});

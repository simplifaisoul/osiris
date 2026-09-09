import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerrainTileLoader, TERRAIN_REQUEST_TIMEOUT_MS } from './terrain-tiles';

const url = (x: number) => `osiris-dem://10/${x}/100`;
const signal = () => new AbortController().signal;
const response = () => new Response(new Uint8Array([1, 2, 3, 4]));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('terrain tile loading', () => {
  it('shares in-flight tiles without one consumer cancelling another', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    const cancelled = new AbortController();
    const first = load(url(1), cancelled.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = load(url(1), signal());
    cancelled.abort(); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(false);
    finish(response());
    expect(new Uint8Array(await second)).toEqual(new Uint8Array([1, 2, 3, 4]));
    await load(url(1), signal());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts abandoned in-flight work and allows the same tile to be retried', async () => {
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    })).mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    await load(url(0), signal());
    const cancelled = new AbortController();
    const first = load(url(1), cancelled.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    cancelled.abort(); await rejected;
    expect(fetcher.mock.calls[1][1].signal?.aborted).toBe(true);
    fetcher.mockResolvedValueOnce(response());
    await load(url(1), signal());
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('times out stalled downloads and releases queue slots', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    const first = expect(load(url(1), signal())).rejects.toMatchObject({ name: 'TimeoutError' });
    const second = expect(load(url(2), signal())).rejects.toMatchObject({ name: 'TimeoutError' });
    const queued = load(url(3), signal());
    fetcher.mockResolvedValueOnce(response());
    await vi.advanceTimersByTimeAsync(TERRAIN_REQUEST_TIMEOUT_MS);
    await Promise.all([first, second, queued]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('reuses cached tiles and never hands a transferable cache buffer to MapLibre', async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    const first = await load(url(1), signal());
    structuredClone(first, { transfer: [first] });
    const second = await load(url(1), signal());
    expect(new Uint8Array(second)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/10/1/100.png'), expect.objectContaining({ cache: 'force-cache', credentials: 'omit' }));
  });

  it('evicts the least-recently-used tile when the byte budget is reached', async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader(8);
    await load(url(1), signal());
    await load(url(2), signal());
    await load(url(1), signal());
    await load(url(3), signal());
    await load(url(1), signal());
    expect(fetcher).toHaveBeenCalledTimes(3);
    await load(url(2), signal());
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('limits concurrent downloads to two and drops cancelled queued tiles', async () => {
    const finish: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => finish.push(resolve)));
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    const first = load(url(1), signal());
    const second = load(url(2), signal());
    const cancelled = new AbortController();
    const third = load(url(3), cancelled.signal);
    const rejected = expect(third).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    cancelled.abort();
    await rejected;
    finish[0](response());
    finish[1](response());
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed requests and rejects invalid tile coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetcher);
    const load = createTerrainTileLoader();
    await expect(load(url(1), signal())).rejects.toThrow('HTTP 503');
    await load(url(1), signal());
    await expect(load('osiris-dem://11/1/1', signal())).rejects.toThrow('out of range');
    await expect(load('osiris-dem://10/1024/1', signal())).rejects.toThrow('out of range');
    await expect(load('https://other.example/tile', signal())).rejects.toThrow('Invalid');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

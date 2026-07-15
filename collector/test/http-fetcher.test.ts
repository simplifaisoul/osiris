import { describe, expect, it, vi } from 'vitest';

import {
  BoundedHttpFetcher,
  ResponseTooLargeError,
  type FetchImplementation,
} from '../src/framework/http-fetcher.js';

describe('BoundedHttpFetcher', () => {
  it('captures timings, selected headers and the exact response bytes', async () => {
    const exactBody = Buffer.from([0x00, 0xff, 0x41, 0x0a]);
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(exactBody, {
        status: 206,
        headers: {
          'cache-control': 'max-age=60',
          'content-type': 'application/geo+json; charset=utf-8',
          date: 'Wed, 15 Jul 2026 04:05:07 GMT',
          etag: '"fixture-etag"',
          'last-modified': 'Wed, 15 Jul 2026 04:04:00 GMT',
          'retry-after': '30',
          'set-cookie': 'secret=value',
          'x-unsafe-provider-header': 'do-not-store',
        },
      }),
    );
    const times = [
      new Date('2026-07-15T04:05:06.000Z'),
      new Date('2026-07-15T04:05:07.000Z'),
    ];
    const fetcher = new BoundedHttpFetcher({
      maxBodyBytes: 100,
      timeoutMs: 1_000,
      fetchImpl,
      clock: () => times.shift()!,
    });

    const result = await fetcher.fetch('https://earthquake.usgs.gov/feed.geojson');

    expect(result.endpoint).toBe('https://earthquake.usgs.gov/feed.geojson');
    expect(result.requestStartedAt.toISOString()).toBe('2026-07-15T04:05:06.000Z');
    expect(result.responseReceivedAt.toISOString()).toBe('2026-07-15T04:05:07.000Z');
    expect(result.status).toBe(206);
    expect(result.contentType).toBe('application/geo+json; charset=utf-8');
    expect(result.body).toEqual(exactBody);
    expect(result.headers).toMatchObject({
      'cache-control': 'max-age=60',
      'content-type': 'application/geo+json; charset=utf-8',
      date: 'Wed, 15 Jul 2026 04:05:07 GMT',
      etag: '"fixture-etag"',
      'last-modified': 'Wed, 15 Jul 2026 04:04:00 GMT',
      'retry-after': '30',
    });
    expect(result.headers).not.toHaveProperty('set-cookie');
    expect(result.headers).not.toHaveProperty('x-unsafe-provider-header');

    const requestInit = fetchImpl.mock.calls[0]?.[1];
    expect(requestInit?.redirect).toBe('manual');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('preserves redirects without following an unvalidated location', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(
      Response.redirect('https://untrusted.example/feed', 302),
    );
    const fetcher = new BoundedHttpFetcher({ fetchImpl });

    const result = await fetcher.fetch(
      'https://earthquake.usgs.gov/feed.geojson',
    );

    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('https://untrusted.example/feed');
    expect(result.body).toEqual(Buffer.alloc(0));
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('combines an external cancellation signal with the request bounds', async () => {
    const fetchImpl: FetchImplementation = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('Expected a request signal'));
          return;
        }

        signal.addEventListener(
          'abort',
          () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException('Request aborted', 'AbortError'),
            ),
          { once: true },
        );
      });
    const fetcher = new BoundedHttpFetcher({ timeoutMs: 10_000, fetchImpl });
    const controller = new AbortController();
    const request = fetcher.fetch(
      'https://earthquake.usgs.gov/feed.geojson',
      controller.signal,
    );

    controller.abort(new DOMException('Collector stopped', 'AbortError'));

    await expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Collector stopped',
    });
  });

  it('rejects a declared body larger than the configured limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
    });
    const fetcher = new BoundedHttpFetcher({
      maxBodyBytes: 5,
      fetchImpl: () =>
        Promise.resolve(new Response(body, { headers: { 'content-length': '6' } })),
    });

    await expect(fetcher.fetch('https://example.test/feed')).rejects.toMatchObject({
      name: 'ResponseTooLargeError',
      maxBodyBytes: 5,
      declaredBodyBytes: 6,
    });
  });

  it('enforces the limit while streaming when content-length is absent', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const fetcher = new BoundedHttpFetcher({
      maxBodyBytes: 5,
      fetchImpl: () => Promise.resolve(new Response(body)),
    });

    await expect(fetcher.fetch('https://example.test/feed')).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });

  it('uses an aborting timeout signal for the full request attempt', async () => {
    const fetchImpl: FetchImplementation = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          reject(new Error('Expected a request signal'));
          return;
        }

        signal.addEventListener(
          'abort',
          () => {
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error('HTTP request was aborted'),
            );
          },
          { once: true },
        );
      });
    const fetcher = new BoundedHttpFetcher({ timeoutMs: 5, fetchImpl });

    await expect(fetcher.fetch('https://example.test/feed')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('rejects non-HTTP and credential-bearing endpoints without calling fetch', async () => {
    const fetchImpl = vi.fn<FetchImplementation>();
    const fetcher = new BoundedHttpFetcher({ fetchImpl });

    await expect(fetcher.fetch('file:///etc/passwd')).rejects.toThrow(
      'must use http or https',
    );
    await expect(fetcher.fetch('https://user:secret@example.test/feed')).rejects.toThrow(
      'must not contain credentials',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

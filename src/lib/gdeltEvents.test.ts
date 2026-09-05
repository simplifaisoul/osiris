import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { httpGetBufferIPv4, fetchGdeltEvents } from './gdeltEvents';

/**
 * The events feed died with `ERR_INVALID_PROTOCOL: Protocol "https:" not
 * supported` (#318): data.gdeltproject.org started answering plain HTTP with a
 * 301 to HTTPS, and the redirect was followed with Node's *http* client.
 *
 * These cover the fetcher rather than the parser, so they need a socket — but a
 * loopback one, so they still run offline.
 */

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(r => s.close(() => r()))));
});

/** Starts a loopback HTTP server and returns its `http://127.0.0.1:port` origin. */
function serve(handler: (url: string) => { status: number; headers?: Record<string, string>; body?: string }): Promise<string> {
  const server = createServer((req, res) => {
    const { status, headers = {}, body = '' } = handler(req.url ?? '/');
    res.writeHead(status, headers);
    res.end(body);
  });
  servers.push(server);
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

describe('httpGetBufferIPv4', () => {
  it('reads a plain 200 body', async () => {
    const origin = await serve(() => ({ status: 200, body: 'hello gdelt' }));
    expect((await httpGetBufferIPv4(origin, 5000)).toString('utf8')).toBe('hello gdelt');
  });

  it('follows a same-protocol redirect', async () => {
    const origin = await serve(url =>
      url === '/here' ? { status: 200, body: 'arrived' } : { status: 301, headers: { location: '/here' } }
    );
    expect((await httpGetBufferIPv4(origin, 5000)).toString('utf8')).toBe('arrived');
  });

  /* The regression itself. Port 1 is reserved and never listening, so a correct
     client gets as far as a refused TLS connection; the old one never opened a
     socket at all because http.get rejected the `https:` URL outright. */
  it('switches to the https client when a redirect crosses protocol', async () => {
    const origin = await serve(() => ({ status: 302, headers: { location: 'https://127.0.0.1:1/export.zip' } }));

    const err = await httpGetBufferIPv4(origin, 5000).then(() => null, (e: NodeJS.ErrnoException) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err!.code).not.toBe('ERR_INVALID_PROTOCOL');
    expect(err!.code).toBe('ECONNREFUSED');
  });

  it('gives up on a redirect loop instead of recursing forever', async () => {
    const origin = await serve(() => ({ status: 301, headers: { location: '/loop' } }));
    await expect(httpGetBufferIPv4(origin, 5000)).rejects.toThrow(/exceeded 5 redirects/);
  });

  it('reports a non-200 with its status', async () => {
    const origin = await serve(() => ({ status: 404 }));
    await expect(httpGetBufferIPv4(origin, 5000)).rejects.toThrow(/responded 404$/);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real GDELT host).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchGdeltEvents', () => {
  liveIt('pulls a real 15-minute export end to end', async () => {
    const { events, window, scanned } = await fetchGdeltEvents({ limit: 25 });

    expect(window).toMatch(/^\d{14}\.export\.CSV\.zip$/);
    expect(scanned).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);

    for (const e of events) {
      expect(Number.isFinite(e.lat)).toBe(true);
      expect(Number.isFinite(e.lng)).toBe(true);
      expect(Math.abs(e.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(e.lng)).toBeLessThanOrEqual(180);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  }, 120_000);
});

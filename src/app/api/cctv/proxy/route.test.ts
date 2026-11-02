import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';

// Every camera host "resolves" to the test server below, except one that
// stands in for a camera host whose DNS has been pointed inside the network.
vi.mock('@/lib/ssrf-guard', () => ({
  validateHost: async (host: string) => host === 'cctv-ss01.thb.gov.tw'
    ? { ok: false, reason: 'hostname resolves to reserved IPv4' }
    : { ok: true, resolved: ['127.0.0.1'] },
}));

import { GET, imageType } from './route';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(8)]);

describe('imageType', () => {
  it('reads the type off the bytes when the source will not say', () => {
    // Every Singapore LTA frame arrives like this, with nosniff alongside.
    expect(imageType(jpeg, 'application/octet-stream')).toBe('image/jpeg');
    expect(imageType(png, 'application/octet-stream')).toBe('image/png');
    expect(imageType(jpeg, '')).toBe('image/jpeg');
  });

  it('takes a declared raster type at its word', () => {
    expect(imageType(jpeg, 'image/png')).toBe('image/png');
    expect(imageType(Buffer.alloc(0), 'image/jpeg')).toBe('image/jpeg');
  });

  it('refuses anything that is not a picture, SVG included', () => {
    expect(imageType(Buffer.from('<html><script>steal()</script>'), 'text/html')).toBeNull();
    expect(imageType(Buffer.from('<svg onload="steal()"/>'), 'image/svg+xml')).toBeNull();
    expect(imageType(Buffer.alloc(2), 'application/octet-stream')).toBeNull();
  });
});

describe('GET /api/cctv/proxy', () => {
  let server: http.Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(`${req.headers.host} ${req.url}`);
      const redirect = (to: string) => { res.writeHead(302, { Location: to }); res.end(); };
      switch (req.url) {
        case '/frame.jpg': res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(jpeg); return;
        case '/page': res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<script>steal()</script>'); return;
        case '/vector': res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg onload="steal()"/>'); return;
        case '/hop': return redirect(`http://cdn.skylinewebcams.com:${port}/frame.jpg`);
        case '/away': return redirect(`http://evil.example:${port}/frame.jpg`);
        case '/inside': return redirect(`http://127.0.0.1:${port}/frame.jpg`);
        case '/loop': return redirect('/loop');
        default: res.writeHead(404); res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  const proxy = (url: string) =>
    GET(new NextRequest(`http://localhost/api/cctv/proxy?url=${encodeURIComponent(url)}`));
  const camera = (path: string) => proxy(`http://eismoinfo.lt:${port}${path}`);

  it('serves a camera frame as an image the browser will not reinterpret', async () => {
    const res = await camera('/frame.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses a page or an SVG from a camera host', async () => {
    expect((await camera('/page')).status).toBe(502);
    expect((await camera('/vector')).status).toBe(502);
  });

  it('refuses hosts outside the allowlist, shared storage included', async () => {
    const res = await proxy('https://s3-eu-west-1.amazonaws.com/anyones-bucket/page.html');
    expect(res.status).toBe(403);
  });

  it('follows a redirect only to another allowed camera host', async () => {
    expect((await camera('/hop')).status).toBe(200);
    hits.length = 0;
    expect((await camera('/away')).status).toBe(502);
    expect((await camera('/inside')).status).toBe(502);
    expect(hits.some(h => h.startsWith('evil.example') || h.startsWith('127.0.0.1'))).toBe(false);
  });

  it('gives up on a redirect loop', async () => {
    hits.length = 0;
    expect((await camera('/loop')).status).toBe(502);
    expect(hits.length).toBeLessThanOrEqual(4);
  });

  it('refuses a camera host that resolves to a private address', async () => {
    hits.length = 0;
    const res = await proxy(`http://cctv-ss01.thb.gov.tw:${port}/frame.jpg`);
    expect(res.status).toBe(502);
    expect(hits).toEqual([]);
  });
});

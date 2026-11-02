import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());
const request = (query = 'district=DAL&id=IH20') => new Request(`http://localhost/api/cctv/texas/snapshot?${query}`);

it('rejects invalid districts and IDs before fetching', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const query of ['district=constructor&id=x', 'district=https://evil.test&id=x', 'district=DAL', 'district=DAL&id=%00']) {
    expect((await GET(request(query))).status).toBe(400);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('decodes JPEGs from the fixed upstream and ignores client cache-busters', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ snippet: bytes.toString('base64') }));
  vi.stubGlobal('fetch', fetchMock);
  const response = await GET(request('district=DAL&id=IH20%20%40%20Main&_t=123'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.hostname).toBe('its.txdot.gov');
  expect(url.searchParams.get('icdId')).toBe('IH20 @ Main');
  expect(url.searchParams.has('_t')).toBe(false);
});

it('does not serve unavailable or non-JPEG payloads as images', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ snippet: Buffer.from('<html>error</html>').toString('base64') })));
  expect((await GET(request())).status).toBe(404);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null)));
  expect((await GET(request())).status).toBe(404);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
  const response = await GET(request());
  expect(response.status).toBe(502);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

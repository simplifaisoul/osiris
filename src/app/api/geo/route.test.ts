import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const request = (headers: Record<string, string> = {}) => new Request('http://localhost/api/geo', { headers });
const ipapi = (lat: number, lon: number, city: string) =>
  Response.json({ ip: 'x', latitude: lat, longitude: lon, city, region: '', country_name: '', org: '' });

it('locates the visitor by their own address', async () => {
  const fetchMock = vi.fn().mockResolvedValue(ipapi(51.5, -0.13, 'London'));
  vi.stubGlobal('fetch', fetchMock);
  const res = await GET(request({ 'cf-connecting-ip': '81.2.69.142' }));
  const body = await res.json();
  expect(fetchMock.mock.calls[0][0]).toBe('https://ipapi.co/81.2.69.142/json/');
  expect(body).toMatchObject({ status: 'success', lat: 51.5, lon: -0.13, city: 'London' });
});

it('never lets a cache hand one visitor’s location to another', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ipapi(51.5, -0.13, 'London')));
  const res = await GET(request({ 'cf-connecting-ip': '81.2.69.142' }));
  expect(res.headers.get('cache-control')).toBe('private, no-store');
});

it('in production, does not fall back to locating the server when the visitor address is lost', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const res = await GET(request({ 'x-real-ip': '172.18.0.5', 'x-forwarded-for': '10.0.0.4' }));
  expect(await res.json()).toMatchObject({ status: 'fail' });
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('in development, locates the developer’s own connection', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const fetchMock = vi.fn().mockResolvedValue(ipapi(45.5, -73.6, 'Montreal'));
  vi.stubGlobal('fetch', fetchMock);
  await GET(request());
  expect(fetchMock.mock.calls[0][0]).toBe('https://ipapi.co/json/');
});

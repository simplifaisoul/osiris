import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetches: { url: string; headers: Record<string, string> }[] = [];
let reply: () => Response = () => new Response(JPEG);

vi.mock('@/lib/ssrf-guard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ssrf-guard')>()),
  safeFetch: async (url: string, init: RequestInit) => {
    fetches.push({ url, headers: init.headers as Record<string, string> });
    return reply();
  },
}));

let payload: { json: Buffer; builtAt: number } | undefined;
let snapshot: { builtAt: number; regions: Record<string, unknown[]> } | null = null;
vi.mock('@/lib/cctv-snapshot', () => ({
  getPayload: () => payload,
  readSnapshot: async () => snapshot,
}));

import { cameraOf, catalogue, frameOf, resetFrames, sniffImage, stillOf, stillsNear } from './frames';
import { GET } from '@/app/api/cctv/frame/route';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const CAMERAS = [
  { id: 'madrid-a2', name: 'A-2 km 3.29', city: 'Madrid', country: 'Spain', source: 'DGT', lat: 40.44, lng: -3.67, feed_url: 'https://etraffic.dgt.es/camarasEtraffic/2.jpg', external_url: 'https://etraffic.dgt.es/' },
  { id: 'madrid-sky', name: 'Puerta del Sol', city: 'Madrid', country: 'Spain', source: 'SkylineWebcams', lat: 40.4168, lng: -3.7038, feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive5.jpg' },
  { id: 'tw-1', name: 'T1', city: 'Taipei', country: 'Taiwan', source: 'THB', lat: 25.03, lng: 121.56, feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcctv-ss03.thb.gov.tw%3A443%2FT1%2Fsnapshot' },
  { id: 'burgas', name: 'Burgas', city: 'Burgas', country: 'Bulgaria', source: 'x', lat: 42.5, lng: 27.47, stream_type: 'hls', stream_url: 'https://pics.smartburgas.eu/m3u8/a.m3u8' },
  { id: 'bad', name: 'no coords', lat: 'x', lng: 1 },
];

const useCatalogue = (cams: unknown[] = CAMERAS, builtAt = 1) => { payload = { json: Buffer.from(JSON.stringify({ cameras: cams })), builtAt }; };

beforeEach(() => {
  resetFrames();
  fetches.length = 0;
  reply = () => new Response(JPEG);
  payload = undefined;
  snapshot = null;
});

describe('the catalogue', () => {
  it('reads a still camera, unwrapping one served through the camera proxy', () => {
    expect(stillOf(CAMERAS[0])).toBe('https://etraffic.dgt.es/camarasEtraffic/2.jpg');
    expect(stillOf(CAMERAS[1])).toBe('https://cdn.skylinewebcams.com/live5.jpg');
    expect(stillOf(CAMERAS[3])).toBeNull();
    expect(stillOf({ feed_url: 'javascript:alert(1)' })).toBeNull();
    expect(stillOf({ feed_url: '/api/cctv/proxy?url=file%3A%2F%2F%2Fetc%2Fpasswd' })).toBeNull();
  });

  it('keeps cameras with an id and a place, and their operator page to cite', () => {
    expect(cameraOf(CAMERAS[4])).toBeNull();
    expect(cameraOf({ id: 7, lat: 1, lng: 2 })?.id).toBe('7');
    expect(cameraOf(CAMERAS[0])?.page).toBe('https://etraffic.dgt.es/');
  });

  it('indexes the catalogue the camera route built, or the one saved to disk, or says it has none', async () => {
    expect(await catalogue()).toBeNull();
    snapshot = { builtAt: 5, regions: { spain: [CAMERAS[0]] } };
    expect((await catalogue())?.cameras.get('madrid-a2')?.name).toBe('A-2 km 3.29');
    resetFrames();
    useCatalogue();
    const idx = await catalogue();
    expect(idx?.cameras.size).toBe(4);
    expect(idx?.stills.map(c => c.id)).toEqual(['madrid-a2', 'madrid-sky', 'tw-1']);
  });

  it('finds still cameras near a place, nearest first', async () => {
    useCatalogue();
    const near = await stillsNear(40.4168, -3.7038, 25, 5);
    expect(near.map(c => c.id)).toEqual(['madrid-sky', 'madrid-a2']);
    expect(near[0].km).toBe(0);
    expect(await stillsNear(0, 0, 25, 5)).toEqual([]);
  });
});

describe('a frame', () => {
  const cam = () => cameraOf(CAMERAS[0])!;

  it('is fetched as a picture, with its own site as the Referer', async () => {
    const f = await frameOf(cam());
    expect(f.type).toBe('image/jpeg');
    expect(fetches[0].headers.Referer).toBe('https://etraffic.dgt.es/');
  });

  it("is fetched without a Referer from Taiwan's highway cameras", async () => {
    await frameOf(cameraOf(CAMERAS[2])!);
    expect(fetches[0].url).toBe('https://cctv-ss03.thb.gov.tw:443/T1/snapshot');
    expect(fetches[0].headers.Referer).toBeUndefined();
  });

  it('is held for a few seconds and fetched once for everyone asking at once', async () => {
    await Promise.all([frameOf(cam()), frameOf(cam()), frameOf(cam())]);
    await frameOf(cam());
    expect(fetches).toHaveLength(1);
  });

  it('is refused when it is not a picture, too big, or the camera fails', async () => {
    reply = () => new Response('<html><script>steal()</script>', { headers: { 'content-type': 'image/jpeg' } });
    await expect(frameOf(cam())).rejects.toThrow('did not send a picture');
    resetFrames();
    reply = () => new Response(JPEG, { headers: { 'content-length': '9000000' } });
    await expect(frameOf(cam())).rejects.toThrow('too large');
    resetFrames();
    reply = () => new Response('gone', { status: 404 });
    await expect(frameOf(cam())).rejects.toThrow('answered 404');
  });

  it('does not exist for a live stream', async () => {
    await expect(frameOf(cameraOf(CAMERAS[3])!)).rejects.toMatchObject({ status: 422 });
  });

  it('can be sniffed from its first bytes', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(new TextEncoder().encode('<svg onload=x>'))).toBeNull();
  });
});

describe('GET /api/cctv/frame', () => {
  const get = (q: string, ip = '203.0.113.9') => GET(new Request(`http://localhost/api/cctv/frame${q}`, { headers: { 'x-real-ip': ip } }));

  it("serves a camera's frame by its id", async () => {
    useCatalogue();
    const res = await get('?id=madrid-a2');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-at')).toMatch(/^\d{4}-/);
  });

  it('answers plainly when it cannot', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?id=madrid-a2')).status).toBe(503);
    useCatalogue();
    expect((await get('?id=nope')).status).toBe(404);
    expect((await get('?id=burgas')).status).toBe(422);
    reply = () => new Response('', { status: 500 });
    expect((await get('?id=tw-1')).status).toBe(502);
  });

  it('limits how fast one visitor can ask', async () => {
    useCatalogue();
    let last = 0;
    for (let i = 0; i < 91; i++) last = (await get('?id=madrid-a2', '198.51.100.77')).status;
    expect(last).toBe(429);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraNumber, currentFrames, currentFrameUrl, fetchEstoniaCameras, LOOKUP_MS, picture, resetEstoniaLookup, STALE_MS } from './estonia';
import { GET } from './estonia/route';
import { stillOf } from '@/lib/vision/frames';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetEstoniaLookup();
});

const NOW = Date.parse('2026-11-19T01:35:00Z');

const feature = (path: string, time = NOW - 5 * 60_000, x = 27.44067, y = 59.36536, site = 'Jõhvi') => ({
  attributes: { site_name: site, image_path: path, image_time: time },
  geometry: { x, y },
});

function serve(...bodies: unknown[]) {
  const fetchMock = vi.fn(async () => Response.json(bodies.length > 1 ? bodies.shift() : bodies[0]));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Estonian road cameras', () => {
  it('accepts only camera numbers and picture paths of the layer’s own shape', () => {
    expect(cameraNumber('94')).toBe('94');
    expect(cameraNumber('94/../1')).toBeNull();
    expect(picture('94/94_202611190326.jpg')).toEqual({ number: '94', image: 'https://www.tarktee.ee/images/94/94_202611190326.jpg' });
    expect(picture('94/95_202611190326.jpg')).toBeNull();
    expect(picture('../94/94_202611190326.jpg')).toBeNull();
    expect(picture('https://evil.example/94/94_202611190326.jpg')).toBeNull();
  });

  it('keeps cameras with a place and a current picture, once each', () => {
    const frames = currentFrames({
      features: [
        feature('94/94_202611190326.jpg'),
        feature('94/94_202611190326.jpg'),
        feature('44/44_202611190330.jpg', NOW - STALE_MS - 1),
        feature('45/45_202611190330.jpg', NOW, 0, 0),
        feature('46/46_202611190330.jpg', NOW, 26.43, 58.45, 'Kärevere'),
      ],
    }, NOW);
    expect(frames.map(f => [f.number, f.site])).toEqual([['94', 'Jõhvi'], ['46', 'Kärevere']]);
  });

  it('lists each camera with a feed that names the camera, not the picture', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    serve({ features: [feature('94/94_202611190326.jpg', Date.now())] });
    const [cam] = await fetchEstoniaCameras();
    expect(cam).toEqual({
      id: 'ee-94',
      lat: 59.36536,
      lng: 27.44067,
      name: 'Jõhvi road camera',
      city: 'Jõhvi',
      country: 'Estonia',
      feed_url: '/api/cctv/estonia?id=94',
      source: 'Transpordiamet',
    });
    expect(stillOf(cam as unknown as Record<string, unknown>)).toBe('/api/cctv/estonia?id=94');
  });

  it('redirects to the current picture, sharing one lookup a minute', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const fetchMock = serve(
      { features: [feature('94/94_202611190326.jpg')] },
      { features: [feature('94/94_202611190336.jpg', NOW + LOOKUP_MS)] },
    );
    const first = await GET(new Request('https://osirisai.live/api/cctv/estonia?id=94'));
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('https://www.tarktee.ee/images/94/94_202611190326.jpg');
    await currentFrameUrl('94');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + LOOKUP_MS + 1);
    expect(await currentFrameUrl('94')).toBe('https://www.tarktee.ee/images/94/94_202611190336.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers 404 for a camera with no current picture', async () => {
    serve({ features: [] });
    expect((await GET(new Request('https://osirisai.live/api/cctv/estonia?id=7'))).status).toBe(404);
    expect((await GET(new Request('https://osirisai.live/api/cctv/estonia?id=x'))).status).toBe(404);
  });
});

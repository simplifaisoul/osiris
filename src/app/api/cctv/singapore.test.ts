import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraNumber, currentFrames, currentFrameUrl, fetchSingaporeCameras, LOOKUP_MS, pictureLink, resetSingaporeLookup, STALE_MS } from './singapore';
import { GET } from './singapore/route';
import { stillOf } from '@/lib/vision/frames';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetSingaporeLookup();
});

const NOW = Date.parse('2026-11-13T09:10:00+08:00');

const row = (id: string, image: string, timestamp = '2026-11-13T09:06:00+08:00', lat = 1.447023728, lng = 103.7716543) => ({
  camera_id: id,
  timestamp,
  image,
  location: { latitude: lat, longitude: lng },
});

const pic = (uuid: string) => `https://images.data.gov.sg/api/traffic-images/2026/11/${uuid}.jpg`;
const body = (...cameras: unknown[]) => ({ items: [{ timestamp: '2026-11-13T09:09:00+08:00', cameras }] });

function serve(...answers: unknown[]) {
  const fetchMock = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Singapore cameras', () => {
  it('names a camera from OneMotoring and points its feed at the current-picture route', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    serve(body(row('2701', pic('c992581f-c7c0-4350-acb8-32c60e4a776f')), row('9999', pic('a1'))));
    expect(await fetchSingaporeCameras()).toEqual([
      {
        id: 'sin-2701',
        lat: 1.447023728,
        lng: 103.7716543,
        name: 'Woodlands Causeway (Towards Johor)',
        city: 'Singapore',
        country: 'Singapore',
        feed_url: '/api/cctv/singapore?id=2701',
        source: 'LTA Singapore',
      },
      expect.objectContaining({ id: 'sin-9999', name: 'Camera 9999' }),
    ]);
  });

  it('leaves out rows with a bad id, a place outside Singapore, a foreign link or an old picture', () => {
    const frames = currentFrames(body(
      row('2701', pic('ok')),
      row('../x', pic('bad-id')),
      row('2702', pic('far'), undefined, 40.7, -74),
      row('2704', 'https://evil.example/api/traffic-images/2026/11/x.jpg'),
      row('4703', pic('old'), new Date(NOW - STALE_MS - 1000).toISOString()),
      row('4712', pic('no-time'), 'not a date'),
    ), NOW);
    expect(frames.map(f => f.number)).toEqual(['2701']);
  });

  it('accepts only JPEGs in the traffic-image folder', () => {
    expect(pictureLink(pic('abc'))).toBe(pic('abc'));
    expect(pictureLink('https://images.data.gov.sg/api/traffic-images/../../other/x.jpg')).toBeNull();
    expect(pictureLink('https://images.data.gov.sg/api/traffic-images/2026/11/x.png')).toBeNull();
    expect(pictureLink('https://images.data.gov.sg/api/traffic-images/x.jpg?redirect=1')).toBeNull();
    expect(pictureLink('http://images.data.gov.sg/api/traffic-images/x.jpg')).toBeNull();
    expect(cameraNumber('2701')).toBe('2701');
    expect(cameraNumber('2701/../x')).toBeNull();
  });

  it('looks the current picture up once a minute, shared between requests', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const fetchMock = serve(body(row('2701', pic('first'))), body(row('2701', pic('second'), '2026-11-13T09:11:00+08:00')));
    const [a, b] = await Promise.all([currentFrameUrl('2701'), currentFrameUrl('2701')]);
    expect(a).toBe(pic('first'));
    expect(b).toBe(pic('first'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + LOOKUP_MS + 1);
    expect(await currentFrameUrl('2701')).toBe(pic('second'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last links through a failed lookup, and has none for a camera it never saw', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    serve(body(row('2701', pic('first'))), new Error('down'));
    expect(await currentFrameUrl('2701')).toBe(pic('first'));
    vi.setSystemTime(NOW + LOOKUP_MS + 1);
    expect(await currentFrameUrl('2701')).toBe(pic('first'));
    expect(await currentFrameUrl('4799')).toBeNull();
    expect(await currentFrameUrl('not-a-number')).toBeNull();
  });

  it('redirects to the current picture, and answers 404 when there is none', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    serve(body(row('2701', pic('first'))));
    const hit = await GET(new Request('https://osirisai.live/api/cctv/singapore?id=2701&_t=1'));
    expect(hit.status).toBe(302);
    expect(hit.headers.get('location')).toBe(pic('first'));
    const miss = await GET(new Request('https://osirisai.live/api/cctv/singapore?id=4799'));
    expect(miss.status).toBe(404);
  });

  it('keeps Singapore cameras readable by the frame detector', () => {
    expect(stillOf({ feed_url: '/api/cctv/singapore?id=2701' })).toBe('/api/cctv/singapore?id=2701');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { COLORADO, fetchMinnesotaCameras, loadCars511xCameras, MINNESOTA, mapCars511xFeature, NEW_YORK, STALE_MS, type Cars511xFeature, type Cars511xView } from './cars511x';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const NOW = Date.parse('2026-11-19T01:30:00Z');

const site = (id: number, views: Cars511xView[], extra: Record<string, unknown> = {}): Cars511xFeature => ({
  geometry: { coordinates: [-93.53395, 44.90744] },
  properties: { id, name: 'T.H.7 EB @ Old Market Rd', public: true, location: { cityReference: 'in Shorewood' }, views, ...extra },
});

const hls = (n: string) => ({ type: 'WMP', url: `https://video.dot.state.mn.us/public/${n}.stream/playlist.m3u8`, videoPreviewUrl: `https://public.carsprogram.org/cameras/MN/${n}`, broken: false });
const still = (url: string, imageTimestamp?: number) => ({ type: 'STILL_IMAGE', url, imageTimestamp, broken: false });

describe('511x cameras (Minnesota, Colorado, New York)', () => {
  it('plays the live view and shows its preview as the still', () => {
    expect(mapCars511xFeature(site(520199, [hls('C1273')]), MINNESOTA, NOW)).toEqual({
      id: 'mn511-520199',
      lat: 44.90744,
      lng: -93.53395,
      name: 'T.H.7 EB @ Old Market Rd',
      city: 'Shorewood',
      country: 'US',
      feed_url: 'https://public.carsprogram.org/cameras/MN/C1273',
      stream_url: 'https://video.dot.state.mn.us/public/C1273.stream/playlist.m3u8',
      stream_type: 'hls',
      source: 'MnDOT',
    });
  });

  it('prefers a live view over a still listed before it, and skips broken views', () => {
    const cam = mapCars511xFeature(site(1, [{ ...hls('C1'), broken: true }, still('https://public.carsprogram.org/cameras/MN/C2-v1', NOW - 60_000), hls('C3')]), MINNESOTA, NOW);
    expect(cam?.stream_url).toContain('/C3.stream/');
  });

  it('shows a still-only site by its still, and drops it once the still has stopped', () => {
    const fresh = still('https://cocam.carsprogram.org/Cellular/160E06135CAM1RHS-Rd.jpg', NOW - 10 * 60_000);
    const cam = mapCars511xFeature({ geometry: { coordinates: [-105.01, 39.53] }, properties: { id: 927, name: 'Wildcat Reserve Pkwy', public: true, location: { cityReference: 'near Olathe' }, views: [fresh] } }, COLORADO, NOW);
    expect(cam).toMatchObject({ id: 'co511-927', city: 'near Olathe', feed_url: fresh.url, source: 'CDOT' });
    expect(cam?.stream_url).toBeUndefined();

    const stopped = { ...fresh, imageTimestamp: NOW - STALE_MS - 1 };
    expect(mapCars511xFeature({ geometry: { coordinates: [-105.01, 39.53] }, properties: { id: 927, public: true, views: [stopped] } }, COLORADO, NOW)).toBeNull();
  });

  it('leaves out private, misplaced and picture-less sites', () => {
    expect(mapCars511xFeature(site(1, [hls('C1')], { public: false }), MINNESOTA, NOW)).toBeNull();
    expect(mapCars511xFeature({ ...site(2, [hls('C2')]), geometry: { coordinates: [0, 0] } }, MINNESOTA, NOW)).toBeNull();
    expect(mapCars511xFeature(site(3, [{ type: 'WMP', url: 'http://insecure.example/x.m3u8', broken: false }]), MINNESOTA, NOW)).toBeNull();
    expect(mapCars511xFeature(site(4, []), MINNESOTA, NOW)).toBeNull();
  });

  it('leaves out New York City DOT pictures, from a host that never answers', () => {
    const at = (coordinates: number[], views: Cars511xView[]): Cars511xFeature => ({ geometry: { coordinates }, properties: { id: 20930, name: 'Central Park West @ 86 St', public: true, views } });
    expect(mapCars511xFeature(at([-73.969353, 40.785302], [still('https://nyctmc.org/api/cameras/8a6bc417/image')]), NEW_YORK, NOW)).toBeNull();
    const nysdot = { type: 'WMP', url: 'https://s51.nysdot.skyvdn.com/rtplive/R4_001/playlist.m3u8', videoPreviewUrl: 'https://public.carsprogram.org/cameras/NYSDOT/R4_001.flv.png', broken: false };
    expect(mapCars511xFeature(at([-77.5, 43.15], [nysdot]), NEW_YORK, NOW)).toMatchObject({
      id: 'ny511-20930', source: 'NYSDOT', city: 'New York', stream_url: nysdot.url, feed_url: nysdot.videoPreviewUrl,
    });
  });

  it('leaves out the Ontario cameras NYSDOT republishes from across the Niagara', () => {
    const qew: Cars511xFeature = { geometry: { coordinates: [-79.188, 43.165] }, properties: { id: 34182, name: 'QEW E/Welland Canal', route: 'QEW', public: true, views: [still('https://public.carsprogram.org/cameras/NYSDOT/other/52.jpg')] } };
    expect(mapCars511xFeature(qew, NEW_YORK, NOW)).toBeNull();
    expect(mapCars511xFeature({ ...qew, properties: { ...qew.properties, route: 'I-190' } }, NEW_YORK, NOW)).not.toBeNull();
  });

  it('reads the state file once, without duplicates, and fails loudly when it cannot', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => Response.json({ features: [site(1, [hls('C1')]), site(1, [hls('C1')]), site(2, [hls('C2')])] }));
    vi.stubGlobal('fetch', fetchMock);
    const cams = await fetchMinnesotaCameras();
    expect(cams.map(c => c.id)).toEqual(['mn511-1', 'mn511-2']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api-511x-mn.carsprogram.org/cameras/map-features');

    // The loader throws, so the region's cache keeps its last good list.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await expect(loadCars511xCameras(MINNESOTA)).rejects.toThrow('MnDOT cameras HTTP 503');
  });
});

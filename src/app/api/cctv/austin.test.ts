import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchAustinCameras, mapAustinCamera, type AustinCameraRow } from './austin';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const austin = (id: string, extra: Partial<AustinCameraRow> = {}): AustinCameraRow => ({
  camera_id: id,
  location_name: '830 BLK W RUNDBERG LN (Little Walnut Creek Library, HEB)',
  camera_status: 'TURNED_ON',
  screenshot_address: `https://cctv.austinmobility.io/image/${id}.jpg`,
  location: { coordinates: [-97.698158, 30.363686] },
  ...extra,
});

describe('City of Austin cameras', () => {
  it('maps a turned-on camera to its still', () => {
    expect(mapAustinCamera(austin('1'))).toEqual({
      id: 'austin-1',
      lat: 30.363686,
      lng: -97.698158,
      name: '830 BLK W RUNDBERG LN (Little Walnut Creek Library, HEB)',
      city: 'Austin',
      country: 'US',
      feed_url: 'https://cctv.austinmobility.io/image/1.jpg',
      source: 'City of Austin',
    });
  });

  it('leaves out cameras that are off, misplaced, or point anywhere but the city camera host', () => {
    expect(mapAustinCamera(austin('2', { camera_status: 'REMOVED' }))).toBeNull();
    expect(mapAustinCamera(austin('3', { location: { coordinates: [0, 0] } }))).toBeNull();
    expect(mapAustinCamera(austin('4', { screenshot_address: 'https://elsewhere.example/image/4.jpg' }))).toBeNull();
    expect(mapAustinCamera(austin('../5'))).toBeNull();
  });

  it('drops a camera whose picture has stopped, keeping the current ones', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== 'HEAD') return Response.json([austin('1'), austin('2')]);
      const age = url.endsWith('/1.jpg') ? 2 * 60_000 : 14 * 60 * 60_000;
      return new Response(null, { status: 200, headers: { 'Last-Modified': new Date(now - age).toUTCString() } });
    }));
    expect((await fetchAustinCameras()).map(c => c.id)).toEqual(['austin-1']);
  });
});

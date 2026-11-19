import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchCalgaryCameras, mapCalgaryCamera, type CalgaryCameraRow } from './calgary';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const calgary = (n: number, extra: Partial<CalgaryCameraRow> = {}): CalgaryCameraRow => ({
  camera_url: { url: `https://trafficcam.calgary.ca/loc${n}.jpg`, description: `Camera ${n + 1}` },
  camera_location: 'Glenmore Trail / Macleod Trail S',
  quadrant: 'SW/SE',
  point: { coordinates: [-114.0715855, 50.993989] },
  ...extra,
});

describe('City of Calgary cameras', () => {
  it('maps a camera by its picture number, captioned with its quadrant', () => {
    expect(mapCalgaryCamera(calgary(0))).toEqual({
      id: 'calgary-0',
      lat: 50.993989,
      lng: -114.0715855,
      name: 'Glenmore Trail / Macleod Trail S',
      city: 'Calgary SW/SE',
      country: 'Canada',
      feed_url: 'https://trafficcam.calgary.ca/loc0.jpg',
      source: 'City of Calgary',
    });
  });

  it('leaves out misplaced rows and pictures hosted anywhere else', () => {
    expect(mapCalgaryCamera(calgary(1, { point: { coordinates: [0, 0] } }))).toBeNull();
    expect(mapCalgaryCamera(calgary(2, { camera_url: { url: 'https://elsewhere.example/loc2.jpg' } }))).toBeNull();
  });

  it('lists each camera once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([calgary(0), calgary(0), calgary(100)])));
    expect((await fetchCalgaryCameras()).map(c => c.id)).toEqual(['calgary-0', 'calgary-100']);
  });
});

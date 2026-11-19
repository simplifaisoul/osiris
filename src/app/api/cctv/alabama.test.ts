import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchAlabamaCameras, mapAlabamaCamera, type AlgoCamera } from './alabama';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const algo = (id: number, extra: Partial<AlgoCamera> = {}): AlgoCamera => ({
  id,
  accessLevel: 'Public',
  snapshotImageUrl: `https://api.algotraffic.com/v4/Cameras/${id}/snapshot.jpg`,
  location: { latitude: 30.535105, longitude: -88.23953, city: 'Mobile', county: 'Mobile', displayRouteDesignator: 'I-10', displayCrossStreet: 'McDonald Rd', direction: 'East' },
  ...extra,
});

describe('Alabama ALGO cameras', () => {
  it('maps a public camera to its snapshot', () => {
    expect(mapAlabamaCamera(algo(31385))).toEqual({
      id: 'al-31385',
      lat: 30.535105,
      lng: -88.23953,
      name: 'I-10 at McDonald Rd (eastbound)',
      city: 'Mobile',
      country: 'US',
      feed_url: 'https://api.algotraffic.com/v4/Cameras/31385/snapshot.jpg',
      source: 'ALDOT ALGO Traffic',
    });
  });

  it('names a camera with no direction or cross street by what it has', () => {
    const cam = mapAlabamaCamera(algo(2, { location: { ...algo(2).location, displayCrossStreet: 'Unknown', direction: 'Any', city: null } }));
    expect(cam).toMatchObject({ name: 'I-10', city: 'Mobile County' });
  });

  it('leaves out non-public cameras, other hosts and misplaced rows', () => {
    expect(mapAlabamaCamera(algo(3, { accessLevel: 'FirstResponder' }))).toBeNull();
    expect(mapAlabamaCamera(algo(4, { snapshotImageUrl: 'https://elsewhere.example/4.jpg' }))).toBeNull();
    expect(mapAlabamaCamera(algo(5, { location: { latitude: 0, longitude: 0 } }))).toBeNull();
  });

  it('lists each camera once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([algo(1), algo(1), algo(7)])));
    expect((await fetchAlabamaCameras()).map(c => c.id)).toEqual(['al-1', 'al-7']);
  });
});

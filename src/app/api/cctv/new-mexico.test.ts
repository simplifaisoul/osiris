import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchNewMexicoCameras, mapNmRoadsCamera, type NmRoadsCamera } from './new-mexico';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

/** An entry as GetCameraInfo publishes it. */
const nm = (file: string, extra: Partial<NmRoadsCamera> = {}): NmRoadsCamera => ({
  title: 'I-25 @ Lower La Bajada',
  grouping: 'Santa Fe Area',
  snapshotFile: `http://ss.nmroads.com/snapshots/${file}.jpg`,
  enabled: true,
  lat: 35.506001,
  lon: -106.244,
  ...extra,
});

describe('New Mexico cameras', () => {
  it("maps a camera to its NMRoads still, served over https through the camera proxy", () => {
    expect(mapNmRoadsCamera(nm('i25_lowerlabajada'))).toEqual({
      id: 'nm-i25_lowerlabajada',
      lat: 35.506001,
      lng: -106.244,
      name: 'I-25 @ Lower La Bajada',
      city: 'Santa Fe, New Mexico',
      country: 'US',
      feed_url: '/api/cctv/proxy?url=http%3A%2F%2Fss.nmroads.com%2Fsnapshots%2Fi25_lowerlabajada.jpg',
      source: 'NMDOT',
    });
    expect(mapNmRoadsCamera(nm('x', { grouping: 'Statewide' }))?.city).toBe('New Mexico');
  });

  it('leaves out pictures from elsewhere, switched-off cameras and misplaced rows', () => {
    expect(mapNmRoadsCamera(nm('x', { snapshotFile: 'https://elsewhere.example/snapshots/x.jpg' }))).toBeNull();
    expect(mapNmRoadsCamera(nm('x', { enabled: false }))).toBeNull();
    expect(mapNmRoadsCamera(nm('x', { lat: 0, lon: 0 }))).toBeNull();
  });

  it('reads the list NMRoads serves as text/javascript, once per camera', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ cameraInfo: [nm('a'), nm('a'), nm('b')] }), {
      headers: { 'Content-Type': 'text/javascript;charset=UTF-8' },
    })));
    expect((await fetchNewMexicoCameras()).map(c => c.id)).toEqual(['nm-a', 'nm-b']);
  });
});

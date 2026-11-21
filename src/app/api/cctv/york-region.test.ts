import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchYorkRegionCameras, mapYorkCamera, type YorkCameraFeature } from './york-region';
import { fetchOntarioCameras } from './ontario';

vi.mock('./ontario', () => ({ fetchOntarioCameras: vi.fn(async () => []) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const york = (id: string | number, extra: Partial<NonNullable<YorkCameraFeature['attributes']>> = {}, geometry = { x: -79.38230940047303, y: 43.84438561894178 }): YorkCameraFeature => ({
  attributes: {
    FACILITYID: id,
    photo: `https://ww5.yorkmaps.ca/webtrafficimages/loc${id}.jpg`,
    url: `https://ww5.yorkmaps.ca/webtrafficimages/location${id}.html`,
    cameralocation: 'Highway 7 and Leslie Street',
    ...extra,
  },
  geometry,
});

describe('York Region cameras', () => {
  it("maps a camera to the Region's picture and page", () => {
    expect(mapYorkCamera(york('21'))).toEqual({
      id: 'york-21',
      lat: 43.844386,
      lng: -79.382309,
      name: 'Highway 7 and Leslie Street',
      city: 'York Region',
      country: 'Canada',
      feed_url: 'https://ww5.yorkmaps.ca/webtrafficimages/loc21.jpg',
      external_url: 'https://ww5.yorkmaps.ca/webtrafficimages/location21.html',
      source: 'York Region',
    });
  });

  it('leaves out pictures from elsewhere, odd ids and misplaced rows', () => {
    expect(mapYorkCamera(york('21', { photo: 'https://elsewhere.example/loc21.jpg' }))).toBeNull();
    expect(mapYorkCamera(york('2 1'))).toBeNull();
    expect(mapYorkCamera(york('21', {}, { x: 0, y: 0 }))).toBeNull();
    expect(mapYorkCamera(york('21', { url: 'https://elsewhere.example/' }))).not.toHaveProperty('external_url');
  });

  it('lists each camera once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [york(1), york(1), york(2)] })));
    expect((await fetchYorkRegionCameras()).map(c => c.id)).toEqual(['york-1', 'york-2']);
  });

  it('leaves the cameras Ontario 511 republishes to Ontario 511', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ features: [york(1), york(2, {}, { x: -79.461, y: 44.06 })] })));
    vi.mocked(fetchOntarioCameras).mockResolvedValueOnce([
      { id: 'on-2779', lat: 43.84439, lng: -79.38225, name: 'Highway 7 at Leslie Street', city: 'York', country: 'Canada', source: '511 Ontario' },
    ]);
    expect((await fetchYorkRegionCameras()).map(c => c.id)).toEqual(['york-2']);
  });

  it('keeps the last good list when ArcGIS reports an error inside a 200', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 500, message: 'Unable to complete operation.' } })));
    expect(await fetchYorkRegionCameras()).toEqual([]);
  });
});

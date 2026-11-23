import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchIrelandCameras, fetchKansasCameras, KANSAS, loadCarsGraphqlCameras, mapCarsGraphqlFeature, NEBRASKA, type CarsGraphqlFeature } from './cars-graphql';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const feature = (id: number, url: string | null, lng: number, lat: number, title = 'US 77: S of Cortland'): CarsGraphqlFeature => ({
  title,
  uri: `camera/${id}`,
  features: [{ geometry: { coordinates: [lng, lat] } }],
  __typename: 'Camera',
  active: true,
  views: [{ category: 'IMAGE', url }],
});

describe('CARS GraphQL cameras (Nebraska, Kansas)', () => {
  it('maps a Nebraska camera to its still, without the frozen cache-buster', () => {
    expect(mapCarsGraphqlFeature(feature(512, 'https://dot511.nebraska.gov/images/vid-001077037-03.jpg?1795051680000', -96.73382, 40.46516), NEBRASKA)).toEqual({
      id: 'nedot-512',
      lat: 40.46516,
      lng: -96.73382,
      name: 'US 77: S of Cortland',
      city: 'Nebraska',
      country: 'US',
      feed_url: 'https://dot511.nebraska.gov/images/vid-001077037-03.jpg',
      source: 'Nebraska DOT',
    });
  });

  it("captions KC Scout's cameras as theirs", () => {
    const kc = mapCarsGraphqlFeature(feature(40, 'https://www.kcscout.net/TransSuite.VCS.CameraSnapshots/PTCCTV0044-LQ.jpg?1', -94.55, 39.1, 'I-29 N @ Cookingham Drive'), KANSAS);
    expect(kc).toMatchObject({ id: 'ksdot-40', source: 'KC Scout', city: 'Kansas City' });
    const kdot = mapCarsGraphqlFeature(feature(2, 'https://kscam.carsprogram.org/KDOT_505010_IMAGE001.JPG?1', -97.2296, 37.74075), KANSAS);
    expect(kdot).toMatchObject({ source: 'KDOT', city: 'Kansas' });
  });

  it('leaves out inactive, picture-less, misplaced and non-camera features', () => {
    const ok = feature(1, 'https://kscam.carsprogram.org/a.JPG', -97.2, 37.7);
    expect(mapCarsGraphqlFeature({ ...ok, active: false }, KANSAS)).toBeNull();
    expect(mapCarsGraphqlFeature(feature(1, null, -97.2, 37.7), KANSAS)).toBeNull();
    expect(mapCarsGraphqlFeature(feature(1, 'http://kscam.carsprogram.org/a.JPG', -97.2, 37.7), KANSAS)).toBeNull();
    expect(mapCarsGraphqlFeature(feature(1, 'https://kscam.carsprogram.org/a.JPG', 0, 0), KANSAS)).toBeNull();
    expect(mapCarsGraphqlFeature({ ...ok, __typename: 'Sign' }, KANSAS)).toBeNull();
    expect(mapCarsGraphqlFeature({ ...ok, uri: 'camera/1/../x' }, KANSAS)).toBeNull();
  });

  it("asks the state's own API for its whole box and fails loudly when it cannot", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({
      data: { mapFeaturesQuery: { mapFeatures: [feature(2, 'https://kscam.carsprogram.org/a.JPG', -97.2, 37.7)] } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchKansasCameras()).map(c => c.id)).toEqual(['ksdot-2']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.kandrive.gov/api/graphql');
    expect(JSON.parse(String(init?.body)).variables.input).toMatchObject({ north: 40.1, south: 36.9, east: -94.5, west: -102.1, zoom: 16 });

    // The loader throws, so the region's cache keeps its last good list.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
    await expect(loadCarsGraphqlCameras(KANSAS)).rejects.toThrow('KDOT cameras HTTP 502');
  });

  it("reads TII's cameras as Ireland's, asking as itself", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({
      data: { mapFeaturesQuery: { mapFeatures: [
        feature(91, 'https://irecam.carsprogram.org/Vaisala/1681_cam1.jpeg?1795307760000', -6.64806, 53.92972, 'Reaghstown'),
        feature(92, 'https://irecam.carsprogram.org/Vaisala/1683_cam1.jpeg', -0.1, 51.5, 'London'),
      ] } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchIrelandCameras()).toEqual([{
      id: 'tii-91', lat: 53.92972, lng: -6.64806, name: 'Reaghstown', city: 'National roads', country: 'Ireland',
      feed_url: 'https://irecam.carsprogram.org/Vaisala/1681_cam1.jpeg', source: 'TII',
    }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://traffic.tii.ie/api/graphql');
    expect(new Headers(init?.headers).has('Referer')).toBe(false);
  });
});

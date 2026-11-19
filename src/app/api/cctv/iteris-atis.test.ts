import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { MONTANA, SOUTH_DAKOTA, fetchMontanaCameras, fetchSouthDakotaCameras, mapIterisSite, type IterisSite, type IterisView } from './iteris-atis';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const NOW = Date.UTC(2026, 10, 19, 9, 30);
const fresh = NOW / 1000 - 600;

const view = (name: string, extra: Partial<IterisView> = {}): IterisView => ({
  id: name,
  name,
  description: `Watertown-north of town along I-29 @ MP 179 ${name.toLowerCase()}`,
  image: `https://sd.cdn.iteris-atis.com/camera_images/CSDATY/${name.length}/latest.jpg`,
  updateTime: fresh,
  ...extra,
});

const sdSite = (views: IterisView[], extra: Partial<IterisSite> = {}): IterisSite => ({
  id: 'CSDATY',
  geometry: { type: 'Point', coordinates: [-97.06, 44.95] },
  properties: { name: 'Watertown North', route: 'I-29', cameras: views },
  ...extra,
});

describe('Iteris 511 cameras (South Dakota, Montana)', () => {
  it('shows a view of the road rather than the pavement', () => {
    const cam = mapIterisSite(sdSite([view('Road Surface View'), view('Looking South')]), SOUTH_DAKOTA, NOW);
    expect(cam).toEqual({
      id: 'sd-CSDATY',
      lat: 44.95,
      lng: -97.06,
      name: 'Watertown-north of town along I-29 @ MP 179 looking south',
      city: 'South Dakota',
      country: 'US',
      feed_url: 'https://sd.cdn.iteris-atis.com/camera_images/CSDATY/13/latest.jpg',
      source: 'SD511',
    });
  });

  it('leaves out a site whose pictures have stopped, or are hosted elsewhere', () => {
    expect(mapIterisSite(sdSite([view('Looking North', { updateTime: NOW / 1000 - 4 * 3600 })]), SOUTH_DAKOTA, NOW)).toBeNull();
    expect(mapIterisSite(sdSite([view('Looking North', { image: 'https://elsewhere.example/a.jpg' })]), SOUTH_DAKOTA, NOW)).toBeNull();
  });

  it("names Montana's weather stations by place and route", () => {
    const station: IterisSite = {
      id: '301007',
      geometry: { type: 'Point', coordinates: [-112.372317, 47.0877] },
      properties: {
        name: 'Rogers Pass',
        description: 'MT-200 MP 90.8',
        route: 'MT-200',
        cameras: [{ name: 'Rogers Pass - North Elev 5406', image: 'https://mt.cdn.iteris-atis.com/rwis_images/301007-00-01.jpg', updateTime: fresh }],
      },
    };
    expect(mapIterisSite(station, MONTANA, NOW)).toMatchObject({ id: 'mt-301007', name: 'Rogers Pass, MT-200 MP 90.8', source: 'Montana 511' });
  });

  it("reads only Montana's weather stations, not the neighbours' cameras its map re-shows", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { asked.push(url); return Response.json({ features: [] }); }));
    await fetchMontanaCameras();
    expect(asked).toEqual(['https://mt.cdn.iteris-atis.com/geojson/icons/metadata/icons.rwis.geojson']);
  });

  it('reads both layers and lists each site once, even when one layer fails', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('icons.rwis.geojson')
        ? new Response('down', { status: 503 })
        : Response.json({ features: [sdSite([view('Looking North')]), sdSite([view('Looking North')])] })));
    try {
      expect((await fetchSouthDakotaCameras()).map(c => c.id)).toEqual(['sd-CSDATY']);
    } finally {
      vi.useRealTimers();
    }
  });
});

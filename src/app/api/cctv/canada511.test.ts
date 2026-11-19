import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchCanada511Cameras } from './canada511';
import { fetchAlaskaCameras } from './alaska';
import { fetchNewEnglandCameras } from './newengland';
import { fetchPennsylvaniaCameras } from './pennsylvania';
import { fetchConnecticutCameras } from './connecticut';
import type { Ibi511Record } from './ibi511';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const row = (id: number, location: string, lng: number, lat: number): Ibi511Record => ({
  id,
  source: 'GovNL',
  location,
  latLng: { geography: { wellKnownText: `POINT (${lng} ${lat})` } },
  images: [{ imageUrl: `/map/Cctv/${id}`, isVideoAuthRequired: false, blocked: false, disabled: false }],
});

/** One row per site as each publishes it, keyed by host. */
const SITES: Record<string, Ibi511Record[]> = {
  'www.manitoba511.ca': [row(62, 'Hwy 1 at West Hawk', -95.1548, 49.7396)],
  '511.gnb.ca': [row(1, 'Aroostook River Route 2', -67.7338, 46.8186)],
  '511.novascotia.ca': [row(53, 'Weavers Mountain', -62.2238, 45.568)],
  '511nl.ca': [row(2, 'Flowers Cove Route 430', -56.7012, 51.3131)],
  '511yukon.ca': [row(1, 'S.Klondike Hwy - km 106.5', -134.7053, 60.1749), row(9, 'Mis-geocoded at 0,0', 0, 0)],
  '511.alaska.gov': [row(1, 'Seward Highway MP 78.9 / Portage Glacier Road', -148.9755, 60.8189)],
  'hotline.gov.sk.ca': [row(1, 'Hwy 1 @ Wapella', -101.9796, 50.2593)],
  '511.gov.pe.ca': [row(1, 'Albany Hwy 1 E', -63.5935, 46.2513)],
  'newengland511.org': [row(622, 'I-189 SOUTH BURLINGTON', -73.1937, 44.4602), row(623, 'Mis-geocoded in New York', -74.0, 40.7)],
  'www.511pa.com': [
    { ...row(4357, 'I-78 EB MM 47.9 @ ADAMS ROAD OVERPASS', -75.65852, 40.57533), images: [{ imageUrl: '/map/Cctv/6406', videoUrl: 'https://pa-se3.arcadis-ivds.com:8200/chan-29713/index.m3u8', isVideoAuthRequired: true }] },
    { ...row(4129, 'I-376 @ BUNKER HILL ROAD', -80.31978, 40.61313), images: [{ imageUrl: '/map/Cctv/6178', blocked: true }] },
  ],
  'ctroads.org': [row(475, 'Cam 137 Waterbury I-84 EB W/O Exit 25 Hamilton Ave', -73.026686, 41.5452)],
};

const stub = (down: string[] = []) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const host = new URL(url).hostname;
  if (down.includes(host)) return new Response('error', { status: 500 });
  const rows = SITES[host] ?? [];
  return Response.json({ recordsTotal: rows.length, data: rows });
}));

describe('Canadian and Alaskan 511 cameras', () => {
  it('loads all seven provinces and territories, each with its own prefix, inside its own borders', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stub();
    const cams = await fetchCanada511Cameras();
    expect(cams.map(c => c.id).sort()).toEqual(['mb-62', 'nb-1', 'nl-2', 'ns-53', 'pe-1', 'sk-1', 'yt-1']);
    expect(cams.find(c => c.id === 'sk-1')).toMatchObject({ source: 'Saskatchewan Highway Hotline', feed_url: 'https://hotline.gov.sk.ca/map/Cctv/1' });
    const yt = cams.find(c => c.id === 'yt-1');
    expect(yt).toMatchObject({ source: '511 Yukon', country: 'Canada', feed_url: 'https://511yukon.ca/map/Cctv/1' });
  });

  it('keeps the provinces that answer when one does not', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stub(['511.gnb.ca']);
    const cams = await fetchCanada511Cameras();
    expect(cams.map(c => c.id).sort()).toEqual(['mb-62', 'nl-2', 'ns-53', 'pe-1', 'sk-1', 'yt-1']);
  });

  it('loads Alaska', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stub();
    expect(await fetchAlaskaCameras()).toEqual([expect.objectContaining({
      id: 'ak-1', lat: 60.8189, lng: -148.9755, country: 'US', source: 'Alaska 511', feed_url: 'https://511.alaska.gov/map/Cctv/1',
    })]);
  });

  it('loads New England 511 inside Vermont, New Hampshire and Maine', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stub();
    expect(await fetchNewEnglandCameras()).toEqual([expect.objectContaining({
      id: 'ne511-622', country: 'US', source: 'New England 511', feed_url: 'https://newengland511.org/map/Cctv/622',
    })]);
  });

  it('loads Pennsylvania and Connecticut by their public stills, leaving out cameras the site blocks', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    stub();
    const pa = await fetchPennsylvaniaCameras();
    expect(pa).toEqual([expect.objectContaining({ id: 'pa511-4357', source: 'PennDOT', feed_url: 'https://www.511pa.com/map/Cctv/6406' })]);
    expect(pa[0].stream_url).toBeUndefined();
    expect(await fetchConnecticutCameras()).toEqual([expect.objectContaining({
      id: 'ct511-475', source: 'CTDOT', feed_url: 'https://ctroads.org/map/Cctv/475',
    })]);
  });
});

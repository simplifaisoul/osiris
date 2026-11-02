import { afterEach, describe, it, expect, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchIdahoCameras } from './idaho';
import type { Ibi511Record } from './ibi511';

afterEach(() => {
  vi.unstubAllGlobals();
  clearSourceCache();
});

const row = (id: number, source: string, location: string, wkt: string, county: string | null = 'Nez Perce'): Ibi511Record => ({
  id,
  source,
  roadway: 'Local Boise',
  direction: 'Unknown',
  location,
  county,
  latLng: { geography: { wellKnownText: wkt } },
  images: [{ imageUrl: `/map/Cctv/${id + 1000}`, isVideoAuthRequired: false, blocked: false, disabled: false }],
});

/** Rows as 511.idaho.gov/List/GetData/Cameras publishes them. */
const rows: Ibi511Record[] = [
  // An ACHD intersection in Boise, which the feed files under Nez Perce County.
  row(437, 'ACHD', 'Broadway (US-20) & Front St', 'POINT (-116.193 43.608)'),
  row(16, 'ITDNET', 'D3 I-84 37.9 Garrity 538', 'POINT (-116.51544 43.599537)', null),
  // UDOT's and WSDOT's border cameras sit inside Idaho's bounding box.
  row(1, 'UDOT', 'I-15 UT/ID State Line UT', 'POINT (-112.198 42.0011)', null),
  row(388, 'WSDOT', 'I-90 Liberty Lake, WA', 'POINT (-117.042 47.6966)'),
  // Idaho's own rows for Nevada and British Columbia.
  row(759, 'Idaho511', 'Local I-80 Winnemucca', 'POINT (-117.74422 40.971237)'),
  row(775, 'USER', 'Hwy 3, Creston, BC', 'POINT (-116.52389 49.11869)', 'Kootenai'),
];

describe('fetchIdahoCameras', () => {
  it('keeps Idaho’s own cameras as snapshots and drops its neighbours’', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ recordsTotal: rows.length, data: rows })));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await fetchIdahoCameras()).toEqual([
      {
        id: 'itd-437',
        lat: 43.608,
        lng: -116.193,
        name: 'Broadway (US-20) & Front St',
        city: 'Idaho',
        country: 'US',
        feed_url: 'https://511.idaho.gov/map/Cctv/1437',
        source: 'ITD',
      },
      {
        id: 'itd-16',
        lat: 43.599537,
        lng: -116.51544,
        name: 'D3 I-84 37.9 Garrity 538',
        city: 'Idaho',
        country: 'US',
        feed_url: 'https://511.idaho.gov/map/Cctv/1016',
        source: 'ITD',
      },
    ]);
  });
});

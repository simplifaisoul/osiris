import { afterEach, describe, it, expect, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchWisconsinCameras } from './wisconsin';
import type { Ibi511Record } from './ibi511';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

/** A row as 511wi.gov/List/GetData/Cameras publishes it. */
const row = (id: number, wkt: string, videoUrl: string | null = `https://cctv1.dot.wi.gov/rtplive/CCTV-${id}/playlist.m3u8`): Ibi511Record => ({
  id,
  source: 'ATMS',
  roadway: 'I-39/US 51',
  direction: 'Unknown',
  location: 'I-39/US 51 at County B',
  county: 'Portage',
  latLng: { geography: { wellKnownText: wkt } },
  images: [{ imageUrl: `/map/Cctv/${id + 900}`, videoUrl, isVideoAuthRequired: false, blocked: false, disabled: false }],
});

describe('fetchWisconsinCameras', () => {
  it("plays WisDOT's live stream with its still as the picture, and drops rows outside the state", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      recordsTotal: 2,
      data: [row(1, 'POINT (-89.518702 44.454149)'), row(2, 'POINT (0 0)')],
    })));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await fetchWisconsinCameras()).toEqual([{
      id: 'wisdot-1',
      lat: 44.454149,
      lng: -89.518702,
      name: 'I-39/US 51 at County B',
      city: 'Portage County',
      country: 'US',
      feed_url: 'https://511wi.gov/map/Cctv/901',
      stream_url: 'https://cctv1.dot.wi.gov/rtplive/CCTV-1/playlist.m3u8',
      stream_type: 'hls',
      source: 'WisDOT',
    }]);
  });
});

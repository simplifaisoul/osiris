import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchOhioCameras, mapOhgoSite, type OhgoSite } from './ohio';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

/** A site as api.ohgo.com/roadmarkers/cameras publishes it. */
const site = (id: string, extra: Partial<OhgoSite> = {}): OhgoSite => ({
  Id: id,
  Latitude: 41.50557,
  Longitude: -82.84921,
  Location: 'SR-2 at S Lightner Rd, 5060',
  Cameras: [{ Direction: 'View', LargeURL: 'https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-WestSign.jpg' }],
  ...extra,
});

describe('Ohio cameras', () => {
  it("maps a site to one pin with ODOT's picture", () => {
    expect(mapOhgoSite(site('00000000000001'))).toEqual({
      id: 'ohgo-1',
      lat: 41.50557,
      lng: -82.84921,
      name: 'SR-2 at S Lightner Rd',
      city: 'Ohio',
      country: 'US',
      feed_url: 'https://itscameras.dot.state.oh.us/images/toledo/SR2-EB-WestSign.jpg',
      source: 'ODOT',
    });
  });

  it("leaves out Kentucky's TRIMARC pictures, odd ids and misplaced rows", () => {
    expect(mapOhgoSite(site('2', { Cameras: [{ Direction: 'View', LargeURL: 'https://www.trimarc.org/images/milestone/CCTV_05_71_0123.jpg' }] }))).toBeNull();
    expect(mapOhgoSite(site('2', { Cameras: [{ LargeURL: 'not a url' }] }))).toBeNull();
    expect(mapOhgoSite(site('x2'))).toBeNull();
    expect(mapOhgoSite(site('2', { Latitude: 0, Longitude: 0 }))).toBeNull();
  });

  it('lists each site once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([site('1'), site('01'), site('2')])));
    expect((await fetchOhioCameras()).map(c => c.id)).toEqual(['ohgo-1', 'ohgo-2']);
  });
});

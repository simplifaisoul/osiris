import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchNewJerseyCameras, mapNjtaCamera, readCameraPage, type NjtaCamera } from './new-jersey';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

/** A camera as the page's map data publishes it. */
const njta = (id: number, extra: Partial<NjtaCamera> = {}): NjtaCamera => ({
  id,
  lat: 40.70233333,
  lng: -74.06958333,
  mile_marker: 5.5,
  relative_text: 'Liberty State Park (Jersey City)',
  video_url: `https://wink.njta.com/203/public/hls/WF05-24AF-4D42-CE69-${id}_nj.m3u8`,
  type: 'camera',
  ...extra,
});

/** The camera page, with its map data HTML-escaped into the block's attribute as WordPress writes it. */
const page = (cameras: Record<string, NjtaCamera[]>) => {
  const config = JSON.stringify({ mode: 'traffic-cameras', initialData: { cameras, 'service-areas': [] } })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return `<html><body><div class="alignwide wp-block-njta-theme-map-block" data-current-tab="turnpike" data-block-config="${config}"></div></body></html>`;
};

describe('NJ Turnpike Authority cameras', () => {
  it("plays the Authority's live stream, named by road and place", () => {
    expect(mapNjtaCamera(njta(47), 'turnpike')).toEqual({
      id: 'njta-47',
      lat: 40.702333,
      lng: -74.069583,
      name: 'NJ Turnpike: Liberty State Park (Jersey City)',
      city: 'Jersey City, New Jersey',
      country: 'US',
      stream_url: 'https://wink.njta.com/203/public/hls/WF05-24AF-4D42-CE69-47_nj.m3u8',
      stream_type: 'hls',
      source: 'NJ Turnpike Authority',
    });
  });

  it('uses the mile marker when the text names only the town', () => {
    const cam = mapNjtaCamera(njta(73, { mile_marker: 53.6, relative_text: '(Bass River Twp)' }), 'parkway');
    expect(cam?.name).toBe('Garden State Parkway MP 53.6 (Bass River Twp)');
    expect(cam?.city).toBe('Bass River Twp, New Jersey');
    expect(mapNjtaCamera(njta(992, { mile_marker: 4, relative_text: 'Exit 4A' }), 'parkway')?.city).toBe('New Jersey');
    expect(mapNjtaCamera(njta(1, { relative_text: '' }), 'turnpike')?.name).toBe('NJ Turnpike MP 5.5');
  });

  it('leaves out other roads, other kinds, other hosts and misplaced rows', () => {
    expect(mapNjtaCamera(njta(1), 'service-areas')).toBeNull();
    expect(mapNjtaCamera(njta(1, { type: 'service_area' }), 'parkway')).toBeNull();
    expect(mapNjtaCamera(njta(1, { video_url: 'https://example.com/a.m3u8' }), 'turnpike')).toBeNull();
    expect(mapNjtaCamera(njta(1, { video_url: 'http://wink.njta.com/203/public/hls/a.m3u8' }), 'turnpike')).toBeNull();
    expect(mapNjtaCamera(njta(1, { lat: 0, lng: 0 }), 'turnpike')).toBeNull();
    expect(mapNjtaCamera(njta(1, { id: '../1' }), 'turnpike')).toBeNull();
  });

  it("reads the map data out of the page's HTML-escaped attribute", () => {
    const cameras = readCameraPage(page({ turnpike: [njta(47, { relative_text: "Gov't & Port (Newark)" })], parkway: [] }));
    expect(cameras.turnpike[0].relative_text).toBe("Gov't & Port (Newark)");
    expect(() => readCameraPage('<html></html>')).toThrow(/no map data/);
  });

  /** The page, and a playlist for every stream unless `missing` names it. */
  const authority = (cameras: Record<string, NjtaCamera[]>, missing: number[] = []) => vi.fn(async (url: string) => {
    if (!url.endsWith('.m3u8')) return new Response(page(cameras), { headers: { 'Content-Type': 'text/html' } });
    const id = Number(url.match(/-(\d+)_nj\.m3u8$/)![1]);
    return missing.includes(id)
      ? new Response('Not Found', { status: 404 })
      : new Response('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000000,\nWF05_nj2.ts\n');
  });

  it('reads both roads once per camera and keeps only the streams that answer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', authority({
      turnpike: [njta(47), njta(47), njta(28)],
      parkway: [njta(73, { relative_text: '(Bass River Twp)' })],
    }, [28]));
    expect((await fetchNewJerseyCameras()).map(c => c.id)).toEqual(['njta-47', 'njta-73']);
  });
});

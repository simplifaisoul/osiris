import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchMissouriCameras, loadMissouriCameras, mapMoDotCamera } from './missouri';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const cam = (html: string, location = '141 AT 21, MM 27.1', x = -90.424496, y = 38.4623) => ({ location, x, y, rtmp: null, html });
const FEED = [
  cam('https://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_100/playlist.m3u8'),
  cam('https://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_101/playlist.m3u8'),
  cam('https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_209/playlist.m3u8'),
  cam('https://S2.ozarkstrafficoneview.com/rtplive/CAM1045/playlist.m3u8', 'Battlefield and Fremont', -93.27, 37.16),
  cam('https://s2.ozarkstrafficoneview.com/rtplive/CAM1045/playlist.m3u8', 'Battlefield and Fremont', -93.27, 37.16),
  cam('https://traveler.modot.org/tisvc/api/Tms/CameraStream/K435WBC-07-LQ', 'I-435 WB At Metcalf Ave'),
];

/** The feed, and every playlist except those on the servers listed as down. */
const serve = (down: string[] = []) => vi.stubGlobal('fetch', vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => {
  if (url.endsWith('StreamingCams2.json')) return Response.json(FEED);
  if (down.includes(new URL(url).host)) throw new DOMException('The operation timed out', 'TimeoutError');
  return new Response('#EXTM3U\n#EXT-X-VERSION:3\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
}));

describe('MoDOT cameras', () => {
  it('maps a camera to its live stream, naming Springfield’s as Ozarks Traffic', () => {
    expect(mapMoDotCamera(FEED[0])).toEqual({
      id: 'modot-modot_cam_100',
      lat: 38.4623,
      lng: -90.424496,
      name: '141 AT 21, MM 27.1',
      city: 'Missouri',
      country: 'US',
      stream_url: 'https://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_100/playlist.m3u8',
      stream_type: 'hls',
      source: 'MoDOT',
    });
    expect(mapMoDotCamera(FEED[3])).toMatchObject({ id: 'modot-cam1045', city: 'Springfield', source: 'Ozarks Traffic', stream_url: 'https://s2.ozarkstrafficoneview.com/rtplive/CAM1045/playlist.m3u8' });
  });

  it('leaves out the KC Scout relay, misplaced cameras and anything but an https playlist', () => {
    expect(mapMoDotCamera(FEED[5])).toBeNull();
    expect(mapMoDotCamera(cam('https://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_1/playlist.m3u8', 'x', 0, 0))).toBeNull();
    expect(mapMoDotCamera(cam('http://sfs01-traveler.modot.mo.gov/rtplive/MODOT_CAM_1/playlist.m3u8'))).toBeNull();
    expect(mapMoDotCamera(cam('https://sfs01-traveler.modot.mo.gov/rtplive/../playlist.m3u8'))).toBeNull();
  });

  it('keeps only the cameras on streaming servers that answer, each once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    serve(['sfs02-traveler.modot.mo.gov']);
    expect((await fetchMissouriCameras()).map(c => c.id)).toEqual(['modot-modot_cam_100', 'modot-modot_cam_101', 'modot-cam1045']);
  });

  it('fails loudly when the list cannot be read, so the region keeps its last good one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await expect(loadMissouriCameras()).rejects.toThrow('MoDOT cameras HTTP 503');
  });
});

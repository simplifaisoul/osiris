import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchArlingtonCameras, mapArlingtonCamera, type ArlingtonCamera } from './arlington';
import { fetchVirginiaCameras } from './virginia';

vi.mock('./virginia', () => ({ fetchVirginiaCameras: vi.fn(async () => []) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

/** A row as Traffic+Cameras.json publishes it. */
const arl = (site: string, extra: Partial<ArlingtonCamera> = {}): ArlingtonCamera => ({
  'Camera Site': site,
  'Camera EncoderB2': 'Columbia Pike @ S Glebe  - 024',
  Latitude: 38.861252,
  Longitude: -77.09204,
  port: '8001',
  STATUS: 'ONLINE',
  ...extra,
});

describe('Arlington County cameras', () => {
  it("plays the County's live stream, ten ports above the one listed", () => {
    expect(mapArlingtonCamera(arl('cam2'))).toEqual({
      id: 'arlington-cam2',
      lat: 38.861252,
      lng: -77.09204,
      name: 'Columbia Pike @ S Glebe',
      city: 'Arlington, Virginia',
      country: 'US',
      stream_url: 'https://itsvideo.arlingtonva.us:8011/live/cam2.stream/playlist.m3u8',
      stream_type: 'hls',
      source: 'Arlington County',
    });
    expect(mapArlingtonCamera(arl('cam5', { port: '8003' }))?.stream_url).toBe('https://itsvideo.arlingtonva.us:8013/live/cam5.stream/playlist.m3u8');
  });

  it('leaves out offline cameras, odd sites and ports, and misplaced rows', () => {
    expect(mapArlingtonCamera(arl('cam2', { STATUS: 'OFFLINE' }))).toBeNull();
    expect(mapArlingtonCamera(arl('../cam2'))).toBeNull();
    expect(mapArlingtonCamera(arl('cam2', { port: '443' }))).toBeNull();
    expect(mapArlingtonCamera(arl('cam2', { port: '' }))).toBeNull();
    expect(mapArlingtonCamera(arl('cam2', { Latitude: 0, Longitude: 0 }))).toBeNull();
  });

  /** The County's list, and a playlist at `bandwidth` for every stream unless `playlists` says otherwise. */
  const county = (rows: ArlingtonCamera[], playlists: Record<string, number | null> = {}) => vi.fn(async (url: string) => {
    if (!url.endsWith('playlist.m3u8')) return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/octet-stream' } });
    const site = url.match(/\/live\/(cam\d+)\.stream\//)![1];
    const bandwidth = site in playlists ? playlists[site] : 490_604;
    return bandwidth === null
      ? new Response('Not Found', { status: 404 })
      : new Response(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=352x240
chunklist_w1.m3u8
`);
  });

  it('reads the list the County serves as octet-stream, once per camera', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', county([arl('cam1'), arl('cam1'), arl('cam2')]));
    expect((await fetchArlingtonCameras()).map(c => c.id)).toEqual(['arlington-cam1', 'arlington-cam2']);
  });

  it('keeps only the streams that answer at a rate the County can deliver', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', county([arl('cam1'), arl('cam2'), arl('cam3'), arl('cam4')], { cam2: null, cam3: 4_160_716, cam4: 1_000_000 }));
    expect((await fetchArlingtonCameras()).map(c => c.id)).toEqual(['arlington-cam1', 'arlington-cam4']);
  });

  it('leaves the cameras VDOT already shows to VDOT, and shows them all when VDOT is down', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', county([
      arl('cam1'),
      arl('cam2', { Latitude: 38.881657, Longitude: -77.095481 }),
    ]));
    vi.mocked(fetchVirginiaCameras).mockResolvedValueOnce([
      { id: 'vdot-1', lat: 38.861252, lng: -77.09204, name: 'COLUMBIA PIKE AT S GLEBE', city: 'Arlington County, Virginia', country: 'US', source: 'VDOT' },
    ]);
    expect((await fetchArlingtonCameras()).map(c => c.id)).toEqual(['arlington-cam2']);

    clearSourceCache();
    vi.mocked(fetchVirginiaCameras).mockRejectedValueOnce(new Error('down'));
    expect((await fetchArlingtonCameras()).map(c => c.id)).toEqual(['arlington-cam1', 'arlington-cam2']);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCaltransCameras, mapCaltransFeature, type CaltransAttributes } from './caltrans';

vi.mock('@/lib/stealthFetch', () => ({ stealthFetch: vi.fn() }));
import { stealthFetch } from '@/lib/stealthFetch';

/** A camera with live video, as the feature layer returns it. */
const streaming: CaltransAttributes = {
  OBJECTID: 1210,
  latitude: 36.70841,
  longitude: -119.73432,
  locationName: 'SR-99 : Dodge Ave',
  nearbyPlace: 'Fresno',
  county: 'Fresno',
  inService: 'True',
  currentImageURL: 'https://cwwp2.dot.ca.gov/data/d6/cctv/image/sr99dodgeave/sr99dodgeave.jpg',
  streamingVideoURL: 'https://wzmedia.dot.ca.gov/D6/99_Dodge_Ave.stream/playlist.m3u8',
};

describe('mapCaltransFeature', () => {
  it('maps a camera with live video to an HLS stream and keeps its still', () => {
    expect(mapCaltransFeature(streaming)).toEqual({
      id: 'cal-1210',
      lat: 36.70841,
      lng: -119.73432,
      name: 'SR-99 : Dodge Ave',
      city: 'Fresno',
      country: 'US',
      feed_url: 'https://cwwp2.dot.ca.gov/data/d6/cctv/image/sr99dodgeave/sr99dodgeave.jpg',
      stream_url: 'https://wzmedia.dot.ca.gov/D6/99_Dodge_Ave.stream/playlist.m3u8',
      stream_type: 'hls',
      source: 'Caltrans',
    });
  });

  it('trims a stream address that carries trailing spaces', () => {
    const cam = mapCaltransFeature({ ...streaming, streamingVideoURL: 'https://wzmedia.dot.ca.gov/D4/S101_at_Cesar_Chavez_Bl.stream/playlist.m3u8 ' });
    expect(cam?.stream_url).toBe('https://wzmedia.dot.ca.gov/D4/S101_at_Cesar_Chavez_Bl.stream/playlist.m3u8');
  });

  it('keeps the still but no stream when the address is not an https playlist', () => {
    const cam = mapCaltransFeature({ ...streaming, streamingVideoURL: 'rtsp://camera.example/live' });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
    expect(cam?.feed_url).toBe(streaming.currentImageURL);
  });

  it('gives an out-of-service camera no stream', () => {
    const cam = mapCaltransFeature({ ...streaming, inService: 'False' });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.feed_url).toBe(streaming.currentImageURL);
  });

  it('keeps a still-only camera as before', () => {
    const cam = mapCaltransFeature({ ...streaming, streamingVideoURL: null });
    expect(cam).toMatchObject({ id: 'cal-1210', feed_url: streaming.currentImageURL });
    expect(cam?.stream_url).toBeUndefined();
  });

  it('drops a row with no coordinates or no still', () => {
    expect(mapCaltransFeature({ ...streaming, latitude: null })).toBeNull();
    expect(mapCaltransFeature({ ...streaming, currentImageURL: null })).toBeNull();
  });
});

describe('fetchCaltransCameras', () => {
  afterEach(() => vi.mocked(stealthFetch).mockReset());

  const page = (ids: number[], more: boolean) => new Response(JSON.stringify({
    features: ids.map(id => ({ attributes: { ...streaming, OBJECTID: id } })),
    ...(more ? { exceededTransferLimit: true } : {}),
  }));

  it('pages past the layer’s 2,000-row cap', async () => {
    vi.mocked(stealthFetch)
      .mockResolvedValueOnce(page([1, 2], true))
      .mockResolvedValueOnce(page([3], false));
    const cams = await fetchCaltransCameras();
    expect(cams.map(c => c.id)).toEqual(['cal-1', 'cal-2', 'cal-3']);
    const urls = vi.mocked(stealthFetch).mock.calls.map(c => String(c[0]));
    expect(urls[0]).toContain('resultOffset=0');
    expect(urls[1]).toContain('resultOffset=2000');
  });

  it('keeps the pages already read when a later one fails', async () => {
    vi.mocked(stealthFetch)
      .mockResolvedValueOnce(page([1, 2], true))
      .mockRejectedValueOnce(new Error('timeout'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await fetchCaltransCameras()).map(c => c.id)).toEqual(['cal-1', 'cal-2']);
    warn.mockRestore();
  });
});

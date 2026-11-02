import { describe, it, expect } from 'vitest';
import { fetchDelawareCameras, parseDelaware, type DelawareCameraRecord } from './delaware';

/** A representative row from tmc.deldot.gov/json/videocamera.json. */
const sample: DelawareCameraRecord = {
  id: 'KCAM001',
  title: 'DE 1 @ MILFORD NECK ROAD (NORTH OFF)',
  county: 'Kent',
  lat: 38.990931,
  lon: -75.448625,
  enabled: true,
  status: 'Active',
  urls: {
    m3u8: 'http://video.deldot.gov:1935/live/KCAM001.stream/playlist.m3u8',
    m3u8s: 'https://video.deldot.gov:443/live/KCAM001.stream/playlist.m3u8',
  },
};

const feed = (...rows: DelawareCameraRecord[]) => ({ cameraCount: rows.length, videoCameras: rows });

describe('parseDelaware', () => {
  it('maps a camera to its HTTPS playlist', () => {
    expect(parseDelaware(feed(sample))).toEqual([{
      id: 'deldot-KCAM001',
      lat: 38.990931,
      lng: -75.448625,
      name: 'DE 1 @ MILFORD NECK ROAD (NORTH OFF)',
      city: 'Kent County, Delaware',
      country: 'US',
      stream_url: 'https://video.deldot.gov/live/KCAM001.stream/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://deldot.gov/map/',
      source: 'DelDOT',
    }]);
  });

  it('leaves out cameras DelDOT has switched off or marked unavailable', () => {
    expect(parseDelaware(feed({ ...sample, enabled: false }))).toEqual([]);
    expect(parseDelaware(feed({ ...sample, status: 'Unavailable' }))).toEqual([]);
  });

  it('never falls back to the plain-http stream, which an https page would block', () => {
    expect(parseDelaware(feed({ ...sample, urls: { m3u8: sample.urls!.m3u8 } }))).toEqual([]);
    expect(parseDelaware(feed({
      ...sample,
      urls: { m3u8s: 'http://video.deldot.gov:1935/live/KCAM001.stream/playlist.m3u8' },
    }))).toEqual([]);
  });

  it('only accepts playlists on DelDOT’s own stream host', () => {
    expect(parseDelaware(feed({
      ...sample,
      urls: { m3u8s: 'https://video.example.com/live/KCAM001.stream/playlist.m3u8' },
    }))).toEqual([]);
    expect(parseDelaware(feed({
      ...sample,
      urls: { m3u8s: 'https://video.deldot.gov.example.com/live/KCAM001.stream/playlist.m3u8' },
    }))).toEqual([]);
  });

  it('drops coordinates outside Delaware', () => {
    // The same camera, moved to Miami.
    expect(parseDelaware(feed({ ...sample, lat: 25.76, lon: -80.19 }))).toEqual([]);
    expect(parseDelaware(feed({ ...sample, lat: null }))).toEqual([]);
  });

  it('keeps one marker per camera id', () => {
    expect(parseDelaware(feed(sample, { ...sample, title: 'Duplicate' }))).toHaveLength(1);
  });

  it('names a camera by its id, and the state alone, when the feed has nothing useful', () => {
    const [cam] = parseDelaware(feed({ ...sample, title: ' ', county: null }));
    expect(cam.name).toBe('DelDOT Camera KCAM001');
    expect(cam.city).toBe('Delaware');
  });

  it('returns nothing for a payload that is not the camera list', () => {
    expect(parseDelaware(null)).toEqual([]);
    expect(parseDelaware({ status: 'error' })).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real DelDOT endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchDelawareCameras (live)', () => {
  liveIt('returns Delaware cameras with playable stream URLs', async () => {
    const cams = await fetchDelawareCameras();
    expect(cams.length).toBeGreaterThan(300);
    for (const cam of cams) {
      expect(cam.stream_url).toMatch(/^https:\/\/video\.deldot\.gov\/live\/[\w-]+\.stream\/playlist\.m3u8$/);
    }
  }, 20000);
});

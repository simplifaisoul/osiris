import { describe, it, expect } from 'vitest';
import { fetchMarylandCameras, parseMaryland, type MarylandCameraRecord } from './maryland';

/** A representative row from getCameraMapDataJSON.do. */
const sample: MarylandCameraRecord = {
  id: '7a00a1dc01250075004d823633235daa',
  name: 'I-270 & Old Hundred Rd (MD 109)',
  description: 'I-270 & Old Hundred Rd (MD 109)(CAM 165)',
  cctvIp: 'strmr5.sha.maryland.gov',
  lat: 39.2773,
  lon: -77.3236,
  cameraCategories: ['Wash. DC'],
  publicVideoURL: 'https://chart.maryland.gov/Video/GetVideo/7a00a1dc01250075004d823633235daa',
  opStatus: 'OK',
  commMode: 'ONLINE',
};

const feed = (...data: MarylandCameraRecord[]) => ({ data, success: true, totalCount: data.length });

describe('parseMaryland', () => {
  it('maps a camera to the stream CHART’s own player plays', () => {
    expect(parseMaryland(feed(sample))).toEqual([{
      id: 'chart-7a00a1dc01250075004d823633235daa',
      lat: 39.2773,
      lng: -77.3236,
      name: 'I-270 & Old Hundred Rd (MD 109)',
      city: 'Washington DC area, Maryland',
      country: 'US',
      stream_url: 'https://strmr5.sha.maryland.gov/rtplive/7a00a1dc01250075004d823633235daa/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://chart.maryland.gov/Video/GetVideo/7a00a1dc01250075004d823633235daa',
      source: 'MDOT SHA CHART',
    }]);
  });

  it('keeps every camera whatever CHART reports about its health', () => {
    const cams = parseMaryland(feed(
      { ...sample, id: 'a'.repeat(32), opStatus: 'COMM_FAILURE' },
      { ...sample, id: 'b'.repeat(32), opStatus: 'COMM_MARGINAL' },
      { ...sample, id: 'c'.repeat(32), commMode: 'OFFLINE' },
    ));
    expect(cams).toHaveLength(3);
  });

  it('names a camera by its description when CHART’s name is a bare device number', () => {
    const [cam] = parseMaryland(feed({ ...sample, name: '710002', description: 'I-70 East of I-270' }));
    expect(cam.name).toBe('I-70 East of I-270');
  });

  it('falls back to the id when there is no usable name or description', () => {
    const [cam] = parseMaryland(feed({ ...sample, name: ' ', description: null }));
    expect(cam.name).toBe('CHART Camera 7a00a1dc');
  });

  it('labels the region as CHART groups it, and the state alone without one', () => {
    expect(parseMaryland(feed({ ...sample, cameraCategories: ['Eastern Shore'] }))[0].city).toBe('Eastern Shore, Maryland');
    expect(parseMaryland(feed({ ...sample, cameraCategories: ['Western MD'] }))[0].city).toBe('Western Maryland');
    expect(parseMaryland(feed({ ...sample, cameraCategories: [] }))[0].city).toBe('Maryland');
  });

  it('only builds streams on CHART’s own servers', () => {
    expect(parseMaryland(feed({ ...sample, cctvIp: 'strmr5.example.com' }))).toEqual([]);
    expect(parseMaryland(feed({ ...sample, cctvIp: 'strmr5.sha.maryland.gov.example.com' }))).toEqual([]);
    expect(parseMaryland(feed({ ...sample, cctvIp: null }))).toEqual([]);
  });

  it('rejects an id that is not CHART’s hex device id', () => {
    expect(parseMaryland(feed({ ...sample, id: '../../etc' }))).toEqual([]);
    expect(parseMaryland(feed({ ...sample, id: null }))).toEqual([]);
  });

  it('links to the camera’s CHART page, rebuilding it when the feed’s link is not CHART’s', () => {
    const [cam] = parseMaryland(feed({ ...sample, publicVideoURL: 'https://example.com/x' }));
    expect(cam.external_url).toBe('https://chart.maryland.gov/Video/GetVideo/7a00a1dc01250075004d823633235daa');
  });

  it('drops coordinates outside Maryland', () => {
    // The same camera, moved to Miami.
    expect(parseMaryland(feed({ ...sample, lat: 25.76, lon: -80.19 }))).toEqual([]);
    expect(parseMaryland(feed({ ...sample, lat: null }))).toEqual([]);
  });

  it('keeps one marker per camera id', () => {
    expect(parseMaryland(feed(sample, { ...sample, name: 'Duplicate' }))).toHaveLength(1);
  });

  it('returns nothing for a payload that is not the camera feed', () => {
    expect(parseMaryland(null)).toEqual([]);
    expect(parseMaryland({ success: false, error: 'down' })).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real CHART feed).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchMarylandCameras (live)', () => {
  liveIt('returns Maryland cameras with CHART stream URLs', async () => {
    const cams = await fetchMarylandCameras();
    expect(cams.length).toBeGreaterThan(400);
    for (const cam of cams) {
      expect(cam.stream_url).toMatch(/^https:\/\/strmr\d+\.sha\.maryland\.gov\/rtplive\/[0-9a-f]+\/playlist\.m3u8$/);
    }
  }, 30000);
});

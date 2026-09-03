import { describe, it, expect } from 'vitest';
import { fetchLouisianaCameras, mapRecord, type LouisianaCameraRecord } from './louisiana';

/** A representative row from 511la.org/List/GetData/Cameras. */
const sample: LouisianaCameraRecord = {
  id: 1,
  roadway: 'I-20',
  location: 'I-20 at I-220 Off Ramp',
  latLng: { geography: { wellKnownText: 'POINT (-93.630833 32.538889)' } },
  images: [{
    id: 1,
    description: 'Traffic closest to this camera is traveling eastbound on I-20.',
    imageUrl: '/map/Cctv/1',
    videoUrl: 'https://ITSStreamingBR2.dotd.la.gov/public/shr-cam-030.streams/playlist.m3u8',
    blocked: false,
    disabled: false,
  }],
};

describe('mapRecord', () => {
  it('labels the camera by its cross-street, not the traffic-direction blurb', () => {
    expect(mapRecord(sample)).toEqual({
      id: 'ladotd-1',
      lat: 32.538889,
      lng: -93.630833,
      name: 'I-20 at I-220 Off Ramp',
      city: 'Louisiana',
      country: 'US',
      feed_url: 'https://511la.org/map/Cctv/1',
      stream_url: 'https://ITSStreamingBR2.dotd.la.gov/public/shr-cam-030.streams/playlist.m3u8',
      stream_type: 'hls',
      source: 'LADOTD',
    });
  });

  it('falls back to the roadway, then the caption, when there is no location', () => {
    expect(mapRecord({ ...sample, location: null })?.name).toBe('I-20');
    expect(mapRecord({ ...sample, location: 'N/A', roadway: null })?.name)
      .toBe('Traffic closest to this camera is traveling eastbound on I-20.');
    expect(mapRecord({ ...sample, location: null, roadway: null, images: [{ ...sample.images![0], description: null }] })?.name)
      .toBe('LADOTD Camera 1');
  });

  /* One real row advertises `/snapshots?…&ext=.jpg` as its videoUrl, and that
     address answers with a JPEG. Handing it to an HLS player would break a
     camera that has a perfectly good snapshot. */
  it('keeps the snapshot when videoUrl is not actually a playlist', () => {
    const cam = mapRecord({
      ...sample,
      images: [{
        ...sample.images![0],
        videoUrl: 'http://ITSStreamingNO.dotd.la.gov:1935/snapshots?application=public&snap=ns-cam-059.streams&ext=.jpg',
      }],
    });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
    expect(cam?.feed_url).toBe('https://511la.org/map/Cctv/1');
  });

  it('ignores a video feed the operator has switched off', () => {
    const cam = mapRecord({ ...sample, images: [{ ...sample.images![0], videoDisabled: true }] });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.feed_url).toBe('https://511la.org/map/Cctv/1');
  });

  it('drops blocked, disabled and imageless rows', () => {
    expect(mapRecord({ ...sample, images: [{ ...sample.images![0], blocked: true }] })).toBeNull();
    expect(mapRecord({ ...sample, images: [{ ...sample.images![0], disabled: true }] })).toBeNull();
    expect(mapRecord({ ...sample, images: [] })).toBeNull();
  });

  it('drops rows without usable coordinates, and any that land outside Louisiana', () => {
    expect(mapRecord({ ...sample, latLng: null })).toBeNull();
    expect(mapRecord({ ...sample, latLng: { geography: { wellKnownText: 'POINT (0 0)' } } })).toBeNull();
    // Houston — over the Texas line, so not ours to draw.
    expect(mapRecord({ ...sample, latLng: { geography: { wellKnownText: 'POINT (-95.37 29.76)' } } })).toBeNull();
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real 511LA endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchLouisianaCameras (live)', () => {
  liveIt('pages the whole state and returns well-formed cameras', async () => {
    const cams = await fetchLouisianaCameras();
    expect(cams.length).toBeGreaterThan(300);
    expect(new Set(cams.map(c => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.id).toMatch(/^ladotd-\d+$/);
      expect(cam.country).toBe('US');
      expect(cam.source).toBe('LADOTD');
      expect(cam.feed_url).toMatch(/^https:\/\/511la\.org\/map\/Cctv\/\d+$/);
      expect(cam.lat).toBeGreaterThan(28.8);
      expect(cam.lat).toBeLessThan(33.1);
      expect(cam.lng).toBeGreaterThan(-94.2);
      expect(cam.lng).toBeLessThan(-88.6);
      if (cam.stream_url) {
        expect(cam.stream_type).toBe('hls');
        expect(cam.stream_url).toMatch(/\.m3u8$/);
      }
    }

    // Nearly all of them stream; the map should be showing video, not stills.
    expect(cams.filter(c => c.stream_url).length).toBeGreaterThan(cams.length * 0.9);
  }, 60_000);
});

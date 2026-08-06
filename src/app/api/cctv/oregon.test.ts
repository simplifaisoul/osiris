import { describe, it, expect } from 'vitest';
import { mapFeature, fetchOregonCameras, type TripCheckFeature } from './oregon';

// A representative feature from cctvinventory.js
const sample: TripCheckFeature = {
  attributes: {
    cameraId: 277,
    filename: 'AstoriaUS101MeglerBrNB_pid392.jpg',
    latitude: 46.18785,
    longitude: -123.85347,
    route: 'US101 ',
    title: 'US101 at Astoria - ODOT District Office',
  },
};

const withAttrs = (patch: Record<string, unknown>): TripCheckFeature => ({
  attributes: { ...sample.attributes, ...patch },
});

describe('mapFeature', () => {
  it('maps a valid feature to a CctvCamera', () => {
    expect(mapFeature(sample)).toEqual({
      id: 'odot-277',
      lat: 46.18785,
      lng: -123.85347,
      name: 'US101 at Astoria - ODOT District Office',
      city: 'US101',
      country: 'US',
      feed_url: 'https://tripcheck.com/RoadCams/cams/AstoriaUS101MeglerBrNB_pid392.jpg',
      source: 'ODOT TripCheck',
    });
  });

  it('falls back to route then a default name', () => {
    expect(mapFeature(withAttrs({ title: null }))?.name).toBe('US101');
    expect(mapFeature(withAttrs({ title: null, route: null }))?.name).toBe('ODOT Camera 277');
  });

  it('skips features without an id or filename', () => {
    expect(mapFeature(withAttrs({ cameraId: null }))).toBeNull();
    expect(mapFeature(withAttrs({ filename: null }))).toBeNull();
    expect(mapFeature({})).toBeNull();
  });

  it('skips features without usable coordinates', () => {
    expect(mapFeature(withAttrs({ latitude: null }))).toBeNull();
    expect(mapFeature(withAttrs({ longitude: undefined }))).toBeNull();
  });

  it('drops coordinates outside the Oregon bounding box', () => {
    // London — well outside Oregon
    expect(mapFeature(withAttrs({ latitude: 51.5072, longitude: -0.1276 }))).toBeNull();
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real TripCheck endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchOregonCameras (live)', () => {
  liveIt('fetches a large set of well-formed Oregon cameras', async () => {
    const cams = await fetchOregonCameras();
    expect(cams.length).toBeGreaterThan(500);
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.id).toMatch(/^odot-\d+$/);
      expect(cam.country).toBe('US');
      expect(cam.source).toBe('ODOT TripCheck');
      expect(cam.feed_url).toMatch(/^https:\/\/tripcheck\.com\/RoadCams\/cams\/.+$/);
      expect(cam.lat).toBeGreaterThan(41.9);
      expect(cam.lat).toBeLessThan(46.3);
      expect(cam.lng).toBeGreaterThan(-124.6);
      expect(cam.lng).toBeLessThan(-116.4);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { mapRecord, fetchMichiganCameras, type MiDriveRecord } from './michigan';

// A representative record from /MiDrive/camera/list — MiDrive embeds values in HTML.
const sample: MiDriveRecord = {
  route: '11 Mile',
  county:
    'Wayne County <a href="/MiDrive/map?cameras=true&lat=42.491304&lon=-83.04479&zoom=15&id=1129"target="_blank">Go to</a>',
  location: ' @ Mound NB',
  direction: 'Traffic closest to camera is traveling north.',
  image:
    '<img alt="north" id="1129Img" src="https://micamerasimages.net/thumbs/semtoc_cam_253.flv.jpg?item=1" height="170"><div id="1129Div"></div>',
};

describe('mapRecord', () => {
  it('extracts coordinates, id and frame URL out of the embedded HTML', () => {
    expect(mapRecord(sample)).toEqual({
      id: 'mdot-1129',
      lat: 42.491304,
      lng: -83.04479,
      name: '11 Mile @ Mound NB',
      city: 'Wayne County',
      country: 'US',
      feed_url: 'https://micamerasimages.net/thumbs/semtoc_cam_253.flv.jpg?item=1',
      source: 'MDOT MiDrive',
    });
  });

  it('strips the "Go to" anchor out of the county label', () => {
    expect(mapRecord(sample)?.city).toBe('Wayne County');
  });

  it('handles &amp;-escaped query separators', () => {
    const escaped = {
      ...sample,
      county: sample.county!.replace('&lat=', '&amp;lat=').replace('&lon=', '&amp;lon='),
    };
    expect(mapRecord(escaped)?.lat).toBe(42.491304);
  });

  it('falls back to a default name when route and location are empty', () => {
    expect(mapRecord({ ...sample, route: null, location: null })?.name).toBe('MDOT Camera 1129');
  });

  it('skips records missing coordinates, an id, or an image src', () => {
    expect(mapRecord({ ...sample, county: 'Wayne County' })).toBeNull();
    expect(mapRecord({ ...sample, image: '<img src="/relative/path.jpg">' })).toBeNull();
    expect(mapRecord({})).toBeNull();
  });

  it('drops coordinates outside the Michigan bounding box', () => {
    // London — well outside Michigan
    const bad = {
      ...sample,
      county: sample.county!.replace('lat=42.491304&lon=-83.04479', 'lat=51.5072&lon=-0.1276'),
    };
    expect(mapRecord(bad)).toBeNull();
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real MiDrive endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchMichiganCameras (live)', () => {
  liveIt('fetches a large set of well-formed Michigan cameras', async () => {
    const cams = await fetchMichiganCameras();
    expect(cams.length).toBeGreaterThan(400);
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.id).toMatch(/^mdot-\d+$/);
      expect(cam.country).toBe('US');
      expect(cam.source).toBe('MDOT MiDrive');
      expect(cam.feed_url).toMatch(/^https?:\/\//);
      expect(cam.lat).toBeGreaterThan(41.6);
      expect(cam.lat).toBeLessThan(48.3);
      expect(cam.lng).toBeGreaterThan(-90.5);
      expect(cam.lng).toBeLessThan(-82.1);
    }
  });
});

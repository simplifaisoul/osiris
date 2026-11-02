import { describe, it, expect } from 'vitest';
import { fetchSouthCarolinaCameras, parseSouthCarolina, type SouthCarolinaCameraFeature } from './southcarolina';

/** A representative feature from icons.cameras.geojson. */
const sample: SouthCarolinaCameraFeature = {
  geometry: { type: 'Point', coordinates: [-79.062775, 33.845627] },
  properties: {
    id: 'e71ff390-d2a0-11e6-8996-0123456789ab',
    name: '50001',
    description: 'US 501 N @ 16th Ave',
    route: 'US 501',
    jurisdiction: 'Myrtle Beach',
    active: true,
    problem_stream: false,
    https_url: 'https://s18.us-east-1.skyvdn.com/rtplive/50001/playlist.m3u8',
    image_url: 'https://scdotsnap.us-east-1.skyvdn.com/thumbs/50001.flv.png',
  },
};

const layer = (...features: SouthCarolinaCameraFeature[]) => ({ type: 'FeatureCollection', features });
const withProps = (props: SouthCarolinaCameraFeature['properties']): SouthCarolinaCameraFeature => ({
  ...sample,
  properties: { ...sample.properties, ...props },
});

describe('parseSouthCarolina', () => {
  it('maps a camera to its HLS stream and keeps the snapshot', () => {
    expect(parseSouthCarolina(layer(sample))).toEqual([{
      id: 'scdot-e71ff390-d2a0-11e6-8996-0123456789ab',
      lat: 33.845627,
      lng: -79.062775,
      name: 'US 501 N @ 16th Ave',
      city: 'Myrtle Beach, South Carolina',
      country: 'US',
      feed_url: 'https://scdotsnap.us-east-1.skyvdn.com/thumbs/50001.flv.png',
      stream_url: 'https://s18.us-east-1.skyvdn.com/rtplive/50001/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://www.511sc.org/',
      source: 'SCDOT',
    }]);
  });

  it('leaves out cameras SCDOT has switched off or flagged as problem streams', () => {
    expect(parseSouthCarolina(layer(withProps({ active: false })))).toEqual([]);
    expect(parseSouthCarolina(layer(withProps({ problem_stream: true })))).toEqual([]);
  });

  it('falls back to the snapshot when the stream is missing or not SCDOT’s own', () => {
    const [noStream] = parseSouthCarolina(layer(withProps({ https_url: null })));
    expect(noStream.stream_url).toBeUndefined();
    expect(noStream.feed_url).toBe(sample.properties!.image_url);

    const [foreign] = parseSouthCarolina(layer(withProps({
      https_url: 'https://s18.skyvdn.com.example.com/rtplive/50001/playlist.m3u8',
    })));
    expect(foreign.stream_url).toBeUndefined();
  });

  it('never uses a plain-http stream, which an https page would block', () => {
    const [cam] = parseSouthCarolina(layer(withProps({
      https_url: 'http://s18.us-east-1.skyvdn.com/rtplive/50001/playlist.m3u8',
    })));
    expect(cam.stream_url).toBeUndefined();
  });

  it('drops a camera with neither a stream nor a snapshot', () => {
    expect(parseSouthCarolina(layer(withProps({ https_url: null, image_url: null })))).toEqual([]);
  });

  it('drops coordinates outside South Carolina', () => {
    // The same camera, moved to Miami.
    expect(parseSouthCarolina(layer({ ...sample, geometry: { type: 'Point', coordinates: [-80.19, 25.76] } }))).toEqual([]);
    expect(parseSouthCarolina(layer({ ...sample, geometry: null }))).toEqual([]);
  });

  it('keeps one marker per camera id', () => {
    expect(parseSouthCarolina(layer(sample, withProps({ description: 'Duplicate' })))).toHaveLength(1);
  });

  it('names a camera by its route, then its device number, and the state alone, when the feed has less', () => {
    const [byRoute] = parseSouthCarolina(layer(withProps({ description: ' ' })));
    expect(byRoute.name).toBe('US 501');
    const [byDevice] = parseSouthCarolina(layer(withProps({ description: null, route: null, jurisdiction: null })));
    expect(byDevice.name).toBe('SCDOT Camera 50001');
    expect(byDevice.city).toBe('South Carolina');
  });

  it('returns nothing for a payload that is not the camera layer', () => {
    expect(parseSouthCarolina(null)).toEqual([]);
    expect(parseSouthCarolina({ type: 'FeatureCollection' })).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real 511SC camera layer).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchSouthCarolinaCameras (live)', () => {
  liveIt('returns South Carolina cameras with playable stream URLs', async () => {
    const cams = await fetchSouthCarolinaCameras();
    expect(cams.length).toBeGreaterThan(600);
    for (const cam of cams) {
      if (cam.stream_url) {
        expect(cam.stream_url).toMatch(/^https:\/\/s\d+\.us-east-1\.skyvdn\.com\/rtplive\/[\w-]+\/playlist\.m3u8$/);
      }
    }
  }, 30000);
});

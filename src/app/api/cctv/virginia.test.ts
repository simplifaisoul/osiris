import { describe, it, expect } from 'vitest';
import { fetchVirginiaCameras, parseVirginia, type VirginiaCameraFeature } from './virginia';

/** A representative feature from /services/511/map/layers/map/cams. */
const sample: VirginiaCameraFeature = {
  geometry: { type: 'Point', coordinates: [-77.3055, 38.84519] },
  properties: {
    id: '3958',
    description: 'University Drive and Sager Avenue',
    route: '',
    jurisdiction: 'City of Fairfax',
    active: true,
    problem_stream: false,
    https_url: 'https://media-sfs7.vdotcameras.com/rtplive/0i6a7bfbs60yq2lbgivq0b8xk3scij3c/playlist.m3u8',
    image_url: 'https://snapshot.vdotcameras.com/thumbs/0i6a7bfbs60yq2lbgivq0b8xk3scij3c.flv.png',
  },
};

const layer = (...features: VirginiaCameraFeature[]) => ({ type: 'FeatureCollection', features });
const withProps = (props: VirginiaCameraFeature['properties']): VirginiaCameraFeature => ({
  ...sample,
  properties: { ...sample.properties, ...props },
});

describe('parseVirginia', () => {
  it('maps a camera to its HLS stream and keeps the snapshot', () => {
    expect(parseVirginia(layer(sample))).toEqual([{
      id: 'vdot-3958',
      lat: 38.84519,
      lng: -77.3055,
      name: 'University Drive and Sager Avenue',
      city: 'City of Fairfax, Virginia',
      country: 'US',
      feed_url: 'https://snapshot.vdotcameras.com/thumbs/0i6a7bfbs60yq2lbgivq0b8xk3scij3c.flv.png',
      stream_url: 'https://media-sfs7.vdotcameras.com/rtplive/0i6a7bfbs60yq2lbgivq0b8xk3scij3c/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://511.vdot.virginia.gov/',
      source: 'VDOT',
    }]);
  });

  it('leaves out cameras VDOT has switched off or flagged as problem streams', () => {
    expect(parseVirginia(layer(withProps({ active: false })))).toEqual([]);
    expect(parseVirginia(layer(withProps({ problem_stream: true })))).toEqual([]);
  });

  it('falls back to the snapshot when the stream is missing or not VDOT’s own', () => {
    const [noStream] = parseVirginia(layer(withProps({ https_url: null })));
    expect(noStream.stream_url).toBeUndefined();
    expect(noStream.feed_url).toBe(sample.properties!.image_url);

    const [foreign] = parseVirginia(layer(withProps({
      https_url: 'https://media.vdotcameras.com.example.com/rtplive/x/playlist.m3u8',
    })));
    expect(foreign.stream_url).toBeUndefined();
  });

  it('never uses a plain-http stream, which an https page would block', () => {
    const [cam] = parseVirginia(layer(withProps({
      https_url: 'http://media-sfs7.vdotcameras.com/rtplive/x/playlist.m3u8',
    })));
    expect(cam.stream_url).toBeUndefined();
  });

  it('drops a camera with neither a stream nor a snapshot', () => {
    expect(parseVirginia(layer(withProps({ https_url: null, image_url: null })))).toEqual([]);
  });

  it('drops coordinates outside Virginia, including a flipped longitude', () => {
    // The live feed has one camera at +77.27, which would put it in Asia.
    expect(parseVirginia(layer({ ...sample, geometry: { type: 'Point', coordinates: [77.266727, 38.880113] } }))).toEqual([]);
    expect(parseVirginia(layer({ ...sample, geometry: null }))).toEqual([]);
  });

  it('keeps one marker per camera id', () => {
    expect(parseVirginia(layer(sample, withProps({ description: 'Duplicate' })))).toHaveLength(1);
  });

  it('names a camera by its route, then its id, and the state alone, when the feed has less', () => {
    const [byRoute] = parseVirginia(layer(withProps({ description: ' ', route: 'I-95' })));
    expect(byRoute.name).toBe('I-95');
    const [byId] = parseVirginia(layer(withProps({ description: null, route: null, jurisdiction: null })));
    expect(byId.name).toBe('VDOT Camera 3958');
    expect(byId.city).toBe('Virginia');
  });

  it('returns nothing for a payload that is not the camera layer', () => {
    expect(parseVirginia(null)).toEqual([]);
    expect(parseVirginia({ type: 'FeatureCollection' })).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real VDOT 511 endpoint).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchVirginiaCameras (live)', () => {
  liveIt('returns Virginia cameras with playable stream URLs', async () => {
    const cams = await fetchVirginiaCameras();
    expect(cams.length).toBeGreaterThan(1000);
    for (const cam of cams) {
      if (cam.stream_url) {
        expect(cam.stream_url).toMatch(/^https:\/\/media-sfs\d+\.vdotcameras\.com\/rtplive\/[\w-]+\/playlist\.m3u8$/);
      }
    }
  }, 30000);
});

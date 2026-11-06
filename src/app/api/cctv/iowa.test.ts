import { describe, it, expect } from 'vitest';
import { mapFeature, cleanTitle, type IowaFeature } from './iowa';

/** A video camera, verbatim from 511ia.org's MapFeatures response. */
const videoCamera: IowaFeature = {
  title: 'I-235: WWD - I-235 @ MM 8.7',
  uri: 'camera/59652622',
  features: [{ geometry: { coordinates: [-93.61956, 41.59574] } }],
  __typename: 'Camera',
  active: true,
  views: [{
    category: 'VIDEO',
    url: 'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/wwd67hd.jpeg?1793913960000',
    sources: [{ type: 'application/x-mpegURL', src: 'https://video4.iowadot.gov:8888/ankeny/wwd67lb/playlist.m3u8' }],
  }],
};

/** A road-weather camera: a still and no video. */
const stillCamera: IowaFeature = {
  title: 'I-380: RWIS - I-380 MM 71 @ Waterloo',
  uri: 'camera/59652620',
  features: [{ geometry: { coordinates: [-92.309, 42.45567] } }],
  __typename: 'Camera',
  active: true,
  views: [{ category: 'IMAGE', url: 'https://atmsqf.iowadot.gov/snapshots/public/RWIS/RWIS_46-00.jpg?1793913960000', sources: null }],
};

describe('mapFeature', () => {
  it('maps a video camera to its HLS stream and keeps its still', () => {
    expect(mapFeature(videoCamera)).toEqual({
      id: 'iadot-59652622',
      lat: 41.59574,
      lng: -93.61956,
      name: 'I-235 @ MM 8.7',
      city: 'Iowa',
      country: 'US',
      feed_url: 'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/wwd67hd.jpeg',
      stream_url: 'https://video4.iowadot.gov:8888/ankeny/wwd67lb/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://511ia.org/@41.59574,-93.61956,14?show=camera%2F59652622',
      source: 'Iowa DOT',
    });
  });

  it('maps a still-only camera without a stream', () => {
    const cam = mapFeature(stillCamera);
    expect(cam?.feed_url).toBe('https://atmsqf.iowadot.gov/snapshots/public/RWIS/RWIS_46-00.jpg');
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
  });

  it('keeps a video camera whose still is the "camera closed" icon, stream only', () => {
    const cam = mapFeature({
      ...videoCamera,
      views: [{ ...videoCamera.views![0], url: '/images/icon-camera-closed-fill-solid-padded.svg' }],
    });
    expect(cam?.feed_url).toBeUndefined();
    expect(cam?.stream_type).toBe('hls');
  });

  it('drops a camera with neither a still nor a stream', () => {
    expect(mapFeature({
      ...videoCamera,
      views: [{ category: 'VIDEO', url: '/images/icon-camera-closed-fill-solid-padded.svg', sources: [] }],
    })).toBeNull();
  });

  it('ignores a stream that is not an https playlist', () => {
    const cam = mapFeature({
      ...videoCamera,
      views: [{ ...videoCamera.views![0], sources: [{ type: 'application/x-mpegURL', src: 'http://video4.iowadot.gov/x/playlist.m3u8' }] }],
    });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.feed_url).toBeDefined();
  });

  it('drops inactive cameras, non-camera features and coordinates outside Iowa', () => {
    expect(mapFeature({ ...videoCamera, active: false })).toBeNull();
    expect(mapFeature({ ...videoCamera, __typename: 'Event' })).toBeNull();
    expect(mapFeature({ ...videoCamera, features: [{ geometry: { coordinates: [-118.24, 34.05] } }] })).toBeNull();
  });

  it('drops a record with no coordinates or no id', () => {
    expect(mapFeature({ ...videoCamera, features: [] })).toBeNull();
    expect(mapFeature({ ...videoCamera, uri: null })).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('drops the route and area code in front of the place', () => {
    expect(cleanTitle('I-235: WWD - I-235 @ MM 8.7')).toBe('I-235 @ MM 8.7');
    expect(cleanTitle('I-80: 1EA - I-35/80 @ MM 125 (IWZ 3125)')).toBe('I-35/80 @ MM 125 (IWZ 3125)');
    expect(cleanTitle('Unknown: DM - I-35 @ MM 100.15 (NE 158TH Ave.)')).toBe('I-35 @ MM 100.15 (NE 158TH Ave.)');
  });

  it('drops a route that is only repeated', () => {
    expect(cleanTitle('I-80: I-80 @ MM 73.7')).toBe('I-80 @ MM 73.7');
  });

  it('keeps any other title whole', () => {
    expect(cleanTitle('IA 2: R81: Bloomfield')).toBe('IA 2: R81: Bloomfield');
  });
});

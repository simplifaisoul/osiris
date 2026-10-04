import { describe, it, expect } from 'vitest';
import { mapFeature, type WsdotFeature } from './washington';

// A representative feature from TravelInfoCamerasWeather.
const sample: WsdotFeature = {
  attributes: {
    OBJECTID: 1003,
    CameraTitle: 'I-5 at MP 3.2: Main St',
    ImageURL: 'https://images.wsdot.wa.gov/sw/005vc00320.jpg',
    CompassDirection: 'N',
  },
  geometry: { x: -122.665898, y: 45.659428 },
};

const withAttrs = (patch: Record<string, unknown>): WsdotFeature => ({
  ...sample,
  attributes: { ...sample.attributes, ...patch },
});

describe('mapFeature', () => {
  it('maps a valid feature and routes the still through the camera proxy', () => {
    expect(mapFeature(sample)).toEqual({
      id: 'wsdot-1003',
      lat: 45.659428,
      lng: -122.665898,
      name: 'I-5 at MP 3.2: Main St N',
      city: 'Washington',
      country: 'US',
      feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fimages.wsdot.wa.gov%2Fsw%2F005vc00320.jpg',
      source: 'WSDOT',
    });
  });

  it('falls back to a default name', () => {
    expect(mapFeature(withAttrs({ CameraTitle: null }))?.name).toBe('WSDOT Camera 1003 N');
  });

  it('skips features without an id or image', () => {
    expect(mapFeature(withAttrs({ OBJECTID: null }))).toBeNull();
    expect(mapFeature(withAttrs({ ImageURL: '  ' }))).toBeNull();
  });

  it('drops a camera outside Washington', () => {
    expect(mapFeature({ ...sample, geometry: { x: -118.2, y: 34.05 } })).toBeNull();
  });
});

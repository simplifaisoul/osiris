import { describe, it, expect } from 'vitest';
import { mapOhgoRecord, type OhgoCameraRecord } from './ohio';

/** A real row from publicapi.ohgo.com/api/v1/cameras. */
const sample: OhgoCameraRecord = {
  id: '00000000000001',
  latitude: 41.50557,
  longitude: -82.84921,
  location: 'SR-2 at S Lightner Rd, 5060',
  description: 'SR-2 at S Lightner Rd, 5060',
  cameraViews: [{
    direction: 'View',
    smallUrl: 'https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-WestSign.jpg',
    largeUrl: 'https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-WestSign.jpg',
    mainRoute: 'SR-2 at S Lightner Rd, 5060',
  }],
};

describe('mapOhgoRecord', () => {
  it('maps a camera site to its snapshot', () => {
    expect(mapOhgoRecord(sample)).toEqual({
      id: 'ohgo-00000000000001',
      lat: 41.50557,
      lng: -82.84921,
      name: 'SR-2 at S Lightner Rd, 5060',
      city: 'Ohio',
      country: 'US',
      feed_url: 'https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-WestSign.jpg',
      stream_type: 'jpg',
      source: 'ODOT',
    });
  });

  it('falls back to the small image when only that one is published', () => {
    const cam = mapOhgoRecord({
      ...sample,
      cameraViews: [{ ...sample.cameraViews![0], largeUrl: null }],
    });
    expect(cam?.feed_url).toBe('https://itscameras.dot.state.oh.us:443/images/toledo/SR2-EB-WestSign.jpg');
  });

  it('drops a site with no usable image', () => {
    expect(mapOhgoRecord({ ...sample, cameraViews: [{ direction: 'View' }] })).toBeNull();
    expect(mapOhgoRecord({ ...sample, cameraViews: [] })).toBeNull();
    expect(mapOhgoRecord({ ...sample, cameraViews: null })).toBeNull();
  });

  it('drops coordinates outside Ohio', () => {
    // The same camera, moved to Miami.
    expect(mapOhgoRecord({ ...sample, latitude: 25.76, longitude: -80.19 })).toBeNull();
    expect(mapOhgoRecord({ ...sample, latitude: undefined })).toBeNull();
    expect(mapOhgoRecord({ ...sample, latitude: 0, longitude: 0 })).toBeNull();
  });

  it('drops a row with no id', () => {
    expect(mapOhgoRecord({ ...sample, id: undefined })).toBeNull();
    expect(mapOhgoRecord({ ...sample, id: '  ' })).toBeNull();
  });

  /* Every row ODOT publishes repeats `location` in `description` and
     `mainRoute`, so the fallbacks only matter if that ever stops being true. */
  it('names a camera by its id when the feed has nothing useful', () => {
    expect(mapOhgoRecord({
      ...sample,
      location: null,
      description: 'N/A',
      cameraViews: [{ ...sample.cameraViews![0], mainRoute: null }],
    })?.name).toBe('ODOT Camera 00000000000001');
  });
});

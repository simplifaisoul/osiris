import { describe, it, expect } from 'vitest';
import { mapRecord, type NevadaCameraRecord } from './nevada';

/** A representative row from /List/GetData/Cameras. */
const sample: NevadaCameraRecord = {
  id: 2,
  roadway: 'McCarran & Caughlin/cashill',
  location: 'N/A',
  latLng: { geography: { wellKnownText: 'POINT (-119.8 39.5)' } },
  images: [{
    id: 2,
    description: 'McCarran & Caughlin/cashill',
    imageUrl: '/map/Cctv/2',
    videoUrl: 'https://d2wse2.its.nv.gov:443/renoxcd02/abc_public.stream/playlist.m3u8',
    blocked: false,
    disabled: false,
  }],
};

describe('mapRecord', () => {
  it('takes the HLS URL straight from the feed, and keeps the snapshot', () => {
    expect(mapRecord(sample)).toEqual({
      id: 'ndot-2',
      lat: 39.5,
      lng: -119.8,
      name: 'McCarran & Caughlin/cashill',
      city: 'Nevada',
      country: 'US',
      feed_url: 'https://www.nvroads.com/map/Cctv/2',
      stream_url: 'https://d2wse2.its.nv.gov:443/renoxcd02/abc_public.stream/playlist.m3u8',
      stream_type: 'hls',
      source: 'NDOT',
    });
  });

  it('falls back to a snapshot when the camera has no video', () => {
    const cam = mapRecord({
      ...sample,
      images: [{ ...sample.images![0], videoUrl: null }],
    });
    expect(cam?.feed_url).toBe('https://www.nvroads.com/map/Cctv/2');
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
  });

  it('ignores a video feed the operator has switched off', () => {
    const cam = mapRecord({
      ...sample,
      images: [{ ...sample.images![0], videoDisabled: true }],
    });
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.feed_url).toBe('https://www.nvroads.com/map/Cctv/2');
  });

  it('drops blocked, disabled and imageless rows', () => {
    expect(mapRecord({ ...sample, images: [{ ...sample.images![0], blocked: true }] })).toBeNull();
    expect(mapRecord({ ...sample, images: [{ ...sample.images![0], disabled: true }] })).toBeNull();
    expect(mapRecord({ ...sample, images: [] })).toBeNull();
  });

  it('drops coordinates outside Nevada', () => {
    // The same camera, moved to Miami.
    expect(mapRecord({
      ...sample,
      latLng: { geography: { wellKnownText: 'POINT (-80.19 25.76)' } },
    })).toBeNull();
    expect(mapRecord({ ...sample, latLng: null })).toBeNull();
  });

  it('names a camera by its id when the feed has nothing useful', () => {
    expect(mapRecord({
      ...sample,
      roadway: null,
      location: 'N/A',
      images: [{ ...sample.images![0], description: null }],
    })?.name).toBe('NDOT Camera 2');
  });
});

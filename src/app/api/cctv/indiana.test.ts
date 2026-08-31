import { describe, it, expect } from 'vitest';
import { mapFeature, cleanTitle, streamUrl, type IndotFeature } from './indiana';

/** A live camera, verbatim from 511in.org's MapFeatures response. */
const liveCamera: IndotFeature = {
  title: 'I-94: 1-094-035-8-1 E OF US421',
  uri: 'camera/21504',
  features: [{ geometry: { coordinates: [-86.86994, 41.66028] } }],
  __typename: 'Camera',
  active: true,
  views: [{ url: 'https://public.carsprogram.org/cameras/IN/INDOT_528_sdRf2LeZp7VYFgcF.flv.png', category: 'VIDEO' }],
};

describe('mapFeature', () => {
  it('maps a live camera to an HLS stream', () => {
    expect(mapFeature(liveCamera)).toEqual({
      id: 'indot-21504',
      lat: 41.66028,
      lng: -86.86994,
      name: 'I-94: E OF US421',
      city: 'Indiana',
      country: 'US',
      stream_url: 'https://skysfs4.trafficwise.org/preroll/INDOT_528_sdRf2LeZp7VYFgcF/playlist.m3u8',
      stream_type: 'hls',
      external_url: 'https://511in.org/@41.66028,-86.86994,14?show=camera%2F21504',
      source: 'INDOT TrafficWise',
    });
  });

  it('drops a camera whose feed is a placeholder icon, not a stream', () => {
    expect(mapFeature({
      ...liveCamera,
      views: [{ url: '/images/icon-camera-closed-fill-solid-padded.svg', category: 'VIDEO' }],
    })).toBeNull();
  });

  it('drops inactive cameras and non-camera features', () => {
    expect(mapFeature({ ...liveCamera, active: false })).toBeNull();
    expect(mapFeature({ ...liveCamera, __typename: 'Event' })).toBeNull();
  });

  it('drops coordinates outside Indiana', () => {
    // Same record, moved to Los Angeles.
    expect(mapFeature({
      ...liveCamera,
      features: [{ geometry: { coordinates: [-118.24, 34.05] } }],
    })).toBeNull();
  });

  it('drops a record with no coordinates or no id', () => {
    expect(mapFeature({ ...liveCamera, features: [] })).toBeNull();
    expect(mapFeature({ ...liveCamera, uri: null })).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('strips the internal asset number but keeps route and place', () => {
    expect(cleanTitle('I-94: 1-094-035-8-1 E OF US421')).toBe('I-94: E OF US421');
    expect(cleanTitle('I-65: 1-065-172-4-2 SR-38')).toBe('I-65: SR-38');
  });

  it('keeps the original when the place is glued onto the number', () => {
    // No space to cut at, so guessing where the number ends would mangle it.
    expect(cleanTitle('I-94: 1-094-041-0-2NORTH OF WARNKE RD')).toBe('I-94: 1-094-041-0-2NORTH OF WARNKE RD');
  });

  it('strips lowercase camera suffixes inside the asset number', () => {
    expect(cleanTitle('I-70: 1-070-064-6-eb-ra-cam-1 REST PARK PLAINFIELD EB'))
      .toBe('I-70: REST PARK PLAINFIELD EB');
  });

  it('leaves a title with no asset number alone', () => {
    expect(cleanTitle('US-31 at Main St')).toBe('US-31 at Main St');
  });
});

describe('streamUrl', () => {
  it('builds the playlist URL from the camera token', () => {
    expect(streamUrl('INDOT_755_39XmtxVzQBD4XQVb'))
      .toBe('https://skysfs4.trafficwise.org/preroll/INDOT_755_39XmtxVzQBD4XQVb/playlist.m3u8');
  });
});

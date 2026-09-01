import { describe, it, expect } from 'vitest';
import { mapRecord, streamKind, sample, type OpenCctvRecord } from './opencctv';

/** A representative row from /api/cameras/batch. */
const sampleRow: OpenCctvRecord = {
  id: 'seoul-its-1234',
  name: 'Gangnam-daero',
  city: 'Seoul',
  country: 'KR',
  lat: 37.4979,
  lng: 127.0276,
  feed_url: 'https://cctvsec.ktict.co.kr/1234/stream.m3u8',
  feed_type: 'm3u8',
  source: 'seoul-its',
  active: 1,
};

describe('streamKind', () => {
  it('translates the feed types OSIRIS can play', () => {
    expect(streamKind('m3u8')).toBe('hls');
    expect(streamKind('mjpeg')).toBe('mjpeg');
    expect(streamKind('image')).toBe('jpg');
    expect(streamKind('iframe')).toBe('iframe');
  });

  it('rejects anything it does not recognise', () => {
    expect(streamKind('rtsp')).toBeNull();
    expect(streamKind(null)).toBeNull();
    expect(streamKind('')).toBeNull();
  });
});

describe('mapRecord', () => {
  it('maps an HLS camera to a stream', () => {
    expect(mapRecord(sampleRow)).toEqual({
      id: 'occ-seoul-its-1234',
      lat: 37.4979,
      lng: 127.0276,
      name: 'Gangnam-daero',
      city: 'Seoul',
      country: 'KR',
      stream_url: 'https://cctvsec.ktict.co.kr/1234/stream.m3u8',
      stream_type: 'hls',
      source: 'OpenCCTV / seoul-its',
    });
  });

  it('puts a still on feed_url rather than stream_url', () => {
    const cam = mapRecord({ ...sampleRow, feed_type: 'image', feed_url: 'https://x.jp/cam1.jpg' });
    expect(cam?.feed_url).toBe('https://x.jp/cam1.jpg');
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
  });

  it('drops a still whose URL a cache-buster would break', () => {
    // The tile appends ?_t= on every refresh, so this one would break on sight.
    expect(mapRecord({
      ...sampleRow, feed_type: 'image', cache_buster_breaks_url: true,
    })).toBeNull();
  });

  it('keeps a stream even when a cache-buster would break it', () => {
    // Streams are never re-pointed, so the flag does not apply to them.
    expect(mapRecord({ ...sampleRow, cache_buster_breaks_url: true })).not.toBeNull();
  });

  it('drops inactive, feedless, coordinateless and unplayable rows', () => {
    expect(mapRecord({ ...sampleRow, active: 0 })).toBeNull();
    expect(mapRecord({ ...sampleRow, feed_url: null })).toBeNull();
    expect(mapRecord({ ...sampleRow, lat: undefined })).toBeNull();
    expect(mapRecord({ ...sampleRow, feed_type: 'rtsp' })).toBeNull();
    expect(mapRecord({ ...sampleRow, id: undefined })).toBeNull();
  });

  it('falls back through name, city, then a placeholder', () => {
    expect(mapRecord({ ...sampleRow, name: null })?.name).toBe('Seoul');
    expect(mapRecord({ ...sampleRow, name: null, city: null })?.name).toBe('Camera');
  });

  it('names the upstream operator in the source', () => {
    expect(mapRecord({ ...sampleRow, source: null })?.source).toBe('OpenCCTV');
  });
});

describe('sample', () => {
  it('returns everything when under the cap', () => {
    expect(sample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('thins to the cap', () => {
    expect(sample(Array.from({ length: 1000 }, (_, i) => i), 100)).toHaveLength(100);
  });

  it('spreads across the list rather than taking a prefix', () => {
    // The index is grouped by operator, so a prefix would be one city.
    const picked = sample(Array.from({ length: 100 }, (_, i) => i), 10);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBeGreaterThan(80);
  });
});

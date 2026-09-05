import { describe, it, expect } from 'vitest';
import { parseRwsCameras, fetchNetherlandsCameras } from './netherlands';

/** One record in the shape Rijkswaterstaat actually serves. */
const AMERSFOORT = {
  id: 4,
  latitude: '52.185241',
  longitude: '5.41449',
  road: 'A1',
  near: 'Amersfoort',
  location_description: 'Langs de A1, net ten westen van knooppunt Hoevelaken.',
  stream_url: 'https://stream.inmoves.nl/62/embed',
  static_url: 'https://stream.inmoves.nl/62',
};

describe('parseRwsCameras', () => {
  it('maps a record, proxying the hotlink-protected frame', () => {
    expect(parseRwsCameras([AMERSFOORT])).toEqual([{
      id: 'nl-rws-4',
      lat: 52.185241,
      lng: 5.41449,
      name: 'A1 — Amersfoort',
      city: 'Amersfoort',
      country: 'Netherlands',
      feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fstream.inmoves.nl%2F62',
      external_url: 'https://stream.inmoves.nl/62/embed',
      source: 'Rijkswaterstaat',
    }]);
  });

  it('parses the string coordinates into numbers', () => {
    const [cam] = parseRwsCameras([AMERSFOORT]);
    expect(typeof cam.lat).toBe('number');
    expect(typeof cam.lng).toBe('number');
  });

  it('drops records that cannot be placed or shown', () => {
    expect(parseRwsCameras([
      { ...AMERSFOORT, id: 1, latitude: 'n/a' },              // unparseable
      { ...AMERSFOORT, id: 2, latitude: '48.85', longitude: '2.35' }, // Paris — outside NL
      { ...AMERSFOORT, id: 3, static_url: undefined, stream_url: undefined }, // nothing to show
      { ...AMERSFOORT, id: undefined },                        // no id to key on
    ])).toEqual([]);
  });

  it('keeps the first of a repeated id', () => {
    expect(parseRwsCameras([AMERSFOORT, { ...AMERSFOORT, near: 'Elsewhere' }])).toHaveLength(1);
  });

  it('falls back through name sources rather than emitting a blank label', () => {
    const [noRoad] = parseRwsCameras([{ ...AMERSFOORT, road: undefined }]);
    expect(noRoad.name).toBe('Amersfoort');

    const [bare] = parseRwsCameras([{ ...AMERSFOORT, road: undefined, near: undefined }]);
    expect(bare.name).toBe('Langs de A1, net ten westen van knooppunt Hoevelaken.');
    expect(bare.city).toBe('Netherlands');
  });

  it('returns nothing for a payload that is not an array', () => {
    expect(parseRwsCameras(null)).toEqual([]);
    expect(parseRwsCameras({ error: 'nope' })).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real RWS feed).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchNetherlandsCameras', () => {
  liveIt('returns the live Rijkswaterstaat cameras, all inside the Netherlands', async () => {
    const cams = await fetchNetherlandsCameras();

    // The feed carried 26 when this replaced NDW; it is curated, so it moves slowly.
    expect(cams.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cams.map(c => c.id)).size).toBe(cams.length);

    for (const c of cams) {
      expect(c.lat).toBeGreaterThan(50.7);
      expect(c.lat).toBeLessThan(53.7);
      expect(c.lng).toBeGreaterThan(3.3);
      expect(c.lng).toBeLessThan(7.3);
      expect(c.country).toBe('Netherlands');
      expect(c.source).toBe('Rijkswaterstaat');
      expect(c.feed_url).toMatch(/^\/api\/cctv\/proxy\?url=/);
    }
  }, 60_000);
});

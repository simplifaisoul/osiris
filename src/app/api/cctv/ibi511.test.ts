import { describe, it, expect } from 'vitest';
import { cameraCity, cameraLabel, mapIbi511Record, parseWkt, type Ibi511Record, type Ibi511Source } from './ibi511';
import { fetchFloridaCameras } from './florida';
import { fetchGeorgiaCameras } from './georgia';
import { fetchNorthCarolinaCameras } from './northcarolina';
import { fetchArizonaCameras } from './arizona';

const FDOT: Ibi511Source = {
  base: 'https://fl511.com',
  idPrefix: 'fdot',
  source: 'FDOT',
  state: 'Florida',
  bounds: { minLat: 24.4, maxLat: 31.1, minLng: -87.7, maxLng: -79.9 },
};

/** A representative row from fl511.com/List/GetData/Cameras. */
const sample: Ibi511Record = {
  id: 1,
  roadway: 'I-95',
  direction: 'Northbound',
  location: 'I-95 MP 134.0 Northbound',
  county: 'Brevard',
  latLng: { geography: { wellKnownText: 'POINT (-80.892882 26.17325)' } },
  images: [{
    imageUrl: '/map/Cctv/1',
    videoUrl: 'https://dis-se18.divas.cloud:8200/chan-1_h/index.m3u8',
    blocked: false,
    disabled: false,
  }],
};

describe('cameraLabel', () => {
  it('keeps a location that reads as a place', () => {
    expect(cameraLabel(sample)).toBe('I-95 MP 134.0 Northbound');
    expect(cameraLabel({ ...sample, location: 'SR-95 @SR-68 Laughlin Rd' }))
      .toBe('SR-95 @SR-68 Laughlin Rd');
  });

  it('strips the agency asset-code prefix Georgia puts in front of its labels', () => {
    expect(cameraLabel({ ...sample, location: 'GDOT-1130: I-20 E at SR5 MM 34.2 (Douglas)' }))
      .toBe('I-20 E at SR5 MM 34.2 (Douglas)');
    expect(cameraLabel({ ...sample, location: 'ALPH-0050: Rucker Rd at Charlotte Dr (Alpharetta)' }))
      .toBe('Rucker Rd at Charlotte Dr (Alpharetta)');
  });

  /* NCDOT, and the Alligator Alley run of FDOT, put a pure equipment code
     here. There is no place name hiding in it to recover. */
  it('falls back to road and direction when the location is only an asset code', () => {
    expect(cameraLabel({ ...sample, roadway: 'I-485', direction: 'Outer', location: 'CCTV10-I485-30.1O_I85' }))
      .toBe('I-485 Outer');
    expect(cameraLabel({ ...sample, roadway: 'I-75', direction: 'Northbound', location: '0517N_75_Alligator_Alley_M052' }))
      .toBe('I-75 Northbound');
  });

  it('does not mistake an @-style cross-street for a code prefix', () => {
    // `SR-389 @MP3.3` starts with letters, a dash and digits, like a code — but
    // there is no colon, so it must survive intact.
    expect(cameraLabel({ ...sample, location: 'SR-389 @MP3.3' })).toBe('SR-389 @MP3.3');
  });

  it('uses the road alone when there is no direction, and nothing when there is no road', () => {
    expect(cameraLabel({ ...sample, location: 'CCTV01-NC12-28S', direction: null })).toBe('I-95');
    expect(cameraLabel({ ...sample, location: null, roadway: null })).toBeNull();
  });

  it('treats the platform’s "N/A" filler as absent', () => {
    expect(cameraLabel({ ...sample, location: 'N/A' })).toBe('I-95 Northbound');
    expect(cameraLabel({ ...sample, location: 'N/A', roadway: 'N/A' })).toBeNull();
  });
});

describe('cameraCity', () => {
  it('prefers the city, then the county, then the state', () => {
    expect(cameraCity({ ...sample, city: 'Bullhead City' }, 'Arizona')).toBe('Bullhead City');
    expect(cameraCity(sample, 'Florida')).toBe('Brevard County');
    expect(cameraCity({ ...sample, county: null }, 'Florida')).toBe('Florida');
    expect(cameraCity({ ...sample, city: 'N/A', county: 'N/A' }, 'Florida')).toBe('Florida');
  });
});

describe('mapIbi511Record', () => {
  it('maps a streaming camera', () => {
    expect(mapIbi511Record(sample, FDOT)).toEqual({
      id: 'fdot-1',
      lat: 26.17325,
      lng: -80.892882,
      name: 'I-95 MP 134.0 Northbound',
      city: 'Brevard County',
      country: 'US',
      feed_url: 'https://fl511.com/map/Cctv/1',
      stream_url: 'https://dis-se18.divas.cloud:8200/chan-1_h/index.m3u8',
      stream_type: 'hls',
      source: 'FDOT',
    });
  });

  /* ADOT publishes no video at all, and Louisiana proved an agency will put a
     JPEG address in videoUrl, so a playlist is only taken when it is one. */
  it('keeps a camera on its snapshot when there is no usable playlist', () => {
    const noVideo = mapIbi511Record({ ...sample, images: [{ ...sample.images![0], videoUrl: null }] }, FDOT);
    expect(noVideo?.stream_url).toBeUndefined();
    expect(noVideo?.feed_url).toBe('https://fl511.com/map/Cctv/1');

    const jpegVideo = mapIbi511Record(
      { ...sample, images: [{ ...sample.images![0], videoUrl: 'https://fl511.com/snapshots?id=4&ext=.jpg' }] },
      FDOT,
    );
    expect(jpegVideo?.stream_url).toBeUndefined();
  });

  it('skips rows that are blocked, disabled, unplaceable or out of state', () => {
    expect(mapIbi511Record({ ...sample, images: [{ ...sample.images![0], blocked: true }] }, FDOT)).toBeNull();
    expect(mapIbi511Record({ ...sample, images: [{ ...sample.images![0], disabled: true }] }, FDOT)).toBeNull();
    expect(mapIbi511Record({ ...sample, images: [] }, FDOT)).toBeNull();
    expect(mapIbi511Record({ ...sample, latLng: null }, FDOT)).toBeNull();
    // Coordinates in Georgia must not turn up in the Florida layer.
    expect(mapIbi511Record({ ...sample, latLng: { geography: { wellKnownText: 'POINT (-84.33 34.07)' } } }, FDOT)).toBeNull();
  });

  /* The three biggest of these feeds gate their playlists behind a session the
     map cannot get; their edges answer 401 to everyone else. The row says so
     itself, and taking the URL anyway would give the player a dead stream. */
  it('leaves an auth-gated playlist alone and keeps the public snapshot', () => {
    const gated = mapIbi511Record(
      { ...sample, images: [{ ...sample.images![0], isVideoAuthRequired: true }] },
      FDOT,
    );
    expect(gated?.stream_url).toBeUndefined();
    expect(gated?.stream_type).toBeUndefined();
    expect(gated?.feed_url).toBe('https://fl511.com/map/Cctv/1');
  });

  it('still takes a playlist the row marks as open', () => {
    const open = mapIbi511Record(
      { ...sample, images: [{ ...sample.images![0], isVideoAuthRequired: false }] },
      FDOT,
    );
    expect(open?.stream_url).toBe('https://dis-se18.divas.cloud:8200/chan-1_h/index.m3u8');
  });

  it('honours videoDisabled without dropping the camera', () => {
    const cam = mapIbi511Record({ ...sample, images: [{ ...sample.images![0], videoDisabled: true }] }, FDOT);
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.feed_url).toBeDefined();
  });

  it('prefixes ids per agency so two states cannot collide', () => {
    const asGeorgia = mapIbi511Record(
      { ...sample, latLng: { geography: { wellKnownText: 'POINT (-84.33 34.07)' } } },
      { ...FDOT, idPrefix: 'gdot', source: 'GDOT', state: 'Georgia', bounds: { minLat: 30.3, maxLat: 35.1, minLng: -85.7, maxLng: -80.8 } },
    );
    expect(asGeorgia?.id).toBe('gdot-1');
    expect(mapIbi511Record(sample, FDOT)?.id).toBe('fdot-1');
  });
});

describe('parseWkt', () => {
  it('reads longitude first, as the platform writes it', () => {
    expect(parseWkt('POINT (-80.892882 26.17325)')).toEqual({ lat: 26.17325, lng: -80.892882 });
  });
  it('returns null for anything else', () => {
    expect(parseWkt(null)).toBeNull();
    expect(parseWkt('LINESTRING (0 0, 1 1)')).toBeNull();
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real endpoints).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('live southern-tier feeds', () => {
  const cases: Array<[string, () => Promise<unknown[]>, number, { minLat: number; maxLat: number; minLng: number; maxLng: number }]> = [
    ['Florida', fetchFloridaCameras, 3000, FDOT.bounds],
    ['Georgia', fetchGeorgiaCameras, 2500, { minLat: 30.3, maxLat: 35.1, minLng: -85.7, maxLng: -80.8 }],
    ['North Carolina', fetchNorthCarolinaCameras, 800, { minLat: 33.8, maxLat: 36.6, minLng: -84.4, maxLng: -75.4 }],
    ['Arizona', fetchArizonaCameras, 400, { minLat: 31.3, maxLat: 37.1, minLng: -115.0, maxLng: -109.0 }],
  ];

  for (const [name, fetcher, atLeast, bounds] of cases) {
    liveIt(`${name} returns placed, uniquely identified cameras`, async () => {
      const cams = (await fetcher()) as Array<{ id: string; lat: number; lng: number; name: string }>;
      expect(cams.length).toBeGreaterThan(atLeast);
      expect(new Set(cams.map(c => c.id)).size).toBe(cams.length);
      for (const c of cams) {
        expect(c.lat).toBeGreaterThanOrEqual(bounds.minLat);
        expect(c.lat).toBeLessThanOrEqual(bounds.maxLat);
        expect(c.lng).toBeGreaterThanOrEqual(bounds.minLng);
        expect(c.lng).toBeLessThanOrEqual(bounds.maxLng);
        expect(c.name.trim()).not.toBe('');
      }
    }, 120_000);
  }
});

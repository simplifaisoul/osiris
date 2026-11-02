import { afterEach, describe, it, expect, vi } from 'vitest';
import { cameraCity, cameraLabel, loadIbi511Cameras, mapIbi511Record, parseWkt, type Ibi511Record, type Ibi511Source } from './ibi511';
import { fetchFloridaCameras } from './florida';
import { fetchGeorgiaCameras } from './georgia';
import { fetchNorthCarolinaCameras } from './northcarolina';
import { fetchArizonaCameras } from './arizona';
import { fetchIdahoCameras } from './idaho';
import { fetchOntarioCameras } from './ontario';
import { fetchAlbertaCameras } from './alberta';

afterEach(() => vi.unstubAllGlobals());

const FDOT: Ibi511Source = {
  base: 'https://fl511.com',
  idPrefix: 'fdot',
  source: 'FDOT',
  state: 'Florida',
  bounds: { minLat: 24.4, maxLat: 31.1, minLng: -87.7, maxLng: -79.9 },
};

const MTO: Ibi511Source = {
  base: 'https://511on.ca',
  idPrefix: 'on',
  source: '511 Ontario',
  state: 'Ontario',
  country: 'Canada',
  countySuffix: '',
  bounds: { minLat: 41.6, maxLat: 57.0, minLng: -95.3, maxLng: -74.2 },
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

  it('leaves the county bare where it is not a county', () => {
    expect(cameraCity({ ...sample, county: 'Toronto' }, 'Ontario', '')).toBe('Toronto');
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

  it('uses public snapshots when the provider video edge is inaccessible', () => {
    const cam = mapIbi511Record(
      { ...sample, images: [{ ...sample.images![0], isVideoAuthRequired: false }] },
      { ...FDOT, snapshotOnly: true },
    );
    expect(cam?.feed_url).toBe('https://fl511.com/map/Cctv/1');
    expect(cam?.stream_url).toBeUndefined();
    expect(cam?.stream_type).toBeUndefined();
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

  it('leaves out the agencies a deployment names', () => {
    const cfg = { ...FDOT, excludeAgencies: ['UDOT', 'ODOT'] };
    expect(mapIbi511Record({ ...sample, source: 'UDOT' }, cfg)).toBeNull();
    expect(mapIbi511Record({ ...sample, source: 'ODOT' }, cfg)).toBeNull();
    expect(mapIbi511Record({ ...sample, source: 'FDOT' }, cfg)?.id).toBe('fdot-1');
    expect(mapIbi511Record({ ...sample, source: null }, cfg)?.id).toBe('fdot-1');
  });

  it('captions from the state when the county column is not to be trusted', () => {
    expect(mapIbi511Record(sample, { ...FDOT, ignoreCounty: true })?.city).toBe('Florida');
    expect(mapIbi511Record({ ...sample, city: 'Cocoa' }, { ...FDOT, ignoreCounty: true })?.city).toBe('Cocoa');
  });

  it('places a Canadian deployment in Canada', () => {
    /** A row from 511on.ca/List/GetData/Cameras. */
    const qew: Ibi511Record = {
      id: 1283,
      roadway: 'QEW',
      direction: 'Unknown',
      location: 'QEW East of Concession Road',
      county: 'Niagara',
      latLng: { geography: { wellKnownText: 'POINT (-78.925595 42.911243)' } },
      images: [{ imageUrl: '/map/Cctv/2555', blocked: false, disabled: false }],
    };
    expect(mapIbi511Record(qew, MTO)).toEqual({
      id: 'on-1283',
      lat: 42.911243,
      lng: -78.925595,
      name: 'QEW East of Concession Road',
      city: 'Niagara',
      country: 'Canada',
      feed_url: 'https://511on.ca/map/Cctv/2555',
      source: '511 Ontario',
    });
  });
});

describe('loadIbi511Cameras', () => {
  /* 511 Alberta answers 500 to a page of more than fifty rows, so a
     deployment has to be able to ask for less than the usual hundred. */
  it('pages at the size the deployment asks for', async () => {
    const asked: Array<{ start: number; length: number }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const query = JSON.parse(new URL(String(input)).searchParams.get('query') ?? '{}');
      asked.push({ start: query.start, length: query.length });
      const rows = Array.from({ length: Math.min(query.length, 120 - query.start) }, (_, i) => ({
        ...sample,
        id: query.start + i + 1,
        latLng: { geography: { wellKnownText: 'POINT (-114.2 51.1)' } },
      }));
      return Response.json({ recordsTotal: 120, data: rows });
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const cams = await loadIbi511Cameras({
      ...MTO, base: 'https://511.alberta.ca', idPrefix: 'ab', pageSize: 50,
      bounds: { minLat: 48.9, maxLat: 60.1, minLng: -120.1, maxLng: -109.9 },
    });

    expect(asked.sort((a, b) => a.start - b.start)).toEqual([
      { start: 0, length: 50 }, { start: 50, length: 50 }, { start: 100, length: 50 },
    ]);
    expect(cams).toHaveLength(120);
  });

  const pagedFeed = (total: number, rowFor: (id: number) => Ibi511Record, failFrom = Infinity) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const query = JSON.parse(new URL(String(input)).searchParams.get('query') ?? '{}');
      if (query.start >= failFrom) return new Response('', { status: 503 });
      const rows = Array.from({ length: Math.max(0, Math.min(query.length, total - query.start)) }, (_, i) => rowFor(query.start + i + 1));
      return Response.json({ recordsTotal: total, data: rows });
    });

  /* Idaho leaves out a tenth of its rows on purpose; that must not read as
     pages lost to throttling. */
  it('does not count rows left out on purpose as a short read', async () => {
    vi.stubGlobal('fetch', pagedFeed(200, id => ({ ...sample, id, source: id % 5 === 0 ? 'UDOT' : 'FDOT' })));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const cams = await loadIbi511Cameras({ ...FDOT, excludeAgencies: ['UDOT'] });
    expect(cams).toHaveLength(160);
  });

  it('still refuses a read that lost pages', async () => {
    vi.stubGlobal('fetch', pagedFeed(300, id => ({ ...sample, id }), 100));

    await expect(loadIbi511Cameras(FDOT)).rejects.toThrow('FDOT short read: 100 of 300');
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

describe('live IBI 511 feeds', () => {
  const cases: Array<[string, () => Promise<unknown[]>, number, { minLat: number; maxLat: number; minLng: number; maxLng: number }]> = [
    ['Florida', fetchFloridaCameras, 3000, FDOT.bounds],
    ['Georgia', fetchGeorgiaCameras, 2500, { minLat: 30.3, maxLat: 35.1, minLng: -85.7, maxLng: -80.8 }],
    ['North Carolina', fetchNorthCarolinaCameras, 800, { minLat: 33.8, maxLat: 36.6, minLng: -84.4, maxLng: -75.4 }],
    ['Arizona', fetchArizonaCameras, 400, { minLat: 31.3, maxLat: 37.1, minLng: -115.0, maxLng: -109.0 }],
    ['Idaho', fetchIdahoCameras, 300, { minLat: 41.98, maxLat: 49.01, minLng: -117.25, maxLng: -111.0 }],
    ['Ontario', fetchOntarioCameras, 700, MTO.bounds],
    ['Alberta', fetchAlbertaCameras, 250, { minLat: 48.9, maxLat: 60.1, minLng: -120.1, maxLng: -109.9 }],
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

import { describe, it, expect } from 'vitest';
import { indexVkrCoords, parseLithuania, fetchLithuaniaCameras } from './lithuania';

const NOW = 1786114800000; // 2026-08-07T15:00:00Z — fixed so staleness is deterministic

/** One VKR layer feature, shaped as `?lks=false` returns it (WGS84, lat first). */
function feature(overrides: Record<string, unknown> = {}) {
  return {
    id: '72',
    name: 'Vilnius A1 10,04',
    details: true,
    icon: '15',
    points: [{ min: 9, max: 99, point: [54.7268, 25.2043] }],
    ...overrides,
  };
}
const layer = (...features: unknown[]) => [{ layer: 'VKR', name: 'Vaizdo kameros', features }];

/** One camera-info-table entry. */
function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 72,
    name: 'Vilnius A1 10,04',
    roadName: 'Vilnius–Kaunas–Klaipėda',
    roadNr: 'A1',
    date: NOW - 60_000, // one minute old
    image: 'https://eismoinfo.lt/eismoinfo-backend/image-provider/camera/last?id=72',
    x: 576154,
    y: 6056867,
    km: 10.04,
    ...overrides,
  };
}

describe('indexVkrCoords', () => {
  it('indexes features by id, coercing numeric ids to strings', () => {
    const idx = indexVkrCoords(layer(feature(), feature({ id: 8 })));
    expect(idx.get('72')).toEqual([54.7268, 25.2043]);
    expect(idx.get('8')).toEqual([54.7268, 25.2043]);
  });

  it('returns an empty index for malformed payloads', () => {
    expect(indexVkrCoords(null).size).toBe(0);
    expect(indexVkrCoords({}).size).toBe(0);
    expect(indexVkrCoords(layer(feature({ points: [] }))).size).toBe(0);
    expect(indexVkrCoords(layer(feature({ points: [{ point: ['a', 'b'] }] }))).size).toBe(0);
  });
});

describe('parseLithuania', () => {
  it('joins the layer and the table into one camera', () => {
    expect(parseLithuania(layer(feature()), [entry()], NOW)[0]).toEqual({
      id: 'lt-72',
      lat: 54.7268,
      lng: 25.2043,
      name: 'Vilnius A1 10,04 (A1 Vilnius–Kaunas–Klaipėda)',
      city: 'Vilnius',
      country: 'Lithuania',
      feed_url:
        '/api/cctv/proxy?url=https%3A%2F%2Feismoinfo.lt%2Feismoinfo-backend%2Fimage-provider%2Fcamera%2Flast%3Fid%3D72',
      stream_type: 'jpg',
      external_url: 'https://eismoinfo.lt/#!/vkr/72',
      source: 'Via Lietuva',
    });
  });

  it('routes the feed through the proxy with the ?id= preserved', () => {
    const [cam] = parseLithuania(layer(feature()), [entry()], NOW);
    expect(cam.feed_url).toMatch(/^\/api\/cctv\/proxy\?url=/);
    const inner = decodeURIComponent(cam.feed_url!.replace('/api/cctv/proxy?url=', ''));
    expect(inner).toBe('https://eismoinfo.lt/eismoinfo-backend/image-provider/camera/last?id=72');
  });

  it('derives the city by trimming the road number and km suffix', () => {
    const cases: Array<[string, string, string]> = [
      ['Vilnius A1 10,04', 'A1', 'Vilnius'],
      ['Šilagalys į Panevėžį A8 7,57', 'A8', 'Šilagalys į Panevėžį'],
      ['Didžiulio ež. A1 19,42', 'A1', 'Didžiulio ež.'],
      ['Pabradė 102 41,46', '102', 'Pabradė'],
    ];
    for (const [name, roadNr, city] of cases) {
      const cams = parseLithuania(layer(feature({ name })), [entry({ name, roadNr })], NOW);
      expect(cams[0].city).toBe(city);
    }
  });

  it('falls back to Lithuania when no place can be recovered', () => {
    const cams = parseLithuania(layer(feature()), [entry({ name: 'A1', roadNr: 'A1' })], NOW);
    expect(cams[0].city).toBe('Lithuania');
  });

  it('drops table entries with no matching coordinates in the layer', () => {
    expect(parseLithuania(layer(feature({ id: '999' })), [entry()], NOW)).toEqual([]);
    expect(parseLithuania([], [entry()], NOW)).toEqual([]);
  });

  it('drops frames older than six hours, and entries with no timestamp', () => {
    const stale = entry({ date: NOW - 7 * 60 * 60 * 1000 });
    const fresh = entry({ date: NOW - 5 * 60 * 60 * 1000 });
    expect(parseLithuania(layer(feature()), [stale], NOW)).toEqual([]);
    expect(parseLithuania(layer(feature()), [fresh], NOW)).toHaveLength(1);
    expect(parseLithuania(layer(feature()), [entry({ date: undefined })], NOW)).toEqual([]);
  });

  it('drops coordinates outside the Lithuanian bounding box', () => {
    // London — well outside Lithuania
    const bad = layer(feature({ points: [{ point: [51.5072, -0.1276] }] }));
    expect(parseLithuania(bad, [entry()], NOW)).toEqual([]);
  });

  it('de-duplicates repeated ids', () => {
    expect(parseLithuania(layer(feature()), [entry(), entry()], NOW)).toHaveLength(1);
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseLithuania(layer(feature()), null, NOW)).toEqual([]);
    expect(parseLithuania(null, [entry()], NOW)).toEqual([]);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real eismoinfo endpoints).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchLithuaniaCameras (live)', () => {
  liveIt('fetches well-formed Lithuanian cameras', async () => {
    const cams = await fetchLithuaniaCameras();
    expect(cams.length).toBeGreaterThan(200);
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);

    for (const cam of cams) {
      expect(cam.country).toBe('Lithuania');
      expect(cam.source).toBe('Via Lietuva');
      expect(cam.stream_type).toBe('jpg');
      expect(cam.feed_url).toMatch(
        /^\/api\/cctv\/proxy\?url=https%3A%2F%2Feismoinfo\.lt%2F[\w%.-]+%3Fid%3D\d+$/,
      );
      expect(cam.lat).toBeGreaterThan(53.8);
      expect(cam.lat).toBeLessThan(56.5);
      expect(cam.lng).toBeGreaterThan(20.9);
      expect(cam.lng).toBeLessThan(26.9);
    }
  });
});

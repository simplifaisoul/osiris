import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deflateRawSync } from 'zlib';
import {
  activeFeeds, clearTransitCache, feedsFor, feedsWaitingForKeys, readFeed, requestFor, vehiclesIn, MAX_FEEDS_PER_VIEW, FEEDS,
} from './transit-live';
import { KEYED_TRANSIT_FEEDS } from './transit-feeds-keyed';
import { encodeFeed, type FixtureVehicle } from './gtfs-rt.fixtures';
import type { TransitFeed } from './transit';

const now = () => Math.floor(Date.now() / 1000);
const serve = (vehicles: FixtureVehicle[]) => vi.fn(async () => new Response(encodeFeed(vehicles)));

const BOSTON: TransitFeed = {
  id: 'test-mbta', provider: 'MBTA', country: 'US', region: 'Boston',
  url: 'https://feeds.example/mbta.pb', bbox: [-71.6, 42.0, -70.6, 42.8],
  center: [-71.06, 42.36], core: [-71.2, 42.25, -70.95, 42.45], vehiclesAtProbe: 300,
};

beforeEach(() => clearTransitCache());

describe('readFeed', () => {
  it('reads a feed once and shares it while it is fresh', async () => {
    const fetchImpl = serve([{ lat: 42.36, lng: -71.06, ts: now() }]);
    const first = await readFeed(BOSTON, fetchImpl);
    const second = await readFeed(BOSTON, fetchImpl);
    expect(first.vehicles).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks once when several viewers want the same feed at the same moment', async () => {
    const fetchImpl = serve([{ lat: 42.36, lng: -71.06, ts: now() }]);
    await Promise.all([readFeed(BOSTON, fetchImpl), readFeed(BOSTON, fetchImpl), readFeed(BOSTON, fetchImpl)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves out vehicles that stopped reporting and fixes far outside the area', async () => {
    const entry = await readFeed(BOSTON, serve([
      { lat: 42.36, lng: -71.06, ts: now(), id: 'on-the-road' },
      { lat: 42.35, lng: -71.07, ts: now() - 3600, id: 'parked-an-hour-ago' },
      { lat: 56.95, lng: 24.1, ts: now(), id: 'gps-says-riga' },
    ]));
    expect(entry.vehicles.map(v => v.id)).toEqual(['on-the-road']);
    expect(entry.vehicles[0]).toMatchObject({ f: 'test-mbta', route: '39', label: '1234', s: 8.5 });
  });

  it('keeps the last good positions, marked as failed, when a read fails', async () => {
    await readFeed(BOSTON, serve([{ lat: 42.36, lng: -71.06, ts: now() }]), Date.now());
    const down = vi.fn(async () => new Response('', { status: 503 }));
    const later = await readFeed(BOSTON, down, Date.now() + 5 * 60_000);
    expect(later.ok).toBe(false);
    expect(later.error).toBe('HTTP 503');
    expect(later.vehicles).toHaveLength(1);
  });

  it('answers from the last read while a slow operator takes its time, then shows the new one', async () => {
    await readFeed(BOSTON, serve([{ lat: 42.36, lng: -71.06, ts: now(), id: 'before' }]));
    let answer!: () => void;
    const slow = vi.fn(() => new Promise<Response>(resolve => {
      answer = () => resolve(new Response(encodeFeed([{ lat: 42.37, lng: -71.05, ts: now(), id: 'after' }])));
    }));
    const shown = await readFeed(BOSTON, slow, Date.now() + 30_000);
    expect(shown.vehicles.map(v => v.id)).toEqual(['before']);
    expect(slow).toHaveBeenCalledTimes(1);

    answer();
    await vi.waitFor(async () => expect((await readFeed(BOSTON, slow)).vehicles.map(v => v.id)).toEqual(['after']));
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('waits for a fresh read when the last one is too old to show', async () => {
    await readFeed(BOSTON, serve([{ lat: 42.36, lng: -71.06, ts: now(), id: 'before' }]));
    const entry = await readFeed(BOSTON, serve([{ lat: 42.37, lng: -71.05, ts: now(), id: 'after' }]), Date.now() + 5 * 60_000);
    expect(entry.vehicles.map(v => v.id)).toEqual(['after']);
  });
});

describe('feedsFor', () => {
  it('picks the feeds covering a view, nearest first, and caps how many', () => {
    const near = { ...BOSTON, id: 'near', bbox: [-71.2, 42.3, -71.0, 42.4] };
    const far = { ...BOSTON, id: 'far', bbox: [-71.6, 42.0, -70.0, 43.0] };
    const elsewhere = { ...BOSTON, id: 'elsewhere', bbox: [24, 60, 25, 61] };
    expect(feedsFor([-71.15, 42.3, -71.05, 42.4], [far, elsewhere, near]).map(f => f.id)).toEqual(['near', 'far']);

    const many = Array.from({ length: MAX_FEEDS_PER_VIEW + 5 }, (_, i) => ({ ...BOSTON, id: `f${i}` }));
    expect(feedsFor([-71.15, 42.3, -71.05, 42.4], many)).toHaveLength(MAX_FEEDS_PER_VIEW);
  });
});

describe('vehiclesIn', () => {
  it('returns only the vehicles on screen, with the feeds that supplied them', async () => {
    const mbta = FEEDS.find(f => f.url.includes('cdn.mbta.com'))!;
    expect(mbta).toBeDefined();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url) === mbta.url
      ? new Response(encodeFeed([
        { lat: 42.3601, lng: -71.0589, ts: now(), id: 'downtown' },
        { lat: 42.25, lng: -71.0, ts: now(), id: 'quincy' },
      ]))
      : new Response(encodeFeed([])));

    const result = await vehiclesIn([-71.1, 42.33, -71.0, 42.4], fetchImpl as typeof fetch);
    expect(result.vehicles.map(v => v.id)).toEqual(['downtown']);
    const used = result.feeds.find(f => f.id === mbta.id)!;
    expect(used).toMatchObject({ ok: true, count: 1, provider: mbta.provider });
  });
});

describe('keyed feeds', () => {
  const header: TransitFeed = { ...BOSTON, id: 'k1', url: 'https://api.example/vp.pb', key: { env: 'TEST_KEY', header: 'Authorization', prefix: 'apikey ', signup: 'https://example' } };
  const query: TransitFeed = { ...BOSTON, id: 'k2', url: 'https://api.example/vp?agency=RG', key: { env: 'TEST_KEY', query: 'api_key', signup: 'https://example' } };

  it('puts the key where the operator wants it', () => {
    expect(requestFor(header, { TEST_KEY: 's3cret' })?.headers.Authorization).toBe('apikey s3cret');
    expect(requestFor(query, { TEST_KEY: 's3cret' })?.url).toBe('https://api.example/vp?agency=RG&api_key=s3cret');
  });

  it('has no request at all without the key, and reads keyless feeds as they are', () => {
    expect(requestFor(header, {})).toBeNull();
    expect(requestFor(BOSTON, {})?.url).toBe(BOSTON.url);
  });

  it('reads a keyed feed only once its variable is set, and lists the rest without their keys', () => {
    const wmata = KEYED_TRANSIT_FEEDS.filter(f => f.key?.env === 'TRANSIT_WMATA_KEY');
    expect(activeFeeds({}).some(f => wmata.includes(f))).toBe(false);
    expect(activeFeeds({ TRANSIT_WMATA_KEY: 'x' }).filter(f => wmata.includes(f))).toHaveLength(wmata.length);
    const waiting = feedsWaitingForKeys({});
    expect(waiting.some(w => w.env === 'TRANSIT_WMATA_KEY' && w.signup)).toBe(true);
    expect(JSON.stringify(feedsWaitingForKeys({ TRANSIT_WMATA_KEY: 'x' }))).not.toContain('"x"');
  });

  it('says a refused key is a refused key', async () => {
    vi.stubEnv('TEST_KEY', 'wrong');
    const entry = await readFeed(header, vi.fn(async () => new Response('', { status: 401 })));
    vi.unstubAllEnvs();
    expect(entry).toMatchObject({ ok: false, error: 'key refused (HTTP 401)' });
  });
});

describe('zipped feeds', () => {
  it('reads a feed that ships as a one-file archive', async () => {
    const data = deflateRawSync(Buffer.from(encodeFeed([{ lat: 51.5, lng: -0.12, ts: now(), id: 'LX58CCK' }])));
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt16LE(10, 26);
    const zip = Buffer.concat([header, Buffer.from('gtfsrt.bin'), data]);
    const uk: TransitFeed = { ...BOSTON, id: 'uk', bbox: [-8, 49, 2, 61], format: 'zip' };
    const entry = await readFeed(uk, vi.fn(async () => new Response(zip)));
    expect(entry.vehicles.map(v => v.id)).toEqual(['LX58CCK']);
  });
});

describe('route names and modes', () => {
  it('names a route the way riders do and knows a train from a bus', async () => {
    const mbta = FEEDS.find(f => f.url.includes('cdn.mbta.com'))!;
    const kcm = FEEDS.find(f => /king county/i.test(f.provider))!;
    const entryM = await readFeed(mbta, serve([
      { lat: 42.36, lng: -71.06, ts: now(), id: 'red', route: 'Red' },
      { lat: 42.35, lng: -71.07, ts: now(), id: 'cr', route: 'CR-Worcester' },
    ]));
    expect(entryM.vehicles.map(v => [v.name, v.mode])).toEqual([['Red Line', 'metro'], ['Framingham/Worcester Line', 'rail']]);
    const entryK = await readFeed(kcm, serve([{ lat: 47.6, lng: -122.33, ts: now(), id: 'b', route: '100001' }]));
    expect(entryK.vehicles[0]).toMatchObject({ route: '100001', name: '1', mode: 'bus' });
  });
});

describe('history for instant playback', () => {
  it('sends each vehicle its earlier fixes in the same trip', async () => {
    const t = now();
    await readFeed(BOSTON, serve([{ lat: 42.36, lng: -71.06, ts: t - 20, id: 'v' }]), Date.now());
    const second = await readFeed(BOSTON, serve([{ lat: 42.361, lng: -71.06, ts: t, id: 'v' }]), Date.now() + 5 * 60_000);
    expect(second.vehicles[0].h).toEqual([[t - 20, 42.36, -71.06]]);
  });
});

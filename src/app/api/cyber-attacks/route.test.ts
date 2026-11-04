import { describe, it, expect, vi, afterEach } from 'vitest';

/** Geolocation goes through the malware layer's live store; tests answer it here instead of the network. */
const located = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock('@/lib/malware-live', () => ({ locateIps: async () => located.map }));

/** The exact record the audit used to reproduce the fabricated feed. */
const FIXTURE = [
  { ip_address: '192.0.2.10', country: 'US', malware: 'Emotet', dst_port: 443, status: 'offline' },
];

/**
 * The route caches for five minutes, so each call here gets a fresh module —
 * otherwise a test would assert against the previous test's cached payload.
 */
async function get(body: unknown) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));
  const { GET } = await import('./route');
  return (await GET()).json();
}

afterEach(() => {
  vi.unstubAllGlobals();
  located.map = new Map();
});

const POSTS = [
  '2026-10-30 09:45:23,etugenio,ip,203.0.113.5,#C2 #Mythic,https://x.com/etugenio/status/1',
  '2026-10-31 09:45:23,someone,ip,192.0.2.10,#C2,https://x.com/someone/status/2',
  '2026-10-31 10:45:23,someone,ip,203.0.113.9,#C2,https://x.com/someone/status/3',
].join('\n');

/** Feodo answers JSON and TweetFeed answers CSV, as the live providers do. */
async function getBoth(feodo: unknown, posts: string | null) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('TweetFeed')
    ? (posts === null
      ? { ok: false, status: 503, text: async () => '', headers: new Headers() }
      : { ok: true, status: 200, text: async () => posts, headers: new Headers({ etag: '"x"' }) })
    : { ok: true, status: 200, json: async () => feodo })));
  const { GET } = await import('./route');
  return (await GET()).json();
}

const GEO = (ip: string) => ({ ip, lat: 52.37, lng: 4.89, country: 'NL', city: 'Amsterdam', asn: 64500, as_name: 'EXAMPLE-AS' });

describe('GET /api/cyber-attacks', () => {
  it('reports one indicator for one record, with no invented attack', async () => {
    const body = await get(FIXTURE);

    expect(body.total).toBe(1);
    expect(body.indicators).toHaveLength(1);
    expect(body.online).toBe(0); // the fixture's C2 is offline
    expect(body.indicators[0]).toMatchObject({
      id: '192.0.2.10:443', ip: '192.0.2.10', port: 443, malware: 'Emotet',
      status: 'offline', country: 'US', location_precision: 'country',
    });
    expect(JSON.stringify(body)).not.toMatch(/EXFILTRATION|CREDENTIAL HARVEST|LATERAL MOVE|src_lat/);
    expect(body.indicators[0].source).toBe('abuse.ch Feodo Tracker');
  });

  it("separates fetch time from the record's observation times", async () => {
    const body = await get([{ ...FIXTURE[0], first_seen: '2026-02-01 09:00:00', last_online: '2026-02-08' }]);

    expect(body.fetched_at).toEqual(expect.any(String));
    expect(body.indicators[0].first_seen).toBe('2026-02-01 09:00:00');
    expect(body.indicators[0].last_online).toBe('2026-02-08');
    expect(body.indicators[0]).not.toHaveProperty('fetched_at');
  });

  it('holds its intelligence fields steady across repeated fetches', async () => {
    const first = await get(FIXTURE);
    const second = await get(FIXTURE);

    expect(second.indicators).toEqual(first.indicators);
    expect(second.total).toBe(first.total);
  });

  it('counts a C2 listed twice once', async () => {
    const body = await get([FIXTURE[0], { ...FIXTURE[0] }]);
    expect(body.total).toBe(1);
  });

  it('adds the addresses researchers posted as C2, placed by their own geolocation', async () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    located.map = new Map([['203.0.113.5', GEO('203.0.113.5')], ['203.0.113.9', GEO('203.0.113.9')]]);
    const body = await getBoth(FIXTURE, POSTS);
    vi.useRealTimers();

    expect(body.indicators.map((i: { ip: string }) => i.ip)).toEqual(['192.0.2.10', '203.0.113.5', '203.0.113.9']);
    expect(body.indicators[1]).toMatchObject({
      status: 'reported', malware: 'Mythic', city: 'Amsterdam', location_precision: 'city',
      reference: 'https://x.com/etugenio/status/1',
    });
    expect(body.sources).toEqual([
      { name: 'abuse.ch Feodo Tracker', count: 1 },
      { name: 'TweetFeed (researcher reports on X)', count: 2 },
    ]);
  });

  it('counts an address on both lists once, as the blocklist reports it', async () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    located.map = new Map([['192.0.2.10', GEO('192.0.2.10')], ['203.0.113.5', GEO('203.0.113.5')], ['203.0.113.9', GEO('203.0.113.9')]]);
    const body = await getBoth(FIXTURE, POSTS);
    vi.useRealTimers();

    expect(body.indicators.filter((i: { ip: string }) => i.ip === '192.0.2.10')).toHaveLength(1);
    expect(body.indicators[0]).toMatchObject({ status: 'offline', location_precision: 'city' });
  });

  it('leaves out a post it cannot place, but keeps a blocklist row at its country', async () => {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const body = await getBoth(FIXTURE, POSTS);
    vi.useRealTimers();

    expect(body.indicators).toHaveLength(1);
    expect(body.indicators[0]).toMatchObject({ ip: '192.0.2.10', location_precision: 'country' });
  });

  it('serves the blocklist when the posts fail, and says which source failed', async () => {
    const body = await getBoth(FIXTURE, null);

    expect(body.total).toBe(1);
    expect(body.sources[1]).toMatchObject({ count: 0, error: 'HTTP 503' });
  });

  it('returns an empty feed rather than filler when the provider fails', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })));
    const { GET } = await import('./route');
    const body = await (await GET()).json();

    expect(body).toMatchObject({ indicators: [], total: 0, online: 0 });
  });
});

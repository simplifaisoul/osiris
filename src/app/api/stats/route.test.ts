import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, clearStatsSnapshot } from './route';

/* Each computation fetches six of the app's own feeds. These tests count those
   fetches, because the defect was that every caller paid for all six. */
const baseFeeds = (): Record<string, unknown> => ({
  flights: { commercial_flights: [1, 2], private_flights: [3], private_jets: [], military_flights: [4] },
  satellites: { satellites: [1, 2, 3] },
  cctv: { cameras: [1, 2, 3, 4, 5] },
  weather: { events: [1] },
  infrastructure: { infrastructure: [1, 2] },
  gdelt: { events: [1, 2, 3, 4] },
});

let feeds = baseFeeds();
let calls = 0;
let release: () => void = () => {};

/** `hold` keeps every feed request open until release(), to test concurrency. */
function mockFetch({ hold = false } = {}) {
  calls = 0;
  const gate = hold ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls++;
    await gate;
    const feed = new URL(url).pathname.split('/').pop()!;
    return new Response(JSON.stringify(feeds[feed] ?? {}), { status: 200 });
  }));
}

const request = () => GET(new Request('http://localhost:3000/api/stats'));
const at = (iso: string) => vi.setSystemTime(new Date(iso));

describe('GET /api/stats', () => {
  beforeEach(() => {
    feeds = baseFeeds();
    clearStatsSnapshot();
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-01-01T00:00:00Z');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts each feed', async () => {
    mockFetch();
    const body = await (await request()).json();
    expect(body.stats).toEqual({ flights: 4, sats: 3, cctv: 5, weather: 1, nuclear: 2, incidents: 4 });
  });

  it('serves a burst of concurrent callers from one computation', async () => {
    mockFetch({ hold: true });
    const burst = Array.from({ length: 50 }, request);
    release();
    const bodies = await Promise.all(burst.map(response => response.then(r => r.json())));
    expect(calls).toBe(6);
    expect(new Set(bodies.map(b => JSON.stringify(b.stats))).size).toBe(1);
  });

  it('does not recompute within the TTL', async () => {
    mockFetch();
    await request();
    at('2026-01-01T00:00:29Z');
    await request();
    expect(calls).toBe(6);
  });

  it('answers from a stale snapshot at once while refreshing behind it', async () => {
    mockFetch();
    await request();

    feeds.satellites = { satellites: [1] };
    mockFetch({ hold: true });
    at('2026-01-01T00:00:31Z');
    // Resolves while the refresh is still held open: the caller never waits on it.
    const stale = await (await request()).json();
    expect(stale.stats.sats).toBe(3);
    expect(calls).toBe(6);

    release();
    await vi.waitFor(async () => expect((await (await request()).json()).stats.sats).toBe(1));
    expect(calls).toBe(6); // the waiting callers shared the one refresh
  });

  it('keeps serving the last good snapshot when a refresh fails', async () => {
    mockFetch();
    await request();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    at('2026-01-01T00:00:31Z');

    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).stats.sats).toBe(3);
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Stats refresh failed:', expect.any(Error)));
  });

  /* Found running this against a real server: its first computation raced
     startup, every feed failed, and the zeros were then cached like real data. */
  it('keeps a failed feed at its last good count rather than zeroing it', async () => {
    mockFetch();
    await request();

    feeds.gdelt = { events: [1] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const feed = new URL(url).pathname.split('/').pop()!;
      if (feed === 'satellites') throw new TypeError('fetch failed');
      return new Response(JSON.stringify(feeds[feed] ?? {}), { status: 200 });
    }));
    at('2026-01-01T00:00:31Z');
    await request();
    await vi.waitFor(async () => expect((await (await request()).json()).stats.incidents).toBe(1));
    expect((await (await request()).json()).stats.sats).toBe(3);
  });

  it('does not treat a computation that reached no feed as fresh', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { attempts++; throw new TypeError('fetch failed'); }));
    await request();
    expect(attempts).toBe(6);
    // Still inside what would be the TTL, but nothing was learned: try again.
    at('2026-01-01T00:00:05Z');
    await request();
    await vi.waitFor(() => expect(attempts).toBe(12));

    mockFetch();
    await vi.waitFor(async () => expect((await (await request()).json()).stats.sats).toBe(3));
  });

  it('reports a failure when there is no snapshot to fall back on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect((await request()).status).toBe(500);
  });
});

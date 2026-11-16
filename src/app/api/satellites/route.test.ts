import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Counts builds: the route propagates every satellite once per build.
const propagateTLE = vi.hoisted(() => vi.fn(() => ({ lat: 10, lng: 20, altKm: 400 })));
vi.mock('@/lib/orbit', () => ({ propagateTLE }));

const SATS = 5_100; // above the 5,000 below which the route treats its catalogue as incomplete and refetches
const ISS_1 = '1 25544U 98067A   24146.40251785  .00015505  00000-0  27885-3 0  9997';
const ISS_2 = '2 25544  51.6402 189.7042 0004381 334.8091 106.8778 15.50091157455243';
const tleText = Array.from({ length: SATS }, (_, i) => {
  const id = String(10000 + i);
  return `SAT ${id}\n1 ${id}${ISS_1.slice(7)}\n2 ${id}${ISS_2.slice(7)}`;
}).join('\n');

/** CelesTrak: the "active" group carries the catalogue, every other group answers empty. */
const celestrak = () =>
  vi.fn(async (input: RequestInfo | URL) =>
    new Response(String(input).includes('GROUP=active') ? tleText : '', { status: 200 }));

let cwd: string;

// A fresh module per case (its caches are module state), reading and writing its disk cache in a temp dir.
const freshGet = async () => {
  vi.resetModules();
  return (await import('./route')).GET;
};

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'osiris-sats-'));
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  propagateTLE.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

describe('GET /api/satellites', () => {
  it('answers from one build for ten seconds, then builds again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = celestrak();
    vi.stubGlobal('fetch', fetchMock);
    const GET = await freshGet();

    const first = await (await GET()).json();
    expect(first.raw_count).toBe(SATS);
    expect(first.total).toBe(SATS);
    expect(propagateTLE).toHaveBeenCalledTimes(SATS);
    const downloads = fetchMock.mock.calls.length;

    vi.setSystemTime(Date.now() + 5_000);
    const second = await GET();
    expect(second.headers.get('content-type')).toBe('application/json');
    expect(second.headers.get('cache-control')).toBe('public, s-maxage=120, stale-while-revalidate=300');
    expect((await second.json()).timestamp).toBe(first.timestamp);
    expect(propagateTLE).toHaveBeenCalledTimes(SATS);

    vi.setSystemTime(Date.now() + 6_000);
    const third = await (await GET()).json();
    expect(third.timestamp).not.toBe(first.timestamp);
    expect(propagateTLE).toHaveBeenCalledTimes(2 * SATS);
    // The TLEs are still fresh, so only the positions were rebuilt.
    expect(fetchMock.mock.calls.length).toBe(downloads);
  });

  it('shares one catalogue refresh and one build between concurrent requests', async () => {
    const fetchMock = celestrak();
    vi.stubGlobal('fetch', fetchMock);
    const GET = await freshGet();

    const bodies = await Promise.all([GET(), GET(), GET()].map(async res => (await res).json()));
    expect(bodies.map(body => body.raw_count)).toEqual([SATS, SATS, SATS]);

    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.length).toBeGreaterThan(1);
    expect(new Set(urls).size).toBe(urls.length);
    expect(propagateTLE).toHaveBeenCalledTimes(SATS);
  });
});

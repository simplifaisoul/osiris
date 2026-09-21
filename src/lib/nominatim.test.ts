import { describe, it, expect, vi, beforeEach } from 'vitest';

// No snapshot file is written or read during tests, and the wait between
// requests is shortened so the suite does not sit through it.
process.env.OSIRIS_NOMINATIM_CACHE = 'off';
process.env.OSIRIS_NOMINATIM_GAP_MS = '20';

const httpJson = vi.fn();
vi.mock('@/lib/httpJson', () => ({
  httpJson: (...args: unknown[]) => httpJson(...args),
  OSIRIS_UA: 'test',
}));

const { nominatim, nominatimStats, clearNominatimCache, requestGapMs } = await import('./nominatim');

beforeEach(() => {
  clearNominatimCache();
  httpJson.mockReset();
});

describe('nominatim', () => {
  it('asks once for a question it has been asked twice', async () => {
    httpJson.mockResolvedValue([{ name: 'Sumy' }]);

    const first = await nominatim('search', { q: 'Sumy' });
    const second = await nominatim('search', { q: 'Sumy' });

    expect(first).toEqual([{ name: 'Sumy' }]);
    expect(second).toEqual([{ name: 'Sumy' }]);
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(nominatimStats()).toMatchObject({ served: 2, sent: 1, fromCache: 1 });
  });

  it('treats the same parameters in any order as the same question', async () => {
    httpJson.mockResolvedValue([]);
    await nominatim('search', { q: 'Kyiv', limit: '5' });
    await nominatim('search', { limit: '5', q: 'Kyiv' });
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('never sends a request for a cacheOnly caller', async () => {
    httpJson.mockResolvedValue([{ name: 'Riyadh' }]);

    expect(await nominatim('search', { q: 'Riyadh' }, { cacheOnly: true })).toBeNull();
    expect(httpJson).not.toHaveBeenCalled();

    await nominatim('search', { q: 'Riyadh' });
    // Once it is known, the same caller is answered for free.
    expect(await nominatim('search', { q: 'Riyadh' }, { cacheOnly: true })).toEqual([{ name: 'Riyadh' }]);
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('remembers that a name has no answer, rather than asking again', async () => {
    httpJson.mockResolvedValue([]);
    await nominatim('search', { q: 'Explosions' });
    await nominatim('search', { q: 'Explosions' });
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('answers null when a request fails, and does not retry it immediately', async () => {
    httpJson.mockRejectedValue(new Error('HTTP 429'));
    expect(await nominatim('search', { q: 'Kharkiv' })).toBeNull();
    expect(await nominatim('search', { q: 'Kharkiv' })).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(nominatimStats()).toMatchObject({ failed: 1 });
  });

  it('refuses a burst rather than queueing it against somebody else’s server', async () => {
    httpJson.mockResolvedValue([]);

    const asked = await Promise.all(
      Array.from({ length: 60 }, (_, i) => nominatim('search', { q: `place ${i}` })),
    );

    const refused = asked.filter(a => a === null).length;
    expect(refused).toBeGreaterThan(0);
    expect(nominatimStats().refused).toBe(refused);
    // Nothing beyond the queue length was even attempted.
    expect(httpJson.mock.calls.length).toBeLessThanOrEqual(40);
  }, 30_000);

  it('leaves the configured gap between the requests it does send', async () => {
    httpJson.mockResolvedValue([]);
    const started = Date.now();
    await Promise.all([
      nominatim('search', { q: 'one' }),
      nominatim('search', { q: 'two' }),
      nominatim('search', { q: 'three' }),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2 * requestGapMs());
  }, 30_000);

  it('holds to the policy’s one request a second outside tests, whatever the environment says', () => {
    expect(requestGapMs({} as NodeJS.ProcessEnv)).toBe(2_000);
    expect(requestGapMs({ OSIRIS_NOMINATIM_GAP_MS: '5', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(1_000);
    expect(requestGapMs({ OSIRIS_NOMINATIM_GAP_MS: '4000', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(4_000);
    expect(requestGapMs({ OSIRIS_NOMINATIM_GAP_MS: '5', NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(5);
  });
});

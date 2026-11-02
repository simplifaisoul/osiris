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
  process.env.NOMINATIM_URL = 'https://nominatim.test/';
  clearNominatimCache();
  httpJson.mockReset();
});

describe('nominatim', () => {
  it('asks nothing at all unless the operator turned it on', async () => {
    delete process.env.NOMINATIM_URL;
    expect(await nominatim({ q: 'Sumy' })).toBeNull();
    expect(httpJson).not.toHaveBeenCalled();
    expect(nominatimStats().configured).toBe(false);
  });

  it('asks the configured server’s search, in English', async () => {
    httpJson.mockResolvedValue([]);
    await nominatim({ q: 'Sumy', limit: '8' });
    expect(httpJson.mock.calls[0][0]).toBe('https://nominatim.test/search?format=jsonv2&accept-language=en&q=Sumy&limit=8');
  });

  it('asks once for a question it has been asked twice', async () => {
    httpJson.mockResolvedValue([{ name: 'Sumy' }]);

    const first = await nominatim({ q: 'Sumy' });
    const second = await nominatim({ q: 'Sumy' });

    expect(first).toEqual([{ name: 'Sumy' }]);
    expect(second).toEqual([{ name: 'Sumy' }]);
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(nominatimStats()).toMatchObject({ served: 2, sent: 1, fromCache: 1 });
  });

  it('treats the same parameters in any order as the same question', async () => {
    httpJson.mockResolvedValue([]);
    await nominatim({ q: 'Kyiv', limit: '5' });
    await nominatim({ limit: '5', q: 'Kyiv' });
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('remembers that a name has no answer, rather than asking again', async () => {
    httpJson.mockResolvedValue([]);
    await nominatim({ q: 'Explosions' });
    await nominatim({ q: 'Explosions' });
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('answers null when a request fails, and does not retry it immediately', async () => {
    httpJson.mockRejectedValue(new Error('HTTP 429'));
    expect(await nominatim({ q: 'Kharkiv' })).toBeNull();
    expect(await nominatim({ q: 'Kharkiv' })).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(nominatimStats()).toMatchObject({ failed: 1 });
  });

  it('refuses a burst rather than queueing it against somebody else’s server', async () => {
    httpJson.mockResolvedValue([]);

    const asked = await Promise.all(
      Array.from({ length: 60 }, (_, i) => nominatim({ q: `place ${i}` })),
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
      nominatim({ q: 'one' }),
      nominatim({ q: 'two' }),
      nominatim({ q: 'three' }),
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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// No snapshot file is written or read during tests.
process.env.OSIRIS_GEOCODER_CACHE = 'off';

const httpJson = vi.fn();
vi.mock('@/lib/httpJson', () => ({
  httpJson: (...args: unknown[]) => httpJson(...args),
  OSIRIS_UA: 'test',
}));

const { geocoder, geocoderStats, clearGeocoderCache, sharedSearch, sharedSearchConfigured } = await import('./geocoder');

beforeEach(() => {
  process.env.OSIRIS_GEOCODER_URL = 'http://geocoder.test:2322/';
  delete process.env.SHARED_SEARCH_URL;
  clearGeocoderCache();
  httpJson.mockReset();
});

describe('sharedSearch', () => {
  it('asks osirisai.live by default, so a copy needs nothing set up', async () => {
    httpJson.mockResolvedValue({ results: [] });
    await sharedSearch({ q: 'Lviv', lat: '49.8', lng: '24' });
    expect(httpJson.mock.calls[0][0]).toBe('https://osirisai.live/api/geosearch/shared?q=Lviv&lat=49.8&lng=24');
  });

  it('asks another deployment when told to, and nothing when it is off', async () => {
    process.env.SHARED_SEARCH_URL = 'https://osiris.example/api/geosearch/shared';
    httpJson.mockResolvedValue({ results: [] });
    await sharedSearch({ q: 'Lviv' });
    expect(httpJson.mock.calls[0][0]).toBe('https://osiris.example/api/geosearch/shared?q=Lviv');

    process.env.SHARED_SEARCH_URL = 'off';
    expect(sharedSearchConfigured()).toBe(false);
    expect(await sharedSearch({ q: 'Odesa' })).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('remembers answers and rests after a failure, like the geocoder', async () => {
    httpJson.mockRejectedValueOnce(new Error('HTTP 404')).mockResolvedValue({ results: [] });
    expect(await sharedSearch({ q: 'Kyiv' })).toBeNull();
    expect(await sharedSearch({ q: 'Lviv' })).toBeNull();
    expect(httpJson).toHaveBeenCalledTimes(1);
  });
});

describe('geocoder', () => {
  it('asks nothing at all when no geocoder is configured', async () => {
    delete process.env.OSIRIS_GEOCODER_URL;
    expect(await geocoder({ q: 'Sumy' })).toBeNull();
    expect(httpJson).not.toHaveBeenCalled();
    expect(geocoderStats().configured).toBe(false);
  });

  it('asks the configured server, in English, with repeated keys for a list', async () => {
    httpJson.mockResolvedValue({ features: [] });
    await geocoder({ q: 'Sumy', layer: ['city', 'state'] });
    expect(httpJson.mock.calls[0][0]).toBe('http://geocoder.test:2322/api?lang=en&q=Sumy&layer=city&layer=state');
  });

  it('asks once for a question it has been asked twice', async () => {
    httpJson.mockResolvedValue({ features: [{ properties: { name: 'Sumy' } }] });

    const first = await geocoder({ q: 'Sumy' });
    const second = await geocoder({ q: 'Sumy' });

    expect(first).toEqual(second);
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(geocoderStats()).toMatchObject({ served: 2, sent: 1, fromCache: 1 });
  });

  it('treats the same parameters in any order as the same question', async () => {
    httpJson.mockResolvedValue({ features: [] });
    await geocoder({ q: 'Kyiv', limit: '5' });
    await geocoder({ limit: '5', q: 'Kyiv' });
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it('leaves the geocoder alone for a while after it fails, then asks again', async () => {
    vi.useFakeTimers();
    try {
      httpJson.mockRejectedValue(new Error('Upstream timed out'));
      expect(await geocoder({ q: 'Kharkiv' })).toBeNull();
      // A different question during the rest is refused without a request.
      expect(await geocoder({ q: 'Odesa' })).toBeNull();
      expect(httpJson).toHaveBeenCalledTimes(1);
      expect(geocoderStats()).toMatchObject({ failed: 1, refused: 1 });

      vi.advanceTimersByTime(31_000);
      httpJson.mockReset().mockResolvedValue({ features: [] });
      expect(await geocoder({ q: 'Kharkiv' })).toEqual({ features: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops what was waiting in line when the geocoder fails', async () => {
    let fail: (e: Error) => void = () => {};
    httpJson.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));

    const asked = Array.from({ length: 10 }, (_, i) => geocoder({ q: `town ${i}` }));
    await new Promise(resolve => setTimeout(resolve, 10));
    fail(new Error('Upstream timed out')); // the last of the four in flight fails

    await Promise.race([Promise.all(asked), new Promise(resolve => setTimeout(resolve, 50))]);
    // Six were waiting; none of them was sent after the failure.
    expect(httpJson).toHaveBeenCalledTimes(4);
  });

  it('runs a few at once and refuses a burst beyond its queue', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    let atOnce = 0;
    let most = 0;
    httpJson.mockImplementation(async () => {
      most = Math.max(most, ++atOnce);
      await gate;
      atOnce--;
      return { features: [] };
    });

    const asked = Array.from({ length: 60 }, (_, i) => geocoder({ q: `place ${i}` }));
    await new Promise(resolve => setTimeout(resolve, 10));
    release();
    const answers = await Promise.all(asked);

    expect(most).toBe(4);
    const refused = answers.filter(a => a === null).length;
    expect(refused).toBeGreaterThan(0);
    expect(geocoderStats().refused).toBe(refused);
    expect(httpJson.mock.calls.length).toBe(60 - refused);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createRunner } from './runSource';
import type { Cache } from './cache';
import type { RateLimiter } from './rateLimit';
import type { HealthTracker } from './health';
import type { SourceAdapter } from './types';

function makeAdapter<T>(overrides: Partial<SourceAdapter<T>> = {}): SourceAdapter<T> {
  return {
    meta: {
      id: 'test-source',
      name: 'Test Source',
      category: 'other',
      homepage: 'https://example.com',
      requiresKey: false,
      ttlSeconds: 60,
      minIntervalMs: 1000,
      attribution: 'Example',
    },
    isEnabled: () => true,
    fetch: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function makeStubs() {
  const cacheStore = new Map<string, unknown>();
  const cache: Cache = {
    get: vi.fn((key: string) => cacheStore.get(key)) as Cache['get'],
    set: vi.fn((key: string, value: unknown) => { cacheStore.set(key, value); }) as Cache['set'],
    getStale: vi.fn((key: string) => cacheStore.get(key)) as Cache['getStale'],
  };
  const rateLimit: RateLimiter = { acquire: vi.fn().mockResolvedValue(undefined) };
  const health: HealthTracker = {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    get: vi.fn(),
    snapshot: vi.fn().mockReturnValue([]),
  };
  return { cache, rateLimit, health, cacheStore };
}

describe('createRunner / runSource', () => {
  it('returns status unknown without fetching when the adapter is disabled', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter({ isEnabled: () => false });

    const result = await runner.runSource(adapter);

    expect(result.status).toBe('unknown');
    expect(adapter.fetch).not.toHaveBeenCalled();
  });

  it('returns a fresh cache hit without calling fetch or the rate limiter', async () => {
    const { cache, rateLimit, health, cacheStore } = makeStubs();
    cacheStore.set('test-source', { cached: true });
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    const result = await runner.runSource(adapter);

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ cached: true });
    expect(result.stale).toBe(false);
    expect(adapter.fetch).not.toHaveBeenCalled();
    expect(rateLimit.acquire).not.toHaveBeenCalled();
  });

  it('acquires the rate limiter using the adapter minIntervalMs before fetching', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    await runner.runSource(adapter);

    expect(rateLimit.acquire).toHaveBeenCalledWith('test-source', 1000);
  });

  it('on a successful fetch, caches the result and records health success', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    const result = await runner.runSource(adapter);

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ ok: true });
    expect(cache.set).toHaveBeenCalledWith('test-source', { ok: true }, 60);
    expect(health.recordSuccess).toHaveBeenCalled();
  });

  it('on a failed fetch with no cached fallback, records failure and returns down', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter({ fetch: vi.fn().mockRejectedValue(new Error('upstream 500')) });

    const result = await runner.runSource(adapter);

    expect(result.status).toBe('down');
    expect(result.stale).toBe(false);
    expect(result.error).toBe('upstream 500');
    expect(health.recordFailure).toHaveBeenCalledWith('test-source');
  });

  it('on a failed fetch with a stale cache entry available, returns degraded stale data', async () => {
    const { cache, rateLimit, health, cacheStore } = makeStubs();
    // Simulate an expired cache entry: cache.get (fresh) misses, getStale hits.
    cacheStore.set('test-source', { old: true });
    cache.get = vi.fn().mockReturnValue(undefined);
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter({ fetch: vi.fn().mockRejectedValue(new Error('timeout')) });

    const result = await runner.runSource(adapter);

    expect(result.status).toBe('degraded');
    expect(result.stale).toBe(true);
    expect(result.data).toEqual({ old: true });
    expect(result.error).toBe('timeout');
  });

  it('caches and rate-limits parameterized calls under a key that includes the params', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    await runner.runSource(adapter, { lat: '1', lng: '2' });

    expect(rateLimit.acquire).toHaveBeenCalledWith('test-source:lat=1&lng=2', 1000);
    expect(cache.set).toHaveBeenCalledWith('test-source:lat=1&lng=2', { ok: true }, 60);
  });

  it('produces the same cache key regardless of param insertion order', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    await runner.runSource(adapter, { lng: '2', lat: '1' });

    expect(cache.set).toHaveBeenCalledWith('test-source:lat=1&lng=2', { ok: true }, 60);
  });

  it('two different param sets for the same adapter do not share a cache entry', async () => {
    const { cache, rateLimit, health, cacheStore } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    cacheStore.set('test-source:lat=1&lng=2', { spot: 'A' });

    const result = await runner.runSource(adapter, { lat: '9', lng: '9' });

    // Different params -> cache miss -> falls through to a real fetch, not spot A's cached value.
    expect(result.data).toEqual({ ok: true });
    expect(adapter.fetch).toHaveBeenCalled();
  });

  it('reports health under the plain adapter id even for parameterized calls', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter({ fetch: vi.fn().mockRejectedValue(new Error('x')) });

    const result = await runner.runSource(adapter, { lat: '1', lng: '2' });

    expect(result.sourceId).toBe('test-source');
    expect(health.recordFailure).toHaveBeenCalledWith('test-source');
  });

  it('with no params, behaves exactly as before (plain adapter id as the key)', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const adapter = makeAdapter();

    await runner.runSource(adapter);

    expect(rateLimit.acquire).toHaveBeenCalledWith('test-source', 1000);
    expect(cache.set).toHaveBeenCalledWith('test-source', { ok: true }, 60);
  });
});

describe('createRunner / runWithFallback', () => {
  it('returns the primary result when it succeeds, never calling the secondary', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const primary = makeAdapter({ meta: { ...makeAdapter().meta, id: 'primary' } });
    const secondary = makeAdapter({ meta: { ...makeAdapter().meta, id: 'secondary' } });

    const result = await runner.runWithFallback([primary, secondary]);

    expect(result.sourceId).toBe('primary');
    expect(secondary.fetch).not.toHaveBeenCalled();
  });

  it('falls through to the secondary when the primary fails', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const primary = makeAdapter({
      meta: { ...makeAdapter().meta, id: 'primary' },
      fetch: vi.fn().mockRejectedValue(new Error('down')),
    });
    const secondary = makeAdapter({ meta: { ...makeAdapter().meta, id: 'secondary' } });

    const result = await runner.runWithFallback([primary, secondary]);

    expect(result.sourceId).toBe('secondary');
    expect(result.status).toBe('ok');
  });

  it('returns the last failure when every adapter in the chain fails', async () => {
    const { cache, rateLimit, health } = makeStubs();
    const runner = createRunner({ cache, rateLimit, health, now: () => 1000 });
    const primary = makeAdapter({
      meta: { ...makeAdapter().meta, id: 'primary' },
      fetch: vi.fn().mockRejectedValue(new Error('down-1')),
    });
    const secondary = makeAdapter({
      meta: { ...makeAdapter().meta, id: 'secondary' },
      fetch: vi.fn().mockRejectedValue(new Error('down-2')),
    });

    const result = await runner.runWithFallback([primary, secondary]);

    expect(result.sourceId).toBe('secondary');
    expect(result.status).toBe('down');
  });
});

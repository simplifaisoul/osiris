import type { Cache } from './cache';
import type { RateLimiter } from './rateLimit';
import type { HealthTracker } from './health';
import type { NormalizedResult, SourceAdapter } from './types';

export interface RunnerDeps {
  cache: Cache;
  rateLimit: RateLimiter;
  health: HealthTracker;
  now?: () => number;
  timeoutMs?: number;
}

export interface Runner {
  runSource<T>(adapter: SourceAdapter<T>, params?: Record<string, string>): Promise<NormalizedResult<T>>;
  runWithFallback<T>(adapters: SourceAdapter<T>[], params?: Record<string, string>): Promise<NormalizedResult<T>>;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Cache/rate-limit key for a call. Parameterized adapters (e.g. a per-bbox
 * satellite-imagery search) must not share a cache/rate-limit slot across
 * different param sets, or one query's response would leak into another's.
 * Health tracking intentionally stays keyed by the plain adapter id — health
 * is about the underlying service, not any one parameterized query.
 */
function requestKey(id: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return id;
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return `${id}:${sorted}`;
}

export function createRunner(deps: RunnerDeps): Runner {
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  function timestamp(): string {
    return new Date(now()).toISOString();
  }

  async function runSource<T>(adapter: SourceAdapter<T>, params?: Record<string, string>): Promise<NormalizedResult<T>> {
    const id = adapter.meta.id;
    const key = requestKey(id, params);

    if (!adapter.isEnabled()) {
      return {
        sourceId: id,
        fetchedAt: timestamp(),
        stale: false,
        data: undefined,
        status: 'unknown',
        error: 'disabled: required API key not configured',
      };
    }

    const cached = deps.cache.get<T>(key);
    if (cached !== undefined) {
      return { sourceId: id, fetchedAt: timestamp(), stale: false, data: cached, status: 'ok' };
    }

    await deps.rateLimit.acquire(key, adapter.meta.minIntervalMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = now();
    try {
      const data = await adapter.fetch({ signal: controller.signal, params });
      deps.cache.set(key, data, adapter.meta.ttlSeconds);
      deps.health.recordSuccess(id, now() - start);
      return { sourceId: id, fetchedAt: timestamp(), stale: false, data, status: 'ok' };
    } catch (e) {
      deps.health.recordFailure(id);
      const stale = deps.cache.getStale<T>(key);
      if (stale !== undefined) {
        return { sourceId: id, fetchedAt: timestamp(), stale: true, data: stale, status: 'degraded', error: errorMessage(e) };
      }
      return { sourceId: id, fetchedAt: timestamp(), stale: false, data: undefined, status: 'down', error: errorMessage(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function runWithFallback<T>(adapters: SourceAdapter<T>[], params?: Record<string, string>): Promise<NormalizedResult<T>> {
    let last: NormalizedResult<T> | undefined;
    for (const adapter of adapters) {
      const result = await runSource(adapter, params);
      if (result.status === 'ok') return result;
      last = result;
    }
    return last as NormalizedResult<T>;
  }

  return { runSource, runWithFallback };
}

/**
 * OSIRIS — upstream source cache.
 *
 * Camera *indexes* (where the cameras are) change on the order of weeks, while
 * the frames themselves are pulled live by the client straight from the source.
 * Re-downloading a 500 KB index on every request is pure waste — and some of
 * these upstreams are slow enough to dominate the response (MDOT ~7s, NZTA ~8s),
 * so an uncached `region=all` took ~15s every single time.
 *
 * Three behaviours matter here:
 *   • TTL        — serve from memory until the index is plausibly stale.
 *   • dedup      — concurrent misses share one upstream request instead of
 *                  stampeding it (a `region=all` fan-out hits every source at once).
 *   • stale-on-error — if the upstream fails, keep serving the last good index
 *                  rather than dropping the layer to zero cameras.
 */

interface Entry<T> {
  data: T[];
  expiresAt: number;
  inflight: Promise<T[]> | null;
}

const store = new Map<string, Entry<unknown>>();

export const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Cap on distinct keys. Camera sources are a fixed handful, but callers with
 * per-coordinate keys (place lookups) would otherwise grow this map without
 * bound. Map preserves insertion order, so the oldest keys evict first.
 */
const MAX_ENTRIES = 500;

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  for (const key of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    const entry = store.get(key);
    if (entry?.inflight) continue; // never drop a request in progress
    store.delete(key);
  }
}

/**
 * Wrap a camera fetcher with TTL caching, in-flight dedup and stale fallback.
 * Returns a drop-in replacement with the same signature.
 */
export function cachedSource<T>(
  key: string,
  fetcher: () => Promise<T[]>,
  ttlMs: number = DEFAULT_TTL_MS,
): () => Promise<T[]> {
  return async () => {
    const now = Date.now();
    const entry = store.get(key) as Entry<T> | undefined;

    if (entry && now < entry.expiresAt && entry.data.length > 0) return entry.data;
    if (entry?.inflight) return entry.inflight;

    const inflight = (async () => {
      try {
        const data = await fetcher();
        // An empty result is treated as a failed refresh: keep whatever we had.
        if (data.length === 0 && entry?.data.length) {
          store.set(key, { data: entry.data, expiresAt: now + ttlMs, inflight: null });
          return entry.data;
        }
        store.set(key, { data, expiresAt: now + ttlMs, inflight: null });
        return data;
      } catch (e) {
        if (entry?.data.length) {
          console.warn(`[OSIRIS] ${key} refresh failed — serving ${entry.data.length} cached cameras`);
          // Retry sooner than a full TTL, but don't hammer the failing upstream.
          store.set(key, { data: entry.data, expiresAt: now + 60_000, inflight: null });
          return entry.data;
        }
        console.warn(`[OSIRIS] ${key} fetch failed with no cache to fall back on:`, e);
        store.set(key, { data: [], expiresAt: now + 60_000, inflight: null });
        return [];
      }
    })();

    store.set(key, {
      data: entry?.data ?? [],
      expiresAt: entry?.expiresAt ?? 0,
      inflight,
    } as Entry<unknown>);
    evictIfNeeded();

    return inflight;
  };
}

/** Test seam — drops all cached indexes. */
export function clearSourceCache(): void {
  store.clear();
}

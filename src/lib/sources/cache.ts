interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlSeconds: number): void;
  getStale<T>(key: string): T | undefined;
}

export function createCache(now: () => number = Date.now): Cache {
  const store = new Map<string, CacheEntry<unknown>>();

  return {
    get<T>(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= now()) return undefined;
      return entry.value as T;
    },
    set<T>(key: string, value: T, ttlSeconds: number): void {
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    getStale<T>(key: string): T | undefined {
      return store.get(key)?.value as T | undefined;
    },
  };
}

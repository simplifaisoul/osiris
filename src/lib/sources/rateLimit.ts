export interface RateLimiter {
  acquire(sourceId: string, minIntervalMs: number): Promise<void>;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRateLimiter(
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = defaultWait,
): RateLimiter {
  const lastCallAt = new Map<string, number>();

  return {
    async acquire(sourceId: string, minIntervalMs: number): Promise<void> {
      const last = lastCallAt.get(sourceId);
      if (last !== undefined) {
        const remaining = minIntervalMs - (now() - last);
        if (remaining > 0) {
          await wait(remaining);
        }
      }
      lastCallAt.set(sourceId, now());
    },
  };
}

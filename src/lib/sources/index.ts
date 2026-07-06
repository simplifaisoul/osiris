import { createCache } from './cache';
import { createRateLimiter } from './rateLimit';
import { createHealthTracker } from './health';
import { createRunner } from './runSource';
import { createRegistry } from './registry';
import { registerAllSources } from './registerAll';

// Survive Next.js dev-mode HMR module re-evaluation, same pattern used by the
// SDK ingest/stream routes' globalForSDK.
const globalForSources = globalThis as unknown as {
  osirisSourcesSingleton?: {
    cache: ReturnType<typeof createCache>;
    rateLimit: ReturnType<typeof createRateLimiter>;
    health: ReturnType<typeof createHealthTracker>;
    runner: ReturnType<typeof createRunner>;
    registry: ReturnType<typeof createRegistry>;
  };
};

function build() {
  const cache = createCache();
  const rateLimit = createRateLimiter();
  const health = createHealthTracker();
  const runner = createRunner({ cache, rateLimit, health });
  const registry = createRegistry();
  registerAllSources(registry);
  return { cache, rateLimit, health, runner, registry };
}

const singleton = globalForSources.osirisSourcesSingleton ?? build();
globalForSources.osirisSourcesSingleton = singleton;

export const sourceCache = singleton.cache;
export const sourceRateLimit = singleton.rateLimit;
export const sourceHealth = singleton.health;
export const sourceRegistry = singleton.registry;
export const { runSource, runWithFallback } = singleton.runner;

export * from './types';

import type { SourceStatus } from './types';

export interface SourceHealth {
  sourceId: string;
  status: SourceStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
}

export interface HealthTracker {
  recordSuccess(sourceId: string, latencyMs: number): void;
  recordFailure(sourceId: string): void;
  get(sourceId: string): SourceHealth;
  snapshot(): SourceHealth[];
}

interface MutableHealth {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
}

function deriveStatus(consecutiveFailures: number, hasActivity: boolean): SourceStatus {
  if (!hasActivity) return 'unknown';
  if (consecutiveFailures >= 3) return 'down';
  if (consecutiveFailures >= 1) return 'degraded';
  return 'ok';
}

function toHealth(sourceId: string, entry: MutableHealth | undefined): SourceHealth {
  const hasActivity = entry !== undefined;
  const consecutiveFailures = entry?.consecutiveFailures ?? 0;
  return {
    sourceId,
    status: deriveStatus(consecutiveFailures, hasActivity),
    lastSuccessAt: entry?.lastSuccessAt ?? null,
    lastErrorAt: entry?.lastErrorAt ?? null,
    lastLatencyMs: entry?.lastLatencyMs ?? null,
    consecutiveFailures,
  };
}

export function createHealthTracker(now: () => number = Date.now): HealthTracker {
  const store = new Map<string, MutableHealth>();

  return {
    recordSuccess(sourceId: string, latencyMs: number): void {
      const existing = store.get(sourceId);
      store.set(sourceId, {
        lastSuccessAt: new Date(now()).toISOString(),
        lastErrorAt: existing?.lastErrorAt ?? null,
        lastLatencyMs: latencyMs,
        consecutiveFailures: 0,
      });
    },
    recordFailure(sourceId: string): void {
      const existing = store.get(sourceId);
      store.set(sourceId, {
        lastSuccessAt: existing?.lastSuccessAt ?? null,
        lastErrorAt: new Date(now()).toISOString(),
        lastLatencyMs: existing?.lastLatencyMs ?? null,
        consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      });
    },
    get(sourceId: string): SourceHealth {
      return toHealth(sourceId, store.get(sourceId));
    },
    snapshot(): SourceHealth[] {
      return Array.from(store.keys()).map((sourceId) => toHealth(sourceId, store.get(sourceId)));
    },
  };
}

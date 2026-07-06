import type { SourceAdapter } from './types';
import type { SourceHealth } from './health';

/** Display status for the SOURCES panel: the runtime health, plus 'disabled'
 * for keyed sources whose key isn't configured (they never run, so their raw
 * health status stays 'unknown' — 'disabled' is the honest thing to show). */
export type SourceDisplayStatus = 'ok' | 'degraded' | 'down' | 'unknown' | 'disabled';

export interface SourceHealthEntry {
  id: string;
  name: string;
  category: string;
  homepage: string;
  attribution: string;
  requiresKey: boolean;
  enabled: boolean;
  status: SourceDisplayStatus;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
}

export function buildSourceHealthReport(
  adapters: SourceAdapter<unknown>[],
  getHealth: (id: string) => SourceHealth,
): SourceHealthEntry[] {
  return adapters
    .map((a): SourceHealthEntry => {
      const h = getHealth(a.meta.id);
      const enabled = a.isEnabled();
      return {
        id: a.meta.id,
        name: a.meta.name,
        category: a.meta.category,
        homepage: a.meta.homepage,
        attribution: a.meta.attribution,
        requiresKey: a.meta.requiresKey,
        enabled,
        status: enabled ? h.status : 'disabled',
        lastSuccessAt: h.lastSuccessAt,
        lastErrorAt: h.lastErrorAt,
        lastLatencyMs: h.lastLatencyMs,
        consecutiveFailures: h.consecutiveFailures,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

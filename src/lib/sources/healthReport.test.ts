import { describe, it, expect } from 'vitest';
import { buildSourceHealthReport } from './healthReport';
import type { SourceAdapter } from './types';
import type { SourceHealth } from './health';

function adapter(id: string, category: string, name: string, opts?: { requiresKey?: boolean; enabled?: boolean }): SourceAdapter<unknown> {
  return {
    meta: {
      id,
      name,
      category: category as SourceAdapter<unknown>['meta']['category'],
      homepage: `https://example.com/${id}`,
      requiresKey: opts?.requiresKey ?? false,
      ttlSeconds: 60,
      minIntervalMs: 1000,
      attribution: `Attr ${name}`,
    },
    isEnabled: () => opts?.enabled ?? true,
    fetch: async () => ({}),
  };
}

function health(id: string, over: Partial<SourceHealth> = {}): SourceHealth {
  return {
    sourceId: id,
    status: 'unknown',
    lastSuccessAt: null,
    lastErrorAt: null,
    lastLatencyMs: null,
    consecutiveFailures: 0,
    ...over,
  };
}

describe('buildSourceHealthReport', () => {
  it('merges adapter metadata with its health entry', () => {
    const adapters = [adapter('usgs', 'seismic', 'USGS Quakes')];
    const lookup = (id: string) => health(id, { status: 'ok', lastSuccessAt: '2026-01-01T00:00:00.000Z', lastLatencyMs: 42 });

    const report = buildSourceHealthReport(adapters, lookup);

    expect(report).toHaveLength(1);
    expect(report[0]).toEqual({
      id: 'usgs',
      name: 'USGS Quakes',
      category: 'seismic',
      homepage: 'https://example.com/usgs',
      attribution: 'Attr USGS Quakes',
      requiresKey: false,
      enabled: true,
      status: 'ok',
      lastSuccessAt: '2026-01-01T00:00:00.000Z',
      lastErrorAt: null,
      lastLatencyMs: 42,
      consecutiveFailures: 0,
    });
  });

  it('reports a keyed source with no key as disabled, ignoring its (unknown) health', () => {
    const adapters = [adapter('shodan', 'osint', 'Shodan', { requiresKey: true, enabled: false })];
    const report = buildSourceHealthReport(adapters, (id) => health(id));

    expect(report[0].enabled).toBe(false);
    expect(report[0].status).toBe('disabled');
  });

  it('keeps a keyed source enabled+ok when its key is present and it is healthy', () => {
    const adapters = [adapter('shodan', 'osint', 'Shodan', { requiresKey: true, enabled: true })];
    const report = buildSourceHealthReport(adapters, (id) => health(id, { status: 'ok' }));

    expect(report[0].enabled).toBe(true);
    expect(report[0].status).toBe('ok');
  });

  it('sorts by category then name for stable grouped display', () => {
    const adapters = [
      adapter('b', 'weather', 'Zeta'),
      adapter('a', 'weather', 'Alpha'),
      adapter('c', 'cyber', 'Beta'),
    ];
    const report = buildSourceHealthReport(adapters, (id) => health(id));

    expect(report.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

import { describe, it, expect, vi } from 'vitest';

const { listAll, get } = vi.hoisted(() => ({ listAll: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/sources', () => ({
  sourceRegistry: { listAll },
  sourceHealth: { get },
}));

const { GET } = await import('./route');

describe('GET /api/sources/health', () => {
  it('returns a report entry per registered source with a summary count', async () => {
    listAll.mockReturnValue([
      { meta: { id: 'usgs', name: 'USGS', category: 'seismic', homepage: 'h', attribution: 'a', requiresKey: false }, isEnabled: () => true },
      { meta: { id: 'shodan', name: 'Shodan', category: 'osint', homepage: 'h', attribution: 'a', requiresKey: true }, isEnabled: () => false },
    ]);
    get.mockImplementation((id: string) => ({ sourceId: id, status: 'ok', lastSuccessAt: null, lastErrorAt: null, lastLatencyMs: null, consecutiveFailures: 0 }));

    const res = await GET();
    const body = await res.json();

    expect(body.total).toBe(2);
    expect(body.sources).toHaveLength(2);
    expect(body.sources.find((s: any) => s.id === 'shodan').status).toBe('disabled');
    expect(body.summary).toEqual({ ok: 1, degraded: 0, down: 0, unknown: 0, disabled: 1 });
    expect(typeof body.timestamp).toBe('string');
  });
});

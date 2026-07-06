import { describe, it, expect, vi, afterEach } from 'vitest';
import { ransomwareTracker } from './ransomwareTracker';

afterEach(() => vi.unstubAllGlobals());

describe('ransomwareTracker adapter', () => {
  it('normalizes a victim record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ victim: 'Acme Corp', group: 'lockbit', country: 'US', activity: 'Manufacturing', published: '2026-01-01', post_url: 'https://x.com/1' }],
    }));
    const result = await ransomwareTracker.fetch({ signal: new AbortController().signal });
    expect(result).toEqual([{
      id: 'ransomware-0', victim: 'Acme Corp', group: 'lockbit', country: 'US',
      activity: 'Manufacturing', published: '2026-01-01', url: 'https://x.com/1',
    }]);
  });

  it('caps at 100 entries', async () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({ victim: `V${i}`, group: 'g', country: 'US' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => entries }));
    const result = await ransomwareTracker.fetch({ signal: new AbortController().signal });
    expect(result).toHaveLength(100);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(ransomwareTracker.fetch({ signal: new AbortController().signal })).rejects.toThrow('500');
  });
});

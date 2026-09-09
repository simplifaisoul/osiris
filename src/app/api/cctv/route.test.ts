import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { stealthFetch } from '@/lib/stealthFetch';
import { clearSourceCache } from '@/lib/sourceCache';

vi.mock('@/lib/stealthFetch', () => ({ stealthFetch: vi.fn(), stealthHeaders: vi.fn(() => ({})) }));
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); clearSourceCache(); });
afterEach(() => vi.useRealTimers());

describe('CCTV partial responses', () => {
  it('returns a completed region without scheduling unnecessary retries', async () => {
    vi.mocked(stealthFetch).mockResolvedValue(Response.json([
      { id: 'JamCams_1', lat: 51.5, lon: -0.1, commonName: 'London' },
    ]));
    const response = await GET(new Request('http://localhost/api/cctv?region=uk'));
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.pendingRegions).toEqual([]);
  });

  it('marks slow regions as pending instead of silently treating them as complete', async () => {
    vi.mocked(stealthFetch).mockReturnValue(new Promise(() => {}));
    const pending = GET(new Request('http://localhost/api/cctv?region=uk'));
    await vi.advanceTimersByTimeAsync(12_000);
    const response = await pending;
    expect((await response.json()).pendingRegions).toEqual(['uk']);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('allows a bounded retry for an empty/failed provider response', async () => {
    vi.mocked(stealthFetch).mockResolvedValue(new Response('', { status: 503 }));
    const response = await GET(new Request('http://localhost/api/cctv?region=uk'));
    expect((await response.json()).pendingRegions).toEqual(['uk']);
  });
});

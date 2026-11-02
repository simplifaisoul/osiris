import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET, onTorExitList } from './route';

describe('onTorExitList', () => {
  const list = '11.1.1.10\n8.8.8.8\n185.220.101.1\n';

  it('matches an address only as a whole line', () => {
    expect(onTorExitList(list, '8.8.8.8')).toBe(true);
    expect(onTorExitList(list, '185.220.101.1')).toBe(true);
    // Contained in 11.1.1.10 and in 185.220.101.1, but on neither line itself.
    expect(onTorExitList(list, '1.1.1.1')).toBe(false);
    expect(onTorExitList(list, '5.220.101.1')).toBe(false);
  });

  it('tolerates CRLF line endings', () => {
    expect(onTorExitList('8.8.8.8\r\n9.9.9.9\r\n', '8.8.8.8')).toBe(true);
  });
});

describe('GET /api/osint/threats', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ask = (query: string, ip: string) =>
    GET(new Request(`http://localhost/api/osint/threats?query=${encodeURIComponent(query)}`, {
      headers: { 'x-forwarded-for': ip },
    }));

  it('reports UNKNOWN, not LOW, when no reputation source answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const body = await (await ask('1.1.1.1', '203.0.113.1')).json();
    expect(body.threat_level).toBe('UNKNOWN');
    expect(body.tor_exit_node).toBeNull();
  });

  it('does not call an address an exit node because a longer one contains it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('torbulkexitlist')) return new Response('11.1.1.10\n');
      if (url.includes('/indicators/IPv4/')) return Response.json({ pulse_info: { count: 0 } });
      return new Response('', { status: 403 });
    }));
    const body = await (await ask('1.1.1.1', '203.0.113.2')).json();
    expect(body.tor_exit_node).toBe(false);
    expect(body.threat_level).toBe('LOW');
  });

  it('keeps the subscribed pulse feed when it answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/pulses/subscribed')
        ? Response.json({ results: [{ name: 'Pulse A', indicator_count: 3 }] })
        : new Response('', { status: 500 })));
    const body = await (await ask('example.com', '203.0.113.3')).json();
    expect(body.pulses).toEqual([expect.objectContaining({ name: 'Pulse A', indicators_count: 3 })]);
  });

  it('treats a dotted string that is not an IPv4 address as a domain', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await ask('999.999.999.999', '203.0.113.4');
    const urls = fetchMock.mock.calls.map(c => String((c as unknown[])[0]));
    expect(urls.some(u => u.includes('torbulkexitlist'))).toBe(false);
    expect(urls.some(u => u.includes('/indicators/domain/'))).toBe(true);
  });
});

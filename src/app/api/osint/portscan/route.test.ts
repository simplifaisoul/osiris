import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const scan = (target: string, ip: string) =>
  GET(new Request(`http://localhost:3000/api/osint/portscan?target=${encodeURIComponent(target)}`, { headers: { 'x-real-ip': ip } }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/osint/portscan', () => {
  it('reads the full Shodan host record when a key is set', async () => {
    vi.stubEnv('SHODAN_API_KEY', 'k');
    const fetchMock = vi.fn(async () => json({
      ip_str: '8.8.8.8', org: 'Google LLC', isp: 'Google LLC', asn: 'AS15169', ports: [443, 53],
      hostnames: ['dns.google'], vulns: ['CVE-2020-0001'],
      data: [
        { port: 53, transport: 'udp', product: 'Google DNS', data: 'Recursion: enabled', _shodan: { module: 'dns-udp' } },
        { port: 443, transport: 'tcp', product: 'nginx', version: '1.25', http: { title: 'Google' }, vulns: { 'CVE-2021-0002': {} } },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const body = await (await scan('8.8.8.8', '203.0.113.1')).json();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('api.shodan.io/shodan/host/8.8.8.8');
    expect(body.source).toBe('shodan');
    expect(body.ports.map((p: { port: number; transport: string; service?: string }) => `${p.port}/${p.transport}/${p.service}`)).toEqual(['53/udp/dns-udp', '443/tcp/https']);
    expect(body.ports[1]).toMatchObject({ product: 'nginx', version: '1.25', title: 'Google', vulns: ['CVE-2021-0002'] });
    expect(body.vulns).toEqual(['CVE-2020-0001', 'CVE-2021-0002']);
  });

  it('falls back to the keyless InternetDB without a key', async () => {
    vi.stubEnv('SHODAN_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn(async () => json({ ip: '1.1.1.1', ports: [80, 22], cpes: [], hostnames: [], tags: [], vulns: [] })));

    const body = await (await scan('1.1.1.1', '203.0.113.2')).json();
    expect(body.source).toBe('internetdb');
    expect(body.ports.map((p: { port: number; transport: string; service?: string }) => [p.port, p.service])).toEqual([[22, 'ssh'], [80, 'http']]);
  });

  it('falls back to InternetDB with a note when Shodan refuses the key', async () => {
    vi.stubEnv('SHODAN_API_KEY', 'bad');
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('api.shodan.io') ? json({ error: 'nope' }, 401) : json({ ip: '1.1.1.1', ports: [443], cpes: [], hostnames: [], tags: [], vulns: [] })));

    const body = await (await scan('1.1.1.1', '203.0.113.3')).json();
    expect(body.source).toBe('internetdb');
    expect(body.note).toMatch(/key was refused/);
  });

  it('refuses private targets', async () => {
    const res = await scan('10.0.0.1', '203.0.113.4');
    expect(res.status).toBe(400);
  });
});

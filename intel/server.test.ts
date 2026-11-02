import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';

// The intel service is plain CommonJS; required here it exports its pieces without starting.
const intel = createRequire(import.meta.url)('./server.js');

const CSV = (rows: string[]) => ['id,schema,name,aliases,countries,program_ids,sanctions', ...rows].join('\n');
const goodCsv = CSV(['NK-1,Company,Example Sanctioned Company,,ir,SDGT,OFAC']);

afterEach(() => vi.unstubAllGlobals());

describe('buildSanctionsIndex', () => {
  it('indexes a well-formed file', () => {
    expect(intel.buildSanctionsIndex(goodCsv).entries).toHaveLength(1);
  });

  it('refuses a file without the id and name columns', () => {
    expect(() => intel.buildSanctionsIndex('unexpected,columns\nx,y')).toThrow(/id\/name/);
  });

  it('refuses a file with no named entries', () => {
    expect(() => intel.buildSanctionsIndex(CSV([',Company,,,,,']))).toThrow(/no named entries/);
  });

  it('refuses a file that would halve the index', () => {
    expect(() => intel.buildSanctionsIndex(goodCsv, 10)).toThrow(/against 10 held/);
  });
});

describe('loadSanctions', () => {
  const serve = (body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));

  it('keeps the working index when a refresh brings a broken file', async () => {
    serve(goodCsv);
    await intel.loadSanctions();
    expect(intel.sanctionsSearch('Example Sanctioned Company')).toHaveLength(1);

    serve('unexpected,columns\nx,y');
    await intel.loadSanctions();
    expect(intel.sanctionsSearch('Example Sanctioned Company')).toHaveLength(1);
  });

  it('reports the refused refresh in /health', async () => {
    serve(goodCsv);
    await intel.loadSanctions();
    serve('<html>CDN error</html>');
    await intel.loadSanctions();
    vi.unstubAllGlobals();

    const server = intel.app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      expect(health.status).toBe('degraded');
      expect(health.sanctions_entries).toBe(1);
      expect(health.sanctions_last_error).toBeTruthy();
    } finally {
      server.close();
    }
  });
});

describe('normalizeId', () => {
  it('keeps accented and non-Latin names as written', () => {
    expect(intel.normalizeId('person', 'José Álvarez')).toBe('José Álvarez');
    expect(intel.normalizeId('company', 'Газпром')).toBe('Газпром');
  });

  it('keeps an IPv6 address whole and refuses what is not an address', () => {
    expect(intel.normalizeId('ip', '2001:4860:4860::8888')).toBe('2001:4860:4860::8888');
    expect(intel.normalizeId('ip', '8.8.8.8')).toBe('8.8.8.8');
    expect(intel.normalizeId('ip', '999.1.1.1')).toBeNull();
  });

  it('drops control characters from names', () => {
    expect(intel.normalizeId('person', 'Jane\u0000\nDoe')).toBe('Jane Doe');
  });
});

describe('sparqlString', () => {
  // Every quote left in the value must be escaped, and no backslash may remain that is not that escape.
  const closesLiteral = (s: string) => /(^|[^\\])"/.test(s) || /\\(?!")/.test(s);

  it('cannot close the literal it is placed in', () => {
    for (const attack of ['x" } UNION { ?s ?p ?o', 'x\\" }', 'x\\u0022 }', 'line\nbreak"', '\\\\"']) {
      expect(closesLiteral(intel.sparqlString(attack))).toBe(false);
    }
  });

  it('leaves ordinary names alone', () => {
    expect(intel.sparqlString("José Álvarez O'Brien")).toBe("José Álvarez O'Brien");
  });
});

describe('resolver cache', () => {
  beforeEach(() => intel.wdCache.clear());

  it('does not keep a result built while Wikidata was down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const down = await intel.RESOLVERS.company('Example Company');
    expect(down.degraded).toBe(true);
    expect(down.nodes).toHaveLength(0);

    // Wikidata is back: the next request asks it again instead of serving the empty graph.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('wbsearchentities')
      ? Response.json({ search: [{ id: 'Q42' }] })
      : Response.json({ results: { bindings: [{ countryLabel: { value: 'Norway' } }] } })));
    const up = await intel.RESOLVERS.company('Example Company');
    expect(up.degraded).toBe(false);
    expect(up.nodes.map((n: { id: string }) => n.id)).toContain('country:Norway');
  });
});

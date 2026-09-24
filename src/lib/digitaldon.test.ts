import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DIGITALDON_LOADER, OSIRIS_TOKEN, MAX_QUERY_LENGTH,
  loadDigitalDon, resetDigitalDonLoader, parseResult, parseHolders, isHighBubbleRisk,
  cleanQuery, toUpdate, analyzerLink,
} from './digitaldon';

/* A minimal stand-in for the two globals the loader touches. The test env is
   node, and the loader only ever calls createElement('script') and
   head.appendChild, so this is the whole surface. */
interface FakeScript {
  src: string; async: boolean; dataset: Record<string, string>;
  onload: null | (() => void); onerror: null | (() => void); removed: boolean; remove(): void;
}
let scripts: FakeScript[];
const api = { version: '1.8.1', origin: 'https://widget.digitaldon.net', mount: vi.fn() };

function installDom() {
  scripts = [];
  const win: Record<string, unknown> = {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    createElement: () => {
      const s: FakeScript = { src: '', async: false, dataset: {}, onload: null, onerror: null, removed: false, remove() { this.removed = true; } };
      return s;
    },
    head: { appendChild: (s: FakeScript) => { scripts.push(s); } },
  });
  return win;
}

describe('loadDigitalDon', () => {
  let win: Record<string, unknown>;
  beforeEach(() => { resetDigitalDonLoader(); win = installDom(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('injects embed.js once, with no data-* widget attributes, and resolves the API', async () => {
    const a = loadDigitalDon();
    const b = loadDigitalDon();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(DIGITALDON_LOADER);
    expect(scripts[0].async).toBe(true);
    // Only our own marker: any data-chain/address/... would make embed.js mount in place.
    expect(Object.keys(scripts[0].dataset)).toEqual(['osiris']);
    win.DigitalDon = api;
    scripts[0].onload!();
    await expect(a).resolves.toBe(api);
    await expect(b).resolves.toBe(api);
  });

  it('resolves straight away when the API is already on the page', async () => {
    win.DigitalDon = api;
    await expect(loadDigitalDon()).resolves.toBe(api);
    expect(scripts).toHaveLength(0);
  });

  it('rejects on a network error, removes the tag, and a later call tries again', async () => {
    const first = loadDigitalDon();
    scripts[0].onerror!();
    await expect(first).rejects.toThrow(/failed to load/);
    expect(scripts[0].removed).toBe(true);

    const second = loadDigitalDon();
    expect(scripts).toHaveLength(2);
    win.DigitalDon = api;
    scripts[1].onload!();
    await expect(second).resolves.toBe(api);
  });

  it('rejects when the script loads but defines no API', async () => {
    const p = loadDigitalDon();
    scripts[0].onload!();
    await expect(p).rejects.toThrow(/did not define/);
  });

  it('times out instead of hanging when the script never answers', async () => {
    vi.useFakeTimers();
    const p = loadDigitalDon(5_000);
    const settled = expect(p).rejects.toThrow(/timed out/);
    vi.advanceTimersByTime(5_000);
    await settled;
    // A late onload after the timeout changes nothing.
    win.DigitalDon = api;
    scripts[0].onload!();
    await expect(p).rejects.toThrow(/timed out/);
  });

  it('refuses to run outside a browser', async () => {
    vi.unstubAllGlobals();
    await expect(loadDigitalDon()).rejects.toThrow(/browser only/);
  });
});

describe('parseResult', () => {
  const good = { chain: 'solana', address: OSIRIS_TOKEN.address, symbol: 'OSIRIS', score: 61.6, thesis: 'Bullish, accumulation zone', profile: 'YOUNG', engine: '2.40.0' };

  it('keeps a well-formed summary and rounds the score', () => {
    expect(parseResult(good)).toEqual({ ...good, score: 62 });
  });

  it('drops payloads without a usable score or symbol', () => {
    expect(parseResult(null)).toBeNull();
    expect(parseResult('score 90')).toBeNull();
    expect(parseResult({ ...good, score: NaN })).toBeNull();
    expect(parseResult({ ...good, score: '90' })).toBeNull();
    expect(parseResult({ ...good, score: 101 })).toBeNull();
    expect(parseResult({ ...good, score: -1 })).toBeNull();
    expect(parseResult({ ...good, symbol: '' })).toBeNull();
    expect(parseResult({ ...good, symbol: { toString: () => 'X' } })).toBeNull();
  });

  it('blanks non-string fields and caps their length', () => {
    const r = parseResult({ ...good, thesis: { html: '<b>' }, symbol: 'A'.repeat(200) })!;
    expect(r.thesis).toBe('');
    expect(r.symbol).toHaveLength(24);
  });
});

describe('parseHolders', () => {
  it('maps the widget payload to our shape', () => {
    expect(parseHolders({ chain: 'solana', address: 'x', symbol: 'DON', bubble_risk: 'High', clustered_pct: 21.3, top10_pct: 41.2, clusters: 2 }))
      .toEqual({ chain: 'solana', address: 'x', symbol: 'DON', bubbleRisk: 'High', clusteredPct: 21.3, top10Pct: 41.2, clusters: 2 });
  });

  it('refuses unknown risk labels and clamps numbers', () => {
    const h = parseHolders({ bubble_risk: 'EXTREME', clustered_pct: 250, top10_pct: -3, clusters: 'many' })!;
    expect(h.bubbleRisk).toBeNull();
    expect(h.clusteredPct).toBe(100);
    expect(h.top10Pct).toBeNull();
    expect(h.clusters).toBe(0);
  });

  it('flags only a high bubble risk', () => {
    expect(isHighBubbleRisk(parseHolders({ bubble_risk: 'High' }))).toBe(true);
    expect(isHighBubbleRisk(parseHolders({ bubble_risk: 'Mid' }))).toBe(false);
    expect(isHighBubbleRisk(null)).toBe(false);
  });
});

describe('request shaping', () => {
  it('trims and caps queries', () => {
    expect(cleanQuery('  pepe  ')).toBe('pepe');
    expect(cleanQuery('x'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('always sends every key, so a query after a pinned token does not inherit its address', () => {
    // embed.js merges update() into the options it mounted with.
    expect(toUpdate({ q: ' bonk ' })).toEqual({ q: 'bonk', chain: '', address: '' });
    expect(toUpdate({ chain: 'solana', address: OSIRIS_TOKEN.address, q: 'ignored' }))
      .toEqual({ q: '', chain: 'solana', address: OSIRIS_TOKEN.address });
  });

  it('pins $OSIRIS by its token mint, not its PumpSwap pool', () => {
    expect(OSIRIS_TOKEN.address.endsWith('pump')).toBe(true);
    expect(OSIRIS_TOKEN.address).not.toBe('G3rchnZ2WLsBDZSrVME4fTyzFP57F3yvvqWMxAy2b4ce');
  });

  it('builds a tagged link to the full analyzer for the fallback', () => {
    const u = new URL(analyzerLink({ q: 'bonk' }, 'recon_fallback'));
    expect(u.origin).toBe('https://analyzer.digitaldon.net');
    expect(u.searchParams.get('q')).toBe('bonk');
    expect(u.searchParams.get('utm_source')).toBe('osiris');
    expect(u.searchParams.get('utm_medium')).toBe('recon_fallback');
    expect(new URL(analyzerLink(null, 'markets_fallback')).searchParams.has('q')).toBe(false);
  });
});

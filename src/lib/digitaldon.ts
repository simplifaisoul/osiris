/**
 * OSIRIS — DigitalDon token-analysis widget: loader and message contract.
 *
 * The widget is a third-party card served from widget.digitaldon.net. It runs
 * entirely inside a sandboxed, cross-origin iframe that its own loader
 * (embed.js) creates, so nothing of it executes in this page's context and
 * nothing here can reach into it. This module is the whole of our side:
 *
 *   - `loadDigitalDon()` injects embed.js once per document, on demand, and
 *     resolves with the `window.DigitalDon` API it defines;
 *   - `parseResult()` / `parseHolders()` validate the summaries the widget
 *     posts back before any of our UI renders them;
 *   - the few constants both panels share.
 *
 * Nothing loads until a panel that shows the widget is opened. There is no key,
 * no server route and no configuration.
 */

export const DIGITALDON_ORIGIN = 'https://widget.digitaldon.net';
export const DIGITALDON_LOADER = `${DIGITALDON_ORIGIN}/embed.js`;
export const DIGITALDON_ANALYZER = 'https://analyzer.digitaldon.net/';

/** Chains the widget resolves, in the order its own search hint lists them. */
export const DIGITALDON_CHAINS = ['Solana', 'Ethereum', 'Base', 'BSC', 'Arbitrum', 'Mantle', 'Arc', 'Robinhood'] as const;

/**
 * $OSIRIS, by its token mint. The address in TokenPanel's DexScreener embed is
 * the PumpSwap pool (G3rch…), which is what a chart wants; the widget resolves
 * tokens, so it needs the mint.
 */
export const OSIRIS_TOKEN = { chain: 'solana', address: '2nZNHm3Lr9umG3DVrzYwHgktwkuKuJRXqqRqs3ewpump' } as const;

/** Same ceiling /api/osint/crypto applies to an address. */
export const MAX_QUERY_LENGTH = 128;

/** What a host asks the widget to show. A free query, or a pinned token. */
export interface DigitalDonRequest {
  q?: string;
  chain?: string;
  address?: string;
}

/** The engine's summary of the token on screen (`onResult`). */
export interface DigitalDonResult {
  chain: string;
  address: string;
  symbol: string;
  score: number;
  thesis: string;
  profile: string;
  engine: string;
}

export type BubbleRisk = 'Low' | 'Mid' | 'High';

/** The cluster scan's summary (`onHolders`). */
export interface DigitalDonHolders {
  chain: string;
  address: string;
  symbol: string;
  bubbleRisk: BubbleRisk | null;
  clusteredPct: number;
  top10Pct: number | null;
  clusters: number;
}

/** The handle `DigitalDon.mount()` returns. */
export interface DigitalDonHandle {
  iframe: HTMLIFrameElement;
  update(next: Record<string, unknown>): DigitalDonHandle;
  setTheme(theme: 'light' | 'dark' | 'auto'): DigitalDonHandle;
  destroy(): void;
}

export interface DigitalDonMountOptions {
  chain?: string;
  address?: string;
  q?: string;
  theme?: 'light' | 'dark' | 'auto';
  search?: '0' | '1';
  tools?: string;
  view?: string;
  height?: number;
  onReady?: (d: unknown) => void;
  onResult?: (d: unknown) => void;
  onHolders?: (d: unknown) => void;
}

/** `window.DigitalDon`, as defined by embed.js. */
export interface DigitalDonApi {
  version: string;
  origin: string;
  mount(target: Element | string, opts: DigitalDonMountOptions): DigitalDonHandle | null;
}

type DigitalDonWindow = Window & { DigitalDon?: DigitalDonApi };

function isApi(v: unknown): v is DigitalDonApi {
  return !!v && typeof (v as DigitalDonApi).mount === 'function';
}

let pending: Promise<DigitalDonApi> | null = null;

/**
 * Loads embed.js once and resolves with its API.
 *
 * Concurrent callers share one request. A failure (blocked by an extension,
 * offline, timed out) rejects every caller and clears the cache, so the next
 * attempt tries again rather than inheriting the failure for the life of the
 * tab. The script tag is added without data-* attributes: with none, embed.js
 * only defines `window.DigitalDon` and mounts nothing by itself.
 */
export function loadDigitalDon(timeoutMs = 10_000): Promise<DigitalDonApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('DigitalDon loads in the browser only'));
  }
  const w = window as DigitalDonWindow;
  if (isApi(w.DigitalDon)) return Promise.resolve(w.DigitalDon);
  if (pending) return pending;

  pending = new Promise<DigitalDonApi>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!err && isApi(w.DigitalDon)) return resolve(w.DigitalDon);
      pending = null;
      script.remove();
      reject(err || new Error('DigitalDon loader did not define its API'));
    };
    const timer = setTimeout(() => finish(new Error('DigitalDon loader timed out')), timeoutMs);
    script.src = DIGITALDON_LOADER;
    script.async = true;
    script.dataset.osiris = 'digitaldon-loader';
    script.onload = () => finish(null);
    script.onerror = () => finish(new Error('DigitalDon loader failed to load'));
    document.head.appendChild(script);
  });
  return pending;
}

/** Test seam: forget the cached load. */
export function resetDigitalDonLoader(): void {
  pending = null;
}

const str = (v: unknown, max = 64): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Validates the widget's `onResult` payload. The loader already drops
 * messages that do not come from the widget's origin; this is the second
 * line, so a malformed payload can never put NaN or an object into our UI.
 */
export function parseResult(raw: unknown): DigitalDonResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const score = num(d.score);
  const symbol = str(d.symbol, 24).trim();
  if (score === null || score < 0 || score > 100 || !symbol) return null;
  return {
    chain: str(d.chain, 24),
    address: str(d.address, MAX_QUERY_LENGTH),
    symbol,
    score: Math.round(score),
    thesis: str(d.thesis, 80),
    profile: str(d.profile, 24),
    engine: str(d.engine, 16),
  };
}

/** Validates the widget's `onHolders` payload. */
export function parseHolders(raw: unknown): DigitalDonHolders | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const risk = d.bubble_risk === 'Low' || d.bubble_risk === 'Mid' || d.bubble_risk === 'High' ? d.bubble_risk : null;
  const clustered = num(d.clustered_pct);
  const top10 = num(d.top10_pct);
  const clusters = num(d.clusters);
  return {
    chain: str(d.chain, 24),
    address: str(d.address, MAX_QUERY_LENGTH),
    symbol: str(d.symbol, 24),
    bubbleRisk: risk,
    clusteredPct: clustered !== null && clustered >= 0 ? Math.min(clustered, 100) : 0,
    top10Pct: top10 !== null && top10 >= 0 ? Math.min(top10, 100) : null,
    clusters: clusters !== null && clusters >= 0 ? Math.floor(clusters) : 0,
  };
}

export function isHighBubbleRisk(h: DigitalDonHolders | null): boolean {
  return h?.bubbleRisk === 'High';
}

/** Trims a typed query to something worth sending, or '' for nothing. */
export function cleanQuery(q: string): string {
  return q.trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * The full message for `handle.update()`. embed.js merges updates into the
 * options it mounted with, so a request that leaves a key out inherits the
 * previous one: a free query after a pinned token would still carry the old
 * address, and the widget resolves the address first. Every key is always
 * sent, blank when unused.
 */
export function toUpdate(req: DigitalDonRequest): { q: string; chain: string; address: string } {
  const address = (req.address || '').trim();
  return {
    q: address ? '' : cleanQuery(req.q || ''),
    chain: address ? (req.chain || '').trim() : '',
    address,
  };
}

/** Link to the full analyzer, for the fallback when the widget cannot load. */
export function analyzerLink(req: DigitalDonRequest | null, medium: string): string {
  const u = new URL(DIGITALDON_ANALYZER);
  const q = req ? (req.address || cleanQuery(req.q || '')) : '';
  if (q) u.searchParams.set('q', q);
  u.searchParams.set('utm_source', 'osiris');
  u.searchParams.set('utm_medium', medium);
  return u.toString();
}

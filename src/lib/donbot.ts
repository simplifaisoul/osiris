/**
 * OSIRIS — DonBot, DigitalDon's token analyzer, embedded without its script.
 *
 * DigitalDon ships an embed.js that runs in the host page and builds an iframe.
 * OSIRIS builds the iframe itself instead, so none of their code ever runs in
 * this page. The frame runs sealed on their own origin; all that crosses the
 * boundary is the query in its URL and the size and result messages it posts
 * back, which are checked here before anything renders them.
 *
 * Nothing loads until a visitor runs a scan. The frame is sent no referrer and
 * no host name — the `host` parameter embed.js adds is for DigitalDon's usage
 * counts — so it isn't told which site it is on.
 */

export const DONBOT_ORIGIN = 'https://widget.digitaldon.net';
export const DONBOT_ANALYZER = 'https://analyzer.digitaldon.net/';

/** The chains the analyzer resolves, as its own documentation lists them. */
export const DONBOT_CHAINS = ['Solana', 'Ethereum', 'Base', 'BSC', 'Arbitrum', 'Mantle', 'Robinhood'] as const;

/** A ticker, a name or a contract address; the longest of those is well under this. */
export const MAX_QUERY_LENGTH = 128;

/** The sandbox embed.js itself applies — scripts and popups, no top navigation. */
export const DONBOT_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms';

/** A query fit to put in the frame URL, or null. */
export function cleanQuery(raw: string): string | null {
  const q = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return q.length >= 1 && q.length <= MAX_QUERY_LENGTH ? q : null;
}

/** The widget page for a query, dark, with both of its tools. */
export function donbotFrameUrl(query: string): string {
  const params = new URLSearchParams({ q: query, theme: 'dark' });
  return `${DONBOT_ORIGIN}/?${params.toString()}`;
}

export interface DonbotResult {
  type: 'result';
  symbol: string;
  score: number;
  thesis: string;
}

export type DonbotMessage = { type: 'resize'; height: number } | DonbotResult;

/** Tallest the frame may ask to be; its full card is well under this. */
const MAX_HEIGHT = 2400;

/**
 * A message the widget posted, validated — or null for anything else.
 *
 * Callers must also check the event's origin and that it came from their own
 * frame; this checks the shape. The score must be a real number from 0 to 100,
 * and every string is capped, because it all ends up on screen.
 */
export function parseDonbotMessage(data: unknown): DonbotMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.source !== 'digitaldon-widget') return null;

  if (d.type === 'digitaldon:resize') {
    const height = Number(d.height);
    return Number.isFinite(height) && height > 0 ? { type: 'resize', height: Math.min(Math.ceil(height), MAX_HEIGHT) } : null;
  }

  if (d.type === 'digitaldon:result') {
    const score = Number(d.score);
    const symbol = typeof d.symbol === 'string' ? d.symbol.replace(/^\$/, '').trim() : '';
    if (!Number.isFinite(score) || score < 0 || score > 100) return null;
    if (!/^[\w.$-]{1,20}$/.test(symbol)) return null;
    const thesis = typeof d.thesis === 'string' ? d.thesis.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    return { type: 'result', symbol, score: Math.round(score), thesis };
  }

  return null;
}

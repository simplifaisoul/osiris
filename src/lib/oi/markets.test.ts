import { describe, it, expect } from 'vitest';
import { fetchSeries, isSymbol, numbersIn, oddsLine, parseChart, parseManifold, parsePolymarket, parseTrending, pickOdds, trending, type MarketFind } from './markets';
import type { Fetcher } from './web';

/** A chart reply for `n` days, with a live bar on the last day and a null close in the middle. */
function chart(n: number) {
  const t0 = Date.UTC(2025, 0, 1) / 1000;
  const timestamp = Array.from({ length: n }, (_, i) => t0 + i * 86_400);
  const close: (number | null)[] = timestamp.map((_, i) => 100 + i);
  close[5] = null;
  timestamp.push(timestamp[n - 1] + 3600);
  close.push(999);
  return JSON.stringify({ chart: { result: [{ meta: { symbol: 'SOL-USD', currency: 'usd', shortName: 'Solana USD', gmtoffset: 0 }, timestamp, indicators: { quote: [{ close }], adjclose: [{ adjclose: close }] } }] } });
}

describe('prices', () => {
  it('reads a chart as one close a day, the live bar replacing the day’s earlier one, gaps dropped', () => {
    const s = parseChart(chart(40))!;
    expect(s).toMatchObject({ symbol: 'SOL-USD', name: 'Solana USD', currency: 'USD' });
    expect(s.dates).toHaveLength(39);
    expect(s.dates[0]).toBe('2025-01-01');
    expect(s.closes[s.closes.length - 1]).toBe(999);
    expect(s.closes).not.toContain(105);
    expect(parseChart(chart(10))).toBeNull();
    expect(parseChart('not json')).toBeNull();
  });

  it('asks only for well-formed tickers, and remembers one Yahoo does not know', async () => {
    let calls = 0;
    const api: Fetcher = async () => { calls++; return new Response('{"chart":{"error":{"code":"Not Found"}}}', { status: 404 }); };
    expect(await fetchSeries('NOPE-XYZ', api, new AbortController().signal)).toBeNull();
    expect(await fetchSeries('NOPE-XYZ', api, new AbortController().signal)).toBeNull();
    expect(calls).toBe(1);
    expect(isSymbol('^GSPC')).toBe(true);
    expect(isSymbol('BZ=F')).toBe(true);
    expect(isSymbol('../etc')).toBe(false);
    expect(await fetchSeries('a b', api, new AbortController().signal)).toBeNull();
  });
});

const POLY = JSON.stringify({ events: [
  { slug: 'what-price-will-solana-hit-in-2026', volume: 2127390, endDate: '2027-01-01T05:00:00Z', markets: [
    { question: 'Will Solana reach $200 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["0.095", "0.905"]', volumeNum: 412000, active: true, closed: false, endDate: '2026-12-31T12:00:00Z' },
    { question: 'Will Solana reach $120 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]', active: true, closed: true },
    { question: 'Will Solana reach $140 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["0.515", "0.485"]', volumeNum: 220000, active: true, closed: false },
  ] },
  { slug: 'what-price-will-solana-hit-in-october', volume: 32317, markets: [
    { question: 'Will Solana reach $200 in October?', outcomes: '["Yes", "No"]', outcomePrices: '["0.0055", "0.9945"]', volumeNum: 4000, active: true, closed: false },
  ] },
  { slug: 'bad slug!', markets: [{ question: 'x', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' }] },
] });

const MANI = JSON.stringify([
  { question: 'Will SOL hit $200 before 2027?', probability: 0.12, volume: 5400, outcomeType: 'BINARY', isResolved: false, closeTime: Date.UTC(2026, 11, 31), url: 'https://manifold.markets/user/will-sol-hit-200' },
  { question: 'Which coin wins?', outcomeType: 'MULTIPLE_CHOICE', url: 'https://manifold.markets/x' },
  { question: 'Spoofed', probability: 0.5, outcomeType: 'BINARY', url: 'https://evil.example/x' },
]);

describe('prediction markets', () => {
  it('reads Polymarket’s open yes/no markets with their price, volume and page', () => {
    const found = parsePolymarket(POLY);
    expect(found.map(m => m.question)).toEqual(['Will Solana reach $200 by December 31, 2026?', 'Will Solana reach $140 by December 31, 2026?', 'Will Solana reach $200 in October?']);
    expect(found[0]).toEqual({
      platform: 'Polymarket', question: 'Will Solana reach $200 by December 31, 2026?', probability: 0.095, volume: 412000,
      closes: '2026-12-31T12:00:00Z', url: 'https://polymarket.com/event/what-price-will-solana-hit-in-2026',
    });
    expect(parsePolymarket('{}')).toEqual([]);
  });

  it('reads Manifold’s open binary markets on its own site only', () => {
    expect(parseManifold(MANI)).toEqual([{
      platform: 'Manifold', question: 'Will SOL hit $200 before 2027?', probability: 0.12, volume: 5400, closes: '2026-12-31T00:00:00.000Z', url: 'https://manifold.markets/user/will-sol-hit-200',
    }]);
  });

  it('picks the markets that ask the question, the same level and year first', () => {
    const found: MarketFind[] = [...parsePolymarket(POLY), ...parseManifold(MANI)];
    const picked = pickOdds(found, 'Will Solana reach $200 before the end of 2026?', ['solana', 'reach']);
    expect(picked[0].question).toBe('Will Solana reach $200 by December 31, 2026?');
    expect(picked.map(m => m.question)).not.toContain('Will SOL hit $200 before 2027?');
    // About something else entirely: no crowd.
    expect(pickOdds(found, 'Will Israel invade Lebanon by 2028?', ['israel', 'invade', 'lebanon'])).toEqual([]);
  });

  it('reads figures however they are written, and drops markets that share none of the question’s', () => {
    expect([...numbersIn('$150,000 or $150k or 150K by 2026')]).toEqual(['150000', '2026']);
    expect([...numbersIn('a 2.5% cut')]).toEqual(['2.5']);
    const found: MarketFind[] = [
      { platform: 'Manifold', question: 'Will Bitcoin trade above $400k before it falls below $40k?', probability: 0.32, volume: 9000, closes: '', url: 'https://manifold.markets/a' },
      { platform: 'Polymarket', question: 'Will Bitcoin reach $150k by December 31, 2026?', probability: 0.04, volume: 90000, closes: '', url: 'https://polymarket.com/event/b' },
    ];
    expect(pickOdds(found, 'Will Bitcoin trade above $150,000 before the end of 2026?', ['bitcoin', 'trade', 'above']).map(m => m.url)).toEqual(['https://polymarket.com/event/b']);
  });

  it('suggests what the world is betting on: not games, not next week, the most traded open question of each event', () => {
    const now = Date.parse('2026-10-04T00:00:00Z');
    const yes = (question: string, p: number, volumeNum: number) => ({ question, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify([String(p), String(1 - p)]), volumeNum, active: true, closed: false });
    const body = JSON.stringify([
      { slug: 'patriots-vs-bills', title: 'Patriots vs. Bills', endDate: '2026-10-05T00:00:00Z', tags: [{ label: 'Sports' }], volume24hr: 9e6, markets: [yes('Will the Patriots win?', 0.5, 1e6)] },
      { slug: 'fed-october', title: 'Fed Decision in October?', endDate: '2026-10-29T00:00:00Z', tags: [{ label: 'Economy' }], volume24hr: 4e5, markets: [yes('Will the Fed cut by 25 bps?', 0.15, 2e5), yes('Will there be no change?', 0.82, 9e5)] },
      { slug: 'soon', title: 'Ends this week', endDate: '2026-10-08T00:00:00Z', tags: [{ label: 'Politics' }], volume24hr: 3e5, markets: [yes('Soon?', 0.4, 1e5)] },
      { slug: 'putin-out', title: 'Putin out by...?', endDate: '2026-12-31T00:00:00Z', tags: [{ label: 'Geopolitics' }], volume24hr: 3e5, markets: [yes('Putin out by December 31?', 0.025, 4e5), yes('Putin out by October 31?', 0.004, 9e5)] },
    ]);
    expect(parseTrending(body, now).map(t => [t.question, t.probability, t.url])).toEqual([
      ['Will there be no change?', 0.82, 'https://polymarket.com/event/fed-october'],
      ['Putin out by December 31?', 0.025, 'https://polymarket.com/event/putin-out'],
    ]);
    expect(parseTrending('not json')).toEqual([]);
  });

  it('asks Polymarket only for the busiest events that close two weeks out or later', async () => {
    const urls: string[] = [];
    const api: Fetcher = async url => { urls.push(url); return new Response('[]'); };
    expect(await trending(api, new AbortController().signal, Date.parse('2026-10-04T00:00:00Z'))).toEqual([]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('limit=50&end_date_min=2026-10-18T00:00:00.000Z');
  });

  it('says a price as a line to quote', () => {
    expect(oddsLine({ platform: 'Polymarket', question: 'q', probability: 0.095, volume: 2_127_390, closes: '2026-12-31T12:00:00Z' }))
      .toBe('Polymarket traders price YES at 9.5% ($2.1M traded, closes 2026-12-31).');
    expect(oddsLine({ platform: 'Manifold', question: 'q', probability: 0.12, volume: 5400, closes: '' })).toBe('Manifold traders price YES at 12% (5K mana traded).');
  });
});

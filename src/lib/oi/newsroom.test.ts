import { describe, it, expect } from 'vitest';
import { FEEDS, isSocial, parseFeed, rankStories, searchNewsroom, tickerFeed } from './newsroom';
import type { Fetcher } from './web';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Desk</title>
  <item><title><![CDATA[Solana ETF wins approval as SEC clears spot funds]]></title><link>https://www.coindesk.com/markets/solana-etf</link>
    <pubDate>Fri, 02 Oct 2026 14:00:00 +0000</pubDate><description>&lt;p&gt;The SEC approved the first spot &lt;b&gt;Solana&lt;/b&gt; funds on Friday.&lt;/p&gt;</description></item>
  <item><title>Bitcoin slips as yields rise</title><link>https://www.coindesk.com/markets/btc</link><pubDate>Fri, 02 Oct 2026 10:00:00 +0000</pubDate></item>
  <item><title>No link here</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Solana outage &amp;amp; recovery</title>
  <link rel="replies" href="https://www.theverge.com/x#comments"/><link rel="alternate" type="text/html" href="https://www.theverge.com/x"/>
  <published>2026-09-30T08:00:00-04:00</published><summary>Validators restarted the network.</summary></entry></feed>`;

const RDF = `<rdf:RDF><item rdf:about="https://www.dw.com/a"><title>Solana gains in Europe</title><link>https://www.dw.com/a</link><dc:date>2026-10-01T09:00:00Z</dc:date></item></rdf:RDF>`;

describe('reading a feed', () => {
  it('reads RSS items: CDATA opened, escaped HTML stripped, dates as ISO, items without links dropped', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Solana ETF wins approval as SEC clears spot funds', url: 'https://www.coindesk.com/markets/solana-etf',
      published: '2026-10-02T14:00:00.000Z', summary: 'The SEC approved the first spot Solana funds on Friday.',
    });
  });

  it('reads Atom entries by their alternate link, and RDF items by dc:date', () => {
    expect(parseFeed(ATOM)[0]).toMatchObject({ title: 'Solana outage & recovery', url: 'https://www.theverge.com/x', published: '2026-09-30T12:00:00.000Z', summary: 'Validators restarted the network.' });
    expect(parseFeed(RDF)[0]).toMatchObject({ url: 'https://www.dw.com/a', published: '2026-10-01T09:00:00.000Z' });
  });

  it('knows a social network when it sees one', () => {
    expect(isSocial('https://t.me/rybar_in_english/34761')).toBe(true);
    expect(isSocial('https://x.com/someone/status/1')).toBe(true);
    expect(isSocial('https://stocktwits.com/news-articles/x')).toBe(true);
    expect(isSocial('https://www.reuters.com/world/')).toBe(false);
    expect(isSocial('not a url')).toBe(false);
  });

  it('keeps every desk’s feeds on https', () => {
    for (const f of FEEDS) expect(f.url).toMatch(/^https:\/\//);
    expect(tickerFeed('^GSPC')).toBe('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US');
  });
});

describe('ranking the stories', () => {
  const now = Date.parse('2026-10-03T00:00:00Z');
  const q = { desks: [], tickers: [], words: ['solana', 'etf', 'approval'], names: ['solana'] };

  it('keeps stories that name the question, best match first, once each, and drops social posts and old news', () => {
    const out = rankStories([
      { outlet: 'CoinDesk', items: parseFeed(RSS) },
      { outlet: 'Decrypt', items: [
        { title: 'Solana ETF wins approval as SEC clears spot funds', url: 'https://decrypt.co/dup', published: '2026-10-02T15:00:00Z', summary: '' },
        { title: 'Solana traders cheer', url: 'https://t.me/channel/1', published: '2026-10-02T15:00:00Z', summary: 'Solana ETF approval' },
        { title: 'Solana ETF filing first seen', url: 'https://decrypt.co/old', published: '2026-06-01T00:00:00Z', summary: '' },
        { title: 'Solana dips', url: 'https://decrypt.co/dip', published: '2026-10-01T00:00:00Z', summary: '' },
      ] },
    ], q, now);
    // 'Solana dips' shares one of the three words: a passing mention.
    expect(out.map(a => a.url)).toEqual(['https://www.coindesk.com/markets/solana-etf']);
    expect(out[0]).toMatchObject({ outlet: 'CoinDesk', domain: 'coindesk.com', summary: 'The SEC approved the first spot Solana funds on Friday.' });
  });

  it('asks a question of several words for two of them, so a passing mention is not enough', () => {
    const q3 = { desks: [], tickers: [], words: ['israel', 'lebanon', 'invasion'], names: ['israel'] };
    const out = rankStories([{ outlet: 'Al Jazeera', items: [
      { title: 'Somalia rejects any Israeli presence', url: 'https://aj.example/1', published: '2026-10-02T00:00:00Z', summary: 'Israel denied the report.' },
      { title: 'Israel masses troops on the Lebanon border', url: 'https://aj.example/2', published: '2026-10-02T00:00:00Z', summary: '' },
    ] }], q3, now);
    expect(out.map(a => a.url)).toEqual(['https://aj.example/2']);
  });

  it('credits a ticker newswire story to the outlet that wrote it', () => {
    const out = rankStories([{ outlet: 'Yahoo Finance', items: [{ title: 'Solana ETF approval nears', url: 'https://www.benzinga.com/x', published: '2026-10-02T00:00:00Z', summary: '' }] }], q, now);
    expect(out[0].outlet).toBe('Benzinga');
  });
});

describe('searching the newsroom', () => {
  it('reads only the desks asked for, plus the tickers’ newswires', async () => {
    const asked: string[] = [];
    const api: Fetcher = async url => { asked.push(url); return new Response(RSS, { status: 200 }); };
    const out = await searchNewsroom({ desks: ['crypto'], tickers: ['SOL-USD'], words: ['solana', 'etf'], names: ['solana'] }, api, new AbortController().signal);
    expect(asked.length).toBe(FEEDS.filter(f => f.desks.includes('crypto')).length + 1);
    expect(asked).toContain(tickerFeed('SOL-USD'));
    expect(out[0].title).toBe('Solana ETF wins approval as SEC clears spot funds');
  });
});

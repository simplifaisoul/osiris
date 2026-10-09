import { describe, it, expect } from 'vitest';
import { desksFor, parsePlan, planFallback, searchWords, tickersIn, type ResearchPlan } from './plan';
import { articleText, clipText, currentEventsDate, decodeEntities, parseCurrentEvents, parseGdelt, parseWikipedia, pickArticles, researchWeb, resetGdeltPause, type Fetcher, type GdeltArticle } from './web';

describe('the research plan', () => {
  it('searches on the question\'s names first, without its question words or dates', () => {
    expect(planFallback('Will Russia and Ukraine agree a ceasefire before 1 July 2027?')).toMatchObject({ news: ['Russia Ukraine ceasefire agree'], background: ['Russia', 'Ukraine'], desks: ['world', 'defense'], instruments: [] });
    expect(planFallback('Will OPEC+ announce a production cut before December 2026?').news[0]).toMatch(/^OPEC production/);
    expect(planFallback('Which way will the US Federal Reserve move rates at its next meeting?').background).toEqual(['US Federal Reserve']);
  });

  it('takes the model\'s plan, cleaned to plain keywords, and falls back when it is missing', () => {
    expect(parsePlan({ news: ['"OPEC+" AND (cut OR quota)', 'Saudi output'], background: ['OPEC+'] }, 'q')).toMatchObject({ news: ['OPEC cut quota', 'Saudi output'], background: ['OPEC+'] });
    expect(parsePlan(null, 'Will the Bank of England cut rates?').news).toEqual(['Bank England rate cut']);
    expect(searchWords('a to EU of the Bank, or: rates!')).toBe('the Bank rates');
  });

  it('reads the desks, tickers and market searches, keeping only real desks and well-formed tickers', () => {
    const plan = parsePlan({
      news: ['Solana ETF'], desks: ['crypto', 'gossip', 'Markets'], instruments: ['SOL-USD', 'not a ticker!', 'BTC-USD', 'ETH-USD'], markets: ['Solana 200 2026'],
    }, 'Will Solana reach $200 by the end of 2026?');
    expect(plan.desks).toEqual(['crypto', 'markets']);
    expect(plan.instruments).toEqual(['SOL-USD', 'BTC-USD']);
    // The model's search first, then the question's own phrasings: one finds what another misses.
    expect(plan.markets).toEqual(['Solana 200 2026', 'Solana price 2026', 'Solana reach']);
  });

  it('finds the desks and the prices a question names when the model gives none', () => {
    expect(desksFor('Will Solana reach $200 by the end of 2026?')).toEqual(['crypto', 'markets']);
    expect(desksFor('Will Israel invade Lebanon by 2028?')).toEqual(['world', 'defense']);
    expect(desksFor('Who will win the 2026 World Cup?')).toEqual(['sports']);
    expect(desksFor('Will it rain?')).toEqual(['world']);
    expect(tickersIn('Will Solana reach $200 by the end of 2026?')).toEqual(['SOL-USD']);
    expect(tickersIn('Where will Brent crude settle on 31 December?')).toEqual(['BZ=F']);
    // A name alone is no market question.
    expect(tickersIn('Will Apple announce a foldable phone?')).toEqual([]);
    expect(planFallback('Will Bitcoin trade above $100,000 in 2027?')).toMatchObject({ instruments: ['BTC-USD'], desks: ['crypto', 'markets'] });
  });
});

const plan = (over: Partial<ResearchPlan>): ResearchPlan => ({ news: [], background: [], desks: [], instruments: [], markets: [], cameras: [], ...over });

const art = (over: Partial<GdeltArticle>): GdeltArticle => ({ url: 'https://a.example/1', title: 'T', domain: 'a.example', seendate: '', language: 'English', sourcecountry: '', ...over });

describe('GDELT', () => {
  it('reads an article list, and a refusal as nothing', () => {
    const body = JSON.stringify({ articles: [
      { url: 'https://www.reuters.com/x', title: 'OPEC+ set to keep output steady', domain: 'reuters.com', seendate: '20260930T224500Z', language: 'English', sourcecountry: 'United States' },
      { url: 'javascript:alert(1)', title: 'bad', domain: 'x' },
    ] });
    expect(parseGdelt(body)).toEqual([{ url: 'https://www.reuters.com/x', title: 'OPEC+ set to keep output steady', domain: 'reuters.com', seendate: '2026-09-30T22:45:00Z', language: 'English', sourcecountry: 'United States' }]);
    expect(parseGdelt('Please limit requests to one every 5 seconds')).toEqual([]);
  });

  it('keeps English stories once each, at most two from a site, both searches interleaved', () => {
    const a = [art({ url: 'https://s.com/1', title: 'One', domain: 's.com' }), art({ url: 'https://s.com/2', title: 'Two', domain: 's.com' }), art({ url: 'https://s.com/3', title: 'Three', domain: 's.com' })];
    const b = [art({ url: 'https://t.com/1', title: 'one!', domain: 't.com' }), art({ url: 'https://u.com/1', title: 'Four', domain: 'u.com', language: 'Chinese' }), art({ url: 'https://v.com/1', title: 'Five', domain: 'v.com' })];
    expect(pickArticles([a, b], 10).map(x => x.title)).toEqual(['One', 'Two', 'Five']);
  });
});

describe('reading an article', () => {
  const html = `<html><head><meta property="og:site_name" content="The Wire &amp; Co">
    <meta property="og:description" content="A short description."><script>var p = "<p>not this</p>";</script></head>
    <body><nav><p>Home | World | Subscribe to our newsletter today please</p></nav>
    <p>OPEC+ delegates said on Sunday the group would keep output steady through the end of the year, citing weak demand.</p>
    <p>An unrelated paragraph about the weather in the capital, which goes on for a while to be long enough.</p>
    <p>Saudi Arabia&#8217;s energy minister told reporters a production cut was &quot;not on the table&quot; for now.</p>
    <footer><p>All rights reserved by The Wire and its partners around the world.</p></footer></body></html>`;

  it('keeps the paragraphs that bear on the question, in order, and the site\'s name', () => {
    const out = articleText(html, ['opec', 'production', 'cut', 'saudi']);
    expect(out.site).toBe('The Wire & Co');
    expect(out.excerpt).toBe('OPEC+ delegates said on Sunday the group would keep output steady through the end of the year, citing weak demand. Saudi Arabia’s energy minister told reporters a production cut was "not on the table" for now.');
    expect(out.excerpt).not.toMatch(/not this|weather|Subscribe|rights reserved/);
  });

  it('falls back to the page\'s description, decodes entities and cuts at a sentence', () => {
    expect(articleText('<meta name="description" content="Only this.">', ['x']).excerpt).toBe('Only this.');
    expect(decodeEntities('A &amp; B &#x2014; C&nbsp;D &bogus;')).toBe('A & B — C D &bogus;');
    expect(clipText('First sentence here. Second one is much longer than the limit allows.', 40)).toBe('First sentence here.');
  });
});

describe('Wikipedia', () => {
  it('takes the lead of the first article found, with its link', () => {
    const body = JSON.stringify({ query: { pages: [{ index: 1, title: 'OPEC', fullurl: 'https://en.wikipedia.org/wiki/OPEC', extract: 'The Organization of the Petroleum Exporting Countries is a cartel.' }] } });
    expect(parseWikipedia(body)).toEqual({ title: 'OPEC', url: 'https://en.wikipedia.org/wiki/OPEC', extract: 'The Organization of the Petroleum Exporting Countries is a cartel.' });
    expect(parseWikipedia(JSON.stringify({ query: { pages: [{ title: 'X', fullurl: 'https://evil.example/', extract: 'x' }] } }))).toBeNull();
  });

  it('passes over a disambiguation page to the article itself', () => {
    const body = JSON.stringify({ query: { pages: [
      { index: 1, title: 'Solana', fullurl: 'https://en.wikipedia.org/wiki/Solana', extract: 'Solana is the Spanish word for the "sunny side" of a mount or valley. It may refer to:', pageprops: { disambiguation: '' } },
      { index: 2, title: 'Solana (blockchain platform)', fullurl: 'https://en.wikipedia.org/wiki/Solana_(blockchain_platform)', extract: 'Solana is a blockchain platform which uses a proof-of-stake mechanism.' },
    ] } });
    expect(parseWikipedia(body)?.title).toBe('Solana (blockchain platform)');
    // Even when the page is not marked as one.
    expect(parseWikipedia(JSON.stringify({ query: { pages: [{ index: 1, title: 'Mercury', fullurl: 'https://en.wikipedia.org/wiki/Mercury', extract: 'Mercury may refer to:' }] } }))).toBeNull();
  });
});

describe('researchWeb', () => {
  it('turns the plan into linked sources: articles with what they say, then background', async () => {
    const calls: string[] = [];
    const respond = (body: string, type = 'application/json') => new Response(body, { status: 200, headers: { 'content-type': type } });
    const api: Fetcher = async url => {
      calls.push(url);
      if (url.includes('gdeltproject')) {
        return respond(JSON.stringify({ articles: [
          { url: 'https://news.example/a', title: 'OPEC+ holds output steady', domain: 'news.example', seendate: '20261001T080000Z', language: 'English' },
          { url: 'https://blocked.example/b', title: 'Cut talk fades in Vienna', domain: 'blocked.example', seendate: '20260930T080000Z', language: 'English' },
        ] }));
      }
      return respond(JSON.stringify({ query: { pages: [{ index: 1, title: 'OPEC', fullurl: 'https://en.wikipedia.org/wiki/OPEC', extract: 'OPEC is a cartel of oil producers.' }] } }));
    };
    const page: Fetcher = async url => url.includes('blocked')
      ? new Response('no', { status: 403 })
      : respond('<p>OPEC+ will hold output steady, the group said, and no production cut is planned this year.</p>', 'text/html; charset=utf-8');

    const { items } = await researchWeb(plan({ news: ['OPEC production cut'], background: ['OPEC'] }), 'Will OPEC+ cut production?', 6, new AbortController().signal, { api, page, gdeltGapMs: 0 });
    expect(items.map(i => [i.id, i.kind, i.url])).toEqual([
      ['w1', 'web', 'https://news.example/a'],
      ['w2', 'web', 'https://blocked.example/b'],
      ['b1', 'wiki', 'https://en.wikipedia.org/wiki/OPEC'],
    ]);
    // The article that could be read carries what it says; the refused one keeps its headline and link.
    expect(items[0]).toMatchObject({ source: 'news.example', published: '2026-10-01T08:00:00Z', excerpt: 'OPEC+ will hold output steady, the group said, and no production cut is planned this year.' });
    expect(items[1].excerpt).toBeUndefined();
    expect(calls.find(c => c.includes('gdeltproject'))).toContain(encodeURIComponent('OPEC production cut sourcelang:english'));
  });
});

describe('Wikipedia’s Current events', () => {
  const day = `<div class="current-events-content"><ul>
    <li><a href="/wiki/Russian_invasion">Russian invasion of Ukraine</a>
      <ul>
        <li>Russia and Ukraine agree to a ceasefire along the front line for the winter, according to Turkish mediators. <a rel="nofollow" class="external text" href="https://www.reuters.com/world/ceasefire-1">(Reuters)</a></li>
        <li>Israel and Hezbollah agree to a ceasefire in southern Lebanon after weeks of fighting near the border. <a rel="nofollow" class="external text" href="https://apnews.com/x">(AP)</a></li>
        <li>Ukraine reports drone strikes on Kharkiv overnight.</li>
      </ul>
    </li>
  </ul></div>`;

  it('turns the events that name the question’s subjects into linked articles, by the outlet they cite', () => {
    const out = parseCurrentEvents(day, '2026-10-01T12:00:00Z', ['russia', 'ukraine', 'ceasefire', 'agree']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      url: 'https://www.reuters.com/world/ceasefire-1', domain: 'reuters.com', outlet: 'Reuters', via: 'Wikipedia', score: 4,
      title: 'Russia and Ukraine agree to a ceasefire along the front line for the winter, according to Turkish mediators.',
    });
  });

  it('dates the daily pages and only those', () => {
    expect(currentEventsDate('Portal:Current events/2026 October 1')).toBe('2026-10-01T12:00:00Z');
    expect(currentEventsDate('Portal:Current events/October 2026')).toBe('');
  });
});

describe('GDELT, when it refuses', () => {
  it('stops asking for a while instead of slowing every run', async () => {
    resetGdeltPause();
    let gdelt = 0;
    const api: Fetcher = async url => {
      if (url.includes('gdeltproject')) { gdelt++; return new Response('Please limit requests', { status: 429 }); }
      return new Response(JSON.stringify({ query: { search: [], pages: [] } }), { status: 200 });
    };
    const page: Fetcher = async () => new Response('', { status: 404 });
    const deps = { api, page, gdeltGapMs: 0 };
    await researchWeb(plan({ news: ['Refused search one'] }), 'q', 4, new AbortController().signal, deps);
    await researchWeb(plan({ news: ['Refused search two'] }), 'q', 4, new AbortController().signal, deps);
    expect(gdelt).toBe(1);
    resetGdeltPause();
  });
});

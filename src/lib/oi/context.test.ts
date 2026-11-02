import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gatherContext, marketLine, scoreNews, selectContext, terms, type RawNews, type Sources } from './context';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const at = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const NEWS: RawNews[] = [
  { title: 'Iran and the IAEA resume talks in Vienna', published: at(2), source_name: 'Wire', place: { label: 'Vienna, Austria', lat: 48.2, lng: 16.37 } },
  { title: 'Turmoil in grain markets', published: at(3), source_name: 'Wire', risk_score: 2 },
  { title: 'Missile strike reported near Kharkiv', published: at(1), source_name: 'Channel', risk_score: 9, coords: [49.99, 36.23] },
  { title: 'Old story about Iran enrichment', published: at(100), source_name: 'Wire' },
  { title: 'Tehran signals flexibility on enrichment', summary: 'Iran officials said…', published: at(5), source_name: 'Wire' },
];

describe('terms', () => {
  it('keeps the words that matter', () => {
    expect(terms('Will Iran agree to an IAEA deal before 2027?')).toEqual(['iran', 'agree', 'iaea', 'deal']);
    expect(terms('São Paulo protests')).toEqual(['sao', 'paulo', 'protest']);
  });
});

describe('scoreNews', () => {
  it('matches whole words, the title above the body', () => {
    expect(scoreNews(NEWS[0], ['iran'])).toBe(3);
    expect(scoreNews(NEWS[4], ['iran'])).toBe(1);
    // "ran" is not in "Iran", and "oil" is not in "Turmoil".
    expect(scoreNews(NEWS[0], ['ran'])).toBe(0);
    expect(scoreNews(NEWS[1], ['oil'])).toBe(0);
  });
});

describe('selectContext', () => {
  it('picks what bears on the question, recent first, and places it', () => {
    const items = selectContext('Will Iran and the IAEA agree on enrichment?', '', 10, { news: NEWS, quakes: [], quotes: [] }, NOW);
    expect(items[0]).toMatchObject({ id: 'c1', title: 'Iran and the IAEA resume talks in Vienna', lat: 48.2, lng: 16.37, place: 'Vienna, Austria' });
    expect(items.some(i => i.title.startsWith('Old story'))).toBe(false);
  });

  it('leaves a question the feed does not cover without filler: a story about something else is no evidence', () => {
    expect(selectContext('Will the Moon base open?', '', 10, { news: NEWS, quakes: [], quotes: [] }, NOW)).toEqual([]);
  });

  it('keeps a post from a social network as what it is', () => {
    const items = selectContext('Will the Kharkiv strikes stop?', '', 10, { news: [
      { title: 'Missile strike reported near Kharkiv', published: at(1), source_name: 'Rybar', link: 'https://t.me/rybar_in_english/1' },
      { title: 'Kharkiv power restored after strike', published: at(2), source_name: 'Kyiv Independent', link: 'https://kyivindependent.com/x' },
    ], quakes: [], quotes: [] }, NOW);
    expect(items.map(i => i.kind)).toEqual(['social', 'news']);
  });

  it('adds quakes when asked about them, and the market line', () => {
    const items = selectContext('Will a tsunami follow?', '', 10, {
      news: [], quotes: [{ name: 'Gold', price: 2400.5, change_percent: 0.4 }],
      quakes: [{ magnitude: 7.1, place: 'off Hokkaido', lat: 42, lng: 143, time: NOW }, { magnitude: 4, place: 'tiny', lat: 1, lng: 1 }],
    }, NOW);
    expect(items.map(i => i.kind)).toEqual(['quake', 'market']);
    expect(items[0].title).toBe('M7.1 earthquake, off Hokkaido');
    expect(items[1].title).toBe('Markets now: Gold 2,400.5 +0.40%');
  });
});

describe('marketLine', () => {
  it('reads out the board in a fixed order', () => {
    expect(marketLine([{ name: 'Bitcoin', price: 65000, change_percent: -1.234 }, { name: 'S&P 500', price: 7734.25, change_percent: 0.1 }]))
      .toBe('Markets now: S&P 500 7,734.25 +0.10% · Bitcoin 65,000 -1.23%');
    expect(marketLine([])).toBe('');
  });
});

describe('gatherContext', () => {
  // gatherContext reads the clock itself, and the fixture's stories are dated
  // from NOW: without this the test started failing three days after NOW,
  // once every story had aged out of the 72-hour window.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('carries on without a source that fails', async () => {
    const sources: Sources = {
      news: async () => NEWS,
      quakes: async () => { throw new Error('USGS down'); },
      quotes: async () => [],
    };
    const items = await gatherContext('Iran enrichment talks', '', 8, sources);
    expect(items.length).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from './client';
import { getEventsByWindow, getSentimentSeries, insertEvent } from './news';

beforeEach(() => {
  resetDbForTests();
});

const baseEvent = {
  ts: 1000,
  source: 'BBC',
  urlHash: 'hash-1',
  text: 'Tension rises at the border',
  sentiment: -0.4,
  category: 'geopolitico',
  region: 'ukraine',
  lat: 49.0,
  lng: 31.0,
};

describe('insertEvent / getEventsByWindow', () => {
  it('stores a new event and returns it within its window', () => {
    insertEvent(baseEvent);

    const events = getEventsByWindow('geopolitico', 'ukraine', 0, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].urlHash).toBe('hash-1');
    expect(events[0].sentiment).toBe(-0.4);
  });

  it('excludes events outside the requested window', () => {
    insertEvent(baseEvent);
    expect(getEventsByWindow('geopolitico', 'ukraine', 2000, 3000)).toHaveLength(0);
  });

  it('ignores a duplicate url_hash', () => {
    insertEvent(baseEvent);
    insertEvent({ ...baseEvent, text: 'Different text, same URL' });

    const events = getEventsByWindow('geopolitico', 'ukraine', 0, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe('Tension rises at the border');
  });

  it('accepts a null sentiment/category/region for unclassified events', () => {
    insertEvent({
      ts: 1500,
      source: 'BBC',
      urlHash: 'hash-2',
      text: 'Unclassified report',
      sentiment: null,
      category: null,
      region: null,
      lat: null,
      lng: null,
    });

    const db = getDb();
    const row = db.prepare('SELECT * FROM news_events WHERE url_hash = ?').get('hash-2') as {
      sentiment: unknown;
      category: unknown;
    };
    expect(row.sentiment).toBeNull();
    expect(row.category).toBeNull();
  });
});

describe('getSentimentSeries', () => {
  it('buckets sentiment by day and averages it', () => {
    const oneDay = 24 * 60 * 60 * 1000;
    const anchor = 1_700_000_000_000;

    vi.useFakeTimers();
    vi.setSystemTime(anchor);
    insertEvent({ ...baseEvent, ts: anchor, urlHash: 'a', category: 'macro', sentiment: -0.2 });
    insertEvent({ ...baseEvent, ts: anchor + 1000, urlHash: 'b', category: 'macro', sentiment: -0.6 });
    insertEvent({ ...baseEvent, ts: anchor + oneDay + 5000, urlHash: 'c', category: 'macro', sentiment: 0.5 });
    vi.setSystemTime(anchor + oneDay + 5000);

    const series = getSentimentSeries('macro', 90);
    vi.useRealTimers();

    expect(series).toHaveLength(2);
    expect(series[0].sentiment).toBeCloseTo(-0.4, 5); // avg(-0.2, -0.6)
    expect(series[1].sentiment).toBe(0.5);
  });
});

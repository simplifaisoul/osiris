import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DB_PATH = ':memory:';

import { getDb, resetDbForTests } from '@/lib/db/client';
import { GET } from './route';

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss><channel>
<item>
<title><![CDATA[Border tension escalates]]></title>
<description><![CDATA[Reports of a military buildup near the border.]]></description>
<link>https://example.com/article-1</link>
<pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

beforeEach(() => {
  resetDbForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('https://t.me/s/')) {
        return { ok: false } as unknown as Response;
      }
      if (url === 'https://feeds.bbci.co.uk/news/world/rss.xml') {
        return { ok: true, text: async () => RSS_FIXTURE } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/news', () => {
  it('persists fetched articles to news_events', async () => {
    await GET();

    const rows = getDb()
      .prepare('SELECT source, text, sentiment, category FROM news_events')
      .all() as { source: string; text: string; sentiment: number | null; category: string | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('BBC');
    expect(rows[0].text).toContain('Border tension escalates');
    expect(rows[0].sentiment).toBeNull();
    expect(rows[0].category).toBeNull();
  });

  it('does not duplicate a row when the same article is fetched twice', async () => {
    await GET();
    await GET();

    const count = (getDb().prepare('SELECT COUNT(*) as n FROM news_events').get() as { n: number }).n;
    expect(count).toBe(1);
  });
});

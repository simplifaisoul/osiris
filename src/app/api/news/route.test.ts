import { describe, it, expect } from 'vitest';
import { scoreRisk, findCoords, mergeCrossPosts, recentPosts, wirePost, sourceRef, type ChannelPost, type RssItem } from './route';
import type { TelegramPost } from '@/lib/telegram';

describe('scoreRisk', () => {
  it('reports the terms that produced the score', () => {
    const r = scoreRisk('Missile strike reported near the frontline');
    expect(r.matched).toEqual(expect.arrayContaining(['missile', 'strike', 'frontline']));
    expect(r.score).toBe(1 + r.matched.length * 2);
  });

  it('scores unremarkable text at the floor', () => {
    expect(scoreRisk('Local council approves new library hours')).toEqual({ score: 1, matched: [] });
  });

  it('caps at 10 and stays deterministic', () => {
    const text = 'war missile strike attack nuclear invasion bomb drone killed destroyed';
    expect(scoreRisk(text).score).toBe(10);
    expect(scoreRisk(text)).toEqual(scoreRisk(text));
  });

  /* Each of these matched as a substring before: "award" and "software" as
     war, "cooperation" as operation, "Bombay" as bomb. */
  it('matches whole words, not fragments of other words', () => {
    expect(scoreRisk('Software award for regional cooperation announced in Bombay').matched).toEqual([]);
    expect(scoreRisk('A warning was issued').matched).toEqual([]);
  });

  it('still counts plural and past-tense forms', () => {
    expect(scoreRisk('Drones attacked two depots; strikes continued').matched)
      .toEqual(expect.arrayContaining(['drone', 'attack', 'strike']));
    expect(scoreRisk('Civilian casualties reported').matched).toEqual(['casualty']);
  });
});

describe('findCoords', () => {
  it('returns the preset anchor and names the term it matched', () => {
    expect(findCoords('Reports of shelling in Rafah, southern Gaza')).toEqual({
      coords: [31.416, 34.333], anchor: 'gaza',
    });
  });

  it('returns null when no place term is present', () => {
    expect(findCoords('Markets closed higher on Tuesday')).toBeNull();
  });

  /* The anchor is a territory centroid, so two different events in the same
     territory resolve to the same point. That is the limitation the payload's
     location_precision field exists to declare. */
  it('gives distinct events in one territory the same anchor', () => {
    expect(findCoords('strike in Rafah, Gaza')?.coords).toEqual(findCoords('aid convoy in Gaza City')?.coords);
  });
});

const channel = (handle: string, bloc: 'western' | 'russian' = 'western') => ({ handle, name: handle, lean: 'x', bloc });
const post = (id: string, text: string, publishedAt: string): TelegramPost => ({
  id, channel: id.split('/')[0], url: `https://t.me/${id}`, publishedAt, text,
  headline: text, flag: null, summary: '', media: null, forwardedFrom: null, replyTo: null, views: null,
});

describe('recentPosts', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');

  /* A dead channel's page still lists its last posts. OSINTtechnical's were
     from June 2022 and went out as live alerts. */
  it('leaves out posts older than the live window', () => {
    const posts = [
      post('a/1', 'Old post from a channel that stopped posting', '2022-06-27T16:30:37Z'),
      post('a/2', 'Yesterday', '2026-09-16T12:00:00Z'),
      post('a/3', 'Just now', '2026-09-17T11:59:00Z'),
    ];
    expect(recentPosts(posts, now).map(p => p.id)).toEqual(['a/2', 'a/3']);
  });

  it('keeps only the newest posts per channel', () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(`a/${i}`, `Post ${i}`, new Date(now - (12 - i) * 60_000).toISOString()));
    const kept = recentPosts(posts, now);
    expect(kept).toHaveLength(8);
    expect(kept.at(-1)?.id).toBe('a/11');
  });
});

describe('mergeCrossPosts', () => {
  const report = 'Explosions reported near the Kherson rail junction after an overnight drone attack';

  it('folds one report posted by several channels into a single story led by the earliest', () => {
    const posts: ChannelPost[] = [
      { post: post('b/7', `🇺🇦 ${report} https://t.me/b`, '2026-09-17T10:05:00Z'), channel: channel('b', 'russian') },
      { post: post('a/3', report, '2026-09-17T10:00:00Z'), channel: channel('a') },
      { post: post('c/9', 'An unrelated report about a naval exercise in the Baltic Sea today', '2026-09-17T10:01:00Z'), channel: channel('c') },
    ];
    const stories = mergeCrossPosts(posts);
    expect(stories).toHaveLength(2);
    const merged = stories.find(s => s.carriedBy.length)!;
    expect(merged.lead.post.id).toBe('a/3');
    expect(merged.carriedBy.map(c => c.post.id)).toEqual(['b/7']);
  });

  it('does not count a channel repeating its own post as a second channel', () => {
    const stories = mergeCrossPosts([
      { post: post('a/1', report, '2026-09-17T10:00:00Z'), channel: channel('a') },
      { post: post('a/2', report, '2026-09-17T11:00:00Z'), channel: channel('a') },
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].carriedBy).toEqual([]);
  });

  it('never merges short posts, which are too generic to match reliably', () => {
    const stories = mergeCrossPosts([
      { post: post('a/1', 'Map update', '2026-09-17T10:00:00Z'), channel: channel('a') },
      { post: post('b/1', 'Map update', '2026-09-17T10:00:00Z'), channel: channel('b') },
    ]);
    expect(stories).toHaveLength(2);
  });
});

describe('wirePost', () => {
  const feed = { handle: 'bbc', name: 'BBC World', lean: 'British public broadcaster', bloc: 'western' as const };
  const item: RssItem = {
    title: 'Strikes reported in southern Lebanon',
    description: 'Residents said three villages were hit overnight.',
    link: 'https://www.bbc.co.uk/news/articles/abc123',
    pubDate: '2026-09-20T06:30:00.000Z',
    source: 'BBC World',
  };

  it('reads a wire item into the shape a channel post has', () => {
    const post = wirePost(item, feed);
    expect(post.channel).toBe('bbc');
    expect(post.url).toBe(item.link);
    expect(post.publishedAt).toBe(item.pubDate);
    expect(post.headline).toBe('Strikes reported in southern Lebanon');
    expect(post.summary).toBe('Residents said three villages were hit overnight.');
    // A wire's pictures stay on the wire's own page.
    expect(post.media).toBeNull();
  });

  it('lifts a breaking label the same way a channel post does', () => {
    const post = wirePost({ ...item, title: 'BREAKING: Strikes reported in southern Lebanon' }, feed);
    expect(post.flag).toBe('BREAKING');
    expect(post.headline).toBe('Strikes reported in southern Lebanon');
  });

  it('gives two items from one feed different ids, and one item the same id twice', () => {
    const other = wirePost({ ...item, link: 'https://www.bbc.co.uk/news/articles/xyz789' }, feed);
    expect(wirePost(item, feed).id).not.toBe(other.id);
    expect(wirePost(item, feed).id).toBe(wirePost(item, feed).id);
  });

  it('does not repeat the headline as its own summary', () => {
    const post = wirePost({ ...item, description: item.title }, feed);
    expect(post.text).toBe(item.title);
  });
});

describe('sourceRef', () => {
  it('names a channel by its handle and a wire by its site', () => {
    expect(sourceRef({ handle: 'QudsNen', name: 'Quds News Network', lean: '', bloc: 'regional' })).toBe('t.me/QudsNen');
    expect(sourceRef({ handle: 'bbc', name: 'BBC World', lean: '', bloc: 'western' })).toBe('feeds.bbci.co.uk');
    expect(sourceRef({ handle: 'tass', name: 'TASS', lean: '', bloc: 'russian' })).toBe('tass.com');
  });
});

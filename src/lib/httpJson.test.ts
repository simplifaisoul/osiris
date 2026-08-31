import { describe, it, expect } from 'vitest';
import { httpConditional } from './httpJson';

/**
 * Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real
 * abuse.ch dump).
 *
 * The malware feed polls a 2.9 MB file every 60 seconds against an upstream
 * that regenerates it every 5 minutes, and the only thing keeping that from
 * costing 175 MB an hour is abuse.ch honouring `If-None-Match`. That is an
 * assumption about someone else's server, so it is worth an explicit check
 * rather than an inference from a header — if abuse.ch ever stops answering
 * 304, the feed silently gets 35x more expensive and nothing else would say so.
 */
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

const RECENT_CSV = 'https://urlhaus.abuse.ch/downloads/csv_recent/';

describe('httpConditional', () => {
  liveIt('fetches the dump, then answers 304 to the same validators', async () => {
    const first = await httpConditional(RECENT_CSV, {
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });

    expect(first.changed).toBe(true);
    expect(first.body).toBeTruthy();
    expect(first.body!).toContain('abuse.ch URLhaus');
    // One of the two must come back, or there is nothing to revalidate with.
    expect(first.etag ?? first.lastModified).toBeTruthy();

    const second = await httpConditional(RECENT_CSV, {
      etag: first.etag,
      lastModified: first.lastModified,
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });

    expect(second.changed).toBe(false);
    expect(second.body).toBeNull();
    // Validators survive a 304 so the next poll can still revalidate.
    expect(second.etag ?? second.lastModified).toBeTruthy();
  }, 120_000);

  liveIt('degrades to a plain GET when given no validators', async () => {
    const res = await httpConditional(RECENT_CSV, {
      timeoutMs: 60_000,
      headers: { Accept: 'text/csv', 'Accept-Encoding': 'gzip' },
    });
    expect(res.changed).toBe(true);
    expect(res.body).toBeTruthy();
  }, 120_000);
});

import { describe, it, expect } from 'vitest';
import { fetchGdeltEvents, QUAD_LABELS } from './gdeltEvents';

/**
 * Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real GDELT
 * export host).
 *
 * data.gdeltproject.org now 301s every plain-HTTP request to its HTTPS origin,
 * including the http:// archive URLs printed in its own lastupdate.txt. The
 * reader follows redirects by re-entering itself, so an http-only client threw
 * `Protocol "https:" not supported` on the very first hop and the whole layer
 * went dark behind a 502. Nothing in a unit test would have caught that — it is
 * a fact about someone else's server, so it needs a real request to assert.
 */
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('fetchGdeltEvents', () => {
  liveIt('follows the http -> https redirect and returns geocoded events', async () => {
    const { events, window, scanned } = await fetchGdeltEvents({ limit: 50 });

    expect(window).toMatch(/^\d{14}\.export\.CSV\.zip$/);
    expect(scanned).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(50);

    for (const e of events) {
      expect(Number.isFinite(e.lat) && Number.isFinite(e.lng)).toBe(true);
      expect(Math.abs(e.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(e.lng)).toBeLessThanOrEqual(180);
      // Null island is the ungeocoded artefact the reader is meant to drop.
      expect(e.lat === 0 && e.lng === 0).toBe(false);
    }
  }, 60_000);

  liveIt('honours the quad filter', async () => {
    const { events } = await fetchGdeltEvents({ quads: [4], limit: 25 });

    for (const e of events) {
      expect(e.quad).toBe(4);
      expect(e.quad_label).toBe(QUAD_LABELS[4]);
    }
  }, 60_000);
});

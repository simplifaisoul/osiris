import { trending } from '@/lib/oi/markets';
import { disabled, disabledResponse, fail, json, limited } from '@/lib/oi/service';

/**
 * OSIRIS OI — what the world is betting on: the busiest questions on
 * Polymarket that can be rehearsed (not games, at least two weeks out), each
 * with the crowd's price, for the ask form to suggest. Read without a key and
 * kept ten minutes.
 *
 * GET /api/oi/trending
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: Request) {
  if (disabled()) return disabledResponse();
  if (limited(req, 'trending', 30)) return fail(429, 'Too many requests. Wait a minute.');
  const items = await trending((url, init) => fetch(url, init), req.signal);
  return json({ items });
}

import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { scanUsername, isValidUsername } from '@/lib/sherlock';

/**
 * OSIRIS — FINGERPRINT username search, streamed.
 *
 * The same Sherlock detection rules as /api/osint/username, run across the
 * whole (non-NSFW) site database rather than the priority tier, with every
 * site's verdict written out the moment it answers. A full sweep takes tens of
 * seconds; streaming is what makes that bearable to watch.
 *
 *   ?username=  target handle (required)
 *
 * Response is NDJSON, one event per line:
 *   { type: 'result', total, site, url, status, http_status?, reason?, ms }
 *   { type: 'done', ...UsernameScan }   calibrated — positives a random
 *                                       control handle also triggered are
 *                                       moved to `inconclusive` here
 *   { type: 'error', error }
 */

export const maxDuration = 120;

export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get('username') || '').trim();

  if (!username) {
    return NextResponse.json({ error: 'Missing username parameter' }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Invalid username. Allowed: letters, digits, and . _ - @ (max 64).' },
      { status: 400 }
    );
  }

  // A sweep fans out to every site in the database — several times the
  // priority tier /api/osint/username allows six of a minute.
  if (isRateLimited(`fingerprint:${getClientIp(req)}`, 3, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded — try again in a minute' }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          open = false; // client disconnected
        }
      };

      try {
        const scan = await scanUsername(username, {
          all: true,
          concurrency: 18,
          timeoutMs: 6000,
          signal: req.signal,
          onResult: (r, total) => send({ type: 'result', total, ...r }),
        });
        send({ type: 'done', ...scan, timestamp: new Date().toISOString() });
      } catch (e) {
        console.error('[OSIRIS] fingerprint scan failed:', e);
        send({ type: 'error', error: e instanceof Error ? e.message : 'Username scan failed' });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a disconnect */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      // no-transform keeps compression and proxies from holding lines back.
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

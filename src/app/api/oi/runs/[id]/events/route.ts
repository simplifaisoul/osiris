import { getClientIp } from '@/lib/ssrf-guard';
import { getRun, subscribe } from '@/lib/oi/runs';
import { disabled, disabledResponse, fail } from '@/lib/oi/service';
import type { Stamped } from '@/lib/oi/types';

/**
 * OSIRIS OI — a run as it happens, over Server-Sent Events.
 *
 * GET /api/oi/runs/{id}/events
 *
 * Replays everything so far, then streams new events until the run ends.
 * Each event is `id: <seq>` + `data: <json>`; a reconnect with Last-Event-ID
 * (or ?after=<seq>) resumes where it left off. Comments every 15 s keep
 * proxies from closing a quiet stream.
 */
export const dynamic = 'force-dynamic';

const MAX_STREAMS_PER_IP = 12;
const g = globalThis as unknown as { __osirisOiStreams?: Map<string, number> };
const open = (g.__osirisOiStreams ??= new Map());

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (disabled()) return disabledResponse();
  const run = getRun((await params).id);
  if (!run) return fail(404, 'No such run. Runs are kept for a few hours.');

  const ip = getClientIp(req);
  if ((open.get(ip) ?? 0) >= MAX_STREAMS_PER_IP) return fail(429, 'Too many open streams from your address.');

  const resume = req.headers.get('last-event-id') ?? new URL(req.url).searchParams.get('after');
  const after = resume !== null && /^\d+$/.test(resume) ? Number(resume) : -1;

  const enc = new TextEncoder();
  let closed = false;
  let released = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};
  const onAbort = () => finish();

  /*
   * Everything a stream holds, given back exactly once. It is set up before
   * anything is sent, because a finished run replays its 'end' event (and so
   * closes) before subscribe() has even returned.
   */
  function release() {
    if (released) return;
    released = true;
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    req.signal.removeEventListener('abort', onAbort);
    const n = (open.get(ip) ?? 1) - 1;
    if (n > 0) open.set(ip, n);
    else open.delete(ip);
  }

  let finish = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      open.set(ip, (open.get(ip) ?? 0) + 1);
      finish = () => {
        if (closed) return;
        closed = true;
        release();
        try { controller.close(); } catch { /* already closed */ }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { finish(); }
      };
      const send = (e: Stamped) => {
        write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
        if (e.t === 'end') finish();
      };

      req.signal.addEventListener('abort', onAbort);
      write('retry: 3000\n\n');
      const stop = subscribe(run, after, send);
      if (closed) { stop(); return; }
      unsubscribe = stop;
      // A finished run has nothing more to send once the replay is out.
      if (run.state.status !== 'running') { finish(); return; }
      heartbeat = setInterval(() => write(': ping\n\n'), 15_000);
    },
    cancel() {
      closed = true;
      release();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps compression from buffering the stream.
      'Cache-Control': 'no-cache, no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

import { getClientIp } from '@/lib/ssrf-guard';
import {
  ERR, PROTOCOL_VERSIONS, expectsNoReply, handleMessage, isLongCall, progressToken, type JsonRpcResponse, type McpContext,
} from '@/lib/oi/mcp';
import { credentials, disabled, limited, siteOrigin } from '@/lib/oi/service';

/**
 * OSIRIS MCP server — Streamable HTTP, stateless.
 *
 *   POST /api/mcp   one JSON-RPC message (or a batch, for 2025-03-26 clients)
 *   GET  /api/mcp   405: this server does not open server-initiated streams
 *
 * A call that waits on a forecast answers as a short SSE stream when the
 * client accepts one, carrying progress notifications and keep-alives, so
 * it can wait out a whole run. Over plain JSON it waits at most 80 s, under
 * the edge proxy's timeout, and hands back the run id to poll.
 *
 * Model keys come from headers: X-OI-Provider, X-OI-Key (or
 * Authorization: Bearer), X-OI-Model.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JSON_WAIT_S = 80;
const STREAM_WAIT_S = 280;

const enc = new TextEncoder();

function rpcResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Browsers send Origin; servers and agents do not. A browser page may only
 * talk to this endpoint from this site or from a local tool. Nothing here
 * rides on cookies, so this is defence in depth, as the transport asks.
 */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
    if (o.host === host) return true;
    if (o.hostname === 'localhost' || o.hostname === '127.0.0.1' || o.hostname === '[::1]') return true;
    const extra = (process.env.OI_MCP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    return extra.includes(o.origin);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (disabled()) return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.internal, message: 'OI is switched off on this server.' } }, 503);
  if (!originAllowed(req)) return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: 'Origin not allowed.' } }, 403);

  const version = req.headers.get('mcp-protocol-version');
  if (version && !PROTOCOL_VERSIONS.includes(version)) {
    return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: `Unsupported protocol version. Supported: ${PROTOCOL_VERSIONS.join(', ')}.` } }, 400);
  }
  if (limited(req, 'mcp', 120)) {
    return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: 'Too many requests. Slow down.' } }, 429);
  }

  const raw = await req.text().catch(() => '');
  if (raw.length > 256_000) return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: 'Request too large.' } }, 413);
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.parse, message: 'Parse error.' } }, 400);
  }

  const creds = credentials(req);
  if ('error' in creds) {
    return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: creds.error } }, 400);
  }
  const base: Omit<McpContext, 'maxWaitSeconds'> = { creds, ip: getClientIp(req), origin: siteOrigin(req), signal: req.signal };

  // A batch: answered together, without streaming.
  if (Array.isArray(msg)) {
    if (!msg.length || msg.length > 20) return rpcResponse({ jsonrpc: '2.0', id: null, error: { code: ERR.invalidRequest, message: 'A batch holds 1 to 20 messages.' } }, 400);
    const out: JsonRpcResponse[] = [];
    for (const m of msg) {
      const r = await handleMessage(m, { ...base, maxWaitSeconds: JSON_WAIT_S });
      if (r) out.push(r);
    }
    return out.length ? rpcResponse(out) : new Response(null, { status: 202 });
  }

  if (expectsNoReply(msg)) return new Response(null, { status: 202 });

  const wantsStream = (req.headers.get('accept') || '').includes('text/event-stream');
  if (!wantsStream || !isLongCall(msg)) {
    const r = await handleMessage(msg, { ...base, maxWaitSeconds: JSON_WAIT_S });
    return r ? rpcResponse(r) : new Response(null, { status: 202 });
  }

  // A long call, streamed: progress as it comes, keep-alives between, then the answer.
  const token = progressToken(msg);
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (s: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(s)); } catch { closed = true; }
      };
      const send = (m: unknown) => write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
      const keepAlive = setInterval(() => write(': keep-alive\n\n'), 15_000);
      stop = () => { closed = true; clearInterval(keepAlive); };

      const progress = token === null ? undefined : (progress: number, total: number, message: string) =>
        send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress, total, message } });

      handleMessage(msg, { ...base, maxWaitSeconds: STREAM_WAIT_S, progress })
        .then(r => { if (r) send(r); })
        .catch(() => send({ jsonrpc: '2.0', id: null, error: { code: ERR.internal, message: 'Internal error.' } }))
        .finally(() => {
          stop();
          try { controller.close(); } catch { /* already closed */ }
        });
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

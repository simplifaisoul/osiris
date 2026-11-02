/**
 * OSIRIS as an MCP server (Model Context Protocol, Streamable HTTP, stateless).
 *
 * Agents such as Hermes connect to /api/mcp and get OI as tools, plus
 * free OSIRIS intelligence (the world brief, the markets). The model key is
 * configured once on the connection as headers (X-OI-Provider,
 * X-OI-Key, X-OI-Model), never passed as a tool argument, so it stays
 * out of the agent's transcript.
 *
 * This module is the protocol and the tools; the route does the HTTP.
 */
import { briefing } from './context';
import { providerInfo } from './providers';
import { cancelRun, getRun, injectEvent, ownsRun, runSummary, subscribe, waitForEnd, waitSlot, watchUrl, type Run } from './runs';
import { CREDIT, OI_VERSION, askPrediction, describe, startPrediction, type Credentials } from './service';
import { num, oneOf, text } from './parse';
import { currentAnswer } from './state';

import type { StartDeps } from './runs';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL = PROTOCOL_VERSIONS[0];

export interface McpContext {
  creds: Credentials;
  ip: string;
  origin: string;
  signal: AbortSignal;
  /** Longest a tool may wait for a run: shorter over plain JSON (proxy timeouts), longer when streaming. */
  maxWaitSeconds: number;
  /** Set when the response is a stream and the client asked for progress. */
  progress?: (progress: number, total: number, message: string) => void;
  deps?: StartDeps;
}

type Id = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };

const INSTRUCTIONS = `OSIRIS OI is a prediction engine for real-world questions: it researches the question from sources that can be checked (reporting from publishers' own feeds, GDELT and Wikipedia's Current events, each with its link; daily prices for any market price the question turns on; what prediction markets such as Polymarket price the same question at; background; and OSIRIS's live feeds where on topic), casts the actors who decide it as agents, and simulates them acting on each other over dated periods from today to the horizon, in several parallel worlds. A question about a price is priced: a statistical baseline from the price's own history, each world's own course for the price, and the worlds' events run through the market's own paths.
Use oi_predict to predict a question; it returns the probability the worlds add up to, in the shape the question asks for (a probability for yes or no, a share per outcome for "which", an estimate with an 80% range for "how much"), and the story: the predicted path date by date, what each actor does, how each world ended, drivers, scenarios and signposts, what the prediction rests on (the baseline, the prediction market on the same question), and a watch_url where a human can watch the analysis draw itself on the globe. A run takes one to five minutes: if oi_predict returns before the run is done, call oi_get_run with wait_seconds until status is "done".
oi_ask questions the report agent, or any actor that played, afterwards. oi_inject drops a breaking event into a running simulation (god's-eye view): it lands in every world.
osiris_world_brief, osiris_markets and osiris_trending (what the world is betting on: questions with the crowd's price, to predict and compare) are free and need no model key. OI tools run on the model key configured on this connection.
${CREDIT}`;

const RUN_ID = { type: 'string', description: 'The run id returned by oi_predict.' };

export const TOOLS = [
  {
    name: 'oi_predict',
    title: 'Forecast a question',
    description: 'Start an OSIRIS OI prediction: the actors who decide the question are simulated acting on each other, period by period from today to the horizon, in parallel worlds grounded in live research; a report agent then gives the probability the worlds add up to (or a share per outcome, or an estimate with a range, as the question asks) and the story: the predicted path date by date, what each actor does, drivers, scenarios and signposts. Waits for the result up to wait_seconds, else returns the run id to poll with oi_get_run. Uses the model key configured on this connection.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What to forecast, ideally something that will resolve yes or no by a date. 8–500 characters.' },
        context: { type: 'string', description: 'Optional data of your own: a report, notes, a table, a policy draft (up to 100,000 characters, about 25,000 tokens). The world model reads it once.' },
        context_scope: { type: 'string', enum: ['brief', 'panel'], description: 'brief (default): only the world model reads the context. panel: every actor\'s move and the report agent also read its first 8,000 characters, which costs about 2,000 more input tokens per model call.' },
        depth: { type: 'string', enum: ['quick', 'standard', 'deep'], description: 'quick: 4 actors × 3 periods × 2 worlds (~34 model calls). standard: 6 × 4 × 3 (~88). deep: 7 × 4 × 4 (~132). Default standard.' },
        use_live_feeds: { type: 'boolean', description: 'Research the question first (recent news with its links, and Wikipedia background) and read the OSIRIS live feeds; the actors ground their first moves in quotes from these sources. Default true.' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: 280, description: 'How long to wait for the forecast before returning. Default: as long as this connection allows.' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'oi_get_run',
    title: 'Check a forecast',
    description: 'The state of an OI run: phase, the worlds pooled so far, each world as it stands, and the prediction once written. Optionally waits for the run to finish.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN_ID,
        wait_seconds: { type: 'integer', minimum: 0, maximum: 280, description: 'Wait up to this long for the run to finish. Default 0.' },
        include_moves: { type: 'boolean', description: 'Include every move of the simulation, world by world and period by period: what each actor did, said and aimed at, which way it pushed, and the quotes behind it (each a source id from sources, the words, and whether they were found verbatim). Default false.' },
      },
      required: ['run_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'oi_ask',
    title: 'Question the actors',
    description: 'Ask the report agent, or any actor that played, by id, a follow-up question about a run. Uses the model key configured on this connection.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN_ID,
        message: { type: 'string', description: 'Your question (up to 1,000 characters).' },
        target: { type: 'string', description: '"report" (default) or the id of an actor that played (see actors[].persona in the run).' },
      },
      required: ['run_id', 'message'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'oi_inject',
    title: 'Inject an event',
    description: 'God\'s-eye view: drop a breaking event into a running simulation. It lands in every world at the start of the next period. Needs the run_token oi_predict returned.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN_ID,
        run_token: { type: 'string', description: 'The run_token from oi_predict.' },
        event: { type: 'string', description: 'What happened, in a sentence (up to 400 characters).' },
      },
      required: ['run_id', 'run_token', 'event'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'oi_cancel',
    title: 'Cancel a forecast',
    description: 'Stop a running OI run. Needs the run_token oi_predict returned.',
    inputSchema: {
      type: 'object',
      properties: { run_id: RUN_ID, run_token: { type: 'string', description: 'The run_token from oi_predict.' } },
      required: ['run_id', 'run_token'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'oi_info',
    title: 'About OI',
    description: 'Providers, depths, limits and endpoints, and which provider and model this connection is configured with.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'osiris_world_brief',
    title: 'World brief',
    description: 'Live intelligence from OSIRIS: the latest stories on a topic (or the biggest of the moment), placed on the map, with large earthquakes and a line of market prices. Free; no model key needed.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional: a topic, place or question to filter on.' },
        limit: { type: 'integer', minimum: 1, maximum: 40, description: 'At most this many items. Default 20.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'osiris_markets',
    title: 'Markets',
    description: 'Live prices from the OSIRIS markets board: world indices, defence stocks, oil, commodities, crypto and FX. Free; no model key needed.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', enum: ['all', 'indices', 'stocks', 'oil', 'commodities', 'crypto', 'fx'], description: 'Default all.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'osiris_trending',
    title: 'What the world is betting on',
    description: 'The busiest open questions on Polymarket that can be predicted (not games, at least two weeks out), each with the crowd\'s price of YES: questions to run oi_predict on and compare with the crowd. Free; no model key needed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
] as const;

/* ───────────────────────────── Tool results ───────────────────────────── */

interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const ok = (summary: string, data: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
  structuredContent: data,
});

const toolError = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

const needKey = (ctx: McpContext) => (!ctx.creds.provider || (!ctx.creds.key && providerInfo(ctx.creds.provider).needsKey))
  ? toolError('This connection has no model key. Configure the MCP server with headers X-OI-Provider (openai, anthropic, google, openrouter, groq, deepseek, xai, mistral or qwen) and X-OI-Key (or Authorization: Bearer <key>), optionally X-OI-Model. The key is used only for your runs and never stored.')
  : null;

function headline(run: Run): string {
  const s = run.state;
  if (s.status === 'failed') return `The run failed: ${s.message}`;
  if (s.status === 'cancelled') return 'The run was cancelled.';
  if (s.report) {
    return `${s.report.headline}: ${s.report.answer} (${s.report.confidence} confidence).`;
  }
  const last = s.rounds[s.rounds.length - 1];
  const sofar = last ? ` After period ${last.round} the worlds stand at ${currentAnswer(s)}.` : '';
  return `Still running: ${s.phaseLabel || s.phase}.${sofar} Call oi_get_run with wait_seconds to wait for the forecast.`;
}

/** Waits for a run, reporting each phase and period as progress when the client asked for it. */
async function follow(run: Run, seconds: number, ctx: McpContext): Promise<void> {
  if (seconds <= 0 || run.state.status !== 'running') return;
  // Past this address's share of held connections, answer at once: the caller polls instead.
  const release = waitSlot(ctx.ip);
  if (!release) return;
  try {
    await followHeld(run, seconds, ctx);
  } finally {
    release();
  }
}

async function followHeld(run: Run, seconds: number, ctx: McpContext): Promise<void> {
  const total = 5 + run.state.periodsPlanned;
  const step = () => {
    const s = run.state;
    const base = { context: 1, graph: 2, agents: 3, simulate: 3 + s.rounds.length, report: 4 + s.periodsPlanned, done: total }[s.phase];
    return Math.min(total, base);
  };
  let unsubscribe = () => {};
  if (ctx.progress) {
    const report = ctx.progress;
    report(step(), total, run.state.phaseLabel || 'Starting');
    unsubscribe = subscribe(run, run.state.lastSeq, e => {
      if (e.t === 'phase' || e.t === 'round') report(step(), total, run.state.phaseLabel);
    });
  }
  try {
    await waitForEnd(run, seconds * 1000, ctx.signal);
  } finally {
    unsubscribe();
  }
}

/** Every move of the simulation, world by world and period by period. */
function movesOf(run: Run) {
  const names = new Map(run.state.actors.map(a => [a.id, a.name]));
  return run.state.moves.map(m => ({
    world: m.world, period: m.period, actor: m.actor, name: names.get(m.actor),
    action: m.action, statement: m.statement || undefined, targets: m.targets, stance: m.stance,
    push: m.favors ? undefined : m.push, favors: m.favors, why: m.why || undefined, quotes: m.cites?.length ? m.cites : undefined,
  }));
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<ToolResult> {
  const waitArg = (v: unknown, fallback: number) => Math.min(ctx.maxWaitSeconds, Math.round(num(v, 0, 280, fallback)));

  switch (name) {
    case 'oi_predict': {
      const missing = needKey(ctx);
      if (missing) return missing;
      const started = startPrediction(
        { question: args.question, seed: args.context, seed_scope: args.context_scope, depth: args.depth, use_feeds: args.use_live_feeds },
        ctx.creds, ctx.ip, ctx.deps,
      );
      if (!started.ok) return toolError(started.error);
      const { run } = started;
      // Said first, so a client that drops mid-wait still knows where its run is.
      ctx.progress?.(0, 5 + run.state.periodsPlanned, `Run ${run.id} started. Watch it: ${watchUrl(ctx.origin, run.id)}`);
      await follow(run, waitArg(args.wait_seconds, ctx.maxWaitSeconds), ctx);
      const data = { ...runSummary(run, ctx.origin), run_token: run.token };
      return ok(`${headline(run)}\nWatch it on the globe: ${data.watch_url}`, data);
    }
    case 'oi_get_run': {
      const run = getRun(String(args.run_id ?? ''));
      if (!run) return toolError('No such run. Runs are kept for a few hours.');
      await follow(run, waitArg(args.wait_seconds, 0), ctx);
      const data: Record<string, unknown> = runSummary(run, ctx.origin);
      if (args.include_moves === true || args.include_posts === true) data.moves = movesOf(run);
      return ok(headline(run), data);
    }
    case 'oi_ask': {
      const missing = needKey(ctx);
      if (missing) return missing;
      const run = getRun(String(args.run_id ?? ''));
      if (!run) return toolError('No such run.');
      const asked = await askPrediction(run, args.target, args.message, ctx.creds, ctx.signal, ctx.deps?.chat);
      if (!asked.ok) return toolError(asked.error);
      return ok(asked.reply, { run_id: run.id, target: asked.target, reply: asked.reply });
    }
    case 'oi_inject': {
      const run = getRun(String(args.run_id ?? ''));
      if (!run) return toolError('No such run.');
      if (!ownsRun(run, args.run_token)) return toolError('That run_token does not match this run.');
      const done = injectEvent(run, args.event);
      if (!done.ok) return toolError(done.error);
      return ok('Queued: it lands in every world at the start of the next period.', { run_id: run.id, queued: true });
    }
    case 'oi_cancel': {
      const run = getRun(String(args.run_id ?? ''));
      if (!run) return toolError('No such run.');
      if (!ownsRun(run, args.run_token)) return toolError('That run_token does not match this run.');
      const cancelled = cancelRun(run);
      return ok(cancelled ? 'Cancelling.' : `Nothing to cancel: the run is ${run.state.status}.`, { run_id: run.id, cancelled });
    }
    case 'oi_info': {
      const p = ctx.creds.provider;
      const data = {
        ...describe(ctx.origin),
        connection: {
          provider: p ?? null,
          model: p ? ctx.creds.model || providerInfo(p).defaultModel : null,
          key_configured: Boolean(ctx.creds.key),
        },
      };
      return ok(p && ctx.creds.key ? `Configured for ${providerInfo(p).name}.` : 'No model key on this connection: OI tools need one; the OSIRIS tools do not.', data);
    }
    case 'osiris_world_brief': {
      const topic = text(args.topic, 200);
      const items = await briefing(topic, Math.round(num(args.limit, 1, 40, 20)));
      return ok(`${items.length} items${topic ? ` on "${topic}"` : ''} from OSIRIS live feeds.`, { topic: topic || null, items });
    }
    case 'osiris_markets': {
      const group = oneOf(args.group, ['all', 'indices', 'stocks', 'oil', 'commodities', 'crypto', 'fx'] as const, 'all');
      const { getQuotes } = await import('@/app/api/markets/route');
      const quotes = (await getQuotes())
        .filter(q => group === 'all' || q.group === group)
        .map(q => ({ name: q.name, symbol: q.symbol, group: q.group, price: q.price, change_pct: Math.round(q.change_percent * 100) / 100, currency: q.currency, market_open: q.market_open }));
      return ok(`${quotes.length} instruments.`, { group, quotes, as_of: new Date().toISOString() });
    }
    case 'osiris_trending': {
      const { trending } = await import('./markets');
      const items = (await trending((url, init) => fetch(url, init), ctx.signal))
        .map(t => ({ question: t.question, crowd_pct: Math.round(t.probability * 1000) / 10, event: t.event, url: t.url, closes: t.closes || undefined }));
      return ok(`${items.length} questions the world is betting on.`, { items, source: 'Polymarket', as_of: new Date().toISOString() });
    }
  }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { rpc: ERR.invalidParams });
}

/* ───────────────────────────── The protocol ───────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** A request that waits on a run, which is worth streaming progress for. */
export function isLongCall(msg: unknown): boolean {
  if (!isObj(msg) || msg.method !== 'tools/call' || !isObj(msg.params)) return false;
  const name = msg.params.name;
  const args = isObj(msg.params.arguments) ? msg.params.arguments : {};
  return name === 'oi_predict' || (name === 'oi_get_run' && Number(args.wait_seconds) > 0) || name === 'oi_ask';
}

export function progressToken(msg: unknown): string | number | null {
  if (!isObj(msg) || !isObj(msg.params) || !isObj(msg.params._meta)) return null;
  const t = msg.params._meta.progressToken;
  return typeof t === 'string' || typeof t === 'number' ? t : null;
}

/** True for a notification or a response: something that gets no reply. */
export function expectsNoReply(msg: unknown): boolean {
  return isObj(msg) && (msg.id === undefined || typeof msg.method !== 'string');
}

const rpcError = (id: Id, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Handles one JSON-RPC message. Null when it was a notification or a response. */
export async function handleMessage(msg: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!isObj(msg) || msg.jsonrpc !== '2.0') return rpcError(null, ERR.invalidRequest, 'Not a JSON-RPC 2.0 message.');
  const id = (typeof msg.id === 'string' || typeof msg.id === 'number') ? msg.id : null;
  if (expectsNoReply(msg)) return null;
  const method = msg.method as string;
  const params = isObj(msg.params) ? msg.params : {};

  try {
    switch (method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        return {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST_PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'osiris-oi', title: 'OSIRIS OI', version: OI_VERSION },
            instructions: INSTRUCTIONS,
          },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'resources/list':
        return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'prompts/list':
        return { jsonrpc: '2.0', id, result: { prompts: [] } };
      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : '';
        if (!TOOLS.some(t => t.name === name)) return rpcError(id, ERR.invalidParams, `Unknown tool: ${name || '(none)'}`);
        const args = isObj(params.arguments) ? params.arguments : {};
        try {
          return { jsonrpc: '2.0', id, result: await callTool(name, args, ctx) };
        } catch (err) {
          // A tool that breaks reports it as a tool error, which the calling model can read and work around.
          return { jsonrpc: '2.0', id, result: toolError(`The tool failed: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown error'}`) };
        }
      }
      default:
        return rpcError(id, ERR.methodNotFound, `Method not found: ${method}`);
    }
  } catch {
    return rpcError(id, ERR.internal, 'Internal error.');
  }
}

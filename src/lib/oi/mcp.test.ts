import { describe, it, expect } from 'vitest';
import { ERR, LATEST_PROTOCOL, TOOLS, expectsNoReply, handleMessage, isLongCall, progressToken, type McpContext } from './mcp';
import { createDemoChat } from './demo';
import { getRun } from './runs';

let ipN = 0;
const ctx = (over: Partial<McpContext> = {}): McpContext => ({
  creds: { provider: 'openai', key: 'sk-test-0123456789', model: 'gpt-5-mini' },
  ip: `192.0.2.${++ipN}`,
  origin: 'https://osirisai.live',
  signal: new AbortController().signal,
  maxWaitSeconds: 20,
  deps: { chat: createDemoChat() },
  ...over,
});

const call = (name: string, args: Record<string, unknown>, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

describe('the protocol', () => {
  it('initialises, agreeing a version it speaks', async () => {
    const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'hermes', version: '1' } } }, ctx());
    expect(r?.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'osiris-oi' } });
    const r2 = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, ctx());
    expect((r2?.result as { protocolVersion: string }).protocolVersion).toBe(LATEST_PROTOCOL);
  });

  it('answers pings and lists its tools', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', id: 'p', method: 'ping' }, ctx())).toEqual({ jsonrpc: '2.0', id: 'p', result: {} });
    const r = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx());
    const names = (r?.result as { tools: { name: string }[] }).tools.map(t => t.name);
    expect(names).toEqual(TOOLS.map(t => t.name));
    for (const t of TOOLS) expect(t.inputSchema.type).toBe('object');
  });

  it('takes notifications silently and refuses what it does not know', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toBeNull();
    expect(expectsNoReply({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} })).toBe(true);
    expect((await handleMessage({ jsonrpc: '2.0', id: 4, method: 'sampling/createMessage' }, ctx()))?.error?.code).toBe(ERR.methodNotFound);
    expect((await handleMessage({ id: 5, method: 'ping' }, ctx()))?.error?.code).toBe(ERR.invalidRequest);
    expect((await handleMessage(call('rm_rf', {}), ctx()))?.error?.code).toBe(ERR.invalidParams);
  });

  it('knows which calls are worth streaming', () => {
    expect(isLongCall(call('oi_predict', { question: 'x' }))).toBe(true);
    expect(isLongCall(call('oi_get_run', { run_id: 'x' }))).toBe(false);
    expect(isLongCall(call('oi_get_run', { run_id: 'x', wait_seconds: 30 }))).toBe(true);
    expect(progressToken({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: { progressToken: 'abc' } } })).toBe('abc');
  });
});

describe('the tools', () => {
  it('predicts, waits, and hands back the run, its token and a link to watch it', async () => {
    const progress: string[] = [];
    const r = await handleMessage(call('oi_predict', { question: 'Will the envoys sign a deal by year end?', depth: 'quick', use_live_feeds: false }),
      ctx({ progress: (_p, _t, m) => progress.push(m) }));
    const result = r?.result as { content: { text: string }[]; structuredContent: Record<string, unknown>; isError?: boolean };
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ status: 'done', depth: 'quick' });
    expect(result.content[0].text).toMatch(/Watch it on the globe: https:\/\/osirisai\.live\/\?oi=/);
    expect(typeof result.structuredContent.run_token).toBe('string');
    expect(progress[0]).toMatch(/^Run [0-9a-f-]{36} started/);
    // Progress follows the simulated clock, period by period.
    expect(progress.some(m => /the actors move in 2 worlds/.test(m))).toBe(true);
    expect((result.structuredContent.report as { path: unknown[] }).path.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('sk-test');
  });

  it('asks for a key when the connection has none', async () => {
    const r = await handleMessage(call('oi_predict', { question: 'Will the envoys sign a deal?' }), ctx({ creds: {} }));
    const result = r?.result as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/X-OI-Key/);
  });

  it('reads a run, questions it, and guards injections with the token', async () => {
    const started = await handleMessage(call('oi_predict', { question: 'Will the envoys sign a deal by year end?', depth: 'quick', use_live_feeds: false }), ctx());
    const run = (started?.result as { structuredContent: { id: string; run_token: string } }).structuredContent;
    expect(getRun(run.id)).toBeDefined();

    const got = await handleMessage(call('oi_get_run', { run_id: run.id, include_moves: true }), ctx());
    const data = (got?.result as { structuredContent: { moves: { world: string; actor: string }[]; worlds: unknown[]; run_token?: string } }).structuredContent;
    expect(data.moves.length).toBeGreaterThan(0);
    expect(data.worlds).toHaveLength(2);
    expect(data.run_token).toBeUndefined();

    const asked = await handleMessage(call('oi_ask', { run_id: run.id, message: 'Why?' }), ctx());
    expect((asked?.result as { structuredContent: { reply: string } }).structuredContent.reply).toBeTruthy();

    const forged = await handleMessage(call('oi_inject', { run_id: run.id, run_token: 'forged', event: 'Something happens' }), ctx());
    expect((forged?.result as { isError: boolean }).isError).toBe(true);
    const late = await handleMessage(call('oi_inject', { run_id: run.id, run_token: run.run_token, event: 'Something happens' }), ctx());
    expect((late?.result as { content: { text: string }[] }).content[0].text).toMatch(/finished/);
  });

  it('describes itself without revealing the key', async () => {
    const r = await handleMessage(call('oi_info', {}), ctx());
    const data = (r?.result as { structuredContent: { connection: Record<string, unknown> } }).structuredContent;
    expect(data.connection).toEqual({ provider: 'openai', model: 'gpt-5-mini', key_configured: true });
    expect(JSON.stringify(r)).not.toContain('sk-test');
  });
});

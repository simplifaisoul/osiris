import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { cancelRun, startRun, waitForEnd, type StartInput } from '@/lib/oi/runs';
import { createDemoChat } from '@/lib/oi/demo';
import type { ChatFn } from '@/lib/oi/providers';

const streams = () => (globalThis as unknown as { __osirisOiStreams?: Map<string, number> }).__osirisOiStreams;

const input = (ip: string): StartInput => ({
  question: 'Will the envoys sign a deal by year end?', seed: '', depth: 'quick', useFeeds: false,
  provider: 'openai', model: 'gpt-5-mini', key: 'sk-test-0123456789', ip,
});

const get = (id: string, ip: string, signal?: AbortSignal) =>
  GET(new Request(`http://localhost/api/oi/runs/${id}/events`, { headers: { 'x-real-ip': ip }, signal }), { params: Promise.resolve({ id }) });

describe('the event stream', () => {
  it('replays a finished run, closes, and gives the slot back every time', async () => {
    const started = startRun(input('203.0.113.1'), { chat: createDemoChat() });
    if (!started.ok) throw new Error(started.error);
    await waitForEnd(started.run, 10_000);
    // More replays than one address may hold at once: each must hand its slot back.
    for (let i = 0; i < 15; i++) {
      const res = await get(started.run.id, '203.0.113.9');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const body = await res.text();
      expect(body).toContain('"t":"end"');
    }
    expect(streams()?.get('203.0.113.9')).toBeUndefined();
  });

  it('resumes after the last event seen', async () => {
    const started = startRun(input('203.0.113.2'), { chat: createDemoChat() });
    if (!started.ok) throw new Error(started.error);
    await waitForEnd(started.run, 10_000);
    const res = await GET(new Request(`http://localhost/api/oi/runs/${started.run.id}/events`, { headers: { 'x-real-ip': '203.0.113.10', 'last-event-id': '5' } }), { params: Promise.resolve({ id: started.run.id }) });
    const ids = [...(await res.text()).matchAll(/^id: (\d+)$/gm)].map(m => Number(m[1]));
    expect(ids[0]).toBe(6);
  });

  it('gives the slot back when a watcher of a live run goes away', async () => {
    const demo = createDemoChat();
    const slow: ChatFn = async req => { await new Promise(r => setTimeout(r, 40)); return demo(req); };
    const started = startRun(input('203.0.113.3'), { chat: slow });
    if (!started.ok) throw new Error(started.error);
    const watcher = new AbortController();
    const res = await get(started.run.id, '203.0.113.11', watcher.signal);
    const reader = res.body!.getReader();
    await reader.read();
    expect(streams()?.get('203.0.113.11')).toBe(1);
    watcher.abort();
    await reader.cancel().catch(() => {});
    expect(streams()?.get('203.0.113.11')).toBeUndefined();
    cancelRun(started.run);
  });

  it('says so for a run it does not have', async () => {
    const res = await get('00000000-0000-4000-8000-000000000000', '203.0.113.12');
    expect(res.status).toBe(404);
  });
});

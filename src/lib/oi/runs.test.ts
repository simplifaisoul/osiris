import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoChat } from './demo';
import { LIMITS, cancelRun, getRun, injectEvent, ownsRun, runSummary, startRun, subscribe, waitForEnd, waitSlot, type StartInput } from './runs';
import type { ChatFn } from './providers';
import type { Stamped } from './types';

let n = 0;
const input = (over: Partial<StartInput> = {}): StartInput => ({
  question: 'Will the envoys sign a deal by year end?',
  seed: '',
  depth: 'quick',
  useFeeds: false,
  provider: 'openai',
  model: 'gpt-5-mini',
  key: 'sk-test-0123456789',
  ip: `198.51.100.${++n}`,
  ...over,
});

const slow = (ms: number): ChatFn => {
  const demo = createDemoChat();
  return async req => { await new Promise(r => setTimeout(r, ms)); return demo(req); };
};

describe('the run store', () => {
  beforeEach(() => { n += 10; });

  it('runs to the end and summarises without the key or the address', async () => {
    const started = startRun(input(), { chat: createDemoChat() });
    if (!started.ok) throw new Error(started.error);
    const { run } = started;
    expect(getRun(run.id)).toBe(run);
    await waitForEnd(run, 10_000);
    expect(run.state.status).toBe('done');
    const summary = runSummary(run, 'https://osirisai.live');
    expect(summary).toMatchObject({ status: 'done', watch_url: `https://osirisai.live/?oi=${run.id}`, depth: 'quick' });
    expect(summary.report?.probability_pct).toBeGreaterThan(0);
    const flat = JSON.stringify(summary);
    expect(flat).not.toContain('sk-test');
    expect(flat).not.toContain('198.51.100.');
    expect(flat).not.toContain(run.token);
  });

  it('replays a run to a late subscriber, in order', async () => {
    const started = startRun(input(), { chat: createDemoChat() });
    if (!started.ok) throw new Error(started.error);
    await waitForEnd(started.run, 10_000);
    const seen: Stamped[] = [];
    subscribe(started.run, 4, e => seen.push(e));
    expect(seen[0].seq).toBe(5);
    expect(seen.map(e => e.seq)).toEqual(seen.map((_, i) => i + 5));
    expect(seen[seen.length - 1].t).toBe('end');
  });

  it('limits how many runs one address has going', () => {
    const ip = '203.0.113.99';
    const a = startRun(input({ ip }), { chat: slow(200) });
    const b = startRun(input({ ip }), { chat: slow(200) });
    const c = startRun(input({ ip }), { chat: slow(200) });
    expect(a.ok && b.ok).toBe(true);
    expect(c).toMatchObject({ ok: false, status: 429 });
    for (const r of [a, b]) if (r.ok) cancelRun(r.run);
  });

  it('only lets the starter change a run', () => {
    const started = startRun(input(), { chat: slow(50) });
    if (!started.ok) throw new Error(started.error);
    const { run } = started;
    expect(ownsRun(run, run.token)).toBe(true);
    expect(ownsRun(run, 'nope')).toBe(false);
    expect(ownsRun(run, undefined)).toBe(false);
    expect(ownsRun(run, run.token.slice(0, -1) + (run.token.endsWith('a') ? 'b' : 'a'))).toBe(false);
    cancelRun(run);
  });

  it('queues injected events, within reason', () => {
    const started = startRun(input(), { chat: slow(100) });
    if (!started.ok) throw new Error(started.error);
    const { run } = started;
    expect(injectEvent(run, 'x')).toMatchObject({ ok: false, status: 400 });
    for (let i = 0; i < LIMITS.maxInjects; i++) expect(injectEvent(run, `Event number ${i}`)).toEqual({ ok: true });
    expect(injectEvent(run, 'One too many')).toMatchObject({ ok: false, status: 429 });
    cancelRun(run);
  });

  it('cancels', async () => {
    const started = startRun(input(), { chat: slow(30) });
    if (!started.ok) throw new Error(started.error);
    const { run } = started;
    expect(cancelRun(run)).toBe(true);
    await waitForEnd(run, 5_000);
    expect(run.state.status).toBe('cancelled');
    expect(cancelRun(run)).toBe(false);
    expect(injectEvent(run, 'Too late now')).toMatchObject({ ok: false, status: 409 });
  });

  it('reports a failure without the key', async () => {
    const key = 'sk-secret-abcdefghijklmnop';
    const started = startRun(input({ key }), { chat: async () => { throw new Error(`upstream said ${key} is bad`); } });
    if (!started.ok) throw new Error(started.error);
    await waitForEnd(started.run, 5_000);
    expect(started.run.state.status).toBe('failed');
    expect(started.run.state.message).not.toContain(key);
  });

  it('lets one address hold only a few waits open', () => {
    const ip = '203.0.113.71';
    const held = Array.from({ length: 6 }, () => waitSlot(ip));
    expect(held.every(Boolean)).toBe(true);
    expect(waitSlot(ip)).toBeNull();
    expect(waitSlot('203.0.113.72')).not.toBeNull();
    held[0]!();
    held[0]!();
    const again = waitSlot(ip);
    expect(again).not.toBeNull();
    expect(waitSlot(ip)).toBeNull();
    [again, ...held.slice(1)].forEach(r => r!());
  });

  it('does not find runs by malformed ids', () => {
    expect(getRun('../../etc')).toBeUndefined();
    expect(getRun('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });
});

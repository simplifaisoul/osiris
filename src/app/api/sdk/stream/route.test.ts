import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET, MAX_ENTITIES_PER_EVENT } from './route';

const store = () => (globalThis as unknown as { sdkEntityStore: Map<string, unknown>; sdkLastUpdate: number });

afterEach(() => {
  vi.useRealTimers();
  store().sdkEntityStore.clear();
});

type StreamEvent = { type: string; payload: unknown[]; total?: number; truncated?: boolean };

async function events(reader: ReadableStreamDefaultReader<Uint8Array>, n: number) {
  const out: StreamEvent[] = [];
  const decoder = new TextDecoder();
  while (out.length < n) {
    const { value } = await reader.read();
    for (const line of decoder.decode(value).split('\n\n')) {
      if (line.startsWith('data: ')) out.push(JSON.parse(line.slice(6)));
    }
  }
  return out;
}

describe('GET /api/sdk/stream', () => {
  it('says how many entities there are when an update carries only some', async () => {
    vi.useFakeTimers();
    for (let i = 0; i <= MAX_ENTITIES_PER_EVENT; i++) store().sdkEntityStore.set(`e-${i}`, { id: `e-${i}` });
    store().sdkLastUpdate = Date.now();

    const reader = (await GET()).body!.getReader();
    await events(reader, 1); // status
    vi.advanceTimersByTime(5000);
    const [update] = await events(reader, 1);

    expect(update.type).toBe('entity_update');
    expect(update.payload).toHaveLength(MAX_ENTITIES_PER_EVENT);
    expect(update.total).toBe(MAX_ENTITIES_PER_EVENT + 1);
    expect(update.truncated).toBe(true);
    await reader.cancel();
  });

  it('stops its timers as soon as the client goes away', async () => {
    vi.useFakeTimers();
    const reader = (await GET()).body!.getReader();
    await events(reader, 1);
    expect(vi.getTimerCount()).toBe(2);
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Route = typeof import('./route');
let route: Route;
const store = () => (globalThis as unknown as { sdkEntityStore: Map<string, unknown> }).sdkEntityStore;

beforeAll(async () => {
  // The key is read when the module loads.
  vi.stubEnv('SDK_INGEST_KEY', 'test-key');
  route = await import('./route');
});

beforeEach(() => store().clear());

const post = (body: unknown) =>
  route.POST(new NextRequest('http://localhost/api/sdk/ingest', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const entity = (id: string, lat = 10, lng = 10) => ({ id, position: { lat, lng } });

describe('POST /api/sdk/ingest', () => {
  it('reports exactly what reached the store when one entry is malformed', async () => {
    const res = await post({ source: 'test', apiKey: 'test-key', entities: [entity('partial'), null] });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ accepted: 1, rejected: 1 });
    expect([...store().keys()]).toEqual(['ext-test-partial']);
  });

  it('answers 400, not 500, for a body that is not JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect(store().size).toBe(0);
  });

  it('refuses a wrong key', async () => {
    const res = await post({ source: 'test', apiKey: 'nope', entities: [entity('a')] });
    expect(res.status).toBe(401);
    expect(store().size).toBe(0);
  });

  it('accepts a position on the equator or the prime meridian', async () => {
    const body = await (await post({ source: 'test', apiKey: 'test-key', entities: [entity('gulf-of-guinea', 0, 0)] })).json();
    expect(body.accepted).toBe(1);
  });

  it('refuses coordinates that are not on the globe', async () => {
    const body = await (await post({ source: 'test', apiKey: 'test-key', entities: [entity('far', 95, 10), entity('nan', Number.NaN, 0)] })).json();
    expect(body).toMatchObject({ accepted: 0, rejected: 2 });
  });

  it('refuses an oversized body', async () => {
    const res = await post({ source: 'test', apiKey: 'test-key', entities: [], pad: 'x'.repeat(route.MAX_BODY_BYTES) });
    expect(res.status).toBe(413);
  });

  it('refuses new ids once the store is full but still takes updates to held ones', async () => {
    for (let i = 0; i < route.MAX_STORED_ENTITIES; i++) store().set(`held-${i}`, {});
    store().set('ext-test-known', {});
    store().delete('held-0');
    const body = await (await post({ source: 'test', apiKey: 'test-key', entities: [entity('known'), entity('brand-new')] })).json();
    expect(body).toMatchObject({ accepted: 1, rejected: 1 });
    expect(store().has('ext-test-brand-new')).toBe(false);
  });
});

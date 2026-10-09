import { describe, it, expect, vi } from 'vitest';

// The assist step fetches a camera's frame for the model; here a fixed picture stands in.
vi.mock('./attach', () => ({
  frameForModel: async (id: string) => (id === 'gone' ? null : { name: `Cam ${id}`, at: '2026-10-09T08:15:00.000Z', image: { mime: 'image/jpeg', data: 'QUJD' } }),
}));

import { canSeeImages, createChat, type ChatRequest } from '../oi/providers';
import { assistStep } from '../oi/assist/server';
import { runCall, type CameraRecord, type Site } from '../oi/assist/tools';
import type { FrameAnalysis } from './analysis';

const KEY = 'sk-test-0123456789abcdef';
const IMG = [{ mime: 'image/jpeg', data: 'QUJD' }];
const REQ: ChatRequest = { system: 'sys', user: 'look', json: true, maxTokens: 300, images: IMG };

function fake(...replies: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return replies.shift()!;
  });
  return { f: f as unknown as typeof fetch, bodies };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const openaiOk = () => ok({ choices: [{ message: { content: '{"say":"ok","actions":[],"done":true}' } }] });

describe('pictures in a request', () => {
  it('go to OpenAI-style APIs as image_url parts after the text', async () => {
    const { f, bodies } = fake(openaiOk());
    await createChat('openai', KEY, 'gpt-5-mini', f)(REQ);
    const content = (bodies[0].messages as { content: unknown }[])[1].content as { type: string; image_url?: { url: string } }[];
    expect(content[0]).toEqual({ type: 'text', text: 'look' });
    expect(content[1].image_url?.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it("go to Anthropic as base64 image blocks before the text, and to Gemini as inline data", async () => {
    const a = fake(ok({ content: [{ type: 'text', text: 'ok' }] }));
    await createChat('anthropic', KEY, 'claude-haiku-4-5-20251001', a.f)(REQ);
    const blocks = (a.bodies[0].messages as { content: { type: string; source?: unknown }[] }[])[0].content;
    expect(blocks[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
    expect(blocks[1]).toEqual({ type: 'text', text: 'look' });

    const g = fake(ok({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
    await createChat('google', 'AIzaTest0123456789', 'gemini-2.5-flash', g.f)(REQ);
    const parts = (g.bodies[0].contents as { parts: unknown[] }[])[0].parts;
    expect(parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }, { text: 'look' }]);
  });

  it('are dropped, and the call made again in words, when a model cannot read them', async () => {
    const { f, bodies } = fake(
      new Response(JSON.stringify({ error: { message: 'This model does not support image inputs' } }), { status: 400 }),
      openaiOk(),
      openaiOk(),
    );
    const chat = createChat('groq', KEY, 'llama-3.3-70b-versatile', f);
    expect((await chat(REQ)).text).toContain('ok');
    expect((bodies[1].messages as { content: unknown }[])[1].content).toBe('look');
    // Learned: the next call does not try again.
    await chat(REQ);
    expect((bodies[2].messages as { content: unknown }[])[1].content).toBe('look');
  });

  it('are only sent to models likely to read them', () => {
    expect(canSeeImages('anthropic', 'claude-haiku-4-5-20251001')).toBe(true);
    expect(canSeeImages('openai', 'gpt-5-mini')).toBe(true);
    expect(canSeeImages('openai', 'gpt-3.5-turbo')).toBe(false);
    expect(canSeeImages('deepseek', 'deepseek-chat')).toBe(false);
    expect(canSeeImages('groq', 'meta-llama/llama-4-scout-17b-16e-instruct')).toBe(true);
    expect(canSeeImages('openrouter', 'google/gemini-2.5-flash')).toBe(true);
    expect(canSeeImages('qwen', 'qwen-plus')).toBe(false);
  });
});

describe('the assist step after a camera look', () => {
  const body = (data: unknown) => ({
    messages: [
      { role: 'user', text: 'How busy is the A-2?', mode: 'auto' },
      { role: 'assistant', say: 'Looking.', calls: [{ tool: 'camera', args: { near: 'Madrid' } }] },
      { role: 'tool', results: [{ tool: 'camera', ok: true, summary: 'Cam: 31 cars in view', data }] },
    ],
    context: {},
  });

  it('shows the frame to a model that reads pictures, and says which picture it is', async () => {
    const seen: ChatRequest[] = [];
    await assistStep(body({ camera: { id: 'madrid-a2' } }), { provider: 'openai', key: KEY, model: 'gpt-5-mini' }, undefined, async req => { seen.push(req); return { text: '{"say":"Busy.","actions":[],"done":true}', input: 1, output: 1 }; });
    expect(seen[0].images).toEqual(IMG);
    expect(seen[0].user).toContain('ATTACHED: the frame from the camera tool, in order: 1. Cam madrid-a2, 08:15 UTC');
  });

  it('sends counts alone to a model that does not, or when the frame is gone', async () => {
    const seen: ChatRequest[] = [];
    const chat = async (req: ChatRequest) => { seen.push(req); return { text: '{"say":"x","actions":[],"done":true}', input: 1, output: 1 }; };
    await assistStep(body({ camera: { id: 'madrid-a2' } }), { provider: 'deepseek', key: KEY, model: 'deepseek-chat' }, undefined, chat);
    await assistStep(body({ camera: { id: 'gone' } }), { provider: 'openai', key: KEY, model: 'gpt-5-mini' }, undefined, chat);
    expect(seen.map(r => r.images)).toEqual([undefined, undefined]);
    expect(seen[0].user).not.toContain('ATTACHED');
  });
});

describe('the camera tool', () => {
  const analysis: FrameAnalysis = { at: '2026-10-09T08:15:00.000Z', width: 640, height: 360, detections: [], counts: { car: 31, truck: 2 }, light: 'bright', motion: null, ms: 80 };
  const CAMS = [
    { id: 'far', name: 'Far', lat: 41.4, lng: 2.17, feed_url: 'https://x/far.jpg' },
    { id: 'yt', name: 'A web player', lat: 40.4169, lng: -3.7036, stream_type: 'iframe', stream_url: 'https://youtube.com/embed/x' },
    { id: 'a2', name: 'A-2 km 3.29', city: 'Madrid', country: 'Spain', lat: 40.44, lng: -3.67, feed_url: 'https://x/a2.jpg' },
  ];
  function site(): Site & { looked: { cam: CameraRecord; watch: number }[]; flown: number[][] } {
    const looked: { cam: CameraRecord; watch: number }[] = [];
    const flown: number[][] = [];
    return {
      looked, flown,
      data: () => ({ cameras: CAMS }),
      view: () => ({ lat: 0, lng: 0, zoom: 2, projection: 'globe', style: 'dark' }),
      layers: () => ({ cctv: true }),
      flyTo: (lat, lng, zoom) => { flown.push([lat, lng, zoom ?? 0]); },
      setLayers: () => {}, highlight: () => {}, openPanel: () => {}, setView: () => {},
      geocode: async () => ({ name: 'Madrid', lat: 40.4168, lng: -3.7038, kind: 'city' }),
      forecast: async () => ({ ok: false, error: 'no' }),
      camera: async (cam, watch) => { looked.push({ cam, watch }); return { analysis }; },
    };
  }

  it('looks through the nearest camera that can be read, opening it on the map', async () => {
    const s = site();
    const out = await runCall({ tool: 'camera', args: { near: 'Madrid' } }, s);
    expect(out.result.ok).toBe(true);
    expect(s.looked[0].cam.id).toBe('a2'); // the web player is nearer, but cannot be read
    expect(s.flown[0]).toEqual([40.44, -3.67, 14]);
    expect(out.result.summary).toBe('A-2 km 3.29: 31 cars, 2 trucks in view, well lit');
    expect(out.result.data).toMatchObject({ camera: { id: 'a2', where: 'Madrid, Spain' }, in_view: { car: 31, truck: 2 }, vehicles: 33 });
    expect(out.card).toMatchObject({ kind: 'camera', title: 'A-2 km 3.29' });
  });

  it('opens a camera by its id, with a watch', async () => {
    const s = site();
    await runCall({ tool: 'camera', args: { id: 'a2', watch_seconds: 90 } }, s);
    expect(s.looked[0]).toMatchObject({ cam: { id: 'a2' }, watch: 60 });
  });

  it('says plainly when it cannot', async () => {
    const s = site();
    expect((await runCall({ tool: 'camera', args: { id: 'yt' } }, s)).result.summary).toContain('web player');
    expect((await runCall({ tool: 'camera', args: { id: 'nope' } }, s)).result.summary).toContain('No camera with id');
    expect((await runCall({ tool: 'camera', args: {} }, s)).result.ok).toBe(false);
    expect((await runCall({ tool: 'camera', args: { near: 'Madrid', radius_km: 1 } }, s)).result.summary).toContain('within 1 km');
  });
});

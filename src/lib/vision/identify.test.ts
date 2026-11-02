import { describe, it, expect, vi, afterEach } from 'vitest';
import { IDENTIFY_SYSTEM, cropOf, identityWords, parseIdentities, pickVehicles } from './identify';
import type { Detection } from './detect';
import { POST } from '@/app/api/oi/identify/route';

const det = (label: Detection['label'], w: number, h = w * 0.6): Detection => ({ label, score: 0.9, box: [10, 10, w, h] });

describe('choosing the vehicles to name', () => {
  it('takes the largest vehicles big enough to show anything, never people', () => {
    const d = [det('car', 20), det('person', 200), det('truck', 90), det('car', 40), det('bus', 120)];
    expect(pickVehicles(d)).toEqual([4, 2, 3]);
    expect(pickVehicles(Array.from({ length: 10 }, (_, i) => det('car', 30 + i)))).toHaveLength(6);
  });

  it('crops round a box with a margin, inside the frame', () => {
    expect(cropOf([10, 10, 100, 50], { width: 1000, height: 1000 })).toEqual([0, 4, 122, 62]);
    expect(cropOf([950, 950, 100, 100], { width: 1000, height: 1000 })).toEqual([938, 938, 62, 62]);
  });
});

describe("reading the model's answer", () => {
  it('keeps one checked entry per crop, in order', () => {
    const out = parseIdentities({ vehicles: [
      { n: 2, make: 'Ford', model: 'Transit', body: 'van', colour: 'White', confidence: 'likely' },
      { n: 1, make: 'Toyota', model: 'Corolla', body: 'sedan', colour: null, confidence: 'possible' },
      { n: 9, make: 'Ghost', model: 'X', body: 'car', confidence: 'likely' },
    ] }, 2);
    expect(out).toEqual([
      { n: 1, make: 'Toyota', model: 'Corolla', body: null, colour: null, confidence: 'possible' },
      { n: 2, make: 'Ford', model: 'Transit', body: 'van', colour: 'white', confidence: 'likely' },
    ]);
  });

  it('turns "unknown" into unclear, and never keeps a model without a make', () => {
    const [v] = parseIdentities({ vehicles: [{ n: 1, make: 'Unknown', model: 'Civic', body: 'car', confidence: 'likely' }] }, 1);
    expect(v).toMatchObject({ make: null, model: null, confidence: 'unclear' });
    expect(identityWords(v)).toBe('unclear');
  });

  it('strips markup and caps what it keeps', () => {
    const [v] = parseIdentities({ vehicles: [{ n: 1, make: '<img src=x>Tesla', model: 'Model 3'.repeat(20), confidence: 'likely' }] }, 1);
    expect(v.make).toBe('img src=x Tesla');
    expect(v.model!.length).toBeLessThanOrEqual(40);
    expect(parseIdentities(null, 3)).toEqual([]);
  });

  it('forbids number plates in so many words', () => {
    expect(IDENTIFY_SYSTEM).toMatch(/Never read, transcribe or describe number plates/);
  });
});

describe('POST /api/oi/identify', () => {
  afterEach(() => vi.unstubAllGlobals());
  const JPEG = 'QUJDRA==';
  const post = (body: unknown, headers: Record<string, string>) => POST(new Request('http://localhost/api/oi/identify', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `203.0.113.${Math.floor(Math.random() * 200)}`, ...headers }, body: JSON.stringify(body),
  }));

  it('asks a vision model on the reader key, with the crops attached, and returns what it named', async () => {
    const sent: { body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push({ body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"vehicles":[{"n":1,"make":"Toyota","model":"Prius","body":"car","colour":"white","confidence":"likely"}]}' }] }));
    }));
    const res = await post({ camera: 'I-80 at 6th', crops: [{ n: 1, image: JPEG }] }, { 'x-oi-provider': 'anthropic', 'x-oi-key': 'sk-ant-test-0123456789', 'x-oi-model': 'claude-haiku-4-5-20251001' });
    expect(res.status).toBe(200);
    expect((await res.json()).vehicles[0]).toMatchObject({ make: 'Toyota', model: 'Prius', confidence: 'likely' });
    const content = (sent[0].body.messages as { content: { type: string }[] }[])[0].content;
    expect(content.map(c => c.type)).toEqual(['image', 'text']);
  });

  it('refuses without a key, with a model that cannot see, and without crops', async () => {
    expect((await post({ crops: [{ n: 1, image: JPEG }] }, { 'x-oi-provider': 'openai' })).status).toBe(401);
    expect((await post({ crops: [{ n: 1, image: JPEG }] }, { 'x-oi-provider': 'deepseek', 'x-oi-key': 'sk-test-0123456789abcdef', 'x-oi-model': 'deepseek-chat' })).status).toBe(400);
    expect((await post({ crops: [{ n: 1, image: 'not base64!' }] }, { 'x-oi-provider': 'openai', 'x-oi-key': 'sk-test-0123456789abcdef' })).status).toBe(400);
  });

  it('answers from the scripted demo in development, marked as such', async () => {
    const res = await post({ crops: [{ n: 1, image: JPEG }, { n: 2, image: JPEG }] }, { 'x-oi-provider': 'demo' });
    const { vehicles } = await res.json();
    expect(vehicles[0].model).toContain('(demo)');
  });
});

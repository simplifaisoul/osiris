import { describe, it, expect } from 'vitest';
import { cameraEvidence, cameraItem, type CameraDeps } from './forecast';
import type { FrameAnalysis } from './analysis';
import type { CatalogueCamera } from './frames';
import { camerasFor, parsePlan, planFallback } from '../oi/plan';
import { researchPrompt } from '../oi/prompts';
import { runEngine, type EngineDeps } from '../oi/engine';
import { createDemoChat } from '../oi/demo';
import { applyEvent, initialState, type RunState } from '../oi/state';
import type { ContextItem, OiEvent } from '../oi/types';

const cam = (id: string, km: number, over: Partial<CatalogueCamera> = {}): CatalogueCamera & { km: number } => ({
  id, name: `Cam ${id}`, city: 'Madrid', country: 'Spain', source: 'DGT', lat: 40.4, lng: -3.7, still: `https://cams.example/${id}.jpg`, page: 'https://cams.example/', km, ...over,
});

const analysis = (counts: FrameAnalysis['counts']): FrameAnalysis => ({ at: '2026-10-09T08:15:00.000Z', width: 640, height: 360, detections: [], counts, light: 'bright', motion: null, ms: 90 });

function deps(over: Partial<CameraDeps> = {}): CameraDeps & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    geocode: async place => (place === 'Nowhere' ? null : { lat: 40.4, lng: -3.7 }),
    near: async () => [cam('a', 0.4), cam('b', 1.2), cam('c', 3), cam('d', 5)],
    frame: async c => { asked.push(c.id); if (c.id === 'a') throw new Error('offline'); return { bytes: Buffer.from([1]), type: 'image/jpeg', at: '2026-10-09T08:15:00.000Z' }; },
    analyse: async () => analysis({ car: 31, truck: 2 }),
    ...over,
  };
}

describe('planning cameras', () => {
  it('asks for them only when a camera could show what the question turns on', () => {
    expect(camerasFor('Will traffic into Madrid be gridlocked on Friday?')).toEqual(['Madrid']);
    expect(camerasFor('Will the protests in Tbilisi grow this week?')).toEqual(['Tbilisi']);
    expect(camerasFor('Will Bitcoin trade above $100,000 in 2027?')).toEqual([]);
    expect(planFallback('Will Lisbon see snow this winter?').cameras).toEqual(['Lisbon']);
  });

  it("takes the model's answer, even when it is none, and falls back only when it said nothing", () => {
    const q = 'Will traffic in Madrid be heavy tomorrow?';
    expect(parsePlan({ cameras: ['Madrid', 'Valencia', 'Bilbao'] }, q).cameras).toEqual(['Madrid', 'Valencia']);
    expect(parsePlan({ cameras: [] }, q).cameras).toEqual([]);
    expect(parsePlan({ news: ['madrid traffic'] }, q).cameras).toEqual(['Madrid']);
  });

  it('is part of the research prompt', () => {
    expect(researchPrompt('q', '', '2026-10-09')).toContain('"cameras": []');
  });
});

describe('cameraEvidence', () => {
  it('counts the nearest cameras that answer, two a place, and passes over the ones that do not', async () => {
    const d = deps();
    const items = await cameraEvidence(['Madrid'], undefined, d);
    expect(d.asked).toEqual(['a', 'b', 'c']);
    expect(items.map(i => i.id)).toEqual(['v1', 'v2']);
    expect(items[0]).toMatchObject({ kind: 'camera', title: 'Live camera: Cam b', source: 'DGT', url: 'https://cams.example/', place: 'Madrid, Spain' });
  });

  it('looks at four cameras at most, and skips a place it cannot find', async () => {
    const items = await cameraEvidence(['Madrid', 'Nowhere', 'Seville'], undefined, deps({ near: async () => [cam('x', 1), cam('y', 2), cam('z', 3)] }));
    expect(items).toHaveLength(2);
    const two = await cameraEvidence(['Madrid', 'Seville'], undefined, deps({ near: async (lat) => (lat ? [cam(`p${Math.random()}`, 1), cam(`q${Math.random()}`, 2), cam(`r${Math.random()}`, 3)] : []) }));
    expect(two).toHaveLength(4);
  });

  it('words what it saw as a dated source, honest about the counts', () => {
    const item = cameraItem(cam('b', 1.2), analysis({ car: 31, truck: 2 }), 'Madrid', 'v1');
    expect(item.excerpt).toBe("At 2026-10-09 08:15 UTC this camera, 1.2 km from Madrid, showed 31 cars, 2 trucks in view, well lit. Counted by OSIRIS's built-in detector, which misses small, distant or hidden objects, so the counts are a floor.");
    expect(item.published).toBe('2026-10-09T08:15:00.000Z');
  });

  it('does not let nothing counted read as an empty road', () => {
    const item = cameraItem(cam('b', 1.2), analysis({}), 'Madrid', 'v1');
    expect(item.excerpt).toContain('showed nothing the detector could count: an empty scene, a camera showing a placeholder card, or a picture too dark or distant to read');
  });
});

describe('a forecast that looks through cameras', () => {
  const run = async (question: string) => {
    const events: OiEvent[] = [];
    let asked: string[] | null = null;
    const seen: ContextItem = cameraItem(cam('b', 1.2), analysis({ car: 31 }), 'Madrid', 'v1');
    const d: EngineDeps = {
      chat: createDemoChat(), concurrency: 3, emit: e => events.push(e), signal: new AbortController().signal,
      takeInjects: () => [], gather: async () => [], research: async () => ({ items: [], series: [] }), today: '2026-10-09',
      cameras: async places => { asked = places; return [seen]; },
    };
    await runEngine({ question, seed: '', depth: 'quick', useFeeds: true }, d);
    const state = events.reduce((s, e, seq) => applyEvent(s, { ...e, seq, at: seq } as never), initialState()) as RunState;
    return { asked, state };
  };

  it('looks when the question is about traffic, and cites what it saw', async () => {
    const { asked, state } = await run('Will traffic into Madrid be gridlocked on Friday?');
    expect(asked).toEqual(['Madrid']);
    expect(state.context.find(c => c.id === 'v1')?.kind).toBe('camera');
    expect(state.report?.answer).toBeTruthy();
  });

  it('does not look when cameras cannot help', async () => {
    const { asked } = await run('Will Bitcoin trade above $100,000 in 2027?');
    expect(asked).toBeNull();
  });
});

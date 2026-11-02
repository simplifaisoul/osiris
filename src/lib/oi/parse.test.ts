import { describe, it, expect } from 'vitest';
import { extractJson, locate, parseCast, parseMove, parseReport, parseWorld, prob, slug, spreadDuplicates, text } from './parse';
import type { ContextItem } from './types';

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('digs the object out of fences, prose and thinking', () => {
    expect(extractJson('Sure! Here it is:\n```json\n{"a": {"b": "}"}}\n```\nHope that helps')).toEqual({ a: { b: '}' } });
    expect(extractJson('<think>maybe {"x": 1}</think>{"y": 2}')).toEqual({ y: 2 });
  });

  it('forgives trailing commas', () => {
    expect(extractJson('{"a": [1, 2,], "b": 3,}')).toEqual({ a: [1, 2], b: 3 });
  });

  it('throws when there is no object', () => {
    expect(() => extractJson('no idea')).toThrow();
    expect(() => extractJson('[1,2]')).toThrow();
    expect(() => extractJson('{"a": ')).toThrow();
  });
});

describe('values', () => {
  it('reads probabilities however they are written, and never says certain', () => {
    expect(prob(0.45, 0.5)).toBe(0.45);
    expect(prob('45%', 0.5)).toBe(0.45);
    expect(prob(45, 0.5)).toBe(0.45);
    expect(prob(1, 0.5)).toBe(0.99);
    expect(prob(0, 0.5)).toBe(0.01);
    expect(prob('lots', 0.5)).toBe(0.5);
    expect(prob(250, 0.5)).toBe(0.99);
  });

  it('flattens text and caps it', () => {
    expect(text('  a\n\tb  ', 10)).toBe('a b');
    expect(text('abcdefghij', 5)).toBe('abcd…');
    expect(text({ evil: true }, 10, 'x')).toBe('x');
    expect(text('a\u0000b‮c', 10)).toBe('a b c');
  });

  it('makes safe ids', () => {
    expect(slug('Ministry of Defence!', 'x')).toBe('ministry_of_defence');
    expect(slug('<script>', 'x')).toBe('script');
    expect(slug('???', 'fallback')).toBe('fallback');
  });
});

describe('locate', () => {
  it('takes a valid point', () => {
    expect(locate({ place: 'Kyiv', lat: 50.45, lng: 30.52 })).toEqual({ place: 'Kyiv', lat: 50.45, lng: 30.52 });
  });

  it('treats (0, 0) and nonsense as missing, falling back to the country', () => {
    expect(locate({ lat: 0, lng: 0, country: 'fr' })).toEqual({ place: '', lat: 46, lng: 2 });
    expect(locate({ lat: 'north', lng: 999, country: 'DE' })).toMatchObject({ lat: 51, lng: 10 });
    expect(locate({ lat: 0, lng: 0 })).toEqual({ place: '', lat: null, lng: null });
  });

  it('fans out nodes that share a spot', () => {
    const nodes = spreadDuplicates([
      { place: 'a', lat: 38.9, lng: -77 }, { place: 'b', lat: 38.9, lng: -77 }, { place: 'c', lat: 10, lng: 10 }, { place: 'd', lat: null, lng: null },
    ]);
    expect(nodes[0]).not.toEqual(nodes[1]);
    expect(Math.abs(nodes[0].lat! - 38.9)).toBeLessThan(1);
    expect(nodes[2]).toEqual({ place: 'c', lat: 10, lng: 10 });
    expect(nodes[3].lat).toBeNull();
  });
});

const CONTEXT: ContextItem[] = [
  { id: 'c1', kind: 'news', title: 't', source: 's', published: '', place: '', lat: null, lng: null },
];

describe('parseWorld', () => {
  const raw = {
    proposition: 'X happens by year end',
    horizon: '2026-12-31',
    base_rate: '30%',
    actors: [
      { id: 'usa', name: 'United States', kind: 'state', lat: 38.9, lng: -77, lean: 3 },
      { id: 'usa', name: 'US Congress', kind: 'nonsense', country: 'US' },
      { name: '' },
      { id: 'cn', name: 'China', kind: 'state', country: 'CN' },
    ],
    relations: [
      { from: 'usa', to: 'cn', kind: 'rivalry', strength: 2 },
      { from: 'cn', to: 'usa', kind: 'trade' },
      { from: 'usa', to: 'ghost', kind: 'alliance' },
      { from: 'usa', to: 'usa', kind: 'alliance' },
    ],
    evidence: [{ source: 'c1', actor: 'cn', effect: 'no' }, { source: 'c9', actor: 'cn' }],
  };

  it('keeps what is usable and drops the rest', () => {
    const w = parseWorld(raw, 'Will X happen?', CONTEXT);
    expect(w.frame).toMatchObject({ question: 'Will X happen?', proposition: 'X happens by year end', horizon: '2026-12-31', baseRate: 0.3 });
    expect(w.actors.map(a => a.id)).toEqual(['usa', 'usa_1', 'cn']);
    expect(w.actors[0].lean).toBe(1);
    expect(w.actors[1].kind).toBe('group');
    expect(w.actors[2]).toMatchObject({ lat: 35, lng: 105 });
    const rel = w.links.filter(l => l.kind === 'relation');
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({ from: 'a:usa', to: 'a:cn', tone: 'oppose', strength: 1 });
    expect(w.links.filter(l => l.kind === 'evidence')).toEqual([expect.objectContaining({ from: 'c:c1', to: 'a:cn', tone: 'oppose' })]);
  });

  it('survives an empty reply', () => {
    const w = parseWorld({}, 'Will X happen?', []);
    expect(w.frame.proposition).toBe('Will X happen?');
    expect(w.frame.baseRate).toBe(0.5);
    expect(w.actors).toEqual([]);
  });
});

describe('the cast and its moves', () => {
  const actors = new Set(['usa', 'china', 'eu']);

  it('casts only actors the world model named, once each, up to the count', () => {
    const cast = parseCast({ cast: [
      { id: 'USA', goal: 'Win', levers: ['Sanction', '', 'Sign'], red_lines: 'No retreat', style: 'Bold' },
      { id: 'mars', goal: 'Invade' },
      { id: 'usa', goal: 'Again' },
      { id: 'china' },
      { id: 'eu' },
    ] }, 2, actors);
    expect(cast.map(c => c.id)).toEqual(['usa', 'china']);
    expect(cast[0].persona).toEqual({ goal: 'Win', levers: ['Sanction', 'Sign'], redLines: 'No retreat', style: 'Bold' });
    expect(cast[1].persona.goal).toBe('Advance its own interests');
  });

  it('reads a move: targets only other known actors, a stance, and which way it pushes', () => {
    const move = parseMove({
      action: 'Imposes tariffs', statement: 'Fair trade now', targets: ['china', 'usa', 'mars', 'china'], stance: 'PRESSURE', effect: 'down', why: 'Leverage',
    }, 'usa', 'B', 2, actors);
    expect(move).toMatchObject({ id: 'B:usa:2', world: 'B', period: 2, actor: 'usa', targets: ['china'], stance: 'pressure', push: 'no', why: 'Leverage', cites: [] });
  });

  it('holds when it aims at no one, and asks again when the reply names no action', () => {
    expect(parseMove({ action: 'Waits' }, 'eu', 'A', 1, actors)).toMatchObject({ stance: 'hold', push: 'neutral', targets: [] });
    expect(() => parseMove({ statement: 'Hm' }, 'eu', 'A', 1, actors)).toThrow();
  });
});

describe('parseReport', () => {
  it('normalises scenarios to add up, and falls back to the simulation', () => {
    const r = parseReport({ scenarios: [{ name: 'A', probability: 0.6 }, { name: 'B', probability: 0.6 }], drivers: [{ text: 'd', actor: 'ghost' }] }, { probability: 0.42 }, new Set(['usa']));
    expect(r.probability).toBe(0.42);
    expect(r.swarm).toBe(0.42);
    expect(r.scenarios.map(s => s.probability)).toEqual([0.5, 0.5]);
    expect(r.drivers[0].actor).toBeNull();
    expect(r.confidence).toBe('medium');
  });
});

describe('the story in the report', () => {
  it('keeps the path in date order, and only known actors and worlds', () => {
    const r = parseReport({
      path: [{ date: '2026-12-01', title: 'Deal signed', actors: ['usa', 'ghost'] }, { date: '2026-10-15', title: 'Talks resume' }, { title: '' }],
      actor_moves: [{ actor: 'usa', prediction: 'Signs late' }, { actor: 'ghost', prediction: 'Boo' }],
      worlds: [{ world: 'World A', outcome: 'Signed', summary: 'Fast' }, { world: 'Z', outcome: 'Nope' }],
    }, { probability: 0.5 }, new Set(['usa']), undefined, undefined, new Set(['A', 'B']));
    expect(r.path.map(p => [p.date, p.title, p.actors])).toEqual([['2026-10-15', 'Talks resume', []], ['2026-12-01', 'Deal signed', ['usa']]]);
    expect(r.actorMoves).toEqual([{ actor: 'usa', prediction: 'Signs late' }]);
    expect(r.worlds).toEqual([{ world: 'A', outcome: 'Signed', summary: 'Fast' }]);
  });
});

import { describe, it, expect } from 'vitest';
import { brief, moveFor, nodeName, relatedLinks, resolve } from './research';
import { initialState, type RunState } from './state';
import type { Link, Move } from './types';

const link = (over: Partial<Link>): Link => ({ id: 'l', from: 'a:usa', to: 'a:cn', kind: 'relation', tone: 'oppose', strength: 0.8, label: 'trade war', round: 0, ...over });
const move = (over: Partial<Move>): Move => ({
  id: 'A:usa:1', world: 'A', period: 1, actor: 'usa', action: 'Raises tariffs', statement: '', targets: ['cn'], stance: 'pressure', push: 'no', why: '', ...over,
});

const s: RunState = {
  ...initialState(),
  frame: { question: 'q', kind: 'binary', proposition: 'p', resolution: '', horizon: '', outcomes: [], unit: '', baseRate: 0.3, prior: [], anchor: null, baseRateReason: '', focus: null },
  actors: [
    { id: 'usa', name: 'United States', kind: 'state', role: 'Sets tariffs', lean: 0.2, place: '', lat: 38, lng: -77, persona: { goal: 'Win the trade war', levers: ['Tariffs'], redLines: '', style: '' } },
    { id: 'cn', name: 'China', kind: 'state', role: 'Responds', lean: -0.3, place: '', lat: 39, lng: 116 },
  ],
  context: [{ id: 'c1', kind: 'news', title: 'Tariff talks stall', source: 'Wire', published: '', place: 'Geneva', lat: 46, lng: 6 }],
  worlds: ['A', 'B'],
  links: [
    link({ id: 'rel:cn|usa' }),
    link({ id: 'ev:c1:cn:0', from: 'c:c1', to: 'a:cn', kind: 'evidence', tone: 'oppose', label: 'talks stalled' }),
    link({ id: 'mv:A:usa:cn', from: 'a:usa', to: 'a:cn', kind: 'move', tone: 'oppose', round: 2, label: 'Doubles the tariffs' }),
    link({ id: 'qt:A:usa:c1:1', from: 'a:usa', to: 'c:c1', kind: 'cite', tone: 'neutral', round: 1, label: 'talks stall' }),
  ],
  moves: [move({}), move({ id: 'A:usa:2', period: 2, action: 'Doubles the tariffs' }), move({ id: 'B:usa:2', world: 'B', period: 2, action: 'Offers a truce' })],
  events: [{ id: 'A:2:1', world: 'A', period: 2, date: '2026-11-04', title: 'Talks collapse in Geneva', detail: '', actors: ['usa', 'cn'], push: 'no', kind: 'event', place: 'Geneva', lat: 46, lng: 6 }],
  points: [{ world: 'A', period: 2, probability: 0.2, resolved: null, note: 'Positions harden.' }],
};

describe('resolving a click', () => {
  it('finds arcs, points, events and worlds by key, and nothing for a stale key', () => {
    expect(resolve(s, 'link:rel:cn|usa')?.type).toBe('link');
    expect(resolve(s, 'a:usa')?.type).toBe('actor');
    expect(resolve(s, 'c:c1')?.type).toBe('context');
    expect(resolve(s, 'e:A:2:1')?.type).toBe('event');
    expect(resolve(s, 'w:B')?.type).toBe('world');
    expect(resolve(s, 'w:Z')).toBeNull();
    expect(resolve(s, 'a:mars')).toBeNull();
    expect(resolve(s, 's:0')).toBeNull();
    expect(resolve(s, null)).toBeNull();
  });

  it('lights the arc itself, or every arc touching a point', () => {
    expect([...relatedLinks(s, 'link:rel:cn|usa')]).toEqual(['rel:cn|usa']);
    expect(relatedLinks(s, 'a:cn')).toEqual(new Set(['rel:cn|usa', 'ev:c1:cn:0', 'mv:A:usa:cn']));
  });

  it('finds the move an arc or a quote was drawn from, in its own world', () => {
    expect(moveFor(s, s.links[2])?.id).toBe('A:usa:2');
    expect(moveFor(s, s.links[3])?.id).toBe('A:usa:1');
    expect(moveFor(s, s.links[0])).toBeUndefined();
    expect(nodeName(s, 'c:c1')).toBe('Tariff talks stall');
    expect(nodeName(s, 'w:A')).toBe('World A');
  });

  it('says in two lines what an arc or point is', () => {
    expect(brief(s, 'link:rel:cn|usa')).toEqual({ title: 'United States ⇄ China', detail: 'opposed · trade war' });
    expect(brief(s, 'link:ev:c1:cn:0')).toEqual({ title: 'Tariff talks stall', detail: 'points toward NO: China' });
    expect(brief(s, 'link:mv:A:usa:cn')).toEqual({ title: 'United States presses China', detail: 'World A, period 2 · Doubles the tariffs' });
    expect(brief(s, 'a:usa')?.detail).toBe('Plays to: Win the trade war');
    expect(brief(s, 'e:A:2:1')).toEqual({ title: 'Talks collapse in Geneva', detail: 'World A · 2026-11-04' });
    expect(brief(s, 'w:A')).toEqual({ title: 'World A', detail: 'Positions harden.' });
  });
});

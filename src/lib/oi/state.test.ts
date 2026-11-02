import { describe, it, expect } from 'vitest';
import { applyEvent, castOf, currentProbability, initialState, latestPoints } from './state';
import type { Link, OiEvent, Stamped } from './types';

const stamp = (e: OiEvent, seq: number): Stamped => ({ ...e, seq, at: 1000 + seq } as Stamped);

const link = (id: string, tone: Link['tone']): Link => ({ id, from: 'a:a', to: 'a:b', kind: 'move', tone, strength: 0.5, label: '', round: 1 });

describe('applyEvent', () => {
  it('ignores an event it has already seen', () => {
    const s1 = applyEvent(initialState(), stamp({ t: 'warn', message: 'once' }, 0));
    expect(applyEvent(s1, stamp({ t: 'warn', message: 'once' }, 0))).toBe(s1);
  });

  it('redraws a link that comes again, as the newest', () => {
    let s = initialState();
    s = applyEvent(s, stamp({ t: 'link', link: link('mv:A:a:b', 'support') }, 0));
    s = applyEvent(s, stamp({ t: 'link', link: link('x', 'neutral') }, 1));
    s = applyEvent(s, stamp({ t: 'link', link: link('mv:A:a:b', 'oppose') }, 2));
    expect(s.links.map(l => [l.id, l.tone])).toEqual([['x', 'neutral'], ['mv:A:a:b', 'oppose']]);
  });

  it('tracks which actor is deciding in which world until it moves or the period closes', () => {
    let s = initialState();
    s = applyEvent(s, stamp({ t: 'thinking', world: 'A', actor: 'a', period: 1 }, 0));
    s = applyEvent(s, stamp({ t: 'thinking', world: 'B', actor: 'a', period: 1 }, 1));
    s = applyEvent(s, stamp({ t: 'move', move: { id: 'A:a:1', world: 'A', period: 1, actor: 'a', action: 'Waits', statement: '', targets: [], stance: 'hold', push: 'neutral', why: '' } }, 2));
    expect(Object.keys(s.thinking)).toEqual(['B:a']);
    s = applyEvent(s, stamp({ t: 'round', stat: { round: 1, consensus: 0.4, median: 0.4, mean: 0.4, p25: 0.4, p75: 0.4, min: 0.4, max: 0.4, spread: 0, n: 2, histogram: [] } }, 3));
    expect(s.thinking).toEqual({});
    expect(currentProbability(s)).toBe(0.4);
  });

  it('gives the cast their personas, sets the clock, and keeps the latest standing of each world', () => {
    let s = initialState();
    s = applyEvent(s, stamp({ t: 'actor', actor: { id: 'a', name: 'A', kind: 'state', role: '', lean: 0, place: '', lat: null, lng: null } }, 0));
    s = applyEvent(s, stamp({ t: 'actor', actor: { id: 'b', name: 'B', kind: 'state', role: '', lean: 0, place: '', lat: null, lng: null } }, 1));
    s = applyEvent(s, stamp({ t: 'cast', actor: 'b', persona: { goal: 'Win', levers: [], redLines: '', style: '' } }, 2));
    s = applyEvent(s, stamp({ t: 'clock', periods: [{ index: 1, label: 'Oct', start: '2026-10-01', end: '2026-10-31' }], worlds: ['A', 'B'] }, 3));
    s = applyEvent(s, stamp({ t: 'point', point: { world: 'A', period: 1, probability: 0.3, resolved: null, note: '' } }, 4));
    s = applyEvent(s, stamp({ t: 'point', point: { world: 'A', period: 2, probability: 0.5, resolved: null, note: '' } }, 5));
    expect(castOf(s).map(a => a.id)).toEqual(['b']);
    expect(s.worlds).toEqual(['A', 'B']);
    expect(latestPoints(s).get('A')?.period).toBe(2);
  });

  it('ends', () => {
    const s = applyEvent(initialState(), stamp({ t: 'end', status: 'failed', message: 'nope' }, 0));
    expect(s).toMatchObject({ status: 'failed', message: 'nope' });
  });
});

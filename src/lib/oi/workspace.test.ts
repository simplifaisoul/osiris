import { describe, it, expect } from 'vitest';
import { applyEvent, initialState, type RunState } from './state';
import { formatDuration, progressOf, traceOf } from './trace';
import { mentions, objectsOf, searchObjects } from './objects';
import { rangeOf, timelineOf } from './timeline';
import type { Frame, Move, OiEvent, RoundStat, WorldPoint } from './types';

/** Folds events into a state the way the panel does, one second apart. */
function run(events: OiEvent[], t0 = 1_000_000): RunState {
  return events.reduce((s, e, i) => applyEvent(s, { ...e, seq: i, at: t0 + i * 1000 } as never), initialState());
}

const binary: Frame = { question: 'q', kind: 'binary', proposition: 'p', resolution: '', horizon: '', outcomes: [], unit: '', baseRate: 0.3, prior: [], anchor: null, baseRateReason: '', focus: null };
const move = (world: string, actor: string, period: number, over: Partial<Move> = {}): Move => ({
  id: `${world}:${actor}:${period}`, world, period, actor, action: 'Holds', statement: '', targets: [], stance: 'hold', push: 'neutral', why: '', ...over,
});
const point = (world: string, period: number, probability: number, over: Partial<WorldPoint> = {}): WorldPoint => ({ world, period, probability, resolved: null, note: '', ...over });

const stat = (round: number, consensus: number, lo: number, hi: number, n: number): RoundStat => ({
  round, consensus, median: consensus, mean: consensus, p25: lo, p75: hi, min: lo, max: hi, spread: hi - lo, n, histogram: Array(10).fill(0),
});

const persona = { goal: 'Win', levers: ['Talk'], redLines: '', style: '' };
const periods = [
  { index: 1, label: '1 Oct – 31 Oct 2026', start: '2026-10-01', end: '2026-10-31' },
  { index: 2, label: '1 Nov – 30 Nov 2026', start: '2026-11-01', end: '2026-11-30' },
];

const start: OiEvent = { t: 'start', question: 'Will it?', depth: 'quick', provider: 'demo', model: 'scripted', actors: 2, periods: 2, worlds: 2 };
const base: OiEvent[] = [
  start,
  { t: 'phase', phase: 'context', label: 'Researching the question' },
  { t: 'context', items: [{ id: 'c1', kind: 'news', title: 'Talks stall in Geneva', source: 'Wire', published: '', place: 'Geneva', lat: 46, lng: 6 }, { id: 'c2', kind: 'quake', title: 'M5 quake', source: 'USGS', published: '', place: '', lat: null, lng: null }] },
  { t: 'phase', phase: 'graph', label: 'Mapping actors and relations' },
  { t: 'frame', frame: binary },
  { t: 'actor', actor: { id: 'cn', name: 'China', kind: 'state', role: 'Responds', lean: -0.3, place: '', lat: 39, lng: 116 } },
  { t: 'actor', actor: { id: 'eu', name: 'European Union', kind: 'organisation', role: 'Mediates', lean: 0, place: '', lat: 50, lng: 4 } },
  { t: 'phase', phase: 'agents', label: 'Casting the actors who decide it' },
  { t: 'cast', actor: 'cn', persona },
  { t: 'cast', actor: 'eu', persona },
  { t: 'clock', periods, worlds: ['A', 'B'] },
  { t: 'phase', phase: 'simulate', label: '1 Oct – 31 Oct 2026: the actors move in 2 worlds' },
  { t: 'move', move: move('A', 'cn', 1, { cites: [{ source: 'c1', quote: 'Talks stall', exact: true, push: 'no' }] }) },
  { t: 'move', move: move('A', 'eu', 1) },
  { t: 'move', move: move('B', 'cn', 1) },
  { t: 'event', event: { id: 'A:1:1', world: 'A', period: 1, date: '2026-10-12', title: 'Talks resume in Geneva', detail: '', actors: ['cn', 'eu'], push: 'yes', kind: 'event', place: 'Geneva', lat: 46, lng: 6 } },
  { t: 'event', event: { id: 'B:1:1', world: 'B', period: 1, date: '2026-10-20', title: 'A tanker is seized', detail: '', actors: [], push: 'no', kind: 'shock', place: '', lat: null, lng: null } },
  { t: 'point', point: point('A', 1, 0.4) },
  { t: 'point', point: point('B', 1, 0.6) },
  { t: 'round', stat: stat(1, 0.5, 0.4, 0.6, 2) },
];

describe('the execution trace', () => {
  it('lists the whole plan, with what has run timed and what has not pending', () => {
    const steps = traceOf(run(base));
    expect(steps.map(st => st.id)).toEqual(['context', 'graph', 'agents', 'round:1', 'round:2', 'report']);
    expect(steps.map(st => st.title)).toEqual(['Research the question', 'Map the world', 'Cast the actors', 'Simulate · 1 Oct – 31 Oct 2026', 'Simulate · 1 Nov – 30 Nov 2026', 'Write the prediction']);
    expect(steps.map(st => st.status)).toEqual(['done', 'done', 'done', 'active', 'pending', 'pending']);
    expect(steps[0].end! - steps[0].start!).toBe(2000);
    expect(steps[3].end).toBeNull();
    expect(steps[0].metrics).toEqual([{ label: 'Sources', value: '2' }, { label: 'Live feed', value: '1' }, { label: 'Quakes', value: '1' }]);
    expect(steps[1].metrics).toContainEqual({ label: 'Base rate', value: '30%' });
    expect(steps[2].metrics).toEqual([{ label: 'Actors cast', value: '2 / 2' }, { label: 'Periods', value: '2' }, { label: 'Worlds', value: '2' }]);
    expect(steps[3].metrics).toEqual([
      { label: 'Moves', value: '3' }, { label: 'Events', value: '2' }, { label: 'Surprises', value: '1' },
      { label: 'Quotes', value: '1 · 1 verbatim' },
      { label: 'Worlds pooled', value: '50%' }, { label: 'Range', value: '40%–60%' },
    ]);
    expect(progressOf(steps)).toBeCloseTo(3.5 / 6);
  });

  it('closes the last step when the run ends, and marks what it never reached', () => {
    const steps = traceOf(run([...base, { t: 'end', status: 'cancelled', message: 'Stopped' }]));
    expect(steps.find(st => st.id === 'round:1')).toMatchObject({ status: 'failed', end: 1_000_000 + base.length * 1000 });
    expect(steps.filter(st => st.status === 'skipped').map(st => st.id)).toEqual(['round:2', 'report']);
  });

  it('says how long, in tenths of a second, then minutes', () => {
    expect(formatDuration(430)).toBe('0.4s');
    expect(formatDuration(12_340)).toBe('12.3s');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(-1)).toBe('—');
  });
});

describe('the run as objects', () => {
  const s = run(base);

  it('lists every object under its research key', () => {
    expect(objectsOf(s).map(o => `${o.type}:${o.key}`)).toEqual([
      'actor:a:cn', 'actor:a:eu', 'source:c:c1', 'source:c:c2', 'world:w:A', 'world:w:B', 'event:e:A:1:1', 'event:e:B:1:1',
    ]);
  });

  it('finds objects by name, best match first, ignoring case and accents', () => {
    expect(searchObjects(s, 'eu').map(o => o.key)).toEqual(['a:eu']);
    expect(searchObjects(s, 'union')[0].key).toBe('a:eu');
    expect(searchObjects(s, 'tanker')[0].key).toBe('e:B:1:1');
    expect(searchObjects(s, 'world b')[0].key).toBe('w:B');
    expect(searchObjects(s, '   ')).toEqual([]);
  });

  it('finds actors named in text, and sources by id, whole words only', () => {
    expect(mentions('China will wait; the European Union agrees. Chinatown is not China.', s)).toEqual([
      { key: 'a:cn', text: 'China' }, ' will wait; the ',
      { key: 'a:eu', text: 'European Union' }, ' agrees. Chinatown is not ', { key: 'a:cn', text: 'China' }, '.',
    ]);
    expect(mentions('nothing here', s)).toEqual(['nothing here']);
    expect(mentions('', s)).toEqual([]);
    expect(mentions('c1 moves me; ac1 does not.', s)).toEqual([{ key: 'c:c1', text: 'c1' }, ' moves me; ac1 does not.']);
  });
});

describe('the simulation over time', () => {
  it('gives each world a lane with where the question stood per period, how far it moved and what happened', () => {
    const s = run([...base,
      { t: 'phase', phase: 'simulate', label: '1 Nov – 30 Nov 2026: the actors move in 2 worlds' },
      { t: 'point', point: point('A', 2, 0.55) },
      { t: 'round', stat: stat(2, 0.55, 0.55, 0.55, 1) },
    ]);
    const tl = timelineOf(s);
    expect(tl.rounds).toEqual([1, 2]);
    expect(tl.periods.map(p => p.start)).toEqual(['2026-10-01', '2026-11-01']);
    const a = tl.lanes.find(l => l.key === 'w:A')!;
    expect(a.cells.map(c => c?.value)).toEqual([0.4, 0.55]);
    expect(a.cells[1]!.delta).toBeCloseTo(0.15);
    expect(a.drift).toBeCloseTo(0.15);
    expect(a.cells[0]!.events.map(e => e.title)).toEqual(['Talks resume in Geneva']);
    const b = tl.lanes.find(l => l.key === 'w:B')!;
    expect(b.cells[1]).toBeNull();
    expect(b.drift).toBeNull();
    expect(tl.pooled.map(p => p?.label)).toEqual(['50%', '55%']);
    expect(tl.reference).toEqual({ value: 0.3, label: 'Base rate 30%' });
    expect(tl.ends).toEqual(['NO', 'YES']);
  });

  it('puts a number question on one scale across every world, the report and today', () => {
    const number: Frame = { ...binary, kind: 'number', unit: 'USD', anchor: 80 };
    const s = run([start, { t: 'frame', frame: number }, { t: 'clock', periods, worlds: ['A'] },
      { t: 'point', point: point('A', 1, 0.5, { value: 70 }) },
      { t: 'point', point: point('A', 2, 0.5, { value: 90 }) },
    ]);
    expect(rangeOf(s)).toEqual([70, 90]);
    const tl = timelineOf(s);
    expect(tl.lanes[0].cells.map(c => c?.value)).toEqual([0, 1]);
    expect(tl.reference?.value).toBeCloseTo(0.5);
    expect(rangeOf(initialState())).toEqual([0, 1]);
  });
});

describe('the workspace geometry', () => {
  it('grows its columns with the screen, within limits, and centres the globe between them', async () => {
    const { workspaceLayout, workspaceInsets } = await import('./layout');
    expect(workspaceLayout(1280)).toMatchObject({ left: 320, right: 360 });
    expect(workspaceLayout(1440)).toMatchObject({ left: 346, right: 389 });
    expect(workspaceLayout(2560)).toMatchObject({ left: 392, right: 440 });
    expect(workspaceLayout(NaN).left).toBe(346);
    expect(workspaceInsets(1440)).toEqual({ top: 76, bottom: 24, left: 378, right: 421 });
    expect(workspaceInsets(1440, false)).toEqual({ top: 76, bottom: 24, left: 378, right: 16 });
  });
});

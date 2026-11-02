import { describe, it, expect } from 'vitest';
import { activityCentre, beatOf, centreOf, frame, frameRun, shotFor, zoomForSpread } from './camera';
import { initialState, type RunState } from './state';
import type { Actor, Link } from './types';

const actor = (id: string, lng: number, lat: number): Actor => ({ id, name: id, kind: 'state', role: '', lean: 0, place: '', lat, lng });
/** An actor cast to play. */
const player = (id: string, lng: number, lat: number): Actor => ({ ...actor(id, lng, lat), persona: { goal: 'Win', levers: [], redLines: '', style: '' } });

function run(over: Partial<RunState>): RunState {
  return { ...initialState(), periodsPlanned: 3, ...over };
}

describe('framing', () => {
  it('centres between points either side of the date line', () => {
    const [lng, lat] = centreOf([[179, 0], [-179, 0]])!;
    expect(Math.abs(Math.abs(lng) - 180)).toBeLessThan(0.01);
    expect(lat).toBeCloseTo(0, 5);
  });

  it('steps back for a wide spread and for a narrow view', () => {
    expect(zoomForSpread(9000)).toBeLessThan(zoomForSpread(500));
    const wide = frame([[0, 0], [10, 0]], 1280)!;
    const narrow = frame([[0, 0], [10, 0]], 400)!;
    expect(narrow.zoom).toBeLessThan(wide.zoom);
  });

  it('frames a run by its actors, else its focus, else nothing', () => {
    expect(frameRun(run({ actors: [actor('a', 0, 50), actor('b', 20, 50)] }))?.lng).toBeCloseTo(10, 0);
    expect(frameRun(run({ frame: { focus: { place: 'Geneva', lat: 46.2, lng: 6.1 } } as RunState['frame'] }))).toMatchObject({ lat: 46.2, lng: 6.1 });
    expect(frameRun(run({}))).toBeNull();
  });
});

describe('the beats of a run', () => {
  const actors = [actor('a', 0, 50), actor('b', 30, 40), actor('x', -70, 40), actor('y', 100, 30)];
  const cast = [actor('a', 0, 50), actor('b', 30, 40), player('x', -70, 40), player('y', 100, 30)];

  it('moves from the world to the cast to the periods to the report', () => {
    expect(beatOf(run({}))).toBeNull();
    expect(beatOf(run({ actors }))).toBe('world');
    expect(beatOf(run({ actors: cast }))).toBe('panel');
    expect(beatOf(run({ actors: cast, phase: 'simulate' }))).toBe('round:1');
    expect(beatOf(run({ actors: cast, phase: 'simulate', rounds: [{ round: 1 } as RunState['rounds'][number]] }))).toBe('round:2');
    expect(beatOf(run({ actors: cast, report: {} as RunState['report'] }))).toBe('report');
  });

  it('tilts further and swings the bearing as the run goes on', () => {
    const s = run({ actors: cast });
    const world = shotFor(s, 'world', 0)!;
    const panel = shotFor(s, 'panel', world.bearing)!;
    const r1 = shotFor(s, 'round:1', panel.bearing)!;
    const r2 = shotFor(s, 'round:2', r1.bearing)!;
    expect(world.pitch).toBeLessThan(panel.pitch);
    expect(panel.pitch).toBeLessThan(r1.pitch);
    expect(r1.bearing).not.toBe(panel.bearing);
    expect(Math.sign(r2.bearing - r1.bearing)).not.toBe(Math.sign(r1.bearing - panel.bearing));
    // The cast shot steps back a little to take the players in.
    expect(panel.zoom).toBeLessThan(world.zoom);
  });

  it('closes in on where the prediction plays out', () => {
    const s = run({
      actors: cast,
      frame: { focus: { place: 'Geneva', lat: 46.2, lng: 6.1 } } as RunState['frame'],
      report: { scenarios: [] } as unknown as RunState['report'],
    });
    const shot = shotFor(s, 'report', 0)!;
    expect(shot.lat).toBeCloseTo(46.2, 0);
    expect(shot.pitch).toBeGreaterThanOrEqual(45);
  });
});

describe('where the action is', () => {
  it('needs enough moves in a period to say', () => {
    const link = (id: string, from: string, to: string): Link => ({ id, from, to, kind: 'move', tone: 'support', strength: 0.5, label: '', round: 2 });
    const s = run({
      actors: [player('x', 10, 10), player('y', 12, 12), player('z', 14, 14)],
      links: [link('1', 'a:x', 'a:y'), link('2', 'a:y', 'a:z')],
    });
    expect(activityCentre(s, 2)).toBeNull();
    const busier = { ...s, links: [...s.links, link('3', 'a:z', 'a:x')] };
    const c = activityCentre(busier, 2)!;
    expect(c[0]).toBeGreaterThan(10);
    expect(c[0]).toBeLessThan(14);
    expect(activityCentre(busier, 1)).toBeNull();
  });
});

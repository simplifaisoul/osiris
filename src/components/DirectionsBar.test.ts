import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatDuration,
  viaRoad,
  arrivalTime,
  segmentBetween,
  type RouteStep,
} from './DirectionsBar';

const step = (instruction: string, distance: number): RouteStep => ({
  instruction, distance, duration: 0, location: [0, 0], type: 'turn',
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(17)).toBe('17 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('switches to kilometres, dropping the decimal past 10 km', () => {
    expect(formatDistance(2800)).toBe('2.8 km');
    expect(formatDistance(43200)).toBe('43 km');
  });
});

describe('formatDuration', () => {
  it('renders minutes, and never rounds a real route down to zero', () => {
    expect(formatDuration(420)).toBe('7 min');
    expect(formatDuration(5)).toBe('1 min');
  });

  it('renders hours with and without a minute remainder', () => {
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(32760)).toBe('9 hr 6 min');
  });
});

describe('viaRoad', () => {
  it('picks the road carrying the most distance', () => {
    expect(viaRoad([
      step('Drive south on Pariser Platz.', 17),
      step('Turn left to stay on Pariser Platz.', 2600),
      step('Turn right onto Alexanderstraße/B 2/B 5.', 152),
    ])).toBe('Pariser Platz');
  });

  it('reads a road out of either "onto" or "on" phrasing', () => {
    expect(viaRoad([step('Turn right onto Quai des Tuileries.', 1600)])).toBe('Quai des Tuileries');
    expect(viaRoad([step('Drive northeast on Quai Jacques Chirac.', 2000)])).toBe('Quai Jacques Chirac');
  });

  it('ignores generic walkway phrasing and instructions with no road', () => {
    expect(viaRoad([step('Keep left to take the walkway.', 900)])).toBeNull();
    expect(viaRoad([step('Turn right.', 24), step('You have arrived.', 0)])).toBeNull();
    expect(viaRoad([])).toBeNull();
  });
});

describe('arrivalTime', () => {
  it('adds the trip duration to the clock', () => {
    const at = arrivalTime(30 * 60, new Date('2026-01-01T12:00:00'));
    expect(at).toMatch(/12:30|00:30/); // locale may render 12h or 24h
  });

  it('rolls past midnight', () => {
    const at = arrivalTime(2 * 3600, new Date('2026-01-01T23:00:00'));
    expect(at).toMatch(/01:00|1:00/);
  });
});

describe('segmentBetween', () => {
  const line: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];

  it('slices the stretch a step covers', () => {
    expect(segmentBetween(line, [1, 1], [3, 3])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it('runs to the end of the route for the final step', () => {
    expect(segmentBetween(line, [3, 3])).toEqual([[3, 3], [4, 4]]);
  });

  it('snaps to the nearest vertex when a step is slightly off the line', () => {
    expect(segmentBetween(line, [1.02, 0.98], [2.01, 2.02])).toEqual([[1, 1], [2, 2]]);
  });

  it('copes with the endpoints arriving reversed', () => {
    expect(segmentBetween(line, [3, 3], [1, 1])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });
});

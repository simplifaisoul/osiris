import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatDuration,
  viaRoad,
  shortLabel,
  isCoordLabel,
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

describe('isCoordLabel / shortLabel', () => {
  it('recognises a lat,lng label', () => {
    expect(isCoordLabel('52.51630, 13.37770')).toBe(true);
    expect(isCoordLabel('-33.86, 151.21')).toBe(true);
    expect(isCoordLabel('Pariser Platz, Berlin')).toBe(false);
  });

  // Regression: splitting a coordinate on its comma rendered it as two lines
  // ("52.51630" over "13.37770"), which read as a mangled address.
  it('never splits a coordinate label', () => {
    expect(shortLabel('52.51630, 13.37770')).toBe('52.51630, 13.37770');
  });

  it('trims a long display_name to its two leading parts', () => {
    expect(shortLabel('Brandenburger Tor, 1, Pariser Platz, Mitte, Berlin, 10117, Germany'))
      .toBe('Brandenburger Tor, 1');
    expect(shortLabel('Alexanderplatz, Berlin')).toBe('Alexanderplatz, Berlin');
    expect(shortLabel('Berlin')).toBe('Berlin');
  });
});

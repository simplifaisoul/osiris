import { describe, it, expect } from 'vitest';
import { toFeet, formatAlt, type AircraftDetail } from './FlightWatchPanel';

const detail = (over: Partial<AircraftDetail>): AircraftDetail => ({
  icao24: 'a0e250',
  registration: 'N123AA',
  typeCode: 'B738',
  model: 'BOEING 737-800',
  operator: 'American Airlines',
  track: [[-83.35, 42.21], [-81.5, 33.0]],
  points: 2,
  ...over,
});

describe('toFeet / formatAlt', () => {
  it('converts metres to feet, rounded to the nearest 25', () => {
    expect(toFeet(10000)).toBe(32800);
    expect(toFeet(1)).toBe(0);
  });

  it('says Ground rather than an altitude when the aircraft is on it', () => {
    expect(formatAlt(0, true)).toBe('Ground');
  });

  it('falls back for a missing or unusable altitude', () => {
    expect(formatAlt(undefined)).toBe('—');
    expect(formatAlt(NaN)).toBe('—');
  });
});

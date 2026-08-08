import { describe, it, expect } from 'vitest';
import { toFeet, formatAlt } from './FlightWatchPanel';

describe('toFeet', () => {
  // The feed reports metres; aviation reads feet, rounded to the nearest 25.
  it('converts metres to feet at a 25 ft granularity', () => {
    expect(toFeet(0)).toBe(0);
    expect(toFeet(1000)).toBe(3275);
    expect(toFeet(10668)).toBe(35000);
  });
});

describe('formatAlt', () => {
  it('renders thousands separated', () => {
    expect(formatAlt(10668)).toBe('35,000 ft');
  });

  it('says Ground rather than an altitude when the aircraft is down', () => {
    expect(formatAlt(0, true)).toBe('Ground');
    expect(formatAlt(12, true)).toBe('Ground');
  });

  it('falls back to a dash when altitude is missing or unusable', () => {
    expect(formatAlt(undefined)).toBe('—');
    expect(formatAlt(NaN)).toBe('—');
  });
});

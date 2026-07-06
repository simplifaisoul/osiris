import { describe, it, expect } from 'vitest';
import { jitteredCentroid } from './countryCentroids';

describe('jitteredCentroid', () => {
  it('returns a position near the known centroid for a recognized country code', () => {
    const pos = jitteredCentroid(0, 'US');
    expect(pos).not.toBeNull();
    expect(pos!.lng).toBeGreaterThan(-97 - 5);
    expect(pos!.lng).toBeLessThan(-97 + 5);
    expect(pos!.lat).toBeGreaterThan(38 - 5);
    expect(pos!.lat).toBeLessThan(38 + 5);
  });

  it('returns null for an unrecognized country code', () => {
    expect(jitteredCentroid(0, 'ZZ')).toBeNull();
  });

  it('returns null for an empty country code', () => {
    expect(jitteredCentroid(0, '')).toBeNull();
  });

  it('produces different positions for different ids in the same country', () => {
    const a = jitteredCentroid(1, 'US');
    const b = jitteredCentroid(2, 'US');
    expect(a).not.toEqual(b);
  });

  it('is case-insensitive on the country code', () => {
    const upper = jitteredCentroid(5, 'US');
    const lower = jitteredCentroid(5, 'us');
    expect(lower).toEqual(upper);
  });
});

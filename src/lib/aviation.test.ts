import { describe, it, expect } from 'vitest';
import { trackFeatures } from './aviation';

describe('trackFeatures', () => {
  it('returns one segment per report pair', () => {
    const out = trackFeatures([[0, 0], [1, 1], [2, 2]], [100, 200, 300]);
    expect(out).toHaveLength(2);
    expect(out[0].geometry.coordinates).toEqual([[0, 0], [1, 1]]);
    expect(out[1].geometry.coordinates).toEqual([[1, 1], [2, 2]]);
  });

  it('appends a closing segment to the icon coordinates', () => {
    const out = trackFeatures([[0, 0], [1, 1]], [100, 200], { lng: 3, lat: 3, alt: 500 });
    expect(out).toHaveLength(2);
    expect(out[1].geometry.coordinates).toEqual([[1, 1], [3, 3]]);
    expect(out[1].properties.alt).toBe(500);
  });

  it('skips a zero-length closing segment', () => {
    const out = trackFeatures([[0, 0], [1, 1]], [100, 200], { lng: 1, lat: 1, alt: 500 });
    expect(out).toHaveLength(1);
  });

  it('returns nothing for a single point without a final target', () => {
    expect(trackFeatures([[0, 0]], [100])).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { ARC_STRIDE, arcPeakM, distanceKm, packArcs, type ArcSpec } from './arcs';

describe('arcPeakM', () => {
  it('keeps the long arcs as they were', () => {
    expect(arcPeakM(1_000)).toBe(170_000);
    expect(arcPeakM(20_000)).toBe(1_400_000);
  });

  it('lifts a short arc at most a quarter of its span, not a 60 km spike', () => {
    // Two hosts in one city used to rise 60 km and read as a vertical line.
    expect(arcPeakM(5)).toBe(1_250);
    expect(arcPeakM(100)).toBe(25_000);
    expect(arcPeakM(0)).toBe(0);
  });
});

describe('packArcs', () => {
  const arc: ArcSpec = { from: [8.68, 50.11], to: [-0.13, 51.5], tone: 0, id: 0, highlight: 0, strength: 1, birth: 0, kind: 0 };

  it('carries the arc\'s full height on every vertex, for the shader to lower it as one', () => {
    const { vertices } = packArcs([arc], 4);
    const peak = arcPeakM(distanceKm(arc.from, arc.to));
    for (let v = 0; v < vertices.length / ARC_STRIDE; v++) {
      expect(vertices[v * ARC_STRIDE + ARC_STRIDE - 1]).toBeCloseTo(peak, -1);
    }
  });

  it('starts and ends on the ground, and peaks at that height', () => {
    const { vertices } = packArcs([arc], 4);
    const z = (point: number) => vertices[point * 2 * ARC_STRIDE + 2];
    expect(z(0)).toBe(0);
    expect(z(4)).toBeCloseTo(0, 0);
    expect(z(2)).toBeCloseTo(arcPeakM(distanceKm(arc.from, arc.to)), -1);
  });
});

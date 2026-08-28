import { describe, it, expect } from 'vitest';
import { scaleFor } from './ScaleBar';

const OTTAWA_LAT = 45.5268;

describe('scaleFor', () => {
  it('picks a round step that fits inside the 100px budget', () => {
    expect(scaleFor(3, OTTAWA_LAT)).toEqual({ barWidth: 73, label: '1000 km' });
    expect(scaleFor(10, OTTAWA_LAT)).toEqual({ barWidth: 93, label: '10 km' });
    expect(scaleFor(14, OTTAWA_LAT)).toEqual({ barWidth: 75, label: '500 m' });
  });

  it('stays narrow past zoom 16, where the step table used to run out', () => {
    expect(scaleFor(17.8, OTTAWA_LAT)).toEqual({ barWidth: 42, label: '20 m' });
    expect(scaleFor(22, OTTAWA_LAT)).toEqual({ barWidth: 76, label: '2 m' });
  });

  it('never stretches the bar beyond the bottom panel', () => {
    for (let zoom = 0; zoom <= 24; zoom += 0.2) {
      for (const latitude of [0, OTTAWA_LAT, 70]) {
        expect(scaleFor(zoom, latitude).barWidth).toBeLessThan(400);
      }
    }
  });

  it('labels sub-kilometre steps in whole metres', () => {
    for (let zoom = 13; zoom <= 24; zoom += 0.2) {
      expect(scaleFor(zoom, OTTAWA_LAT).label).toMatch(/^\d+ (m|km)$/);
    }
  });
});

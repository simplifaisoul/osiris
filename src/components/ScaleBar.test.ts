import { describe, it, expect } from 'vitest';
import { scaleFor } from './ScaleBar';

const OTTAWA_LAT = 45.5268;

describe('scaleFor', () => {
  it('picks a round step that fits inside the 100px budget', () => {
    expect(scaleFor(3, OTTAWA_LAT)).toEqual({ barWidth: 73, label: '500 km' });
    expect(scaleFor(10, OTTAWA_LAT)).toEqual({ barWidth: 93, label: '5 km' });
    expect(scaleFor(14, OTTAWA_LAT)).toEqual({ barWidth: 60, label: '200 m' });
  });

  it('stays narrow past zoom 16, where the step table used to run out', () => {
    expect(scaleFor(17.8, OTTAWA_LAT)).toEqual({ barWidth: 83, label: '20 m' });
    expect(scaleFor(22, OTTAWA_LAT)).toEqual({ barWidth: 76, label: '1 m' });
  });

  it('never stretches the bar beyond the bottom panel', () => {
    for (let zoom = 0; zoom <= 24; zoom += 0.2) {
      for (const latitude of [0, OTTAWA_LAT, 70, 90, -90, NaN]) {
        expect(scaleFor(zoom, latitude).barWidth).toBeLessThanOrEqual(100);
      }
    }
  });

  it('labels sub-kilometre steps in whole metres', () => {
    for (let zoom = 13; zoom <= 24; zoom += 0.2) {
      expect(scaleFor(zoom, OTTAWA_LAT).label).toMatch(/^\d+ (cm|m|km)$/);
    }
  });
});

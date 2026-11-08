import { describe, expect, it } from 'vitest';
import { boxAround, boxAt, boxProblem, boxSizeM, cutoutPath, describeBox, inBox, parseBox, parseWater } from './cutout';

describe('cut-out boxes', () => {
  it('reads a box from the link and refuses anything else', () => {
    expect(parseBox('-90.17,35.85,-90.15,35.87')).toEqual([-90.17, 35.85, -90.15, 35.87]);
    for (const bad of [null, '', '1,2,3', 'a,b,c,d', '10,0,5,1', '0,10,1,5', '-181,0,0,1', '0,-89,1,0', '0,0,1,1,2']) {
      expect(parseBox(bad)).toBeNull();
    }
  });

  it('round-trips through the link', () => {
    const b = boxAround([[-90.163, 35.862], [-90.151, 35.871], [-90.17, 35.858]]);
    expect(parseBox(cutoutPath(b).split('bbox=')[1])).toEqual(b);
  });

  it('names the water to open with, and only water it knows', () => {
    const b = boxAt(-90.16, 35.86, 2000);
    const q = new URLSearchParams(cutoutPath(b, 'rain').split('?')[1]);
    expect(parseWater(q.get('water'))).toBe('rain');
    expect(q.get('bbox')).toBe(cutoutPath(b).split('bbox=')[1]);
    expect(cutoutPath(b, null)).not.toContain('water');
    for (const bad of [null, '', 'snow', ['rain']]) expect(parseWater(bad)).toBeNull();
  });

  it('measures ground size and refuses boxes too big or too thin', () => {
    const b = boxAt(-90.16, 35.86, 2000);
    const { widthM, heightM } = boxSizeM(b);
    expect(widthM).toBeCloseTo(2000, -1);
    expect(heightM).toBeCloseTo(2000, -1);
    expect(describeBox(b)).toBe('2.0 × 2.0 km');
    expect(boxProblem(b)).toBeNull();
    expect(boxProblem(boxAt(0, 0, 80_000))).toMatch(/50 km/);
    expect(boxProblem([0, 0, 0.0001, 0.01])).toMatch(/too thin/);
  });

  it('keeps what stands inside', () => {
    const b = boxAt(-90.16, 35.86, 2000);
    expect(inBox(-90.16, 35.86, b)).toBe(true);
    expect(inBox(-90.10, 35.86, b)).toBe(false);
  });
});

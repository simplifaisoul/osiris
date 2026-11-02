import { describe, it, expect } from 'vitest';
import { bboxIntersects, inBBox, occupancyLabel, parseBBox, positionAge, viewBBox } from './transit';

describe('bboxIntersects', () => {
  const boston = [-71.3, 42.2, -70.9, 42.5];

  it('tells overlapping boxes from separate ones', () => {
    expect(bboxIntersects(boston, [-71.1, 42.3, -71.0, 42.4])).toBe(true);
    expect(bboxIntersects(boston, [-74.1, 40.6, -73.8, 40.9])).toBe(false);
  });

  it('handles a view that crosses the antimeridian', () => {
    const fiji = [177, -19, 179.5, -16];
    const view = [170, -25, -170, -10]; // 170°E round to 170°W
    expect(bboxIntersects(fiji, view)).toBe(true);
    expect(bboxIntersects(boston, view)).toBe(false);
  });
});

describe('inBBox', () => {
  it('includes the edges and wraps at the antimeridian', () => {
    expect(inBBox(-71.3, 42.2, [-71.3, 42.2, -70.9, 42.5])).toBe(true);
    expect(inBBox(-175, 0, [170, -10, -170, 10])).toBe(true);
    expect(inBBox(0, 0, [170, -10, -170, 10])).toBe(false);
  });
});

describe('viewBBox', () => {
  it('wraps longitudes MapLibre reports past ±180', () => {
    expect(viewBBox(190, 10, 200, 20)).toEqual([-170, 10, -160, 20]);
    expect(viewBBox(170, 10, 190, 20)).toEqual([170, 10, -170, 20]);
  });

  it('treats a view wider than the world as the world', () => {
    expect(viewBBox(-400, -100, 400, 100)).toEqual([-180, -90, 180, 90]);
  });
});

describe('parseBBox', () => {
  it('reads four numbers in range and refuses anything else', () => {
    expect(parseBBox('-71.2,42.25,-70.95,42.45')).toEqual([-71.2, 42.25, -70.95, 42.45]);
    expect(parseBBox('1,2,3')).toBeNull();
    expect(parseBBox('a,b,c,d')).toBeNull();
    expect(parseBBox('0,10,1,5')).toBeNull(); // south above north
    expect(parseBBox('-200,0,0,1')).toBeNull();
    expect(parseBBox(null)).toBeNull();
  });
});

describe('positionAge and occupancyLabel', () => {
  it('says how old a position is', () => {
    const now = 1_792_200_100_000;
    expect(positionAge(1_792_200_088, now)).toBe('12 s ago');
    expect(positionAge(1_792_199_920, now)).toBe('3 min ago');
    expect(positionAge(undefined, now)).toBeUndefined();
  });

  it('names occupancy and hides "no data"', () => {
    expect(occupancyLabel(1)).toBe('Many seats free');
    expect(occupancyLabel(7)).toBeUndefined();
    expect(occupancyLabel(undefined)).toBeUndefined();
  });
});

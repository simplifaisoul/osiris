import { describe, it, expect } from 'vitest';
import { TRANSIT_STRIDE, markerSize, packVehicle, rgb } from './transit-gl-layer';
import { cardAnchor, compassPoint, distanceParts, durationParts, framesPerSecond } from './transit-layer';

describe('transit GPU layer packing', () => {
  it('writes mercator position, colour, heading and selection for one vehicle', () => {
    const out = new Float32Array(2 * TRANSIT_STRIDE);
    packVehicle(out, 1, 0, 0, [1, 0.5, 0], 90, true);
    const o = TRANSIT_STRIDE;
    expect(out[o]).toBeCloseTo(0.5, 6);        // lng 0 is the middle of the world
    expect(out[o + 1]).toBeCloseTo(0.5, 6);    // so is the equator, in mercator
    expect([out[o + 2], out[o + 3], out[o + 4]]).toEqual([1, 0.5, 0]);
    expect(out[o + 5]).toBe(90);
    expect(out[o + 6]).toBe(1);
    expect(out.slice(0, TRANSIT_STRIDE).every(v => v === 0)).toBe(true);
  });

  it('marks a vehicle without a heading so the shader draws a dot', () => {
    const out = new Float32Array(TRANSIT_STRIDE);
    packVehicle(out, 0, -0.1, 51.5, [0, 0, 0], undefined, false);
    expect(out[5]).toBe(-1);
    expect(out[6]).toBe(0);
  });

  it('reads colours and sizes markers by zoom', () => {
    expect(rgb('#5EEAD4')).toEqual([0x5e / 255, 0xea / 255, 0xd4 / 255]);
    expect(markerSize(3)).toBe(2.2);
    expect(markerSize(12)).toBe(5);
    expect(markerSize(14)).toBeCloseTo(6.5, 5);
    expect(markerSize(22)).toBe(10);
  });

  it('draws fewer frames where a vehicle moves less than a pixel a second', () => {
    expect(framesPerSecond(6)).toBe(5);
    expect(framesPerSecond(10)).toBe(15);
    expect(framesPerSecond(15)).toBe(30);
  });

  it('opens a vehicle card ahead of it, so the way it came stays in view', () => {
    expect(cardAnchor(0)).toBe('top');      // came from above: card below
    expect(cardAnchor(180)).toBe('bottom'); // came from below: card above
    expect(cardAnchor(90)).toBe('right');   // came from the right: card to the left
    expect(cardAnchor(-90)).toBe('left');   // came from the left: card to the right
  });
});

describe('vehicle card numbers', () => {
  it('names the compass point a heading falls in', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(44)).toBe('NE');
    expect(compassPoint(181)).toBe('S');
    expect(compassPoint(338)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
  });

  it('writes distances and durations with their units', () => {
    expect(distanceParts(640.4)).toEqual(['640', 'm']);
    expect(distanceParts(2380)).toEqual(['2.4', 'km']);
    expect(distanceParts(12_600)).toEqual(['13', 'km']);
    expect(durationParts(45_000)).toEqual(['45', 's']);
    expect(durationParts(12 * 60_000)).toEqual(['12', 'min']);
    expect(durationParts(90 * 60_000)).toEqual(['1.5', 'h']);
  });
});

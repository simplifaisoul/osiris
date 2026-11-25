import { describe, it, expect } from 'vitest';
import { baseFovDeg, fovAtZoom, footprintKm, zoomForWidth } from './satellite-view';

describe('baseFovDeg', () => {
  it('is the full 60° lens in low orbit', () => {
    expect(baseFovDeg(420)).toBe(60);
    expect(baseFovDeg(550)).toBe(60);
  });

  it('fits the Earth with a margin from geostationary height', () => {
    // The Earth spans about 17.4° from 35,786 km.
    const fov = baseFovDeg(35_786);
    expect(fov).toBeGreaterThan(17.4);
    expect(fov).toBeLessThan(21);
  });
});

describe('fovAtZoom', () => {
  it('leaves 1x alone and narrows as it zooms', () => {
    expect(fovAtZoom(60, 1)).toBeCloseTo(60, 9);
    expect(fovAtZoom(60, 2)).toBeLessThan(60);
    expect(fovAtZoom(60, 8)).toBeLessThan(fovAtZoom(60, 4));
  });
});

describe('footprintKm', () => {
  it('covers about 490 km from the ISS at 1x', () => {
    expect(footprintKm(420, 60)).toBeGreaterThan(470);
    expect(footprintKm(420, 60)).toBeLessThan(510);
  });

  it('comes down to about 60 km at 8x', () => {
    const km = footprintKm(420, fovAtZoom(60, 8));
    expect(km).toBeGreaterThan(55);
    expect(km).toBeLessThan(65);
  });

  it('stops at the horizon when the lens is wider than the Earth', () => {
    // From GEO the visible cap is about 162° of arc: ~18,000 km.
    const horizon = footprintKm(35_786, 40);
    expect(horizon).toBeGreaterThan(17_500);
    expect(horizon).toBeLessThan(18_500);
    expect(footprintKm(35_786, 60)).toBeCloseTo(horizon, 6);
  });
});

describe('zoomForWidth', () => {
  it('gets wider ground at a lower zoom', () => {
    expect(zoomForWidth(60, 0, 300)).toBeGreaterThan(zoomForWidth(490, 0, 300));
  });

  it('matches MapLibre scale at the equator', () => {
    // At zoom z one pixel is 40,075 km / (512 · 2^z).
    const z = zoomForWidth(490, 0, 272);
    const metresPerPx = 40_075_016.686 / (512 * 2 ** z);
    expect(metresPerPx * 272).toBeCloseTo(490_000, -2);
  });

  it('zooms in further at high latitude for the same ground', () => {
    expect(zoomForWidth(100, 60, 272)).toBeCloseTo(zoomForWidth(100, 0, 272) - 1, 6);
  });

  it('stays within the map range', () => {
    expect(zoomForWidth(1e9, 0, 272)).toBe(0);
    expect(zoomForWidth(0.0001, 0, 272)).toBe(18);
  });
});

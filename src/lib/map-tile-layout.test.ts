import { describe, it, expect } from 'vitest';
import { layoutTile, tileHeight, tilesOverlap, type TileGeometry } from './map-tile-layout';

/** The CCTV tile, which is what these numbers were tuned against. */
const CCTV: TileGeometry = { width: 176, imageHeight: 99, labelHeight: 20, gap: 26 };
const VIEW = { width: 1440, height: 900 };

describe('layoutTile', () => {
  it('centres the tile above its marker when there is room', () => {
    const box = layoutTile({ x: 700, y: 500 }, VIEW, CCTV);
    expect(box.x).toBe(700 - CCTV.width / 2);
    expect(box.y).toBe(500 - tileHeight(CCTV) - CCTV.gap);
    expect(box.flipped).toBe(false);
    expect(box.anchored).toBe(true);
  });

  it('flips below the marker when the header would cover the tile', () => {
    // A marker near the top of the screen: above it is app chrome, and a tile
    // drawn under the header is simply invisible.
    const box = layoutTile({ x: 700, y: 120 }, VIEW, CCTV);
    expect(box.flipped).toBe(true);
    expect(box.y).toBe(120 + CCTV.gap);
    expect(box.anchored).toBe(true);
  });

  it('clamps a tile back inside the left edge and reports it unanchored', () => {
    // The layer rail lives here, so the tile is pushed clear of it — and that
    // moves it off its marker, which is what `anchored: false` is for.
    const box = layoutTile({ x: 10, y: 500 }, VIEW, CCTV);
    expect(box.x).toBe(60);
    expect(box.anchored).toBe(false);
  });

  it('clamps against the right edge too', () => {
    const box = layoutTile({ x: VIEW.width - 5, y: 500 }, VIEW, CCTV);
    expect(box.x).toBe(VIEW.width - CCTV.width - 60);
    expect(box.anchored).toBe(false);
  });

  it('keeps a low marker clear of the ticker at the bottom', () => {
    const box = layoutTile({ x: 700, y: VIEW.height - 10 }, VIEW, CCTV);
    expect(box.y).toBeLessThanOrEqual(VIEW.height - tileHeight(CCTV) - 156);
    expect(box.anchored).toBe(false);
  });

  it('never places a tile outside a viewport too small to hold one', () => {
    // Degenerate, but the clamps must not invert and produce a negative origin.
    const box = layoutTile({ x: 100, y: 100 }, { width: 200, height: 200 }, CCTV);
    expect(box.x).toBeGreaterThanOrEqual(60);
    expect(box.y).toBeGreaterThanOrEqual(96);
  });

  it('is deterministic — the two passes must agree', () => {
    // Selection decides overlap from this; the pan loop draws from it. If they
    // disagreed, tiles would settle on top of each other.
    const a = layoutTile({ x: 640, y: 480 }, VIEW, CCTV);
    const b = layoutTile({ x: 640, y: 480 }, VIEW, CCTV);
    expect(a).toEqual(b);
  });

  it('scales with the geometry it is given', () => {
    const big: TileGeometry = { width: 240, imageHeight: 135, labelHeight: 20, gap: 26 };
    const box = layoutTile({ x: 700, y: 500 }, VIEW, big);
    expect(box.x).toBe(700 - 120);
    expect(box.y).toBe(500 - 155 - 26);
  });
});

describe('tilesOverlap', () => {
  const at = (x: number, y: number) => ({ x, y, flipped: false, anchored: true });

  it('sees two tiles in the same place as overlapping', () => {
    expect(tilesOverlap(at(100, 100), at(100, 100), CCTV)).toBe(true);
  });

  it('lets tiles a full width apart coexist', () => {
    expect(tilesOverlap(at(100, 100), at(100 + CCTV.width + 8, 100), CCTV)).toBe(false);
  });

  it('lets tiles a full height apart coexist', () => {
    expect(tilesOverlap(at(100, 100), at(100, 100 + tileHeight(CCTV) + CCTV.gap), CCTV)).toBe(false);
  });

  it('catches a near miss on both axes', () => {
    expect(tilesOverlap(at(100, 100), at(120, 110), CCTV)).toBe(true);
  });
});

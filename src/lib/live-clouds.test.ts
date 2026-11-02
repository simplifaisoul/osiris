import { describe, it, expect } from 'vitest';
import {
  CLOUD_BASE_M, CLOUD_RELIEF_M, PAD, PADDED, REF_HEIGHT, REF_WIDTH, TILE,
  TROPICAL_CLEAR, applyLut, clearSky, clearSkyAt, cloudAltitude, cloudLift, cloudOpacity, frameTime, tileClearSky, isCloudTile, matchLut, referenceFootprint,
  referenceHistogram, referenceUrl, renderClouds, shadowOffset, sunElevation, tileBbox,
  tileDaylight, tileHistogram, tileUrl,
} from './live-clouds';
import { ancestorUv } from './live-clouds-layer';

const HALF = 20037508.342789244;
const TIME = '2026-09-22T12:00:00Z'; // equinox noon: the sun is over 0°, 0°
const NOON = Date.parse(TIME);

describe('tileBbox', () => {
  it('covers the whole world at zoom 0', () => {
    expect(tileBbox(0, 0, 0)).toEqual([-HALF, -HALF, HALF, HALF]);
  });

  // y counts down from the north edge, as in every XYZ scheme.
  it('puts tile 1/0/0 in the north-west quarter', () => {
    expect(tileBbox(1, 0, 0)).toEqual([-HALF, 0, 0, HALF]);
    expect(tileBbox(1, 1, 1)).toEqual([0, -HALF, HALF, 0]);
  });

  it('grows by whole pixels of padding', () => {
    const pixel = (2 * HALF) / TILE;
    expect(tileBbox(0, 0, 0, 2)).toEqual([-HALF - 2 * pixel, -HALF - 2 * pixel, HALF + 2 * pixel, HALF + 2 * pixel]);
  });
});

describe('frameTime', () => {
  it('asks for the current hour once NOAA has had time to publish it', () => {
    expect(frameTime(Date.parse('2026-09-30T23:25:10Z'))).toBe('2026-09-30T23:00:00Z');
  });

  /* Just after the hour the new frame isn't up yet. Asking for it would snap
     to last hour's picture and cache it under this hour's URL. */
  it('stays on the previous hour just after the turn', () => {
    expect(frameTime(Date.parse('2026-10-01T00:05:00Z'))).toBe('2026-09-30T23:00:00Z');
  });
});

describe('isCloudTile', () => {
  const frame = '2026-09-30T23:00:00Z';

  it('accepts a real tile of an hourly frame', () => {
    expect(isCloudTile({ z: 3, x: 4, y: 2, time: frame })).toBe(true);
  });

  it('rejects a tile outside its zoom level', () => {
    expect(isCloudTile({ z: 2, x: 4, y: 0, time: frame })).toBe(false);
  });

  it('rejects zooms past the imagery', () => {
    expect(isCloudTile({ z: 9, x: 0, y: 0, time: frame })).toBe(false);
  });

  it('rejects a time that is not on the hour', () => {
    expect(isCloudTile({ z: 1, x: 0, y: 0, time: '2026-09-30T23:15:00Z' })).toBe(false);
    expect(isCloudTile({ z: 1, x: 0, y: 0, time: 'now' })).toBe(false);
  });
});

describe('hanging the clouds', () => {
  it('puts low cloud at the base and the highest tops a full relief above it', () => {
    expect(cloudAltitude(0)).toBe(CLOUD_BASE_M);
    expect(cloudAltitude(1)).toBe(CLOUD_BASE_M + CLOUD_RELIEF_M);
    expect(cloudAltitude(7)).toBe(CLOUD_BASE_M + CLOUD_RELIEF_M);
  });

  it('draws the clouds whole from space and not at all at street level', () => {
    expect(cloudOpacity(2)).toBe(1);
    expect(cloudOpacity(6)).toBe(1);
    expect(cloudOpacity(11)).toBe(0);
    expect(cloudOpacity(15)).toBe(0);
  });

  it('lifts the deck more the further out the view, and not at all close in', () => {
    expect(cloudLift(6)).toBe(1);
    expect(cloudLift(9)).toBe(1);
    expect(cloudLift(4)).toBeGreaterThan(1);
    expect(cloudLift(0)).toBeLessThanOrEqual(2.5);
  });

  /* The complaint that started this: at town zoom the deck painted over every place. */
  it('thins them out on the way down', () => {
    let last = 1;
    for (let z = 6; z <= 11; z += 0.25) {
      expect(cloudOpacity(z)).toBeLessThanOrEqual(last);
      last = cloudOpacity(z);
    }
    expect(cloudOpacity(8.5)).toBeLessThan(0.6);
  });

  it('casts a shadow that reaches further across a tile the closer in the tile is', () => {
    expect(shadowOffset(6, 0) / shadowOffset(5, 0)).toBeCloseTo(2);
  });

  // A tile is narrower on the ground toward the poles, so the same reach covers more of it.
  it('casts it further across a tile at high latitude', () => {
    expect(shadowOffset(5, Math.PI / 3)).toBeGreaterThan(shadowOffset(5, 0));
  });

  it('draws a tile on its own texture across the inner square, inside the margin', () => {
    expect(ancestorUv(5, 9, 0)).toEqual([PAD / PADDED, PAD / PADDED, TILE / PADDED, TILE / PADDED]);
  });

  it('draws a tile on its parent’s texture over the right quarter', () => {
    // 3, 2 at one level down is the parent's east half, north half.
    const [ox, oy, sx, sy] = ancestorUv(3, 2, 1);
    expect(ox).toBeCloseTo((PAD + TILE / 2) / PADDED);
    expect(oy).toBeCloseTo(PAD / PADDED);
    expect(sx).toBeCloseTo(TILE / 2 / PADDED);
    expect(sy).toBeCloseTo(TILE / 2 / PADDED);
  });
});

describe('NOAA requests', () => {
  it('asks for a tile with its padding, in the band wanted', () => {
    const u = new URL(tileUrl('vis', { z: 1, x: 0, y: 0, time: TIME }));
    expect(u.hostname).toBe('nowcoast.noaa.gov');
    expect(u.searchParams.get('LAYERS')).toBe('global_visible_imagery_mosaic');
    expect(u.searchParams.get('BBOX')).toBe(tileBbox(1, 0, 0, PAD).join(','));
    expect(u.searchParams.get('WIDTH')).toBe(String(PADDED));
    expect(u.searchParams.get('TIME')).toBe(TIME);
  });

  it('asks for the reference as one image of the whole world', () => {
    const u = new URL(referenceUrl('ir', TIME));
    expect(u.searchParams.get('LAYERS')).toBe('global_longwave_imagery_mosaic');
    expect(u.searchParams.get('WIDTH')).toBe(String(REF_WIDTH));
    expect(u.searchParams.get('HEIGHT')).toBe(String(REF_HEIGHT));
    const [minx, , maxx] = u.searchParams.get('BBOX')!.split(',').map(Number);
    expect([minx, maxx]).toEqual([-HALF, HALF]);
  });
});

describe('referenceFootprint', () => {
  it('spans the whole reference at zoom 0', () => {
    expect(referenceFootprint(0, 0, 0)).toEqual({ x0: 0, x1: REF_WIDTH, y0: 0, y1: REF_HEIGHT });
  });

  it('puts tile 1/1/0 on the right half, above the equator', () => {
    expect(referenceFootprint(1, 1, 0)).toEqual({ x0: REF_WIDTH / 2, x1: REF_WIDTH, y0: 0, y1: REF_HEIGHT / 2 });
  });
});

/** A padded tile, every pixel the given grey, opaque. */
function tileOf(grey: (i: number, j: number) => number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(PADDED * PADDED * 4);
  for (let j = 0; j < PADDED; j++) {
    for (let i = 0; i < PADDED; i++) {
      const k = (j * PADDED + i) * 4;
      rgba[k] = rgba[k + 1] = rgba[k + 2] = grey(i, j);
      rgba[k + 3] = 255;
    }
  }
  return rgba;
}

describe('matching a tile to the reference', () => {
  const histogram = (values: number[]) => { const h = new Uint32Array(256); for (const v of values) h[v]++; return h; };
  const spread = (from: number, to: number, n = 2000) => Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));

  it('leaves a tile already on the reference scale as it is', () => {
    const h = histogram(spread(40, 200));
    const lut = matchLut(h, h)!;
    for (const v of [40, 100, 160, 200]) expect(Math.abs(lut[v] - v)).toBeLessThanOrEqual(1);
  });

  /* What NOAA does: the same patch, stretched to fill 0–255 in a tile of its own. */
  it('undoes a stretch', () => {
    const ref = spread(60, 180);
    const stretched = ref.map(v => Math.round(((v - 60) / 120) * 255));
    const lut = matchLut(histogram(stretched), histogram(ref))!;
    expect(Math.abs(lut[0] - 60)).toBeLessThanOrEqual(2);
    expect(Math.abs(lut[128] - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(lut[255] - 180)).toBeLessThanOrEqual(2);
  });

  it('never reverses the order of two greys', () => {
    const lut = matchLut(histogram(spread(0, 255)), histogram(spread(30, 90)))!;
    for (let v = 1; v < 256; v++) expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
  });

  it('gives up on too few samples', () => {
    expect(matchLut(histogram([10, 20, 30]), histogram(spread(0, 255)))).toBeNull();
  });

  it('counts only the unpadded, covered part of a tile', () => {
    const rgba = tileOf((i, j) => (i < PAD || j < PAD || i >= PAD + TILE || j >= PAD + TILE ? 9 : 100));
    rgba[((PAD * PADDED) + PAD) * 4 + 3] = 0; // one pixel outside the satellites' view
    const h = tileHistogram(rgba);
    expect(h[100]).toBe(TILE * TILE - 1);
    expect(h[9]).toBe(0);
  });

  it('skips the black outside the satellites’ view in the reference', () => {
    const grey = new Uint8Array(REF_WIDTH * REF_HEIGHT).fill(120);
    grey[0] = 0;
    const h = referenceHistogram(grey, { x0: 0, x1: 4, y0: 0, y1: 1 });
    expect(h[120]).toBe(3);
    expect(h[0]).toBe(0);
  });

  it('remaps every channel of a tile', () => {
    const rgba = new Uint8ClampedArray([10, 10, 10, 255]);
    const lut = new Uint8Array(256); lut[10] = 77;
    applyLut(rgba, lut);
    expect([...rgba]).toEqual([77, 77, 77, 255]);
  });
});

describe('clear sky', () => {
  /** A reference whose greys run lo..hi across each row, one range north of the equator and another south. */
  const reference = (north: [number, number], south: [number, number]) => {
    const grey = new Uint8Array(REF_WIDTH * REF_HEIGHT);
    for (let j = 0; j < REF_HEIGHT; j++) {
      const [lo, hi] = j < REF_HEIGHT / 2 ? north : south;
      for (let i = 0; i < REF_WIDTH; i++) grey[j * REF_WIDTH + i] = lo + ((hi - lo) * (i % 128)) / 127;
    }
    return grey;
  };

  it('takes the warm end of each cell as clear ground', () => {
    const sky = clearSky(reference([60, 200], [130, 230]));
    expect(clearSkyAt(sky, 1000, 100)).toBeCloseTo(60 + 0.1 * 140, -1);
    expect(clearSkyAt(sky, 1000, REF_HEIGHT - 100)).toBeCloseTo(130 + 0.1 * 100, -1);
  });

  it('lends bands outside the satellites\u2019 view the nearest one with data', () => {
    const grey = reference([60, 200], [60, 200]);
    grey.fill(0, 0, REF_WIDTH * 100); // the top hundred rows: nothing seen
    const sky = clearSky(grey);
    expect(clearSkyAt(sky, 1000, 0)).toBeCloseTo(clearSkyAt(sky, 1000, 200), 0);
  });

  /* A sector the satellites see as falsely cold — the Arctic edge-on — may read
     colder than the rest of its latitude, but only so far, or a sector under
     one great storm would count the storm as clear. */
  it('lets one region read colder than its latitude, within limits', () => {
    const grey = reference([60, 200], [60, 200]);
    for (let j = 0; j < REF_HEIGHT; j++) for (let i = 0; i < 128; i++) grey[j * REF_WIDTH + i] = 200;
    const sky = clearSky(grey);
    const band = clearSkyAt(sky, 1000, 300);
    expect(clearSkyAt(sky, 64, 300)).toBeGreaterThan(band + 20);
    expect(clearSkyAt(sky, 64, 300)).toBeLessThanOrEqual(band + 30.5);
  });

  it('wraps around in longitude, so the date line has no seam', () => {
    const sky = clearSky(reference([60, 200], [60, 200]));
    expect(clearSkyAt(sky, 0, 300)).toBeCloseTo(clearSkyAt(sky, REF_WIDTH, 300), 5);
  });

  it('gives every pixel of a tile its own clear sky', () => {
    const sky = clearSky(reference([60, 200], [130, 230]));
    const tile = tileClearSky(0, 0, 0, sky);
    expect(tile.length).toBe(PADDED * PADDED);
    expect(tile[(PADDED - 1) * PADDED + 100]).toBeGreaterThan(tile[100]);
  });
});

describe('sunlight', () => {
  const deg = Math.PI / 180;

  it('puts the sun overhead at 0°, 0° at equinox noon', () => {
    expect(sunElevation(NOON)(0, 0)).toBeGreaterThan(0.99);
  });

  it('has it below the horizon on the far side of the world', () => {
    expect(sunElevation(NOON)(0, 180 * deg)).toBeLessThan(-0.99);
  });

  it('finds a tile under the sun all lit, and the opposite one all dark', () => {
    // At zoom 3, tile 4/3 sits just east of 0°, 0°; tile 0/3 is on the date line.
    expect(tileDaylight(3, 4, 3, NOON)).toBe(1);
    expect(tileDaylight(3, 0, 3, NOON)).toBe(0);
  });
});

describe('renderClouds', () => {
  // Tile 4/3 at zoom 3 is in full daylight at NOON; tile 0/3 is in darkness.
  const day = { z: 3, x: 4, y: 3, time: NOON };
  const night = { z: 3, x: 0, y: 3, time: NOON };
  /** A pixel of the output by its position inside the tile, past the margin. */
  const at = (i: number, j: number) => ((j + PAD) * PADDED + i + PAD);
  const px = (rgba: Uint8ClampedArray, i: number, j: number) => Array.from(rgba.subarray(at(i, j) * 4, at(i, j) * 4 + 4));

  it('sends the margin out with the tile', () => {
    const { rgba, height } = renderClouds({ ir: tileOf(() => 230), vis: null, ...night });
    expect(rgba.length).toBe(PADDED * PADDED * 4);
    expect(height.length).toBe(PADDED * PADDED);
  });

  it('draws clear, warm ground as nothing at all', () => {
    const { rgba } = renderClouds({ ir: tileOf(() => 70), vis: null, ...night });
    expect(rgba.every((v, k) => k % 4 !== 3 || v === 0)).toBe(true);
  });

  it('draws a deck of cold cloud opaque, and evenly lit when its top is flat', () => {
    const { rgba } = renderClouds({ ir: tileOf(() => 230), vis: null, ...night });
    const [r, g, b, a] = px(rgba, 128, 128);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(200);
    expect(px(rgba, 10, 10)).toEqual([r, g, b, a]);
  });

  it('lifts cold, high cloud above warm, low cloud', () => {
    const high = renderClouds({ ir: tileOf(() => 240), vis: null, ...night }).height[at(128, 128)];
    const low = renderClouds({ ir: tileOf(() => 120), vis: null, ...night }).height[at(128, 128)];
    expect(high).toBeGreaterThan(200);
    expect(low).toBeLessThan(40);
  });

  /* One cold pixel used to lift one vertex into a spike; the lift is smoothed. */
  it('raises a lone cold pixel as a low dome, not a spike', () => {
    const centre = PAD + 128;
    const { height } = renderClouds({ ir: tileOf((i, j) => (i === centre && j === centre ? 250 : 70)), vis: null, ...night });
    expect(height[at(128, 128)]).toBeLessThan(40);
  });

  /* A ridge whose crest runs north-east to south-west through the middle of the
     tile. Rows count southward, so its north-west flank is up and to the left. */
  it('lights the slope facing north-west and shades the one facing away', () => {
    const crest = 2 * (PAD + 128);
    const ridge = (i: number, j: number) => 255 - Math.min(150, Math.abs(i + j - crest) * 3);
    const { rgba } = renderClouds({ ir: tileOf(ridge), vis: null, ...night });
    expect(px(rgba, 118, 118)[0]).toBeGreaterThan(px(rgba, 138, 138)[0] + 20);
  });

  /* The sea off Greenland reads as cold as tropical cloud; against its own
     latitude's clear sky it is clear. This is what veiled the far north. */
  it('judges cloud against the clear sky of its own latitude', () => {
    const ir = tileOf(() => 140);
    const polar = new Float32Array(PADDED * PADDED).fill(130);
    expect(px(renderClouds({ ir, clear: polar, vis: null, ...night }).rgba, 128, 128)[3]).toBe(0);
    expect(px(renderClouds({ ir, clear: new Float32Array(PADDED * PADDED).fill(TROPICAL_CLEAR), vis: null, ...night }).rgba, 128, 128)[3]).toBeGreaterThan(40);
  });

  /* Past about 73° the satellites see the Arctic edge-on, and it came out as a flat white sheet. */
  it('fades cloud out toward the edge of the satellites’ view', () => {
    // Tile 4/1 at zoom 3 runs from about 79° down to 66.5° north.
    const { rgba } = renderClouds({ ir: tileOf(() => 240), vis: null, z: 3, x: 4, y: 1, time: NOON });
    expect(px(rgba, 128, 5)[3]).toBe(0);
    expect(px(rgba, 128, 250)[3]).toBeGreaterThan(200);
  });

  /* The Sahara is as bright as cloud in visible light, but far too hot to be cloud. */
  it('leaves hot, bright desert clear by day', () => {
    const { rgba } = renderClouds({ ir: tileOf(() => 30), vis: tileOf(() => 200), ...day });
    expect(px(rgba, 128, 128)[3]).toBe(0);
  });

  /* Low marine cloud is barely colder than the sea, so infrared misses it; daylight shows it. */
  it('shows low cloud that only visible light can see, but only by day', () => {
    const lowCloud = { ir: tileOf(() => 85), vis: tileOf(() => 190) };
    expect(px(renderClouds({ ...lowCloud, ...day }).rgba, 128, 128)[3]).toBeGreaterThan(200);
    expect(px(renderClouds({ ...lowCloud, vis: null, ...night }).rgba, 128, 128)[3]).toBe(0);
  });
});

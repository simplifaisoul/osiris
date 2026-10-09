import { describe, it, expect } from 'vitest';
import { LABELS, MODEL, decode, fit, toInput } from './detect';
import { countWords, countsOf, describeFrame, describeWatch, lightOf, motionBetween, summariseWatch, vehiclesIn, type FrameAnalysis } from './analysis';

const ROWS = 3549;

/** A raw model output with chosen candidates set: row, cell offset, log size, objectness and one class score. */
function output(cands: { row: number; dx?: number; dy?: number; lw?: number; lh?: number; obj: number; cls: number; score: number }[]) {
  const out = new Float32Array(ROWS * 85);
  for (const c of cands) {
    const at = c.row * 85;
    out[at] = c.dx ?? 0.5; out[at + 1] = c.dy ?? 0.5; out[at + 2] = c.lw ?? 0; out[at + 3] = c.lh ?? 0;
    out[at + 4] = c.obj; out[at + 5 + c.cls] = c.score;
  }
  return out;
}

describe('fit', () => {
  it('scales a frame into the square and pads the rest', () => {
    expect(fit(853, 480)).toEqual({ scale: 416 / 853, width: 416, height: 234 });
    expect(fit(320, 260)).toEqual({ scale: 1.3, width: 416, height: 338 });
  });
});

describe('toInput', () => {
  it('writes planar BGR with the frame top-left and grey 114 padding', () => {
    // A 2×1 RGBA frame: red, then blue.
    const px = [255, 0, 0, 255, 0, 0, 255, 255];
    const t = toInput(px, 2, 1, 4, 4);
    const plane = 16;
    expect([t[0], t[plane], t[2 * plane]]).toEqual([0, 0, 255]); // red → B=0, G=0, R=255
    expect([t[1], t[plane + 1], t[2 * plane + 1]]).toEqual([255, 0, 0]); // blue → B=255
    expect(t[2]).toBe(114);
    expect(t[4 * 3]).toBe(114);
  });
});

describe('decode', () => {
  it('places a box from its grid cell, stride and size, back in frame pixels', () => {
    // Row 0 is the first stride-8 cell; centre (0.5+0)*8 = 4, size e^0*8 = 8 → 0..8, at scale 1.
    const d = decode(output([{ row: 0, obj: 0.9, cls: 2, score: 0.9 }]), 1, { width: 416, height: 416 });
    expect(d).toHaveLength(1);
    expect(d[0].label).toBe('car');
    expect(d[0].score).toBeCloseTo(0.81);
    expect(d[0].box.map(n => Math.round(n))).toEqual([0, 0, 8, 8]);
  });

  it('reads the coarser grids and undoes the scale', () => {
    // First stride-32 cell: rows 2704 (52²) + 676 (26²) = 3380. Centre 16, size e^1*32 ≈ 87.
    const d = decode(output([{ row: 3380, lw: 1, lh: 1, obj: 0.8, cls: 7, score: 0.9 }]), 0.5, { width: 1000, height: 1000 });
    expect(d[0].label).toBe('truck');
    const [x, , w] = d[0].box;
    expect(x).toBe(0); // clipped at the frame's edge
    expect(w).toBeCloseTo((16 + Math.E * 16) / 0.5, 0);
  });

  it('drops weak boxes, and anything whose strongest class is not one it reports', () => {
    const out = output([{ row: 10, obj: 0.4, cls: 2, score: 0.5 }, { row: 20, obj: 0.9, cls: 0, score: 0.6 }]);
    out[20 * 85 + 5 + 26] = 0.9; // a handbag outscores the person
    expect(decode(out, 1, { width: 416, height: 416 })).toEqual([]);
  });

  it('keeps one box per object, and lets different classes overlap', () => {
    const d = decode(output([
      { row: 100, obj: 0.9, cls: 2, score: 0.9 },
      { row: 100 + 1, dx: -0.45, obj: 0.8, cls: 2, score: 0.9 }, // the same car, one cell over
      { row: 300, obj: 0.9, cls: 0, score: 0.7 },
      { row: 300 + 1, dx: -0.45, obj: 0.9, cls: 1, score: 0.6 }, // a bicycle under the person
    ]), 1, { width: 416, height: 416 });
    expect(d.filter(x => x.label === 'car')).toHaveLength(1);
    expect(d.map(x => x.label).sort()).toEqual(['bicycle', 'car', 'person']);
  });

  it('survives a short output rather than reading past it', () => {
    expect(decode(new Float32Array(85 * 10), 1, { width: 10, height: 10 })).toEqual([]);
  });

  it('is configured for the model it ships', () => {
    expect(MODEL.input).toBe(416);
    expect(LABELS).toHaveLength(9);
  });
});

const frame = (counts: FrameAnalysis['counts'], motion: number | null = null): FrameAnalysis =>
  ({ at: '2026-10-09T18:00:00Z', width: 640, height: 360, detections: [], counts, light: 'bright', motion, ms: 80 });

describe('analysis', () => {
  it('counts, and counts vehicles', () => {
    const counts = countsOf([
      { label: 'car', score: 1, box: [0, 0, 1, 1] }, { label: 'car', score: 1, box: [0, 0, 1, 1] }, { label: 'person', score: 1, box: [0, 0, 1, 1] },
    ]);
    expect(counts).toEqual({ car: 2, person: 1 });
    expect(vehiclesIn({ car: 2, truck: 1, person: 5 })).toBe(3);
  });

  it('reads the light', () => {
    expect(lightOf(20)).toBe('dark');
    expect(lightOf(60)).toBe('dim');
    expect(lightOf(140)).toBe('bright');
  });

  it('measures motion as the share of pixels that really moved', () => {
    const a = new Uint8Array(100).fill(100);
    const b = Uint8Array.from(a, (v, i) => (i < 10 ? 200 : v + 5)); // 10 moved, 90 within noise
    expect(motionBetween(a, b)).toBe(0.1);
    expect(motionBetween(a, new Uint8Array(50))).toBeNull();
  });

  it('puts counts in words, biggest first', () => {
    expect(countWords({ person: 1, car: 26, truck: 4 })).toBe('26 cars, 4 trucks, 1 person');
    expect(countWords({})).toBe('nothing it can count');
    expect(describeFrame(frame({ bus: 1 }))).toBe('1 bus in view, well lit');
  });

  it('summarises a watch: ranges, motion, and which way the traffic went', () => {
    const w = summariseWatch([frame({ car: 4 }), frame({ car: 5 }, 0.05), frame({ car: 6 }, 0.04), frame({ car: 9 }, 0.06), frame({ car: 10 }, 0.001), frame({ car: 12 }, 0.07)], 30);
    expect(w.vehicles).toEqual({ min: 4, mean: 7.7, max: 12 });
    expect(w.counts.car).toEqual({ min: 4, mean: 7.7, max: 12 });
    expect(w.changed).toBe(4);
    expect(w.trend).toBe('busier');
    expect(describeWatch(w)).toBe('watched 30 s, 6 frames, vehicles 4–12 (mean 7.7), traffic busier, the picture changed in 4 of 5 intervals');
  });

  it('says so when a slow camera never changed its picture', () => {
    const w = summariseWatch([frame({ car: 3 }), frame({ car: 3 }, 0), frame({ car: 3 }, 0)], 20);
    expect(w.trend).toBe('steady');
    expect(describeWatch(w)).toContain('did not change');
  });
});

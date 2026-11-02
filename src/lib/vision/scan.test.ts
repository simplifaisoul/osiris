import { describe, it, expect } from 'vitest';
import type { Detection, Label } from './detect';
import { merge, place, regionsOf, scan, type Region } from './scan';

const det = (label: Label, score: number, box: Detection['box']): Detection => ({ label, score, box });

describe('regionsOf', () => {
  it('reads a small frame once, whole', () => {
    expect(regionsOf(352, 240)).toEqual([[0, 0, 352, 240]]);
  });

  it('reads a large frame whole, then in four overlapping corners', () => {
    const r = regionsOf(1280, 720);
    expect(r).toEqual([[0, 0, 1280, 720], [0, 0, 768, 432], [512, 0, 768, 432], [0, 288, 768, 432], [512, 288, 768, 432]]);
    // The corners overlap by a fifth of the frame, so anything that small lies whole in one of them.
    expect(r[1][0] + r[1][2] - r[2][0]).toBe(256);
  });
});

describe('place', () => {
  const frame = { width: 1280, height: 720 };

  it('moves a corner\'s boxes into the frame', () => {
    expect(place([det('car', 0.9, [100, 50, 20, 10])], [512, 288, 768, 432], frame)[0].box).toEqual([612, 338, 20, 10]);
  });

  it('drops a box cut off by an edge of the corner inside the frame, and keeps one at the frame\'s own edge', () => {
    const corner: Region = [512, 288, 768, 432];
    const cut = det('car', 0.9, [0, 100, 30, 20]); // touches the corner's left edge, which is mid-frame
    const atEdge = det('car', 0.9, [740, 100, 28, 20]); // touches its right edge, which is the frame's
    expect(place([cut, atEdge], corner, frame).map(d => d.box[0])).toEqual([512 + 740]);
  });

  it('leaves the whole frame\'s boxes alone', () => {
    const d = det('bus', 0.8, [0, 0, 1280, 720]);
    expect(place([d], [0, 0, 1280, 720], frame)).toEqual([d]);
  });
});

describe('merge', () => {
  it('keeps the stronger of two boxes on one object', () => {
    const out = merge([det('car', 0.6, [100, 100, 40, 30]), det('car', 0.9, [102, 101, 40, 30])]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(0.9);
  });

  it('treats a box lying almost wholly inside another of its kind as the same object', () => {
    expect(merge([det('car', 0.9, [100, 100, 80, 40]), det('car', 0.5, [110, 105, 40, 30])])).toHaveLength(1);
  });

  it('keeps one box for a vehicle read as a car once and a truck once', () => {
    expect(merge([det('truck', 0.7, [100, 100, 60, 40]), det('car', 0.8, [101, 100, 60, 40])]).map(d => d.label)).toEqual(['car']);
  });

  it('keeps a person and the bicycle they ride, and objects apart', () => {
    const out = merge([det('person', 0.8, [100, 80, 20, 50]), det('bicycle', 0.7, [98, 110, 26, 25]), det('car', 0.9, [300, 100, 40, 30]), det('car', 0.9, [360, 100, 40, 30])]);
    expect(out.map(d => d.label).sort()).toEqual(['bicycle', 'car', 'car', 'person']);
  });
});

describe('scan', () => {
  /** A raw model output with one object of class `cls` in each given row. */
  const withAt = (cls: number, ...rows: number[]) => {
    const o = new Float32Array(3549 * 85);
    for (const row of rows) { o[row * 85] = 0.5; o[row * 85 + 1] = 0.5; o[row * 85 + 4] = 0.9; o[row * 85 + 5 + cls] = 0.9; }
    return o;
  };
  const withCar = (row: number) => withAt(2, row);

  it('reads every region in turn, says which, and merges what each found into the frame', async () => {
    const heard: [number, number, Region, number][] = [];
    let pass = 0;
    const out = await scan(
      { width: 1000, height: 500 }, regionsOf(1000, 500), 3,
      (_region, f) => new Uint8Array(f.width * f.height * 3).fill(90), // grey: no colour to read
      async () => (++pass === 1 ? withCar(3380 + 13 * 2 + 2) : pass === 5 ? withCar(10 * 52 + 26) : new Float32Array(3549 * 85)),
      (n, of, region, so) => heard.push([n, of, region, so]),
    );
    expect(heard.map(([n, of]) => `${n}/${of}`)).toEqual(['1/5', '2/5', '3/5', '4/5', '5/5']);
    expect(heard[4][2]).toEqual([400, 200, 600, 300]);
    expect(heard.map(h => h[3])).toEqual([0, 1, 1, 1, 1]); // the whole frame's car, before the corner's
    expect(out.passes).toBe(5);
    expect(out.detections).toHaveLength(2);
    // The far car, found only in the bottom-right corner, is placed in the frame inside that corner.
    const far = out.detections.find(d => d.box[0] > 400 && d.box[1] > 200)!;
    expect(far.box[2]).toBeLessThan(20);
    expect(out.colours).toBeNull();
  });

  it('counts people from the whole frame only: close up, a traffic signal reads as one', async () => {
    let pass = 0;
    const out = await scan(
      { width: 1000, height: 500 }, regionsOf(1000, 500), 3,
      (_region, f) => new Uint8Array(f.width * f.height * 3).fill(90),
      async () => (++pass === 1 ? withAt(0, 3380 + 13 * 2 + 2) : pass === 5 ? withAt(0, 10 * 52 + 26) : new Float32Array(3549 * 85)),
    );
    expect(out.detections.map(d => d.label)).toEqual(['person']);
    expect(out.detections[0].box[0]).toBeLessThan(400);
  });
});

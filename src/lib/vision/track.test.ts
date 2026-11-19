import { describe, expect, it } from 'vitest';
import type { Detection, Label } from './detect';
import { GONE_MS, Tracker } from './track';

const box = (x: number, y: number, label: Label = 'car', w = 80, h = 40, score = 0.8): Detection => ({ label, score, box: [x, y, w, h] });

/** Feeds frames a quarter of a second apart (or `every` ms), each a list of boxes; returns what each frame was told. */
function run(frames: Detection[][], every = 250, tracker = new Tracker()) {
  const told = frames.map((dets, i) => tracker.update(dets, 1_000_000 + i * every));
  return { tracker, told, tally: tracker.tally() };
}

describe('Tracker', () => {
  it('counts a car crossing the picture at motorway speed once, from its second sighting', () => {
    // 120 px a frame is a length and a half each quarter second.
    const { told, tally } = run(Array.from({ length: 10 }, (_, i) => [box(20 + i * 120, 300)]));
    expect(tally).toMatchObject({ vehicles: 1, counts: { car: 1 }, moving: 1, standing: 0 });
    expect(told.map(t => t.fresh)).toEqual([[], [0], [], [], [], [], [], [], [], []]);
    expect(told.slice(1).every(t => t.numbers[0] === 1)).toBe(true);
  });

  it('keeps two cars apart as they pass each other in opposite lanes', () => {
    const frames = Array.from({ length: 10 }, (_, i) => [box(20 + i * 100, 200), box(1000 - i * 100, 260)]);
    expect(run(frames).tally.vehicles).toBe(2);
  });

  it('counts each car in a moving queue', () => {
    const frames = Array.from({ length: 12 }, (_, i) => [0, 1, 2].map(k => box(40 + k * 120 + i * 40, 300)));
    expect(run(frames).tally.vehicles).toBe(3);
  });

  it('does not count a box seen in only one frame', () => {
    const frames = [[box(100, 100)], [], [], [], []];
    expect(run(frames).tally.vehicles).toBe(0);
  });

  it('counts a parked car once though the detector loses it for seconds at a time', () => {
    // A few pixels of jitter, as a detector gives a still object.
    const parked = (k: number) => box(500 + (k % 3) * 2, 400 + (k % 2) * 3);
    const frames = [[parked(0)], [parked(1)], [parked(2)], ...Array.from({ length: 20 }, () => []), [parked(3)], [parked(4)]];
    const { tally, told } = run(frames);
    expect(tally).toMatchObject({ vehicles: 1, moving: 0, standing: 1 });
    expect(told[told.length - 1].numbers).toEqual([1]);
  });

  it('counts the next car through as a new one once the last has gone', () => {
    const pass = Array.from({ length: 5 }, (_, i) => [box(20 + i * 120, 300)]);
    const gap = Array.from({ length: Math.ceil(GONE_MS / 250) + 2 }, () => []);
    expect(run([...pass, ...gap, ...pass]).tally).toMatchObject({ vehicles: 2, moving: 2 });
  });

  it('keeps a car read once as a truck a car, and a person apart from the vehicles', () => {
    const frames = Array.from({ length: 6 }, (_, i) => [
      box(100 + i * 60, 300, i === 3 ? 'truck' : 'car', 80, 40, i === 3 ? 0.5 : 0.8),
      box(130 + i * 60, 290, 'person', 20, 50),
    ]);
    expect(run(frames).tally).toMatchObject({ vehicles: 1, people: 1, counts: { car: 1, person: 1 } });
  });

  it('follows a car on a slower device, a frame a second', () => {
    const frames = Array.from({ length: 6 }, (_, i) => [box(20 + i * 200, 300)]);
    expect(run(frames, 1000).tally.vehicles).toBe(1);
  });

  it('ignores what is not a vehicle or a person', () => {
    const frames = Array.from({ length: 4 }, () => [box(100, 100, 'boat')]);
    const { tally, told } = run(frames);
    expect(tally.vehicles + tally.people).toBe(0);
    expect(told[3].numbers).toEqual([null]);
  });
});

/**
 * OSIRIS vision: what a camera frame, or a few seconds of one, comes to.
 *
 * The detector finds boxes; this turns them into what a reader or a model can
 * use: how many of each thing are in view, whether it is light enough to see,
 * how much of the picture moved since the last frame, and over a watch how
 * those changed. Pure and shared by the browser and the server.
 */
import { LABELS, VEHICLES, type Detection, type Label } from './detect';

/** How light the picture is: measured, not the time of day (a floodlit square at night reads bright). */
export type Light = 'bright' | 'dim' | 'dark';

export interface FrameAnalysis {
  /** When the frame was taken (fetched from the camera, or grabbed from its video). ISO. */
  at: string;
  width: number;
  height: number;
  detections: Detection[];
  counts: Partial<Record<Label, number>>;
  light: Light;
  /** The share of the picture that changed since the previous frame, 0–1; null for the first. */
  motion: number | null;
  /** How long the model took, ms. */
  ms: number;
}

export function countsOf(detections: Detection[]): Partial<Record<Label, number>> {
  const out: Partial<Record<Label, number>> = {};
  for (const d of detections) out[d.label] = (out[d.label] ?? 0) + 1;
  return out;
}

export const vehiclesIn = (counts: Partial<Record<Label, number>>): number =>
  VEHICLES.reduce((n, l) => n + (counts[l] ?? 0), 0);

/** From the mean brightness of the picture, 0–255. Night cameras switch to infrared and read as dim. */
export function lightOf(meanLuma: number): Light {
  return meanLuma < 45 ? 'dark' : meanLuma < 85 ? 'dim' : 'bright';
}

/** Mean of a greyscale thumbnail. */
export function meanOf(grey: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  return grey.length ? sum / grey.length : 0;
}

/**
 * How much of the picture changed between two greyscale thumbnails of the same
 * size: the share of pixels that moved by more than `threshold` levels. Small
 * enough noise (compression, sensor grain) stays under it; a passing car does
 * not. Different sizes mean the camera changed its picture: not comparable.
 */
export function motionBetween(a: ArrayLike<number>, b: ArrayLike<number>, threshold = 28): number | null {
  if (!a.length || a.length !== b.length) return null;
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > threshold) moved++;
  return moved / a.length;
}

/* ───────────── A watch: the same camera for a few seconds ───────────── */

export interface Range { min: number; mean: number; max: number }

export interface WatchSummary {
  seconds: number;
  frames: number;
  /** Frames whose picture had changed since the one before: a still camera may refresh only every minute or two. */
  changed: number;
  counts: Partial<Record<Label, Range>>;
  vehicles: Range;
  /** Mean and peak share of the picture moving, over the frames that could be compared. */
  motion: { mean: number; max: number } | null;
  /** Whether the vehicles in view grew or fell from the first third of the watch to the last. */
  trend: 'busier' | 'quieter' | 'steady' | null;
}

const range = (xs: number[]): Range => {
  if (!xs.length) return { min: 0, mean: 0, max: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { min: Math.min(...xs), mean: Math.round(mean * 10) / 10, max: Math.max(...xs) };
};

/** A frame counts as changed above this share of moving pixels. */
const CHANGED = 0.002;

export function summariseWatch(samples: FrameAnalysis[], seconds: number): WatchSummary {
  const counts: Partial<Record<Label, Range>> = {};
  for (const label of LABELS) {
    const xs = samples.map(s => s.counts[label] ?? 0);
    if (xs.some(x => x > 0)) counts[label] = range(xs);
  }
  const vehicles = samples.map(s => vehiclesIn(s.counts));
  const motions = samples.map(s => s.motion).filter((m): m is number => m !== null);
  let trend: WatchSummary['trend'] = null;
  if (samples.length >= 3) {
    const third = Math.max(1, Math.floor(samples.length / 3));
    const first = vehicles.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const last = vehicles.slice(-third).reduce((a, b) => a + b, 0) / third;
    const base = Math.max(first, 2);
    trend = last - first > base * 0.25 ? 'busier' : first - last > base * 0.25 ? 'quieter' : 'steady';
  }
  return {
    seconds,
    frames: samples.length,
    changed: motions.filter(m => m > CHANGED).length,
    counts,
    vehicles: range(vehicles),
    motion: motions.length ? { mean: Math.round((motions.reduce((a, b) => a + b, 0) / motions.length) * 1000) / 1000, max: Math.round(Math.max(...motions) * 1000) / 1000 } : null,
    trend,
  };
}

/* ───────────── In words ───────────── */

const PLURAL: Record<Label, string> = {
  person: 'people', bicycle: 'bicycles', car: 'cars', motorcycle: 'motorbikes', airplane: 'aircraft',
  bus: 'buses', train: 'trains', truck: 'trucks', boat: 'boats',
};
const SINGULAR: Record<Label, string> = {
  person: 'person', bicycle: 'bicycle', car: 'car', motorcycle: 'motorbike', airplane: 'aircraft',
  bus: 'bus', train: 'train', truck: 'truck', boat: 'boat',
};

export const labelWord = (label: Label, n: number) => (n === 1 ? SINGULAR[label] : PLURAL[label]);

/** "26 cars, 4 trucks, 1 bus", biggest first; "nothing it can count" when empty. */
export function countWords(counts: Partial<Record<Label, number>>): string {
  const parts = (Object.entries(counts) as [Label, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return parts.length ? parts.map(([l, n]) => `${n} ${labelWord(l, n)}`).join(', ') : 'nothing it can count';
}

const LIGHT_WORDS: Record<Light, string> = { bright: 'well lit', dim: 'in dim light', dark: 'in the dark' };

/** One line on a frame, for a reader or a model. */
export function describeFrame(a: FrameAnalysis): string {
  return `${countWords(a.counts)} in view, ${LIGHT_WORDS[a.light]}`;
}

/** One line on a watch. */
export function describeWatch(w: WatchSummary): string {
  const v = w.vehicles;
  const parts = [
    `watched ${w.seconds} s, ${w.frames} frame${w.frames === 1 ? '' : 's'}`,
    v.max > 0 ? `vehicles ${v.min === v.max ? v.max : `${v.min}–${v.max}`} (mean ${v.mean})` : 'no vehicles',
    w.trend ? `traffic ${w.trend}` : '',
    w.frames > 1 ? (w.changed ? `the picture changed in ${w.changed} of ${w.frames - 1} intervals` : 'the picture did not change: this camera refreshes slowly') : '',
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * What a model reads: small, plain and honest about the detector's limits.
 * The boxes themselves stay in the page; a model cannot use pixel coordinates.
 */
export function forModel(a: FrameAnalysis, watch?: WatchSummary) {
  return {
    frame_at: a.at,
    in_view: a.counts,
    vehicles: vehiclesIn(a.counts),
    light: a.light,
    picture: `${a.width}x${a.height}`,
    ...(watch ? { watch: { seconds: watch.seconds, frames: watch.frames, changed: watch.changed, vehicles: watch.vehicles, counts: watch.counts, motion: watch.motion, trend: watch.trend } } : {}),
    detector: 'OSIRIS built-in detector (YOLOX-nano). Counts what is clearly visible; small, distant, dark or hidden objects are missed, so treat counts as a floor.',
  };
}

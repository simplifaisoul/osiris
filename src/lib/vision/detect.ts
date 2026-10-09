/**
 * OSIRIS vision: the built-in camera detector, as arithmetic.
 *
 * The model is YOLOX-nano (Megvii, Apache-2.0), the official 0.1.1rc0 ONNX
 * export: a 416×416 BGR image in, 0–255 and not normalised; 3,549 candidate
 * boxes out, 85 numbers each. Those are the raw head: an offset within a grid
 * cell, a log-scaled size, an objectness and 80 class scores, the last two
 * already sigmoided. Strides of 8, 16 and 32 give grids of 52, 26 and 13.
 *
 * Everything here is pure and shared by the browser worker and the server, so
 * the overlay, OI Assist and a forecast all count a frame the same way. The
 * runtime that actually executes the model lives with each caller.
 */

/** Where the model is served from, and the size it reads. */
export const MODEL = {
  name: 'YOLOX-nano',
  url: '/vendor/yolox/0.1.1rc0/yolox_nano.onnx',
  /** The same file on disk, relative to the app's working directory. */
  path: 'public/vendor/yolox/0.1.1rc0/yolox_nano.onnx',
  input: 416,
} as const;

/**
 * The COCO classes a street camera can show and a reader cares about, by their
 * COCO index (0–8). The other 71 (handbags, kites, toasters…) are false
 * positives on a traffic camera far more often than not, so they are dropped.
 */
export const LABELS = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'] as const;
export type Label = typeof LABELS[number];

/** The vehicles a road camera is usually asked about. */
export const VEHICLES: readonly Label[] = ['car', 'truck', 'bus', 'motorcycle'];

export interface Detection {
  label: Label;
  /** objectness × class score, 0–1 */
  score: number;
  /** x, y, width, height in the frame's own pixels */
  box: [number, number, number, number];
}

/** How a frame is fitted into the model's square: scaled to fit, padded right and below. */
export interface Fit { scale: number; width: number; height: number }

export function fit(frameWidth: number, frameHeight: number, size: number = MODEL.input): Fit {
  const scale = Math.min(size / frameWidth, size / frameHeight);
  return { scale, width: Math.max(1, Math.round(frameWidth * scale)), height: Math.max(1, Math.round(frameHeight * scale)) };
}

/** YOLOX pads with grey 114, as it was trained. */
const PAD = 114;

/**
 * The model's input from the scaled frame's pixels (`width`×`height`, RGB or
 * RGBA, row by row): planar BGR in a `size`×`size` square, the frame in the
 * top-left corner and grey padding round it.
 */
export function toInput(pixels: ArrayLike<number>, width: number, height: number, channels: 3 | 4, size: number = MODEL.input): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane).fill(PAD);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const o = y * size + x;
      out[o] = pixels[i + 2];
      out[plane + o] = pixels[i + 1];
      out[2 * plane + o] = pixels[i];
    }
  }
  return out;
}

export interface DecodeOptions {
  /** Lowest objectness × class score kept. */
  threshold?: number;
  /** Overlap above which the weaker of two same-class boxes is dropped. */
  iou?: number;
  size?: number;
  /** Most boxes returned, strongest first. */
  max?: number;
}

const STRIDES = [8, 16, 32] as const;
const ROW = 85;

const overlap = (a: Detection['box'], b: Detection['box']): number => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
};

/**
 * The model's output as boxes in the frame's pixels: decoded from the grids,
 * kept above the threshold, clipped to the frame, and thinned so one object
 * is one box (per class, so a person on a bicycle is both).
 */
export function decode(output: ArrayLike<number>, scale: number, frame: { width: number; height: number }, options: DecodeOptions = {}): Detection[] {
  const { threshold = 0.3, iou = 0.45, size = MODEL.input, max = 200 } = options;
  const found: Detection[] = [];
  let row = 0;
  for (const stride of STRIDES) {
    const cells = size / stride;
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++, row++) {
        const at = row * ROW;
        if (at + ROW > output.length) return thin(found, iou, max);
        const objectness = output[at + 4];
        if (objectness < threshold) continue;
        let best = 0;
        let cls = -1;
        for (let c = 0; c < LABELS.length; c++) {
          const s = output[at + 5 + c];
          if (s > best) { best = s; cls = c; }
        }
        const score = objectness * best;
        if (cls < 0 || score < threshold) continue;
        // The strongest class overall must be one of ours: a "handbag" is not a person.
        let other = 0;
        for (let c = LABELS.length; c < 80; c++) other = Math.max(other, output[at + 5 + c]);
        if (other > best) continue;
        const cx = (output[at] + gx) * stride;
        const cy = (output[at + 1] + gy) * stride;
        const w = Math.exp(output[at + 2]) * stride;
        const h = Math.exp(output[at + 3]) * stride;
        const x1 = Math.max(0, (cx - w / 2) / scale);
        const y1 = Math.max(0, (cy - h / 2) / scale);
        const x2 = Math.min(frame.width, (cx + w / 2) / scale);
        const y2 = Math.min(frame.height, (cy + h / 2) / scale);
        if (x2 - x1 < 1 || y2 - y1 < 1) continue;
        found.push({ label: LABELS[cls], score, box: [x1, y1, x2 - x1, y2 - y1] });
      }
    }
  }
  return thin(found, iou, max);
}

/** Non-maximum suppression, per class. */
function thin(found: Detection[], iou: number, max: number): Detection[] {
  found.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of found) {
    if (kept.some(k => k.label === d.label && overlap(k.box, d.box) > iou)) continue;
    kept.push(d);
    if (kept.length >= max) break;
  }
  return kept;
}

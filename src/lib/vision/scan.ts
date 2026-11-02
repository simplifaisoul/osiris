/**
 * OSIRIS vision: reading a whole frame, in passes.
 *
 * The model reads a 416-pixel square, so a 1280-pixel camera frame is shrunk
 * to a third before it is read, and a car up the road shrinks to a few pixels
 * the model cannot make out. A large frame is therefore read five times: whole,
 * so a bus filling the view is found whole, then in four overlapping corners,
 * each 60% of the frame and so read at nearly twice the detail. On live
 * traffic cameras that finds about twice the vehicles.
 *
 * The corners count vehicles only. Close up, the model takes traffic signals
 * and road drums for people, sure of itself and with no second guess to catch
 * it by; and a person far enough away to need a corner is too small to be sure
 * of anyway. People are counted from the whole frame.
 *
 * Each pass's boxes are moved into the frame and coloured from that pass's own
 * pixels, sharper for a corner; then the passes are merged so that one object
 * is one box. The browser worker and the server read a frame this same way;
 * each brings its own pixels and its own runtime for the model.
 */
import { VEHICLES, decode, fit, toInput, type Detection, type Fit, type Label } from './detect';
import { coloursOf, lensOf, paintVehicles, type Colour, type Gains } from './colour';

/** A part of the frame: x, y, width, height in the frame's pixels. */
export type Region = [number, number, number, number];

/** Frames at least this wide are read in corners too; a smaller one already reads at nearly full detail. */
export const TILE_FROM = 560;
/** Each corner's share of the frame's width and height: 60% overlaps its neighbours by a fifth of the frame. */
const TILE = 0.6;

/** Where the detector looks: the whole frame first, then on a large frame its four corners. */
export function regionsOf(width: number, height: number): Region[] {
  const whole: Region = [0, 0, width, height];
  if (width < TILE_FROM) return [whole];
  const w = Math.round(width * TILE), h = Math.round(height * TILE);
  return [whole, [0, 0, w, h], [width - w, 0, w, h], [0, height - h, w, h], [width - w, height - h, w, h]];
}

/** How close to a region's edge a box must come to count as cut off by it, in the region's pixels. */
const EDGE = 2;

/**
 * A region's boxes (in the region's own pixels) moved into the frame. A box
 * touching an edge of the region that lies inside the frame is cut off there,
 * so it is dropped: anything small enough to need a corner lies whole in a
 * neighbouring one, and anything larger is found by the whole-frame pass.
 */
export function place(detections: Detection[], region: Region, frame: { width: number; height: number }): Detection[] {
  const [rx, ry, rw, rh] = region;
  return detections
    .filter(({ box: [x, y, w, h] }) => !(
      (rx > 0 && x <= EDGE) || (ry > 0 && y <= EDGE)
      || (rx + rw < frame.width && x + w >= rw - EDGE) || (ry + rh < frame.height && y + h >= rh - EDGE)
    ))
    .map(d => ({ ...d, box: [d.box[0] + rx, d.box[1] + ry, d.box[2], d.box[3]] as Detection['box'] }));
}

/** A car, a truck and a bus are often one vehicle read two ways; it keeps one box. */
const ALIKE = new Set<Label>(['car', 'truck', 'bus']);
const alike = (a: Label, b: Label) => a === b || (ALIKE.has(a) && ALIKE.has(b));

/**
 * Boxes from every pass as one set, strongest first. Two boxes are one object
 * when they overlap by more than `iou`, or when the smaller lies more than
 * `inside` within the larger (one vehicle read close up and from afar). A
 * person and the bicycle they ride stay two.
 */
export function merge(found: Detection[], iou = 0.45, inside = 0.7): Detection[] {
  const kept: Detection[] = [];
  for (const d of [...found].sort((a, b) => b.score - a.score)) {
    const same = kept.some(k => {
      if (!alike(k.label, d.label)) return false;
      const w = Math.min(k.box[0] + k.box[2], d.box[0] + d.box[2]) - Math.max(k.box[0], d.box[0]);
      const h = Math.min(k.box[1] + k.box[3], d.box[1] + d.box[3]) - Math.max(k.box[1], d.box[1]);
      if (w <= 0 || h <= 0) return false;
      const inter = w * h, a = k.box[2] * k.box[3], b = d.box[2] * d.box[3];
      return inter / (a + b - inter) > iou || inter / Math.min(a, b) > inside;
    });
    if (!same) kept.push(d);
  }
  return kept;
}

export interface Scan {
  detections: Detection[];
  /** The vehicles by colour; null when the picture has no colour to read. */
  colours: Partial<Record<Colour, number>> | null;
  passes: number;
  /** How long the whole read took, every pass, ms. */
  ms: number;
}

/**
 * Reads a frame region by region. `read` gives a region's pixels scaled to
 * `fit` (RGB or RGBA, row by row), `run` gives the model's output for an
 * input, and `onPass` hears as each pass begins, with how many objects the
 * passes before it found. The first region must be the
 * whole frame: the white balance, and whether there is colour at all, are
 * measured on it and used for every pass.
 */
export async function scan(
  frame: { width: number; height: number },
  regions: Region[],
  channels: 3 | 4,
  read: (region: Region, fit: Fit) => ArrayLike<number> | Promise<ArrayLike<number>>,
  run: (input: Float32Array) => Promise<ArrayLike<number>>,
  onPass?: (pass: number, of: number, region: Region, found: number) => void,
): Promise<Scan> {
  const started = performance.now();
  let lens: Gains | null = null;
  const found: Detection[] = [];
  for (const [i, region] of regions.entries()) {
    onPass?.(i + 1, regions.length, region, i ? merge(found).length : 0);
    const f = fit(region[2], region[3]);
    const pixels = await read(region, f);
    if (i === 0) lens = lensOf(pixels, channels);
    const seen = decode(await run(toInput(pixels, f.width, f.height, channels)), f.scale, { width: region[2], height: region[3] });
    const boxes = place(i === 0 ? seen : seen.filter(d => VEHICLES.includes(d.label)), region, frame);
    found.push(...paintVehicles(boxes, { data: pixels, width: f.width, height: f.height, channels, scale: f.scale, x: region[0], y: region[1] }, lens, VEHICLES));
  }
  const detections = merge(found);
  return { detections, colours: coloursOf(detections, lens), passes: regions.length, ms: Math.round(performance.now() - started) };
}

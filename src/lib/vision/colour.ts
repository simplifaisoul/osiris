/**
 * OSIRIS vision: a vehicle's colour, from its own pixels.
 *
 * Seen from a traffic camera, a vehicle's box holds its paint, its windows,
 * its tyres and its shadow. The windows and shadow are dark whatever the car,
 * so the colour is read from the lower middle of the box (the bonnet or the
 * boot, below the glass) and the dark pixels are set aside: a vehicle is black
 * only when dark is nearly all there is. Of the rest, a real colour (red, blue…)
 * must cover a good share before it wins, so a silver roof reflecting the sky
 * stays silver.
 *
 * First the picture is white-balanced on its own greys: camera footage often
 * carries a cast that would turn every grey car blue. A picture with no colour at all (a night
 * camera in infrared) gets no colours rather than a fleet of grey cars. Pure,
 * shared by the browser worker and the server.
 */

export const COLOURS = ['white', 'silver', 'grey', 'black', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown'] as const;
export type Colour = typeof COLOURS[number];

/** Hue 0–360, saturation and value 0–1. */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, v];
}

/** Below this a pixel is dark: glass, tyres, shadow, or black paint. */
const DARK = 0.25;
/** Compression adds colour noise to grey; below this saturation a pixel has no colour. */
const GREY = 0.3;

const CHROMATIC = new Set<Colour>(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown']);

function bucket(r: number, g: number, b: number): Colour {
  const [h, s, v] = hsv(r, g, b);
  if (v < DARK) return 'black';
  if (s < GREY || (v < 0.42 && s < 0.45)) return v > 0.78 ? 'white' : v > 0.58 ? 'silver' : v > 0.36 ? 'grey' : 'black';
  if (h < 14 || h >= 330) return 'red';
  if (h < 42) return v < 0.55 ? 'brown' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}

/** Whether a picture carries colour at all: an infrared night camera does not. Mean saturation over a sample of pixels. */
export function hasColour(pixels: ArrayLike<number>, channels: 3 | 4): boolean {
  let sum = 0, n = 0;
  for (let i = 0; i + 2 < pixels.length; i += channels * 7) {
    sum += hsv(pixels[i], pixels[i + 1], pixels[i + 2])[1];
    n++;
  }
  return n > 0 && sum / n >= 0.06;
}

/**
 * Gains that make the picture's greys neutral, so a camera's colour cast does
 * not paint every grey car blue. Measured on the pixels that ought to be grey
 * already (road, concrete, haze), not the whole picture: a view full of trees
 * would otherwise be "corrected" towards magenta and turn red cars purple.
 * Capped, so a scene that really is one colour (snow, a sodium-lit tunnel) is
 * not undone.
 */
export function balanceOf(pixels: ArrayLike<number>, channels: 3 | 4): Gains {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 2 < pixels.length; i += channels * 5) {
    const [, s, v] = hsv(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (s > 0.35 || v < 0.2 || v > 0.95) continue;
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
  }
  if (n < 50 || !r || !g || !b) return [1, 1, 1];
  const mean = (r + g + b) / 3;
  const gain = (c: number) => Math.min(1.35, Math.max(0.75, mean / c));
  return [gain(r), gain(g), gain(b)];
}

/**
 * The colour of a vehicle filling `box` (x, y, w, h in the pixel array's own
 * coordinates), from the lower middle of the box, white-balanced by `gains`.
 */
export function colourOf(pixels: ArrayLike<number>, width: number, height: number, channels: 3 | 4, box: readonly [number, number, number, number], gains: Gains = [1, 1, 1]): Colour | null {
  const [bx, by, bw, bh] = box;
  const x0 = Math.max(0, Math.floor(bx + bw * 0.15)), x1 = Math.min(width, Math.ceil(bx + bw * 0.85));
  const y0 = Math.max(0, Math.floor(by + bh * 0.45)), y1 = Math.min(height, Math.ceil(by + bh * 0.88));
  const counts = new Map<Colour, number>();
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      const c = bucket(Math.min(255, pixels[i] * gains[0]), Math.min(255, pixels[i + 1] * gains[1]), Math.min(255, pixels[i + 2] * gains[2]));
      counts.set(c, (counts.get(c) ?? 0) + 1);
      total++;
    }
  }
  if (total < 12) return null;
  const dark = counts.get('black') ?? 0;
  const lit = total - dark;
  // Mostly dark is a black vehicle; otherwise the dark parts are glass and shadow, and the paint is in the rest.
  if (lit < total * 0.3) return 'black';
  const ranked = [...counts.entries()].filter(([c]) => c !== 'black').sort((a, b) => b[1] - a[1]);
  const chromatic = ranked.find(([c]) => CHROMATIC.has(c));
  if (chromatic && chromatic[1] >= lit * 0.4) return chromatic[0];
  return ranked.find(([c]) => !CHROMATIC.has(c))?.[0] ?? 'black';
}

/** Gains for red, green and blue that make a picture's greys neutral. */
export type Gains = readonly [number, number, number];

/** How a picture's colours are read: through its white balance, or not at all when it has none (infrared). */
export function lensOf(pixels: ArrayLike<number>, channels: 3 | 4): Gains | null {
  return hasColour(pixels, channels) ? balanceOf(pixels, channels) : null;
}

/** Pixels the model read: the frame from (`x`, `y`), scaled by `scale` to `width`×`height`, row by row. */
export interface Pixels { data: ArrayLike<number>; width: number; height: number; channels: 3 | 4; scale: number; x: number; y: number }

/**
 * Colours every vehicle among `detections` (boxes in the frame's pixels) from
 * the pixels the model read. Without a lens the picture has no colour, and the
 * detections are left as they are.
 */
export function paintVehicles<D extends { label: string; box: readonly [number, number, number, number] }>(
  detections: D[], pixels: Pixels, lens: Gains | null, vehicles: readonly string[],
): (D & { colour?: Colour | null })[] {
  if (!lens) return detections;
  const { data, width, height, channels, scale, x: ox, y: oy } = pixels;
  return detections.map(d => {
    if (!vehicles.includes(d.label)) return d;
    const [x, y, w, h] = d.box;
    return { ...d, colour: colourOf(data, width, height, channels, [(x - ox) * scale, (y - oy) * scale, w * scale, h * scale], lens) };
  });
}

/** The vehicles by colour; null for a picture with none to read. */
export function coloursOf(detections: { colour?: Colour | null }[], lens: Gains | null): Partial<Record<Colour, number>> | null {
  if (!lens) return null;
  const out: Partial<Record<Colour, number>> = {};
  for (const { colour } of detections) if (colour) out[colour] = (out[colour] ?? 0) + 1;
  return out;
}

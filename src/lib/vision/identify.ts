/**
 * OSIRIS vision: naming the vehicles in a frame, with the reader's own model.
 *
 * The built-in detector says "car" and reads its colour; it cannot tell a
 * Corolla from a Civic, and nothing small enough to run in a browser can from
 * a vehicle thirty pixels wide. So the largest vehicles in the analysed frame
 * are cropped, numbered, and shown to the reader's vision model, which names
 * a make and model only where it can see one and says "unclear" where it
 * cannot. Number plates are never read: the prompt forbids it and the answer
 * has no field for one. Pure: shared by the page, the route and the demo.
 */
import { VEHICLES, type Detection } from './detect';

/** How the identify step's system prompt begins: the demo engine knows it by this. */
export const IDENTIFY_SYSTEM_START = 'You identify vehicles in close-up crops from public traffic cameras';

export const IDENTIFY_SYSTEM = `${IDENTIFY_SYSTEM_START}. Each image is one vehicle, numbered in the order given.

For each, say what you can see: the make and model if you can recognise them (from the shape, the grille, the lights, any badge), the body type, and the colour. Most crops are small and blurry. Name a make or model only when the vehicle itself shows it; otherwise use null. Never guess from context, never invent detail.

Never read, transcribe or describe number plates, people, or anything that identifies a person.

If you were given no images, answer {"vehicles": []}.

Answer with ONE JSON object and nothing else:
{"vehicles": [{"n": 1, "make": string|null, "model": string|null, "body": "car"|"suv"|"van"|"pickup"|"truck"|"bus"|"motorcycle"|"other", "colour": string|null, "confidence": "likely"|"possible"|"unclear"}]}`;

export function identifyPrompt(count: number, camera?: string): string {
  return `${count} vehicle crop${count === 1 ? '' : 's'}${camera ? ` from the camera "${camera.slice(0, 120)}"` : ''}, numbered 1 to ${count} in the order attached. Identify each.`;
}

export type Confidence = 'likely' | 'possible' | 'unclear';
export const BODIES = ['car', 'suv', 'van', 'pickup', 'truck', 'bus', 'motorcycle', 'other'] as const;

export interface Identity {
  n: number;
  make: string | null;
  model: string | null;
  body: typeof BODIES[number] | null;
  colour: string | null;
  confidence: Confidence;
}

/** At most this many vehicles a frame, each at least this wide in the frame, to be worth a model's look. */
export const MAX_CROPS = 6;
export const MIN_WIDTH = 28;

/** The vehicles worth identifying: the largest, big enough to show anything, as indexes into `detections`. */
export function pickVehicles(detections: Detection[], max = MAX_CROPS, minWidth = MIN_WIDTH): number[] {
  return detections
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => (VEHICLES as readonly string[]).includes(d.label) && d.box[2] >= minWidth)
    .sort((a, b) => b.d.box[2] * b.d.box[3] - a.d.box[2] * a.d.box[3])
    .slice(0, max)
    .map(({ i }) => i);
}

/** A crop around a box: a little margin, inside the frame. */
export function cropOf(box: Detection['box'], frame: { width: number; height: number }, margin = 0.12): [number, number, number, number] {
  const [x, y, w, h] = box;
  const mx = w * margin, my = h * margin;
  const x0 = Math.max(0, Math.round(x - mx)), y0 = Math.max(0, Math.round(y - my));
  const x1 = Math.min(frame.width, Math.round(x + w + mx)), y1 = Math.min(frame.height, Math.round(y + h + my));
  return [x0, y0, x1 - x0, y1 - y0];
}

const word = (v: unknown, max = 40): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s && !/^(null|none|unknown|unclear|n\/a|-)$/i.test(s) ? s : null;
};

/** The model's answer, made safe: one entry per crop, in order, every field checked and capped. */
export function parseIdentities(raw: unknown, count: number): Identity[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { vehicles?: unknown }).vehicles) ? (raw as { vehicles: unknown[] }).vehicles : [];
  const byN = new Map<number, Record<string, unknown>>();
  list.forEach((v, i) => {
    if (!v || typeof v !== 'object') return;
    const r = v as Record<string, unknown>;
    const n = Number.isInteger(r.n) && (r.n as number) >= 1 && (r.n as number) <= count ? r.n as number : i + 1;
    if (!byN.has(n) && n <= count) byN.set(n, r);
  });
  const out: Identity[] = [];
  for (let n = 1; n <= count; n++) {
    const r = byN.get(n);
    if (!r) continue;
    const body = word(r.body, 12)?.toLowerCase() ?? null;
    const make = word(r.make);
    const model = make ? word(r.model) : null;
    const confidence: Confidence = r.confidence === 'likely' || r.confidence === 'possible' ? r.confidence : 'unclear';
    out.push({
      n, make, model,
      body: body && (BODIES as readonly string[]).includes(body) ? body as Identity['body'] : null,
      colour: word(r.colour, 20)?.toLowerCase() ?? null,
      confidence: make ? confidence : 'unclear',
    });
  }
  return out;
}

/** "Toyota Corolla", "a Ford", or "unclear". */
export function identityWords(id: Identity): string {
  if (!id.make) return 'unclear';
  return `${id.make}${id.model ? ` ${id.model}` : ''}`;
}

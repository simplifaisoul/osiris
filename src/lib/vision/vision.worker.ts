/**
 * OSIRIS vision worker: runs the camera detector off the main thread, so
 * counting a frame never stalls the map.
 *
 * ONNX Runtime's WebAssembly build executes the model. It is single-threaded
 * on purpose: threads need cross-origin isolation, which the page does not
 * have, and one core runs YOLOX-nano in well under a second. The engine and
 * the model load on the first frame and stay for the session; neither is
 * fetched by anyone who never presses Analyze.
 *
 * Messages in:  { type: 'analyse', id, image: ImageBitmap, at, session }
 *               { type: 'forget', session }
 * Messages out: { id, analysis } or { id, error }
 */
import * as ort from 'onnxruntime-web/wasm';
import { MODEL, decode, fit, toInput } from './detect';
import { countsOf, lightOf, meanOf, motionBetween, type FrameAnalysis } from './analysis';

type Request =
  | { type: 'analyse'; id: number; image: ImageBitmap; at: string; session: string }
  | { type: 'forget'; session: string };

// The DOM typings describe a window; this file runs in a worker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown): void;
};

let model: Promise<ort.InferenceSession> | null = null;

function session(): Promise<ort.InferenceSession> {
  if (!model) {
    // The engine's .wasm is emitted by the bundler next to this worker, with a hashed name that caches for good.
    ort.env.wasm.numThreads = 1;
    model = ort.InferenceSession.create(MODEL.url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    // A failed load (offline, a blocked file) is tried again on the next frame rather than remembered.
    model.catch(() => { model = null; });
  }
  return model;
}

/** The last thumbnail of each camera being watched, to measure motion against. */
const thumbs = new Map<string, Uint8Array>();
const THUMB = 64;

function pixels(image: ImageBitmap, width: number, height: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D canvas in this browser');
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

async function analyse(image: ImageBitmap, at: string, key: string): Promise<FrameAnalysis> {
  const { width, height } = image;
  if (!width || !height) throw new Error('The frame is empty');
  const f = fit(width, height);
  let input: Float32Array;
  let grey: Uint8Array;
  try {
    input = toInput(pixels(image, f.width, f.height), f.width, f.height, 4);
    const th = Math.max(1, Math.round((THUMB * height) / width));
    const small = pixels(image, THUMB, th);
    grey = new Uint8Array(THUMB * th);
    for (let i = 0; i < grey.length; i++) grey[i] = (small[i * 4] * 299 + small[i * 4 + 1] * 587 + small[i * 4 + 2] * 114) / 1000;
  } catch (err) {
    // A video from another site without CORS taints the canvas: the browser will not hand over its pixels.
    if (err instanceof DOMException && err.name === 'SecurityError') throw new Error('The browser will not let this feed be read');
    throw err;
  } finally {
    image.close();
  }
  const s = await session();
  const started = performance.now();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MODEL.input, MODEL.input]) });
  const ms = Math.round(performance.now() - started);
  const detections = decode(out[s.outputNames[0]].data as Float32Array, f.scale, { width, height });
  const previous = thumbs.get(key);
  thumbs.set(key, grey);
  if (thumbs.size > 8) thumbs.delete(thumbs.keys().next().value!);
  return {
    at, width, height, detections, counts: countsOf(detections), light: lightOf(meanOf(grey)),
    motion: previous ? motionBetween(previous, grey) : null, ms,
  };
}

// One frame at a time: frames queue rather than compete for the one core.
let queue: Promise<unknown> = Promise.resolve();

scope.onmessage = ({ data }) => {
  if (data.type === 'forget') { thumbs.delete(data.session); return; }
  const { id, image, at, session: key } = data;
  queue = queue.then(() => analyse(image, at, key))
    .then(analysis => scope.postMessage({ id, analysis }))
    .catch(err => scope.postMessage({ id, error: err instanceof Error ? err.message : 'The frame could not be analysed' }));
};

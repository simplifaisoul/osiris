/**
 * OSIRIS vision on the server: the same detector, for a forecast.
 *
 * A forecast runs on the server, so when its plan asks to look at cameras the
 * frames are counted here: ONNX Runtime's WebAssembly build under Node, the
 * same YOLOX-nano file the browser loads from public/, and sharp to decode and
 * scale the picture. One frame at a time, single-threaded, loaded on first use:
 * a forecast that never asks for cameras costs nothing.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { InferenceSession } from 'onnxruntime-web';
import { MODEL, decode, fit, toInput } from './detect';
import { countsOf, lightOf, meanOf, type FrameAnalysis } from './analysis';

type Ort = typeof import('onnxruntime-web');

let loaded: Promise<{ ort: Ort; session: InferenceSession }> | null = null;

function model() {
  if (!loaded) {
    loaded = (async () => {
      const ort = await import('onnxruntime-web');
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(await readFile(join(process.cwd(), MODEL.path)), { graphOptimizationLevel: 'all' });
      return { ort, session };
    })();
    // A failed load is tried again next time rather than remembered.
    loaded.catch(() => { loaded = null; });
  }
  return loaded;
}

async function run(bytes: Buffer, at: string): Promise<FrameAnalysis> {
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error('The frame is empty');
  const f = fit(width, height);
  const pixels = await sharp(bytes).resize(f.width, f.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const grey = await sharp(bytes).resize(64, Math.max(1, Math.round((64 * height) / width)), { fit: 'fill' }).greyscale().raw().toBuffer();
  const { ort, session } = await model();
  const started = performance.now();
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', toInput(pixels, f.width, f.height, 3), [1, 3, MODEL.input, MODEL.input]) });
  const ms = Math.round(performance.now() - started);
  const detections = decode(out[session.outputNames[0]].data as Float32Array, f.scale, { width, height });
  return { at, width, height, detections, counts: countsOf(detections), light: lightOf(meanOf(grey)), motion: null, ms };
}

let queue: Promise<unknown> = Promise.resolve();

/** Counts what is in a picture. Frames queue: one core, one frame at a time. */
export function analyseImage(bytes: Buffer, at: string): Promise<FrameAnalysis> {
  const job = queue.then(() => run(bytes, at));
  queue = job.catch(() => {});
  return job;
}

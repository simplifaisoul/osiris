/**
 * OSIRIS vision on the server: the same detector, for a forecast.
 *
 * A forecast runs on the server, so when its plan asks to look at cameras the
 * frames are counted here: ONNX Runtime's WebAssembly build under Node, the
 * same YOLOX-nano file the browser loads from public/, and sharp to decode and
 * scale the picture, read in the same passes as the browser (scan.ts). One
 * frame at a time, single-threaded, loaded on first use: a forecast that never
 * asks for cameras costs nothing.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { InferenceSession } from 'onnxruntime-web';
import { MODEL } from './detect';
import { regionsOf, scan } from './scan';
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
  const grey = await sharp(bytes).resize(64, Math.max(1, Math.round((64 * height) / width)), { fit: 'fill' }).greyscale().raw().toBuffer();
  const { ort, session } = await model();
  const read = await scan(
    { width, height }, regionsOf(width, height), 3,
    ([left, top, w, h], f) => sharp(bytes).extract({ left, top, width: w, height: h }).resize(f.width, f.height, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    async input => (await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MODEL.input, MODEL.input]) }))[session.outputNames[0]].data as Float32Array,
  );
  return {
    at, width, height, detections: read.detections, counts: countsOf(read.detections), colours: read.colours, light: lightOf(meanOf(grey)),
    motion: null, passes: read.passes, ms: read.ms,
  };
}

let queue: Promise<unknown> = Promise.resolve();

/** Counts what is in a picture. Frames queue: one core, one frame at a time. */
export function analyseImage(bytes: Buffer, at: string): Promise<FrameAnalysis> {
  const job = queue.then(() => run(bytes, at));
  queue = job.catch(() => {});
  return job;
}

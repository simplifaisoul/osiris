/**
 * OSIRIS vision on the main thread: getting a camera's frame, and handing it
 * to the detector in its worker (vision.worker.ts).
 *
 * A still camera's frame comes from /api/cctv/frame, on OSIRIS's own origin:
 * the browser will only give up a picture's pixels when it comes from the
 * page's own site or one that allows it, and most camera hosts do not. A live
 * stream's frame is taken from the <video> already playing it.
 */
import type { FrameAnalysis } from './analysis';

type Waiting = { resolve: (a: FrameAnalysis) => void; reject: (e: Error) => void };
type Reply = { id: number; analysis?: FrameAnalysis; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, Waiting>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    if (data.analysis) job.resolve(data.analysis);
    else job.reject(new Error(data.error || 'The frame could not be analysed'));
  };
  // A worker that never starts fails every frame, and the next request starts a fresh one.
  worker.onerror = event => {
    for (const job of waiting.values()) job.reject(new Error(event.message || 'The detector could not start'));
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Counts what is in a frame. The bitmap is handed over to the worker, not copied. */
export function analyseBitmap(image: ImageBitmap, at: string, session: string): Promise<FrameAnalysis> {
  const id = ++nextId;
  const target = getWorker();
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    target.postMessage({ type: 'analyse', id, image, at, session }, [image]);
  });
}

/** Drops what the worker remembers of a camera, so a later watch starts fresh. */
export function forgetSession(session: string): void {
  worker?.postMessage({ type: 'forget', session });
}

export interface Grab {
  image: ImageBitmap;
  /** An object URL of the same frame, for the overlay to show; the caller revokes it. */
  url: string;
  at: string;
}

/** A still camera's current frame, through OSIRIS. */
export async function grabStill(cameraId: string, signal?: AbortSignal): Promise<Grab> {
  const res = await fetch(`/api/cctv/frame?id=${encodeURIComponent(cameraId)}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `The camera's frame could not be fetched (${res.status})`);
  }
  const blob = await res.blob();
  const image = await createImageBitmap(blob);
  return { image, url: URL.createObjectURL(blob), at: res.headers.get('x-frame-at') || new Date().toISOString() };
}

/** The frame a live stream is showing now. */
export async function grabVideo(video: HTMLVideoElement): Promise<Grab> {
  if (video.readyState < 2 || !video.videoWidth) throw new Error('The stream has not started playing yet');
  const image = await createImageBitmap(video);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    image.close();
    throw new Error('The browser will not let this feed be read');
  }
  if (!blob) { image.close(); throw new Error('The stream frame could not be captured'); }
  return { image, url: URL.createObjectURL(blob), at: new Date().toISOString() };
}

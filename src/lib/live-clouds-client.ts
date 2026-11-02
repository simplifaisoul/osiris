import type { CloudImage, Tile } from './live-clouds';

/**
 * OSIRIS — Live Clouds on the main thread: hands tile requests to the worker
 * (live-clouds.worker.ts) and gets drawn cloud back.
 */

type Waiting = { resolve: (image: CloudImage) => void; reject: (error: unknown) => void };
type Reply = { id: number; rgba?: CloudImage['rgba']; height?: CloudImage['height']; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, Waiting>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./live-clouds.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    if (data.rgba && data.height) job.resolve({ rgba: data.rgba, height: data.height });
    else job.reject(new Error(data.error || 'Clouds tile failed'));
  };
  // A worker that never starts fails every tile, not just the next one.
  worker.onerror = event => {
    for (const job of waiting.values()) job.reject(new Error(event.message || 'Clouds worker failed'));
    waiting.clear();
  };
  return worker;
}

/** One tile of cloud, drawn off the main thread. Aborting the signal drops it in the worker too. */
export function requestCloudTile(tile: Tile, signal: AbortSignal): Promise<CloudImage> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const id = ++nextId;
  const target = getWorker();
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    signal.addEventListener('abort', () => {
      if (!waiting.delete(id)) return;
      target.postMessage({ type: 'cancel', id });
      reject(signal.reason);
    }, { once: true });
    target.postMessage({ type: 'tile', id, tile });
  });
}

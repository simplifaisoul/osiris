/**
 * OSIRIS vision: one look at a camera, shared by everyone watching it.
 *
 * The reader's Analyze and Watch buttons and OI Assist's camera tool both go
 * through `look`, and the camera viewer's overlay draws whatever this store
 * holds for its camera. So when OI looks at a camera the reader sees the same
 * boxes appear, and a look started from either side shows up in both.
 */
import { useSyncExternalStore } from 'react';
import { describeFrame, summariseWatch, type FrameAnalysis, type WatchSummary } from './analysis';
import { analyseBitmap, forgetSession, grabStill, grabVideo, type Grab } from './client';
import { sourceOf, type VisionCamera } from './source';
import { cropOf, pickVehicles, type Identity } from './identify';
import { errorOf, headersFor, loadEngine, loadKey } from '../oi/client';

export { sourceOf, type VisionCamera };

export interface Look {
  status: 'working' | 'done' | 'error';
  mode: 'frame' | 'watch';
  /** Who asked: the reader, or OI Assist. */
  by: 'you' | 'oi';
  error?: string;
  /** The frame the boxes were found on, as an object URL. */
  frame?: string;
  analysis?: FrameAnalysis;
  /** A watch: how long, how far through, and once done what it came to. */
  watch?: { seconds: number; elapsed: number; summary?: WatchSummary };
  /** The vehicles named by the reader's own model, by their index among the detections. */
  identify?: { status: 'working' | 'done' | 'error'; error?: string; byIndex: Record<number, Identity> };
}

const looks = new Map<string, Look>();
const running = new Map<string, AbortController>();
const videos = new Map<string, HTMLVideoElement>();
const listeners = new Set<() => void>();

function set(id: string, next: Look | null) {
  const prev = looks.get(id);
  if (prev?.frame && prev.frame !== next?.frame) URL.revokeObjectURL(prev.frame);
  if (next) looks.set(id, next); else looks.delete(id);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** The look at a camera, for its overlay. */
export function useLook(id: string | null | undefined): Look | null {
  return useSyncExternalStore(subscribe, () => (id ? looks.get(id) ?? null : null), () => null);
}

/** The camera viewer says which <video> is playing a stream camera, so its frames can be read. */
export function registerVideo(id: string, video: HTMLVideoElement | null) {
  if (video) videos.set(id, video); else videos.delete(id);
}

/** Stops a look and clears its overlay. */
export function clearLook(id: string) {
  running.get(id)?.abort();
  running.delete(id);
  forgetSession(id);
  set(id, null);
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

/** Waits for the viewer to start playing a stream camera, up to `ms`. */
async function videoFor(id: string, signal: AbortSignal, ms = 10_000): Promise<HTMLVideoElement> {
  const until = Date.now() + ms;
  for (;;) {
    const v = videos.get(id);
    if (v && v.readyState >= 2 && v.videoWidth) return v;
    if (Date.now() > until) throw new Error('The stream did not start playing');
    await sleep(250, signal);
  }
}

/** Seconds between frames in a watch: a still camera's picture is held for a few seconds anyway. */
const STEP = { still: 5, video: 1 } as const;

export interface LookResult { camera: string; analysis: FrameAnalysis; watch?: WatchSummary; text: string }

/**
 * Looks at a camera: one frame, or with `watch` seconds a run of frames, each
 * counted. Starting a new look at a camera stops the one before.
 */
export async function look(camera: VisionCamera, options: { watch?: number; by?: 'you' | 'oi' } = {}): Promise<LookResult> {
  const source = sourceOf(camera);
  if (!source) throw new Error('This camera is a web player, so its picture cannot be read');
  const id = camera.id;
  running.get(id)?.abort();
  const controller = new AbortController();
  running.set(id, controller);
  const { signal } = controller;
  const seconds = Math.max(0, Math.min(60, Math.round(options.watch ?? 0)));
  const mode = seconds > 0 ? 'watch' : 'frame';
  const by = options.by ?? 'you';
  const base: Look = { status: 'working', mode, by, ...(mode === 'watch' ? { watch: { seconds, elapsed: 0 } } : {}) };
  const keep = looks.get(id)?.frame;
  set(id, { ...base, frame: keep });
  forgetSession(id);

  const samples: FrameAnalysis[] = [];
  const started = Date.now();
  try {
    for (;;) {
      const grab: Grab = source === 'still' ? await grabStill(id, signal) : await grabVideo(await videoFor(id, signal));
      if (signal.aborted) { grab.image.close(); URL.revokeObjectURL(grab.url); throw signal.reason; }
      const analysis = await analyseBitmap(grab.image, grab.at, id);
      if (signal.aborted) { URL.revokeObjectURL(grab.url); throw signal.reason; }
      samples.push(analysis);
      const elapsed = Math.min(seconds, (Date.now() - started) / 1000);
      set(id, { ...base, frame: grab.url, analysis, ...(mode === 'watch' ? { watch: { seconds, elapsed } } : {}) });
      if (mode === 'frame' || elapsed >= seconds) break;
      // Frames on a fixed beat from the start, so a slow fetch does not stretch the watch.
      await sleep(Math.max(0, started + samples.length * STEP[source] * 1000 - Date.now()), signal);
    }
    const last = samples[samples.length - 1];
    const watch = mode === 'watch' ? summariseWatch(samples, seconds) : undefined;
    const current = looks.get(id);
    set(id, { ...base, status: 'done', frame: current?.frame, analysis: last, ...(watch ? { watch: { seconds, elapsed: seconds, summary: watch } } : {}) });
    return { camera: id, analysis: last, watch, text: describeFrame(last) };
  } catch (err) {
    if (signal.aborted) throw new Error('The look was stopped');
    const message = err instanceof Error ? err.message : 'The camera could not be analysed';
    set(id, { ...base, status: 'error', error: message, frame: looks.get(id)?.frame });
    throw new Error(message);
  } finally {
    if (running.get(id) === controller) running.delete(id);
  }
}

/* ───────────── Naming the vehicles ───────────── */

const base64Of = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** The vehicles cut out of the frame on screen, each scaled to about 256 px on its long side. */
async function cropsOf(frame: string, boxes: [number, number, number, number][], size: { width: number; height: number }): Promise<string[]> {
  const image = await createImageBitmap(await (await fetch(frame)).blob());
  try {
    const out: string[] = [];
    for (const box of boxes) {
      const [x, y, w, h] = cropOf(box, size);
      const k = Math.min(4, 256 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) out.push(await base64Of(blob));
    }
    return out;
  } finally {
    image.close();
  }
}

/**
 * Names the largest vehicles in the camera's analysed frame with the reader's
 * own vision model: make, model, body and colour where it can see them. The
 * answer is pinned to the boxes it was asked about, and dropped if the frame
 * has moved on in the meantime.
 */
export async function identifyVehicles(camera: VisionCamera): Promise<void> {
  const id = camera.id;
  const current = looks.get(id);
  const a = current?.analysis;
  if (!current || !a || !current.frame || current.status === 'working') return;
  const frame = current.frame;
  const fail = (error: string) => { const now = looks.get(id); if (now?.frame === frame) set(id, { ...now, identify: { status: 'error', error, byIndex: {} } }); };
  const picked = pickVehicles(a.detections);
  if (!picked.length) return fail('No vehicle in view is large enough to identify');
  const engine = loadEngine();
  const key = engine ? loadKey(engine.provider) : '';
  if (!engine || (engine.provider !== 'demo' && !key)) return fail('Add your AI key in OI to name makes and models');
  set(id, { ...current, identify: { status: 'working', byIndex: {} } });
  try {
    const crops = await cropsOf(frame, picked.map(i => a.detections[i].box), a);
    const res = await fetch('/api/oi/identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headersFor(engine, key) },
      body: JSON.stringify({ camera: camera.name, crops: crops.map((image, j) => ({ n: j + 1, image })) }),
    });
    if (!res.ok) return fail(await errorOf(res));
    const { vehicles } = await res.json() as { vehicles: Identity[] };
    const byIndex: Record<number, Identity> = {};
    for (const v of vehicles) if (picked[v.n - 1] !== undefined) byIndex[picked[v.n - 1]] = v;
    const now = looks.get(id);
    if (now?.frame === frame) set(id, { ...now, identify: { status: 'done', byIndex } });
  } catch {
    fail('The vehicles could not be identified just then');
  }
}

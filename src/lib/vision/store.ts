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

import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * OSIRIS — the camera catalogue, saved.
 *
 * Cameras were assembled live, per request, from 48 upstreams. That put every
 * visitor behind the slowest provider of the moment: production served 23,240
 * cameras in 13s with eleven regions permanently missing, and a single upstream
 * that hung made everyone wait out the full budget.
 *
 * Where the cameras *are* changes on the order of weeks — the frames themselves
 * are pulled live by the browser, straight from the source. So the catalogue is
 * written to disk, restored at boot, and refreshed in the background. Requests
 * never touch an upstream; they read something already built.
 *
 * The payload is serialised and gzipped once per rebuild, not per request. At
 * ~7.8MB of JSON that is the difference between a response costing real CPU and
 * one costing a buffer write.
 */

export type Camera = Record<string, unknown>;
export type RegionCameras = Record<string, Camera[]>;

const SNAPSHOT_VERSION = 1;

/** Overridable so a test never writes into the real cache directory. */
export const snapshotPath = () =>
  process.env.OSIRIS_CCTV_SNAPSHOT || join(process.cwd(), '.cache', 'cctv-catalog.json');

interface SnapshotFile {
  version: number;
  builtAt: number;
  regions: RegionCameras;
}

/** Restore the catalogue written by an earlier run. */
export async function readSnapshot(): Promise<SnapshotFile | null> {
  // 'off' keeps tests off the filesystem entirely: real disk I/O cannot be
  // flushed deterministically under fake timers, and these caches are module
  // state that leaks between cases if a read lands late.
  if (process.env.OSIRIS_CCTV_SNAPSHOT === 'off') return null;
  try {
    const raw = await readFile(snapshotPath(), 'utf8');
    const parsed = JSON.parse(raw) as SnapshotFile;
    if (parsed?.version !== SNAPSHOT_VERSION || !parsed.regions) return null;
    return parsed;
  } catch {
    return null; // absent or unreadable: the catalogue simply rebuilds
  }
}

/**
 * Write via a temporary file and rename, so a crash mid-write cannot leave a
 * half-written catalogue that the next boot would refuse to parse.
 */
export async function writeSnapshot(regions: RegionCameras): Promise<void> {
  const path = snapshotPath();
  const payload: SnapshotFile = { version: SNAPSHOT_VERSION, builtAt: Date.now(), regions };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(payload));
  await rename(temporary, path);
}

export interface Payload {
  json: Buffer;
  gzip: Buffer;
  etag: string;
  total: number;
  complete: boolean;
  builtAt: number;
}

let payload: Payload | undefined;

/** Serialise and compress once, then hand the same buffers to every caller. */
export function buildPayload(body: unknown, total: number, complete: boolean): Payload {
  const json = Buffer.from(JSON.stringify(body));
  payload = {
    json,
    gzip: gzipSync(json, { level: 6 }),
    etag: `W/"${createHash('sha1').update(json).digest('base64url')}"`,
    total,
    complete,
    builtAt: Date.now(),
  };
  return payload;
}

export const getPayload = () => payload;
export const clearPayload = () => { payload = undefined; };

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { httpJson } from '@/lib/httpJson';

/**
 * OSIRIS — the one door to the app's place lookups.
 *
 * Place search, the map's location readout, the region dossier, the news
 * alert pins and forecasts all find places through here, and here asks a
 * Photon geocoder (github.com/komoot/photon) that the deployment runs itself,
 * at PHOTON_URL. Photon's prebuilt database is a download away, and a server
 * of our own has no usage policy for our traffic to outgrow.
 *
 * The public servers are not used. Komoot's Photon demo and
 * nominatim.openstreetmap.org are shared services with small fair-use limits,
 * and a map with many visitors cannot stay inside them: Nominatim's operators
 * wrote to us about our rate (issue #16), and the Photon demo has blocked this
 * app. So the rules are:
 *
 *   • Without PHOTON_URL nothing is asked. Every lookup resolves null and each
 *     feature shows what it can without a place name, rather than falling
 *     back to someone else's server.
 *   • The browser never asks the geocoder; only the server does, through this
 *     module, so one cache serves every visitor.
 *   • Answers are cached for a month and written to disk, so a restart or a
 *     deploy does not ask again. A place does not move.
 *   • A few requests run at once and a short queue waits behind them; a burst
 *     beyond that is refused rather than queued, so the geocoder is never
 *     buried and a caller is never left waiting on a pile.
 *   • When the geocoder fails, it is left alone for half a minute, so an
 *     outage costs callers nothing instead of a timeout each.
 *
 * Results are © OpenStreetMap contributors (ODbL). Anything shown to a reader
 * from this module has to say so — see ATTRIBUTION.
 */

/** The geocoder's address, e.g. `http://geocoder.internal:2322`; empty turns lookups off. */
const baseUrl = () => (process.env.PHOTON_URL || '').trim().replace(/\/+$/, '');

/** Places do not move. */
const HIT_TTL_MS = 30 * 24 * 3_600_000;
const MAX_ENTRIES = 20_000;
/** How many requests may be at the geocoder at once. */
const MAX_IN_FLIGHT = 4;
/** Deeper than this, a request is refused instead of queued. */
const MAX_QUEUE = 40;
/** How long to leave the geocoder alone after it fails. */
const BACKOFF_MS = 30_000;
const TIMEOUT_MS = 8_000;

/** What every surface showing a geocoder answer must display. */
export const ATTRIBUTION = '© OpenStreetMap contributors';

/** Photon's parameters; a list is sent as the same key repeated (`layer=city&layer=locality`). */
export type PhotonParams = Record<string, string | string[]>;

interface Entry { value: unknown; expires: number }

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let active = 0;
const waiting: (() => void)[] = [];
let downUntil = 0;
let warnedUnset = false;

/** Counted so the health check can show what we are actually sending. */
const stats = { served: 0, fromCache: 0, sent: 0, refused: 0, failed: 0 };

const snapshotPath = () => process.env.OSIRIS_PHOTON_CACHE || join(process.cwd(), '.cache', 'photon.json');

let loaded: Promise<void> | null = null;
let dirty = false;

/** Reads the cache written by an earlier run, once. */
function ensureLoaded(): Promise<void> {
  loaded ??= (async () => {
    if (process.env.OSIRIS_PHOTON_CACHE === 'off') return;
    try {
      const raw = await fs.readFile(snapshotPath(), 'utf8');
      const saved = JSON.parse(raw) as Record<string, Entry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(saved)) {
        if (entry && entry.expires > now) cache.set(key, entry);
      }
      console.log(`[OSIRIS] Place cache restored: ${cache.size} answers from disk`);
    } catch { /* first run, or an unreadable snapshot — start empty */ }
  })();
  return loaded;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  dirty = true;
  if (saveTimer || process.env.OSIRIS_PHOTON_CACHE === 'off') return;
  // Batched: a burst of lookups costs one write, a minute after the first.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    void save();
  }, 60_000);
  saveTimer.unref?.();
}

async function save(): Promise<void> {
  const path = snapshotPath();
  try {
    await fs.mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(Object.fromEntries(cache)), 'utf8');
    await fs.rename(temporary, path);
  } catch (error) {
    console.warn('[OSIRIS] Could not save the place cache:', error);
  }
}

function remember(key: string, value: unknown) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + HIT_TTL_MS });
  scheduleSave();
}

/** Waits for a free request slot; the returned function hands it on. */
async function slot(): Promise<() => void> {
  if (active < MAX_IN_FLIGHT) active++;
  else await new Promise<void>(resolve => waiting.push(resolve));
  return () => {
    const next = waiting.shift();
    if (next) next(); // the slot passes straight to the next in line
    else active--;
  };
}

/** Whether this deployment has a geocoder to ask. */
export function photonConfigured(): boolean {
  return baseUrl() !== '';
}

/**
 * Ask the geocoder, or answer from what we already know.
 *
 * `api` is forward search, `reverse` names a coordinate. Resolves null when
 * there is no geocoder, when the answer is not cached and the queue is full or
 * the geocoder is resting after a failure, or when the request fails. Callers
 * show what they can without it.
 */
export async function photon<T>(
  endpoint: 'api' | 'reverse',
  params: PhotonParams,
  options: {
    /** Answer from the cache or not at all — never send a request for this one. */
    cacheOnly?: boolean;
  } = {},
): Promise<T | null> {
  const base = baseUrl();
  if (!base) {
    if (!warnedUnset) console.warn('[OSIRIS] PHOTON_URL is not set: place search and place names are off.');
    warnedUnset = true;
    return null;
  }
  await ensureLoaded();

  const query = new URLSearchParams({ lang: 'en' });
  for (const [k, v] of Object.entries(params)) {
    query.delete(k);
    for (const one of [v].flat()) query.append(k, one);
  }
  const key = `${endpoint}?${[...query.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')}`;

  stats.served++;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.fromCache++;
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T | null>;

  if (options.cacheOnly || waiting.length >= MAX_QUEUE || Date.now() < downUntil) {
    stats.refused++;
    return null;
  }

  const run = (async () => {
    const release = await slot();
    // It may have failed while this one waited in line; then don't add to it.
    if (Date.now() < downUntil) {
      stats.refused++;
      release();
      return null;
    }
    try {
      const value = await httpJson<T>(`${base}/${endpoint}?${query}`, { timeoutMs: TIMEOUT_MS });
      stats.sent++;
      remember(key, value);
      return value;
    } catch (error) {
      stats.failed++;
      downUntil = Date.now() + BACKOFF_MS;
      console.warn(`[OSIRIS] Photon ${endpoint} failed:`, error instanceof Error ? error.message : error);
      return null;
    } finally {
      release();
    }
  })();

  inflight.set(key, run);
  return run.finally(() => inflight.delete(key)) as Promise<T | null>;
}

/** How much we have asked of the geocoder since this process started. */
export function photonStats() {
  return { ...stats, cached: cache.size, active, queued: waiting.length, configured: photonConfigured() };
}

/** Test seam — forget every answer and reset the counters. */
export function clearPhotonCache(): void {
  cache.clear();
  inflight.clear();
  active = 0;
  waiting.length = 0;
  downUntil = 0;
  warnedUnset = false;
  loaded = null;
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = 0;
}

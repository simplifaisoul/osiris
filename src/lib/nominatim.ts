import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { httpJson } from '@/lib/httpJson';

/**
 * OSIRIS — the backup place search, through a Nominatim server.
 *
 * Off unless the operator of a copy sets NOMINATIM_URL. When it is set, the
 * search box offers "Search OpenStreetMap" under its results, and only that
 * choice asks Nominatim, through /api/geosearch and this module. Typing never
 * does: Nominatim's usage policy does not allow search-as-you-type
 * (operations.osmfoundation.org/policies/nominatim).
 *
 * It is off by default because nominatim.openstreetmap.org's operators asked
 * this project to stop using it (2026-09-20, issue #16, for running at ten
 * times the allowed rate; 2026-10-31, on PR 457). A copy whose operator turns
 * it on is that operator's own use of the server they point it at, under that
 * server's rules. So the rules here are:
 *
 *   • The browser never calls Nominatim. Only the server does, through this
 *     module, so one cache and one budget serve everyone using the copy.
 *   • One request every two seconds at most — half the policy's allowance,
 *     because a deployment may run more than one instance of this app and
 *     they cannot see each other's budgets.
 *   • Answers are cached for a month and written to disk, so a restart or a
 *     deploy does not ask again. A place does not move.
 *   • A burst beyond the queue length is refused rather than queued. A caller
 *     gets null and shows what it can without the answer.
 *
 * Results are © OpenStreetMap contributors (ODbL). Anything shown to a reader
 * from this module has to say so — see ATTRIBUTION.
 */

/** The server's address, e.g. `https://nominatim.example.org`; empty turns it off. */
const baseUrl = () => (process.env.NOMINATIM_URL || '').trim().replace(/\/+$/, '');

/**
 * How long to leave between requests: half the policy's one a second, since
 * instances of this app cannot see each other's budgets.
 *
 * `OSIRIS_NOMINATIM_GAP_MS` exists so tests do not have to wait seconds. Under
 * anything but a test run the policy's own limit is the floor, whatever the
 * environment asks for — a typo in a deployment config must not be able to
 * turn this into the traffic that got us written to.
 */
export function requestGapMs(env: NodeJS.ProcessEnv = process.env): number {
  const asked = Number(env.OSIRIS_NOMINATIM_GAP_MS);
  if (!Number.isFinite(asked) || asked <= 0) return 2_000;
  return env.NODE_ENV === 'test' ? asked : Math.max(1_000, asked);
}

const MIN_GAP_MS = requestGapMs();
/** Places do not move; failures are worth retrying sooner than that. */
const HIT_TTL_MS = 30 * 24 * 3_600_000;
const FAIL_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 20_000;
/** Deeper than this, a request is refused instead of queued. */
const MAX_QUEUE = 40;

/** What every surface showing a Nominatim answer must display. */
export const ATTRIBUTION = '© OpenStreetMap contributors';

interface Entry { value: unknown; expires: number }

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let queueDepth = 0;
let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Counted so the health check can show what we are actually sending. */
const stats = { served: 0, fromCache: 0, sent: 0, refused: 0, failed: 0 };

const snapshotPath = () => process.env.OSIRIS_NOMINATIM_CACHE || join(process.cwd(), '.cache', 'nominatim.json');

let loaded: Promise<void> | null = null;
let dirty = false;

/** Reads the cache written by an earlier run, once. */
function ensureLoaded(): Promise<void> {
  loaded ??= (async () => {
    if (process.env.OSIRIS_NOMINATIM_CACHE === 'off') return;
    try {
      const raw = await fs.readFile(snapshotPath(), 'utf8');
      const saved = JSON.parse(raw) as Record<string, Entry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(saved)) {
        if (entry && entry.expires > now) cache.set(key, entry);
      }
      console.log(`[OSIRIS] Nominatim cache restored: ${cache.size} answers from disk`);
    } catch { /* first run, or an unreadable snapshot — start empty */ }
  })();
  return loaded;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  dirty = true;
  if (saveTimer || process.env.OSIRIS_NOMINATIM_CACHE === 'off') return;
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
    console.warn('[OSIRIS] Could not save the Nominatim cache:', error);
  }
}

function remember(key: string, value: unknown, ttl: number) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + ttl });
  scheduleSave();
}

/** Whether this copy's operator turned the Nominatim backup on. */
export function nominatimConfigured(): boolean {
  return baseUrl() !== '';
}

/**
 * Ask the Nominatim server's search, or answer from what we already know.
 *
 * Resolves null when it is off, when the answer is not cached and the queue is
 * already as long as we are willing to make somebody else's server work for
 * us, or when the request fails. Callers show what they can without it.
 */
export async function nominatim<T>(params: Record<string, string>): Promise<T | null> {
  const base = baseUrl();
  if (!base) return null;
  await ensureLoaded();

  const query = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'en', ...params });
  const key = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');

  stats.served++;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.fromCache++;
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T | null>;

  if (queueDepth >= MAX_QUEUE) {
    stats.refused++;
    return null;
  }

  queueDepth++;
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    try {
      const value = await httpJson<T>(`${base}/search?${query}`, { timeoutMs: 8000 });
      stats.sent++;
      remember(key, value, HIT_TTL_MS);
      return value;
    } catch (error) {
      stats.failed++;
      /* Remembered as "no answer" for a few minutes: asking again in a second
         is exactly the behaviour that got us noticed. */
      remember(key, null, FAIL_TTL_MS);
      console.warn('[OSIRIS] Nominatim search failed:', error instanceof Error ? error.message : error);
      return null;
    } finally {
      queueDepth--;
    }
  });

  chain = run.catch(() => undefined);
  inflight.set(key, run);
  return run.finally(() => inflight.delete(key)) as Promise<T | null>;
}

/** How much we have asked of Nominatim since this process started. */
export function nominatimStats() {
  return { ...stats, cached: cache.size, queueDepth, configured: nominatimConfigured() };
}

/** Test seam — forget every answer and reset the budget. */
export function clearNominatimCache(): void {
  cache.clear();
  inflight.clear();
  chain = Promise.resolve();
  lastRequestAt = 0;
  queueDepth = 0;
  loaded = null;
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = 0;
}

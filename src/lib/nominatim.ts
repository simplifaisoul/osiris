import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { httpJson } from '@/lib/httpJson';

/**
 * OSIRIS — the one door to nominatim.openstreetmap.org.
 *
 * On 2026-09-20 Nominatim's sysadmin told us we were running at over 10
 * requests a second against a service whose policy allows one, across every
 * user of that service, and that a ban was likely
 * (github.com/simplifaisoul/osiris/issues/16). We were: the search box and the
 * map's location label asked Nominatim straight from the browser, so the rate
 * rose with the number of people looking at the site and nothing was shared
 * between them, while three server routes asked on their own budgets.
 *
 * Everything now goes through here, and the rules are:
 *
 *   • The browser never calls Nominatim. Only the server does, through this
 *     module, so one cache and one budget serve every visitor.
 *   • One request every two seconds at most — half the policy's allowance,
 *     because a deployment may run more than one instance of this app and
 *     they cannot see each other's budgets.
 *   • Answers are cached for a month and written to disk, so a restart or a
 *     deploy does not re-ask questions we have already asked. A place does not
 *     move.
 *   • A burst beyond the queue length is refused rather than queued. A caller
 *     gets null and shows what it can without the answer; nobody's map is
 *     worth adding to a pile of requests aimed at someone else's server.
 *
 * Results are © OpenStreetMap contributors (ODbL). Anything shown to a reader
 * from this module has to say so — see ATTRIBUTION.
 */

const HOST = 'https://nominatim.openstreetmap.org';

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

/** Counted so the log can show what we are actually sending. */
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

/**
 * Ask Nominatim, or answer from what we already know.
 *
 * Resolves null when the answer is not cached and the queue is already as long
 * as we are willing to make somebody else's server work for us. Callers show
 * what they can without it.
 */
export async function nominatim<T>(
  endpoint: 'search' | 'reverse',
  params: Record<string, string>,
  options: {
    /** Answer from the cache or not at all — never send a request for this one. */
    cacheOnly?: boolean;
  } = {},
): Promise<T | null> {
  await ensureLoaded();

  const query = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'en', ...params });
  const key = `${endpoint}?${[...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')}`;

  stats.served++;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.fromCache++;
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T | null>;

  if (options.cacheOnly || queueDepth >= MAX_QUEUE) {
    stats.refused++;
    return null;
  }

  queueDepth++;
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    try {
      const value = await httpJson<T>(`${HOST}/${endpoint}?${query}`, { timeoutMs: 8000 });
      stats.sent++;
      remember(key, value, HIT_TTL_MS);
      return value;
    } catch (error) {
      stats.failed++;
      /* Remembered as "no answer" for a few minutes: a name that fails is
         usually a name Nominatim does not hold, and asking again in a second
         is exactly the behaviour that got us noticed. */
      remember(key, null, FAIL_TTL_MS);
      console.warn(`[OSIRIS] Nominatim ${endpoint} failed:`, error instanceof Error ? error.message : error);
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
  return { ...stats, cached: cache.size, queueDepth };
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

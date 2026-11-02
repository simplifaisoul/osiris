/**
 * OSIRIS — Live transit, server side: reads operators' vehicle feeds on demand.
 *
 * A feed is read only when someone is looking at the area it covers, and each
 * read is shared by every visitor for FEED_TTL_MS, so however many people
 * watch a city, its operator sees one request every 20 seconds. That is the
 * pace the feeds themselves update at and well inside their published limits.
 */
import { decodeVehicleFeed } from './gtfs-rt';
import { TRANSIT_FEEDS } from './transit-feeds.generated';
import { KEYED_TRANSIT_FEEDS } from './transit-feeds-keyed';
import { routeFor, timetableModeFor } from './transit-routes';
import { unzipFirstEntry } from './zip';
import { bboxIntersects, inBBox, type BBox, type TransitFeed, type TransitFeedInfo, type TransitVehicle } from './transit';

const FEED_TTL_MS = 20_000;
/** A feed that failed is left alone this long before it is tried again. */
const FAILURE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 20_000;
/** The nationwide files run to a few megabytes, and Great Britain's sometimes takes half a minute to be handed out. */
const ZIP_FETCH_TIMEOUT_MS = 45_000;
/**
 * A read this recent is still shown while the next one is fetched, so a slow
 * operator never holds up the map; only a feed nobody has watched lately waits.
 */
const SERVE_STALE_MS = 2 * 60_000;
/** Positions older than this are a vehicle that has gone out of service, not one on the road. */
const STALE_S = 15 * 60;
/** Feed reads in flight at once. */
const CONCURRENCY = 12;
/** Most feeds read for one view; the ones nearest its centre win. */
export const MAX_FEEDS_PER_VIEW = 40;
/** Most vehicles sent for one view. */
export const MAX_VEHICLES = 25_000;
/** A position this far outside its feed's area is a broken GPS fix, not a bus abroad. */
const AREA_SLACK_DEG = 1;

const UA = 'OSIRIS-Transit/1.0 (+https://osirisai.live)';

interface Entry {
  at: number;
  ok: boolean;
  vehicles: TransitVehicle[];
  error?: string;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

/**
 * Each feed's last few fixes per vehicle, so a map opened now can play a
 * vehicle from where it was a minute ago instead of waiting for the next poll.
 * Held only for the feeds being read, and only for the vehicles in the latest
 * read of each, so it grows with what people watch, not with the catalogue.
 */
const history = new Map<string, Map<string, { trip?: string; fixes: [number, number, number][] }>>();
/** Earlier fixes kept per vehicle. */
const HISTORY_FIXES = 3;
/** Older than this, a held fix is no use to playback. */
const HISTORY_MAX_AGE_S = 300;

/** Gives each vehicle its earlier fixes in the same trip, and records this one. */
function withHistory(feedId: string, vehicles: TransitVehicle[], nowS: number): void {
  const before = history.get(feedId);
  const after = new Map<string, { trip?: string; fixes: [number, number, number][] }>();
  for (const v of vehicles) {
    let held = before?.get(v.id);
    // A new trip starts a new line; the old one would be drawn as a jump anyway.
    if (held && held.trip && v.trip && held.trip !== v.trip) held = undefined;
    const prior = (held?.fixes ?? []).filter(([t]) => (!v.t || t < v.t) && nowS - t <= HISTORY_MAX_AGE_S).slice(-HISTORY_FIXES);
    if (prior.length) v.h = prior;
    const fixes = v.t ? [...prior, [v.t, v.lat, v.lng] as [number, number, number]] : prior;
    after.set(v.id, { trip: v.trip, fixes: fixes.slice(-HISTORY_FIXES) });
  }
  history.set(feedId, after);
}

/**
 * The feeds this server can read: every keyless one, and each keyed one whose
 * key is set in the environment.
 */
export function activeFeeds(env: Record<string, string | undefined> = process.env): TransitFeed[] {
  return [...TRANSIT_FEEDS, ...KEYED_TRANSIT_FEEDS.filter(f => f.key && env[f.key.env])];
}

export const FEEDS: TransitFeed[] = activeFeeds();

export function feedInfo(f: TransitFeed): TransitFeedInfo {
  return { id: f.id, provider: f.provider, region: f.region, country: f.country, ...(f.license ? { license: f.license } : {}) };
}

function padded(b: number[]): BBox {
  return [b[0] - AREA_SLACK_DEG, b[1] - AREA_SLACK_DEG, b[2] + AREA_SLACK_DEG, b[3] + AREA_SLACK_DEG];
}

/**
 * The request for a feed, its key put where the operator wants it, or null
 * when the feed needs a key this server does not have.
 */
export function requestFor(feed: TransitFeed, env: Record<string, string | undefined> = process.env): { url: string; headers: Record<string, string> } | null {
  const headers: Record<string, string> = { 'User-Agent': UA, ...(feed.headers ?? {}) };
  if (!feed.key) return { url: feed.url, headers };
  const key = env[feed.key.env];
  if (!key) return null;
  if (feed.key.header) headers[feed.key.header] = `${feed.key.prefix ?? ''}${key}`;
  let url = feed.url;
  if (feed.key.query) {
    const u = new URL(feed.url);
    u.searchParams.set(feed.key.query, key);
    url = u.toString();
  }
  return { url, headers };
}

/**
 * Reads one feed, or returns the shared copy while it is fresh. Once it is
 * not, a recent copy is still returned at once and the fresh read lands in
 * the cache for the next poll.
 */
export async function readFeed(feed: TransitFeed, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Entry> {
  const hit = cache.get(feed.id);
  if (hit && now - hit.at < (hit.ok ? feed.ttlMs ?? FEED_TTL_MS : FAILURE_TTL_MS)) return hit;
  const running = inflight.get(feed.id) ?? refresh(feed, fetchImpl, hit);
  if (hit && hit.vehicles.length && now - hit.at < SERVE_STALE_MS) return hit;
  return running;
}

/** Fetches a feed into the cache; nothing need wait on it for the read to land. */
function refresh(feed: TransitFeed, fetchImpl: typeof fetch, hit: Entry | undefined): Promise<Entry> {
  const job = (async (): Promise<Entry> => {
    const nowS = Date.now() / 1000;
    try {
      const req = requestFor(feed);
      if (!req) throw new Error('no key configured');
      const timeout = feed.format === 'zip' ? ZIP_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;
      const res = await fetchImpl(req.url, { headers: req.headers, signal: AbortSignal.timeout(timeout) });
      // A refused key is the most likely failure of a keyed feed; say which it is.
      if (res.status === 401 || res.status === 403) throw new Error(feed.key ? `key refused (HTTP ${res.status})` : `HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      const decoded = decodeVehicleFeed(feed.format === 'zip' ? unzipFirstEntry(body) : body);
      const area = padded(feed.bbox);
      const feedMode = timetableModeFor(feed) ?? feed.defaultMode;
      const vehicles: TransitVehicle[] = [];
      for (const v of decoded.vehicles) {
        if (v.timestamp && nowS - v.timestamp > STALE_S) continue;
        if (!inBBox(v.lng, v.lat, area)) continue;
        const route = v.routeId ? routeFor(feed, v.routeId) : undefined;
        // The route's own type, else what the feed's timetable mostly runs, else what the feed is known for.
        const mode = route?.mode ?? feedMode;
        vehicles.push({
          f: feed.id,
          id: v.id,
          lat: Math.round(v.lat * 1e5) / 1e5,
          lng: Math.round(v.lng * 1e5) / 1e5,
          ...(v.bearing !== undefined ? { b: Math.round(v.bearing) } : {}),
          ...(v.speed !== undefined ? { s: Math.round(v.speed * 10) / 10 } : {}),
          ...(v.routeId ? { route: v.routeId } : {}),
          ...(route?.name ? { name: route.name } : {}),
          ...(mode ? { mode } : {}),
          ...(v.label ? { label: v.label } : {}),
          ...(v.tripId ? { trip: v.tripId } : {}),
          ...(v.timestamp ? { t: v.timestamp } : {}),
          ...(v.occupancy !== undefined ? { occ: v.occupancy } : {}),
        });
      }
      withHistory(feed.id, vehicles, nowS);
      return { at: Date.now(), ok: true, vehicles };
    } catch (e) {
      const error = e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message) : 'failed';
      // Keep the last positions through a failed read, marked as such, rather
      // than blanking a city; they age out like any other position.
      const kept = (hit?.vehicles ?? []).filter(v => !v.t || nowS - v.t <= STALE_S);
      return { at: Date.now(), ok: false, vehicles: kept, error };
    }
  })();

  const landed = job.then(entry => {
    cache.set(feed.id, entry);
    inflight.delete(feed.id);
    return entry;
  });
  inflight.set(feed.id, landed);
  return landed;
}

/** The feeds covering a view, nearest its centre first, at most MAX_FEEDS_PER_VIEW. */
export function feedsFor(view: BBox, feeds: TransitFeed[] = FEEDS): TransitFeed[] {
  let cx = view[0] <= view[2] ? (view[0] + view[2]) / 2 : (view[0] + view[2] + 360) / 2;
  if (cx > 180) cx -= 360;
  const cy = (view[1] + view[3]) / 2;
  const dist = (f: TransitFeed) => Math.hypot((f.bbox[0] + f.bbox[2]) / 2 - cx, (f.bbox[1] + f.bbox[3]) / 2 - cy);
  return feeds
    .filter(f => bboxIntersects(f.bbox, view))
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, MAX_FEEDS_PER_VIEW);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export interface ViewResult {
  vehicles: TransitVehicle[];
  feeds: (TransitFeedInfo & { ok: boolean; count: number; error?: string; fetchedAt: string })[];
  /** Feeds covering the view that were not read, because MAX_FEEDS_PER_VIEW was reached. */
  skippedFeeds: number;
  truncated: boolean;
}

/** Every vehicle on screen, from the feeds covering the view. */
export async function vehiclesIn(view: BBox, fetchImpl: typeof fetch = fetch): Promise<ViewResult> {
  const covering = FEEDS.filter(f => bboxIntersects(f.bbox, view));
  const chosen = feedsFor(view);
  const entries = await pool(chosen, CONCURRENCY, f => readFeed(f, fetchImpl));

  const vehicles: TransitVehicle[] = [];
  let truncated = false;
  const feeds = chosen.map((f, i) => {
    const e = entries[i];
    let count = 0;
    for (const v of e.vehicles) {
      if (!inBBox(v.lng, v.lat, view)) continue;
      if (vehicles.length >= MAX_VEHICLES) { truncated = true; break; }
      vehicles.push(v);
      count++;
    }
    return { ...feedInfo(f), ok: e.ok, count, ...(e.error ? { error: e.error } : {}), fetchedAt: new Date(e.at).toISOString() };
  });
  return { vehicles, feeds, skippedFeeds: covering.length - chosen.length, truncated };
}

/** Where coverage is: one entry per feed, with the last count read, or the count at catalogue time. */
export function coverage() {
  return FEEDS.map(f => {
    const e = cache.get(f.id);
    return {
      ...feedInfo(f),
      center: f.center,
      core: f.core,
      vehicles: e?.ok ? e.vehicles.length : f.vehiclesAtProbe,
      live: e ? e.ok : null,
    };
  });
}

/**
 * The keyed feeds this server is not reading, and what switches each on:
 * which variable to set and where its free key is had. Never the key itself.
 */
export function feedsWaitingForKeys(env: Record<string, string | undefined> = process.env) {
  return KEYED_TRANSIT_FEEDS
    .filter(f => f.key && !env[f.key.env])
    .map(f => ({ provider: f.provider, region: f.region, country: f.country, env: f.key!.env, signup: f.key!.signup }));
}

/** For tests: forget every cached read. */
export function clearTransitCache(): void {
  cache.clear();
  inflight.clear();
  history.clear();
}

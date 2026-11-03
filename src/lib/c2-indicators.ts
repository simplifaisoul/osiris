/**
 * OSIRIS — abuse.ch Feodo Tracker C2 indicators.
 *
 * Feodo Tracker publishes a botnet C2 *blocklist*: one row per known
 * command-and-control server. A row says where a C2 is hosted and whether it
 * still answers. It does not say who is operating it, who it attacked, what
 * that attack did, or when any attack happened.
 *
 * The layer this module feeds used to claim all four. It looked up an
 * "attacker origin" in a hardcoded malware-family → region table, drew an arc
 * from there to the C2's country, picked a verb at random out of a list that
 * included EXFILTRATION and CREDENTIAL HARVEST, and cloned every row until it
 * had fifteen arcs so the animation looked busy. The clone count was then
 * reported as `total` under the provider's name, and the verb changed on every
 * cache refresh without any new evidence. None of that was in the source.
 *
 * So: no origins, no verbs, no clones. One indicator per C2 server, carrying
 * only fields the record actually contains. Placement is the centroid of the
 * hosting country — an approximation of a field that is in the record, flagged
 * as such via `location_precision`, not a guess at an unrecorded fact — until
 * the route geolocates the address itself (`placeIndicator`).
 *
 * Feodo is down to five rows (checked 2026-11-02), and abuse.ch's other C2
 * feeds now need a key. The keyless source still publishing C2 servers daily
 * is TweetFeed: indicators security researchers post on X, collected into a
 * CSV with a link to each post. Only addresses the researcher tagged #C2 or
 * #botnet are read, and each keeps its reporter and post, so a dot always
 * leads back to who said so and when.
 */
import { centroidFor } from './countryCentroids';
import type { GeoResult } from './malware-intel';

/** One row of Feodo Tracker's `ipblocklist.json`, as published. */
export interface FeodoRecord {
  ip_address?: string;
  port?: number | string;
  /** Older dumps and some mirrors spell the port this way. */
  dst_port?: number | string;
  status?: string;
  hostname?: string | null;
  as_number?: number | null;
  as_name?: string | null;
  as_country?: string | null;
  /** Older dumps and some mirrors spell the hosting country this way. */
  country?: string | null;
  first_seen?: string | null;
  last_online?: string | null;
  malware?: string | null;
}

/** A C2 server as the map consumes it. Every field traces to the source row. */
export interface C2Indicator {
  /** Stable across refreshes: the C2's address and port. */
  id: string;
  ip: string;
  port: number | null;
  malware: string | null;
  /** 'online' or 'offline', as reported — an offline C2 is not an attack. */
  status: string;
  hostname: string | null;
  /** Country the C2 is *hosted* in. Not an attacker attribution. */
  country: string | null;
  as_number: number | null;
  as_name: string | null;
  /** When the provider first listed this C2, and when it last answered. */
  first_seen: string | null;
  last_online: string | null;
  /** The address's geolocation, else the hosting-country centroid, else null. */
  lng: number | null;
  lat: number | null;
  /** 'city' for a per-address geolocation, 'country' for a centroid. */
  location_precision: 'city' | 'country' | null;
  city: string | null;
  source: string;
  /** The record or post behind this indicator. */
  reference: string | null;
  /** Who reported it, where the source names a person. */
  reporter: string | null;
}

export const FEODO_SOURCE = 'abuse.ch Feodo Tracker';
export const FEODO_SOURCE_URL = 'https://feodotracker.abuse.ch/browse/';

export const TWEETFEED_SOURCE = 'TweetFeed (researcher reports on X)';
export const TWEETFEED_URL = 'https://raw.githubusercontent.com/0xDanielLopez/TweetFeed/master/month.csv';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpv4(text: string): boolean {
  const m = IPV4.exec(text);
  return !!m && [m[1], m[2], m[3], m[4]].every(o => Number(o) <= 255);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function port(record: FeodoRecord): number | null {
  const raw = record.port ?? record.dst_port;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Builds one indicator, or null when the row carries no usable address. */
export function toIndicator(record: FeodoRecord): C2Indicator | null {
  const ip = text(record.ip_address);
  if (!ip) return null;

  const p = port(record);
  const country = text(record.as_country) ?? text(record.country);
  const centroid = centroidFor(country);

  return {
    id: p === null ? ip : `${ip}:${p}`,
    ip,
    port: p,
    malware: text(record.malware),
    status: text(record.status) ?? 'unknown',
    hostname: text(record.hostname),
    country: country ? country.toUpperCase() : null,
    as_number: typeof record.as_number === 'number' ? record.as_number : null,
    as_name: text(record.as_name),
    first_seen: text(record.first_seen),
    last_online: text(record.last_online),
    lng: centroid ? centroid[0] : null,
    lat: centroid ? centroid[1] : null,
    location_precision: centroid ? 'country' : null,
    city: null,
    source: FEODO_SOURCE,
    reference: `https://feodotracker.abuse.ch/browse/host/${ip}/`,
    reporter: null,
  };
}

/**
 * Parses a blocklist dump into deduplicated indicators.
 *
 * Deduplication is by `id` — the same C2 listed twice is one C2, not two
 * events. Order follows the source so identical input yields identical output.
 */
export function parseFeodoBlocklist(raw: unknown): C2Indicator[] {
  if (!Array.isArray(raw)) return [];

  const byId = new Map<string, C2Indicator>();
  for (const record of raw) {
    if (!record || typeof record !== 'object') continue;
    const indicator = toIndicator(record as FeodoRecord);
    if (indicator && !byId.has(indicator.id)) byId.set(indicator.id, indicator);
  }
  return [...byId.values()];
}

/** Hashtags that say what kind of thing was posted, not which family it is. */
const GENERIC_TAGS = new Set([
  'c2', 'botnet', 'rat', 'malware', 'opendir', 'apt', 'android', 'ios', 'phishing', 'scam', 'ransomware',
  'ioc', 'iocs', 'threatintel', 'infostealer', 'stealer', 'loader', 'backdoor', 'cybersecurity', 'dfir', 'osint',
]);

/**
 * Parse TweetFeed's CSV: `date,user,type,value,tags,post`.
 *
 * Keeps addresses posted with a #C2 or #botnet tag within the window, one
 * indicator per address, at its first report. The family is the first tag
 * that names one (`#C2 #ValleyRAT` → ValleyRAT); a post that names none has
 * no family rather than a guessed one. Position comes later, from the route's
 * geolocation: a post carries no country.
 */
export function parseTweetFeedC2(csv: string, now: number, windowDays = 30): C2Indicator[] {
  const cutoff = now - windowDays * 86_400_000;
  const byIp = new Map<string, C2Indicator>();

  for (const raw of csv.split('\n')) {
    const cols = raw.trim().split(',');
    if (cols.length < 6 || cols[2] !== 'ip') continue;

    const [date, user, , ip] = cols;
    const tags = cols.slice(4, -1).join(',');
    if (!/#(c2|botnet)\b/i.test(tags) || !isIpv4(ip)) continue;

    const at = Date.parse(`${date.replace(' ', 'T')}Z`);
    if (!Number.isFinite(at) || at < cutoff) continue;

    const family = tags.split(/\s+/).map(t => t.replace(/^#/, '')).find(t => t && !GENERIC_TAGS.has(t.toLowerCase())) ?? null;
    const post = cols[cols.length - 1];
    const prev = byIp.get(ip);
    if (prev) {
      // Rows run oldest first; a later post may name the family the first did not.
      prev.malware ??= family;
      continue;
    }
    byIp.set(ip, {
      id: ip,
      ip,
      port: null,
      malware: family,
      status: 'reported',
      hostname: null,
      country: null,
      as_number: null,
      as_name: null,
      first_seen: date.slice(0, 10),
      last_online: null,
      lng: null,
      lat: null,
      location_precision: null,
      city: null,
      source: TWEETFEED_SOURCE,
      reference: /^https:\/\/(x|twitter)\.com\//.test(post) ? post : null,
      reporter: text(user),
    });
  }

  return [...byIp.values()];
}

/** Moves an indicator to its own address's geolocation, when there is one. */
export function placeIndicator(indicator: C2Indicator, geo: GeoResult | undefined): C2Indicator {
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return indicator;
  return {
    ...indicator,
    lng: geo.lng,
    lat: geo.lat,
    location_precision: 'city',
    city: geo.city || null,
    country: indicator.country ?? (geo.country || null),
    as_number: indicator.as_number ?? geo.asn,
    as_name: indicator.as_name ?? (geo.as_name || null),
  };
}

#!/usr/bin/env node
/**
 * Builds the live-transit catalogue: every live, keyless GTFS-Realtime
 * vehicle-position feed we can find, checked against the feed itself.
 *
 *   node tools/generate-transit-feeds.mjs            the feeds
 *   node tools/generate-transit-feeds.mjs --routes   the feeds, and each one's route names and modes
 *
 * Candidates come from the Mobility Database catalogue (MobilityData, the
 * body that maintains GTFS), filtered to vehicle-position feeds that need no
 * key, plus the few listed under EXTRA below. Every candidate is then fetched
 * and decoded. A feed is kept only when it decodes and either has vehicles now
 * or has a known service area (a feed can be empty at night). Its area comes
 * from the vehicles it reported, else from the catalogue's schedule data.
 *
 * Realtime feeds identify a route by its timetable's route_id, which is often
 * an internal key ("100001" for King County's route 1), and say nothing of
 * whether a vehicle is a bus or a train. With --routes, the routes.txt of each
 * feed's timetable is read for the name riders use and the GTFS route_type.
 * Only that one file is fetched where the host allows range requests; other
 * archives are streamed to a temporary file and read from disk.
 *
 * Writes src/lib/transit-feeds.generated.ts and, with --routes,
 * src/lib/transit-routes.generated.ts. Needs Node 22.18+ (it imports the
 * TypeScript decoder directly).
 */
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeVehicleFeed } from '../src/lib/gtfs-rt.ts';
import { inflateEntry, localDataStart, locateCentralDirectory, parseCentralDirectory, unzipFirstEntry } from '../src/lib/zip.ts';
import { modeForRouteType } from '../src/lib/transit.ts';

const CATALOGUE = 'https://storage.googleapis.com/storage/v1/b/mdb-csv/o/sources.csv?alt=media';
const OUT_FEEDS = fileURLToPath(new URL('../src/lib/transit-feeds.generated.ts', import.meta.url));
const OUT_ROUTES = fileURLToPath(new URL('../src/lib/transit-routes.generated.ts', import.meta.url));
const UA = 'OSIRIS-Transit/1.0 (+https://osirisai.live)';
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 16;
/** Positions older than this at probe time mean the feed has stopped updating. */
const STALE_S = 6 * 3600;
/** Largest timetable streamed whole when its host refuses range requests. */
const MAX_STATIC_BYTES = 400 * 1024 * 1024;
const WITH_ROUTES = process.argv.includes('--routes');

/**
 * Feeds the catalogue lacks or lists in a form that does not answer. An `area`
 * is the exact service area, used as it is: a national feed's vehicles at probe
 * time may miss corners it serves (at night) or include a few far outside it
 * (international coaches), and either would misplace it.
 */
const EXTRA = [
  { provider: 'Entur (all of Norway)', country: 'NO', area: [4.5, 57.9, 31.2, 71.2], url: 'https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions', headers: { 'ET-Client-Name': 'osiris-transit' }, license: 'https://developer.entur.org/pages-intro-authentication', static: ['https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip'] },
  { provider: 'HSL (Helsinki region)', country: 'FI', url: 'https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl', license: 'https://www.hsl.fi/en/hsl/open-data', static: ['https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip'] },
  { provider: 'OVapi (all of the Netherlands)', country: 'NL', area: [3.2, 50.7, 7.3, 53.7], url: 'https://gtfs.ovapi.nl/nl/vehiclePositions.pb', license: 'https://gtfs.ovapi.nl/README', static: ['https://gtfs.ovapi.nl/nl/gtfs-nl.zip'] },
  { provider: 'TransLink (South East Queensland)', country: 'AU', url: 'https://gtfsrt.api.translink.com.au/api/realtime/seq/VehiclePositions', license: 'https://translink.com.au/about-translink/open-data', static: ['https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip'] },
  { provider: 'TTC (Toronto)', country: 'CA', url: 'https://bustime.ttc.ca/gtfsrt/vehicles', license: 'https://open.toronto.ca/open-data-licence/' },
  { provider: 'CapMetro (Austin)', country: 'US', url: 'https://data.texas.gov/download/eiei-9rpf/application%2Foctet-stream', license: 'https://www.capmetro.org/developertools' },
  { provider: 'Metro Transit (Minneapolis–St Paul)', country: 'US', url: 'https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb', license: 'https://svc.metrotransit.org/' },
  { provider: 'MBTA (Boston)', country: 'US', url: 'https://cdn.mbta.com/realtime/VehiclePositions.pb', license: 'https://www.mbta.com/developers', static: ['https://cdn.mbta.com/MBTA_GTFS.zip'] },
  { provider: 'MiWay (Mississauga)', country: 'CA', url: 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb' },
  { provider: 'Hamilton Street Railway', country: 'CA', url: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb' },
  { provider: 'Durham Region Transit', country: 'CA', url: 'https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions' },
  { provider: 'Guelph Transit', country: 'CA', url: 'https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb', license: 'https://explore.guelph.ca/pages/open-data-license' },
  { provider: 'Kingston Transit', country: 'CA', url: 'https://api.cityofkingston.ca/gtfs-realtime/vehicleupdates.pb' },
  { provider: 'Barrie Transit', country: 'CA', url: 'https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb' },
  { provider: 'YRT/Viva (York Region)', country: 'CA', url: 'https://rtu.york.ca/gtfsrealtime/VehiclePositions', license: 'https://www.yrt.ca/en/about-us/open-data-licence-agreement.aspx' },
  { provider: 'Burlington Transit', country: 'CA', url: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb' },
  // Its route ids are already the public route names (M55, B82), and every vehicle is a bus.
  { provider: 'MTA New York City buses', country: 'US', region: 'New York City', area: [-74.3, 40.48, -73.68, 40.95], url: 'https://gtfsrt.prod.obanyc.com/vehiclePositions', license: 'https://new.mta.info/developers/terms-and-conditions', defaultMode: 'bus' },
  // The Bus Open Data Service's nationwide file: every bus in England,
  // Scotland and Wales, about 1.6 MB zipped, so it is shared for 30 s.
  { provider: 'Bus Open Data Service (Great Britain)', country: 'GB', region: 'Great Britain', area: [-8.7, 49.8, 1.9, 60.9], url: 'https://data.bus-data.dft.gov.uk/avl/download/gtfsrt', format: 'zip', ttlMs: 30_000, license: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', defaultMode: 'bus', static: ['https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/all/'], maxStaticBytes: 3 * 1024 ** 3 },
];

/** A CSV parser that handles quoted fields with commas and newlines. */
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows;
  const keys = head.map(h => h.replace(/^﻿/, '').trim());
  return body.map(r => Object.fromEntries(keys.map((h, i) => [h, r[i] ?? ''])));
}

/** A feed's identity: its URL without scheme, case or trailing slash. */
const feedKey = url => url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
const union = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b);
const round = n => Math.round(n * 1e4) / 1e4;

async function candidates() {
  const rows = parseCsv(await (await fetch(CATALOGUE, { headers: { 'User-Agent': UA } })).text());
  const byId = new Map(rows.map(r => [r.mdb_source_id, r]));
  const list = [];
  for (const r of rows) {
    if (r.data_type !== 'gtfs-rt' || !r.entity_type.split('|').includes('vp')) continue;
    if (!['0', ''].includes(r['urls.authentication_type'])) continue;
    if (['deprecated', 'inactive'].includes(r.status) || r['redirect.id'] || !r['urls.direct_download']) continue;
    let bbox = null, country = '', sub = '', city = '', license = r['urls.license'];
    const staticUrls = [];
    for (const sid of r.static_reference.split('|').map(s => s.trim()).filter(Boolean)) {
      const s = byId.get(sid);
      if (!s) continue;
      country ||= s['location.country_code'];
      sub ||= s['location.subdivision_name'];
      city ||= s['location.municipality'];
      license ||= s['urls.license'];
      // The operator's own copy first (hosts often serve ranges), then the catalogue's mirror.
      for (const u of [s['urls.direct_download'], s['urls.latest']]) if (u && !staticUrls.includes(u)) staticUrls.push(u);
      const b = ['minimum_longitude', 'minimum_latitude', 'maximum_longitude', 'maximum_latitude'].map(k => Number(s[`location.bounding_box.${k}`]));
      if (b.every(Number.isFinite) && s['location.bounding_box.minimum_latitude'] !== '') bbox = union(bbox, b);
    }
    list.push({ mdb: r.mdb_source_id, provider: r.provider, country, region: city || sub, url: r['urls.direct_download'], license, bbox, static: staticUrls });
  }
  // The same feed is sometimes listed twice, under http and https or in other
  // capitalisation. An EXTRA entry for a feed the catalogue has adds to it.
  const byUrl = new Map();
  for (const c of list) if (!byUrl.has(feedKey(c.url))) byUrl.set(feedKey(c.url), c);
  for (const e of EXTRA) {
    const known = byUrl.get(feedKey(e.url));
    if (known) Object.assign(known, e, { region: e.region || known.region, country: e.country || known.country, static: e.static ?? known.static });
    else byUrl.set(feedKey(e.url), { mdb: '', region: '', bbox: null, static: [], ...e });
  }
  return [...byUrl.values()];
}

async function probe(c) {
  const t0 = Date.now();
  try {
    const res = await fetch(c.url, { headers: { 'User-Agent': UA, ...(c.headers || {}) }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    if (!res.ok) return { ...c, ok: false, why: `HTTP ${res.status}` };
    const body = Buffer.from(await res.arrayBuffer());
    const feed = decodeVehicleFeed(c.format === 'zip' ? unzipFirstEntry(body) : body);
    const now = Date.now() / 1000;
    const fresh = feed.vehicles.filter(v => !v.timestamp || now - v.timestamp < STALE_S);
    // The middle 98% of positions: one bus with a broken GPS fix a country
    // away should not stretch the feed's area across a continent.
    let seen = null, center = null, core = null;
    if (fresh.length) {
      const pick = (vals, q) => vals.sort((a, b) => a - b)[Math.min(vals.length - 1, Math.floor(q * vals.length))];
      const trim = fresh.length >= 20 ? 0.01 : 0;
      const lngs = fresh.map(v => v.lng), lats = fresh.map(v => v.lat);
      seen = [pick(lngs, trim), pick(lats, trim), pick(lngs, 1 - trim), pick(lats, 1 - trim)];
      // Where the fleet is: its median point, and the box of its middle 90%,
      // which is where the map flies to. A national feed's area runs to its
      // longest international route; its fleet does not.
      center = [pick(lngs, 0.5), pick(lats, 0.5)];
      const q = fresh.length >= 20 ? 0.05 : 0;
      core = [pick(lngs, q), pick(lats, q), pick(lngs, 1 - q), pick(lats, 1 - q)];
    }
    const routeIds = new Set(fresh.map(v => v.routeId).filter(Boolean));
    return { ...c, ok: true, vehicles: fresh.length, routeIds, seen, center, core, ms: Date.now() - t0 };
  } catch (e) {
    return { ...c, ok: false, why: e.name === 'TimeoutError' ? 'timeout' : String(e.message || e).slice(0, 80) };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); process.stdout.write('.'); }
  }));
  process.stdout.write('\n');
  return out;
}

const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);

/* ─────────────── Route names and modes from timetables ─────────────── */

/** Random access to an archive over HTTP ranges, or null when the host will not serve them. */
async function rangeSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const total = /\/(\d+)$/.exec(res.headers.get('content-range') || '')?.[1];
  await res.body?.cancel();
  if (res.status !== 206 || !total) return null;
  // Signed redirect targets are read directly, without going round again.
  const at = res.url || url;
  return {
    size: Number(total),
    async read(start, end) {
      const r = await fetch(at, { headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(120_000) });
      if (r.status !== 206) throw new Error(`range refused (HTTP ${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    },
    close() {},
  };
}

/** An archive streamed to a temporary file, for hosts without ranges; null past `max` bytes. */
async function fileSource(url, max) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) return null;
  const dir = mkdtempSync(join(tmpdir(), 'osiris-gtfs-'));
  const path = join(dir, 'gtfs.zip');
  const fd = openSync(path, 'w+');
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > max) throw new Error(`over ${Math.round(max / 1048576)} MB`);
      writeSync(fd, chunk);
    }
  } catch (e) {
    closeSync(fd); rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return {
    size,
    async read(start, end) {
      const b = Buffer.alloc(end - start + 1);
      readSync(fd, b, 0, b.length, start);
      return b;
    },
    close() { closeSync(fd); rmSync(dir, { recursive: true, force: true }); },
  };
}

/** The routes.txt of a timetable archive, read through `src`. */
async function readRoutesTxt(src) {
  const tailLen = Math.min(src.size, 65_557 + 76 + 4096);
  const tailStart = src.size - tailLen;
  const tail = await src.read(tailStart, src.size - 1);
  const { offset, size } = locateCentralDirectory(tail, tailStart);
  const cd = offset >= tailStart ? tail.subarray(offset - tailStart, offset - tailStart + size) : await src.read(offset, offset + size - 1);
  const entry = parseCentralDirectory(cd).find(e => /(^|\/)routes\.txt$/i.test(e.name));
  if (!entry) throw new Error('no routes.txt');
  const header = await src.read(entry.localHeaderOffset, entry.localHeaderOffset + 29);
  const nameAndExtra = header.readUInt16LE(26) + header.readUInt16LE(28);
  const start = entry.localHeaderOffset + localDataStart(Buffer.concat([header, Buffer.alloc(nameAndExtra)]));
  return inflateEntry(entry, await src.read(start, start + entry.compressedSize - 1)).toString('utf8');
}

/** A feed's routes from the first of its timetables that can be read. */
async function routesFor(feed) {
  let lastError = 'no timetable listed';
  for (const url of feed.static ?? []) {
    let src = null;
    try {
      src = (await rangeSource(url)) ?? (await fileSource(url, feed.maxStaticBytes ?? MAX_STATIC_BYTES));
      if (!src) { lastError = 'not downloadable'; continue; }
      const rows = parseCsv(await readRoutesTxt(src));
      const routes = {};
      for (const r of rows) {
        if (!r.route_id) continue;
        const name = (r.route_short_name || r.route_long_name || '').trim().slice(0, 40);
        const type = Number(r.route_type);
        routes[r.route_id] = [name === r.route_id ? '' : name, Number.isFinite(type) ? type : -1];
      }
      if (Object.keys(routes).length) return { routes, from: url };
      lastError = 'empty routes.txt';
    } catch (e) {
      lastError = String(e.message || e).slice(0, 80);
    } finally {
      src?.close();
    }
  }
  throw new Error(lastError);
}

/* ─────────────────────────────── Run ─────────────────────────────── */

const list = await candidates();
console.log(`${list.length} candidate feeds`);
const results = await pool(list, CONCURRENCY, probe);
// A feed that timed out or dropped the connection gets one more try, alone,
// so a busy moment does not cost a city its buses until the next build.
const retry = results.map((r, i) => [r, i]).filter(([r]) => !r.ok && /timeout|fetch failed/.test(r.why));
for (const [, i] of retry) results[i] = await probe(list[i]);
console.log(`retried ${retry.length}, recovered ${retry.filter(([, i]) => results[i].ok).length}`);

/*
 * The previous catalogue, so a rebuild run at night does not lose a city whose
 * buses are all in the depot, and a feed that timed out this once keeps its
 * place. A feed that is gone (404, or no longer a feed at all) still drops out.
 */
const previous = new Map();
if (existsSync(OUT_FEEDS)) {
  const text = readFileSync(OUT_FEEDS, 'utf8');
  try {
    for (const f of JSON.parse(text.slice(text.indexOf('= [') + 2, text.lastIndexOf(']') + 1))) previous.set(feedKey(f.url), f);
  } catch { /* unreadable: start afresh */ }
}
const transient = why => /timeout|fetch failed|HTTP 5\d\d/.test(why ?? '');
let carried = 0;

const kept = [];
const ids = new Set();
for (const r of results) {
  const before = previous.get(feedKey(r.url));
  if (!r.ok) {
    if (before && transient(r.why)) { kept.push({ feed: before, probe: r }); ids.add(before.id); carried++; }
    continue;
  }
  // A catalogue area spanning most of the planet is a data error, not a service area.
  const sane = b => b && b[2] - b[0] <= 90 && b[3] - b[1] <= 60;
  // The vehicles seen now, padded so one at the edge of a route still counts as
  // inside, joined to the schedule's area: a feed probed at night shows only
  // the few routes running then.
  const observed = r.seen && [r.seen[0] - 0.05, r.seen[1] - 0.05, r.seen[2] + 0.05, r.seen[3] + 0.05];
  const joined = observed && sane(r.bbox) ? union(observed, r.bbox) : null;
  const area = r.area ?? (sane(joined) ? joined : observed || (sane(r.bbox) ? r.bbox : null));
  if (!area || !sane(area)) {
    if (before) { kept.push({ feed: { ...before, vehiclesAtProbe: 0 }, probe: r }); ids.add(before.id); carried++; }
    continue;
  }
  let id = slug(r.provider) || `feed-${r.mdb}`;
  while (ids.has(id)) id += `-${r.mdb || kept.length}`;
  ids.add(id);
  const core = r.core ? [r.core[0] - 0.02, r.core[1] - 0.02, r.core[2] + 0.02, r.core[3] + 0.02] : area;
  const center = r.center ?? [(core[0] + core[2]) / 2, (core[1] + core[3]) / 2];
  kept.push({
    feed: {
      id,
      provider: r.provider,
      country: r.country || '',
      region: r.region || '',
      url: r.url,
      ...(r.headers ? { headers: r.headers } : {}),
      bbox: area.map(round),
      center: center.map(round),
      core: core.map(round),
      ...(r.license ? { license: r.license } : {}),
      ...(r.mdb ? { mdb: r.mdb } : {}),
      vehiclesAtProbe: r.vehicles,
      ...(r.format ? { format: r.format } : {}),
      ...(r.ttlMs ? { ttlMs: r.ttlMs } : {}),
      ...(r.defaultMode ? { defaultMode: r.defaultMode } : {}),
    },
    probe: r,
  });
}
kept.sort((a, b) => (a.feed.country || 'ZZ').localeCompare(b.feed.country || 'ZZ') || a.feed.provider.localeCompare(b.feed.provider));

const failed = results.filter(r => !r.ok);
console.log(`kept ${kept.length} (${carried} carried over from the last build: empty or briefly unreachable now), ${kept.reduce((n, k) => n + k.feed.vehiclesAtProbe, 0)} vehicles live; ${failed.length} did not answer as a feed`);
const reasons = {};
for (const f of failed) reasons[f.why] = (reasons[f.why] || 0) + 1;
console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12));

writeFileSync(OUT_FEEDS, `import type { TransitFeed } from './transit';

/**
 * OSIRIS — live, keyless GTFS-Realtime vehicle-position feeds (GENERATED).
 *
 * Built by tools/generate-transit-feeds.mjs on ${new Date().toISOString().slice(0, 10)} from the Mobility
 * Database catalogue (https://mobilitydatabase.org) plus a few feeds it lacks.
 * Every feed below answered with a decodable GTFS-Realtime FeedMessage when it
 * was built. \`bbox\` is [west, south, east, north]: the extent of the vehicles
 * the feed reported then, padded and joined to the catalogue's schedule area.
 * \`center\` is the fleet's median point and \`core\` the box its middle 90%
 * ran in, for placing and flying to the feed. \`vehiclesAtProbe\` is how many
 * vehicles it had at that moment.
 *
 * Do not edit by hand; run the tool again.
 */
export const TRANSIT_FEEDS: TransitFeed[] = ${JSON.stringify(kept.map(k => k.feed), null, 2)};
`);
console.log(`wrote ${OUT_FEEDS}`);

if (WITH_ROUTES) {
  const withStatic = kept.filter(k => k.probe.static?.length);
  console.log(`reading the routes of ${withStatic.length} timetables`);
  const table = {};
  let matched = 0, seenIds = 0, failures = 0;
  await pool(withStatic, 4, async ({ feed, probe: p }) => {
    try {
      const { routes } = await routesFor(p);
      // Only routes the timetable gives a name or a type for are worth carrying.
      const r = {};
      const modes = {};
      for (const [rid, [name, type]] of Object.entries(routes)) {
        const mode = modeForRouteType(type >= 0 ? type : undefined);
        modes[mode] = (modes[mode] ?? 0) + 1;
        if (name || mode !== 'unknown') r[rid] = [name, type];
      }
      const d = Object.entries(modes).filter(([m]) => m !== 'unknown').sort((a, b) => b[1] - a[1])[0]?.[0];
      // Keyed by feed URL, which survives a regenerated id.
      table[feedKey(feed.url)] = { ...(d ? { d } : {}), r };
      for (const id of p.routeIds) { seenIds++; if (routes[id]) matched++; }
    } catch (e) {
      failures++;
      console.log(`\n  ${feed.provider}: ${e.message}`);
    }
  });
  const json = JSON.stringify(table);
  writeFileSync(OUT_ROUTES, `/**
 * OSIRIS — route names and modes for the live-transit feeds (GENERATED).
 *
 * From each feed's GTFS timetable (routes.txt), read by
 * tools/generate-transit-feeds.mjs --routes on ${new Date().toISOString().slice(0, 10)}. Keyed by feed URL
 * without scheme, case or trailing slash; per route, [name riders use or "" when it is the id itself,
 * GTFS route_type or -1]; \`d\` is the mode most of the feed's routes are.
 * Held as a JSON string so the type checker does not infer a type for it.
 *
 * Do not edit by hand; run the tool again.
 */
export const TRANSIT_ROUTES_JSON = ${JSON.stringify(json)};
`);
  console.log(`routes for ${Object.keys(table).length} feeds (${failures} failed); ${matched}/${seenIds} live route ids found in a timetable; ${Math.round(json.length / 1024)} KB`);
}

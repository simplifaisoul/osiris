import { inflateRawSync } from 'zlib';
import { get as httpGet } from 'http';

/**
 * ═══════════════════════════════════════════════════════════════
 *  GDELT 2.0 Events — 15-minute export reader
 *
 *  GDELT publishes a ZIP-compressed, tab-separated Events export every
 *  15 minutes at data.gdeltproject.org. Unlike the DOC API (which is
 *  aggressively rate-limited and only exposes a *publisher* country), these
 *  records carry real ActionGeo coordinates for where the event occurred.
 *
 *  The archives hold a single deflated entry, so we read the local file
 *  header and inflate it directly rather than pulling in a ZIP dependency.
 * ═══════════════════════════════════════════════════════════════
 */

const LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

/**
 * GDELT's file host is plain HTTP only — its HTTPS certificate belongs to
 * Google Cloud Storage and does not cover the domain, so TLS is not an option.
 *
 * It also advertises AAAA records ahead of A records. Hosts without working
 * IPv6 egress see the platform fetch() pick the first address and stall until
 * its connect timeout, so we go through Node's http client with family: 4 to
 * pin the request to IPv4 instead of depending on Happy Eyeballs behaviour we
 * do not control.
 */
function httpGetBufferIPv4(url: string, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { family: 4, timeout: timeoutMs }, res => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve(httpGetBufferIPv4(new URL(res.headers.location, url).toString(), timeoutMs));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`${url} responded ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c as Buffer));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('timeout', () => req.destroy(new Error(`${url} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

/** Column offsets in the 61-field GDELT 2.0 Events export. */
const COL = {
  globalEventId: 0,
  sqlDate: 1,
  eventCode: 26,
  eventRootCode: 28,
  quadClass: 29,
  goldstein: 30,
  numMentions: 31,
  numSources: 32,
  numArticles: 33,
  avgTone: 34,
  actionGeoFullName: 52,
  actionGeoCountry: 53,
  actionGeoLat: 56,
  actionGeoLong: 57,
  dateAdded: 59,
  sourceUrl: 60,
} as const;

/** CAMEO QuadClass — the axis that makes this feed useful on a threat map. */
export const QUAD_LABELS: Record<number, string> = {
  1: 'Verbal Cooperation',
  2: 'Material Cooperation',
  3: 'Verbal Conflict',
  4: 'Material Conflict',
};

export interface GdeltEvent {
  id: string;
  lat: number;
  lng: number;
  name: string;
  country: string;
  event_code: string;
  root_code: string;
  quad: number;
  quad_label: string;
  /** −10 (most conflictual) … +10 (most cooperative) */
  goldstein: number;
  /** Average document tone, roughly −100…+100 but usually −20…+20 */
  tone: number;
  articles: number;
  sources: number;
  url: string;
  date: string;
}

/** Extracts the single deflated entry from a ZIP buffer. */
function unzipSingleEntry(buf: Buffer): string {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Not a ZIP archive');
  }
  const method = buf.readUInt16LE(8);
  const compressedSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;

  // A streamed archive can report size 0 here and defer to the data descriptor;
  // in that case take everything up to the central directory.
  const end = compressedSize > 0 ? start + compressedSize : buf.indexOf('PK\x01\x02', start, 'binary');
  const body = buf.subarray(start, end > start ? end : undefined);

  // 8 = deflate, 0 = stored. GDELT uses deflate.
  return (method === 8 ? inflateRawSync(body) : body).toString('utf8');
}

/** Rewinds a `YYYYMMDDHHMMSS.export.CSV.zip` URL by n 15-minute windows. */
function previousWindowUrl(url: string, stepsBack: number): string | null {
  const m = url.match(/(\d{14})\.export\.CSV\.zip$/);
  if (!m) return null;
  const s = m[1];
  const t = Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
    Number(s.slice(12, 14))
  );
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - stepsBack * 15 * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return url.replace(/\d{14}\.export\.CSV\.zip$/, `${stamp}.export.CSV.zip`);
}

/**
 * lastupdate.txt can name an archive a moment before it is actually published,
 * so the advertised URL 404s at the 15-minute boundary. Walk back through
 * earlier windows rather than failing the whole request.
 */
async function fetchExportWithFallback(url: string): Promise<{ csv: string; url: string }> {
  const candidates = [url, ...[1, 2, 3].map(n => previousWindowUrl(url, n)).filter((u): u is string => !!u)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return { csv: unzipSingleEntry(await httpGetBufferIPv4(candidate, 20000)), url: candidate };
    } catch (e) {
      lastError = e;
      // Only a missing archive is worth retrying an earlier window for.
      if (!(e instanceof Error && / responded 404$/.test(e.message))) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('GDELT export unavailable');
}

/** GDELT dates are `YYYYMMDDHHMMSS` (DATEADDED) or `YYYYMMDD` (SQLDATE). */
function parseGdeltDate(dateAdded: string, sqlDate: string): string {
  const s = /^\d{14}$/.test(dateAdded) ? dateAdded : null;
  if (s) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  }
  if (/^\d{8}$/.test(sqlDate)) {
    return `${sqlDate.slice(0, 4)}-${sqlDate.slice(4, 6)}-${sqlDate.slice(6, 8)}T00:00:00Z`;
  }
  return new Date().toISOString();
}

export interface FetchOptions {
  /** Keep only these QuadClass values. Empty means keep all. */
  quads?: number[];
  /** Drop events backed by fewer than this many articles. */
  minArticles?: number;
  /** Maximum events to return, newest-by-file-order first. */
  limit?: number;
}

export interface GdeltEventsResult {
  events: GdeltEvent[];
  /** Name of the 15-minute export the data came from. */
  window: string;
  /** Rows in the export before filtering. */
  scanned: number;
}

export async function fetchGdeltEvents(opts: FetchOptions = {}): Promise<GdeltEventsResult> {
  const { quads = [], minArticles = 1, limit = 600 } = opts;

  const manifest = (await httpGetBufferIPv4(LASTUPDATE_URL, 12000)).toString('utf8');

  const exportUrl = manifest
    .split('\n')
    .map(l => l.trim())
    .find(l => l.includes('.export.CSV.zip'))
    ?.split(/\s+/)
    .pop();
  if (!exportUrl) throw new Error('No export archive listed in lastupdate.txt');

  const { csv, url: resolvedUrl } = await fetchExportWithFallback(exportUrl);
  const rows = csv.split('\n');
  const events: GdeltEvent[] = [];

  for (const row of rows) {
    if (events.length >= limit) break;
    if (!row) continue;
    const c = row.split('\t');
    if (c.length < 61) continue;

    const lat = Number(c[COL.actionGeoLat]);
    const lng = Number(c[COL.actionGeoLong]);
    // Ungeocoded rows carry empty coordinates; 0,0 is the null-island artefact.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;

    const articles = Number(c[COL.numArticles]) || 0;
    if (articles < minArticles) continue;

    const quad = Number(c[COL.quadClass]) || 0;
    if (quads.length > 0 && !quads.includes(quad)) continue;

    events.push({
      id: c[COL.globalEventId],
      lat,
      lng,
      name: c[COL.actionGeoFullName] || 'Unknown location',
      country: c[COL.actionGeoCountry] || '',
      event_code: c[COL.eventCode] || '',
      root_code: c[COL.eventRootCode] || '',
      quad,
      quad_label: QUAD_LABELS[quad] || 'Unclassified',
      goldstein: Number(c[COL.goldstein]) || 0,
      tone: Number(Number(c[COL.avgTone]).toFixed(2)) || 0,
      articles,
      sources: Number(c[COL.numSources]) || 0,
      url: c[COL.sourceUrl]?.trim() || '',
      date: parseGdeltDate(c[COL.dateAdded], c[COL.sqlDate]),
    });
  }

  return {
    events,
    window: resolvedUrl.split('/').pop() || '',
    scanned: rows.length,
  };
}

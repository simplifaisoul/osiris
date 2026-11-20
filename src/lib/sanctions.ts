/**
 * US sanctioned-entity lookup.
 *
 * Source: [OpenSanctions](https://www.opensanctions.org/) `us_sanctions`
 * collection (OFAC SDN and non-SDN, the trade.gov Consolidated Screening
 * List with the BIS Entity List, Military End User and Unverified lists,
 * DoD 1260H, UFLPA) plus the `us_fcc_covered_list` dataset, which is not
 * in `us_sanctions`, distributed as simple CSVs. OpenSanctions
 * normalises the upstream Treasury data into a flat schema with stable
 * field names and an entity-type discriminator (`Person`, `Organization`,
 * `Vessel`, `Aircraft`, …), which is far easier to consume than the raw
 * SDN XML.
 *
 * The whole list (~7 MB, low-tens-of-thousands of entries) is downloaded
 * once on first use, parsed into normalised lookup indices, and refreshed
 * lazily every 24h. Concurrent requests that arrive while a fetch is in
 * flight wait on the same promise (single-flight) so we never pull the
 * file twice. If a refresh fails after the cache has gone stale we keep
 * serving the previous snapshot rather than leaving the route blind.
 */

export const SANCTIONS_CSV_URLS = [
  'https://data.opensanctions.org/datasets/latest/us_sanctions/targets.simple.csv',
  'https://data.opensanctions.org/datasets/latest/us_fcc_covered_list/targets.simple.csv',
];

const TTL_MS = 24 * 60 * 60 * 1000;

export type Schema =
  | 'Person'
  | 'Organization'
  | 'Company'
  | 'Vessel'
  | 'Airplane'
  | 'LegalEntity'
  | 'Security'
  | string;

export interface SanctionEntry {
  id: string;
  schema: Schema;
  name: string;
  aliases: string[];
  countries: string[];
  programs: string[];
  sanctions: string;
  /** OpenSanctions datasets the entity is on, e.g. "US FCC Covered List". */
  datasets: string[];
  first_seen?: string;
  last_seen?: string;
}

interface LoadedList {
  fetchedAt: number;
  entries: SanctionEntry[];
  /** Lower-cased, punctuation-stripped name/alias → entry. */
  byNormName: Map<string, SanctionEntry[]>;
}

let cache: LoadedList | null = null;
let inflight: Promise<LoadedList> | null = null;

/**
 * Lower-case, strip punctuation, collapse whitespace. Used for both index
 * keys and incoming query normalisation so the same string yields the
 * same key on both sides.
 */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Minimal CSV parser tolerant of double-quoted fields with embedded
 * commas, newlines and `""` escapes. The OpenSanctions CSV is well-formed
 * so we don't need a heavyweight parser — `papaparse` etc. would just
 * pull a dependency for the same job.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore — handled by the \n branch
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const splitSemi = (v: string | undefined) => (v || '').split(';').map((s) => s.trim()).filter(Boolean);

/**
 * Index OpenSanctions simple CSVs. An entity in several files (same id) is
 * kept once and carries every dataset.
 */
export function buildIndex(texts: string[]): Omit<LoadedList, 'fetchedAt'> {
  const entries: SanctionEntry[] = [];
  const byNormName = new Map<string, SanctionEntry[]>();
  const byId = new Map<string, SanctionEntry>();

  for (const text of texts) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('OpenSanctions CSV empty');

    const headers = rows[0];
    const idx = (col: string) => headers.indexOf(col);
    const i = {
      id: idx('id'),
      schema: idx('schema'),
      name: idx('name'),
      aliases: idx('aliases'),
      countries: idx('countries'),
      programs: idx('program_ids'),
      sanctions: idx('sanctions'),
      datasets: idx('dataset'),
      first_seen: idx('first_seen'),
      last_seen: idx('last_seen'),
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[i.name]) continue;
      const datasets = i.datasets >= 0 ? splitSemi(row[i.datasets]) : [];
      const known = row[i.id] ? byId.get(row[i.id]) : undefined;
      if (known) {
        for (const d of datasets) if (!known.datasets.includes(d)) known.datasets.push(d);
        continue;
      }
      const entry: SanctionEntry = {
        id: row[i.id] || '',
        schema: row[i.schema] || 'LegalEntity',
        name: row[i.name],
        aliases: splitSemi(row[i.aliases]),
        countries: splitSemi(row[i.countries]),
        programs: splitSemi(row[i.programs]),
        sanctions: row[i.sanctions] || '',
        datasets,
        first_seen: i.first_seen >= 0 ? row[i.first_seen] : undefined,
        last_seen: i.last_seen >= 0 ? row[i.last_seen] : undefined,
      };
      entries.push(entry);
      if (entry.id) byId.set(entry.id, entry);

      // Index every name + alias under its normalised form so an exact
      // (post-normalisation) match is O(1).
      const keys = new Set<string>([entry.name, ...entry.aliases].map(normName));
      for (const key of keys) {
        if (!key) continue;
        const list = byNormName.get(key);
        if (list) list.push(entry);
        else byNormName.set(key, [entry]);
      }
    }
  }
  return { entries, byNormName };
}

async function loadList(): Promise<LoadedList> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const texts: string[] = [];
      for (const url of SANCTIONS_CSV_URLS) {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: 'text/csv' },
        });
        if (!res.ok) throw new Error(`OpenSanctions HTTP ${res.status} for ${url}`);
        texts.push(await res.text());
      }

      const loaded = { fetchedAt: Date.now(), ...buildIndex(texts) };
      cache = loaded;
      return loaded;
    } catch (e) {
      if (cache) return cache;
      throw e;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Strict exact-match lookup (used for inline cross-checks where false
 * positives must be avoided — the registrant string `"Acme"` should NOT
 * match `"Acme Holdings"` automatically).
 */
export async function matchExact(query: string): Promise<SanctionEntry[]> {
  if (!query || query.length < 3) return [];
  const list = await loadList();
  return list.byNormName.get(normName(query)) ?? [];
}

/**
 * Substring + contains search (used for the standalone SANCTIONS tab where
 * the operator is explicitly probing for partial names).
 *
 * Returns up to `limit` matches, ranked: exact name match first, then
 * exact alias match, then substring of name, then substring of alias.
 */
export async function search(
  query: string,
  opts: { schema?: Schema; limit?: number } = {}
): Promise<SanctionEntry[]> {
  if (!query || query.length < 4) return [];
  const list = await loadList();
  const q = normName(query);
  const limit = opts.limit ?? 50;

  const exactName: SanctionEntry[] = [];
  const exactAlias: SanctionEntry[] = [];
  const subName: SanctionEntry[] = [];
  const subAlias: SanctionEntry[] = [];
  const seen = new Set<string>();

  const push = (bucket: SanctionEntry[], e: SanctionEntry) => {
    if (seen.has(e.id)) return;
    if (opts.schema && e.schema !== opts.schema) return;
    seen.add(e.id);
    bucket.push(e);
  };

  for (const entry of list.entries) {
    const nameNorm = normName(entry.name);
    if (nameNorm === q) push(exactName, entry);
    else if (entry.aliases.some((a) => normName(a) === q)) push(exactAlias, entry);
    else if (nameNorm.includes(q)) push(subName, entry);
    else if (entry.aliases.some((a) => normName(a).includes(q))) push(subAlias, entry);
    if (seen.size >= limit * 4) break; // hard cap on the scan
  }

  return [...exactName, ...exactAlias, ...subName, ...subAlias].slice(0, limit);
}

/** Number of indexed entries, for diagnostics / `/api/health`. */
export async function indexSize(): Promise<number> {
  const list = await loadList();
  return list.entries.length;
}

/**
 * Every indexed entry, for callers that need to scan rather than look up —
 * e.g. pulling the designated crypto wallets out of the list. Returns the
 * cached array directly; treat it as read-only.
 */
export async function allEntries(): Promise<readonly SanctionEntry[]> {
  const list = await loadList();
  return list.entries;
}

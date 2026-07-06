export type SourceCategory =
  | 'aviation' | 'maritime' | 'seismic' | 'fire' | 'weather' | 'space'
  | 'cyber' | 'conflict' | 'disaster' | 'news' | 'markets' | 'osint' | 'other';

export type SourceStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface SourceMeta {
  /** Stable slug, e.g. 'usgs-earthquakes' */
  id: string;
  /** Display name, e.g. 'USGS Earthquake Feed' */
  name: string;
  category: SourceCategory;
  /** Provenance link shown in the UI */
  homepage: string;
  license?: string;
  requiresKey: boolean;
  /** Env var names to check; adapter is disabled if any required key is missing */
  keyEnvVars?: string[];
  /** Cache lifetime in seconds */
  ttlSeconds: number;
  /** Minimum interval between upstream calls, in ms */
  minIntervalMs: number;
  /** Short credit shown in the UI provenance badge */
  attribution: string;
}

export interface FetchContext {
  signal: AbortSignal;
  params?: Record<string, string>;
}

export interface NormalizedResult<T> {
  sourceId: string;
  /** ISO timestamp of when this data was fetched (or last successfully fetched, if stale) */
  fetchedAt: string;
  /** True if served from a stale cache entry after an upstream failure */
  stale: boolean;
  data: T | undefined;
  status: SourceStatus;
  error?: string;
}

export interface SourceAdapter<T> {
  meta: SourceMeta;
  /** False if requiresKey is true and a required env var is unset */
  isEnabled(): boolean;
  /** Fetch + normalize from upstream. Throws on failure. */
  fetch(ctx: FetchContext): Promise<T>;
}

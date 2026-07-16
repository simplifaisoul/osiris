import {
  buildEarthquakeResponse,
  type EarthquakeResponse,
} from './contract';
import {
  getEarthquakeDatabase,
  type EarthquakeDatabase,
  type EarthquakeDatabaseSnapshot,
} from './database-source';
import { fetchLiveEarthquakes } from './live-source';

type Environment = Readonly<Record<string, string | undefined>>;

export type EarthquakeDataMode =
  | 'live'
  | 'database'
  | 'database_with_live_fallback';

export type EarthquakeDataSource =
  | 'usgs-live'
  | 'worldstate-database'
  | 'usgs-live-fallback';

export type EarthquakeFallbackReason =
  | 'database-unconfigured'
  | 'database-unavailable'
  | 'database-without-success'
  | 'database-stale';

export interface EarthquakeRuntimeConfig {
  mode: EarthquakeDataMode;
  databaseMaxAgeMs: number;
}

export interface EarthquakeSnapshot {
  response: EarthquakeResponse;
  mode: EarthquakeDataMode;
  source: EarthquakeDataSource;
  databaseResponseReceivedAt: Date | null;
  databaseUpstreamTimestamp: Date | null;
  databaseStale: boolean;
  fallbackReason: EarthquakeFallbackReason | null;
}

interface EarthquakeServiceDependencies {
  getDatabase?: () => EarthquakeDatabase | null;
  loadLive?: typeof fetchLiveEarthquakes;
  now?: () => Date;
  warn?: (message: string) => void;
}

export class EarthquakeDatabaseUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EarthquakeDatabaseUnavailableError';
  }
}

function readDuration(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 60_000 || parsed > 86_400_000) {
    throw new Error(
      'EARTHQUAKE_DATABASE_MAX_AGE_MS must be an integer between 60000 and 86400000',
    );
  }
  return parsed;
}

export function loadEarthquakeRuntimeConfig(
  environment: Environment = process.env,
): EarthquakeRuntimeConfig {
  const value = environment.EARTHQUAKE_DATA_MODE?.trim() || 'live';
  if (
    value !== 'live'
    && value !== 'database'
    && value !== 'database_with_live_fallback'
  ) {
    throw new Error(
      'EARTHQUAKE_DATA_MODE must be live, database, or database_with_live_fallback',
    );
  }

  return {
    mode: value,
    databaseMaxAgeMs: value === 'live'
      ? 900_000
      : readDuration(environment.EARTHQUAKE_DATABASE_MAX_AGE_MS, 900_000),
  };
}

function databaseAge(snapshot: EarthquakeDatabaseSnapshot, now: Date): number | null {
  if (snapshot.responseReceivedAt === null || snapshot.upstreamTimestamp === null) return null;
  return Math.max(
    0,
    now.getTime() - snapshot.responseReceivedAt.getTime(),
    now.getTime() - snapshot.upstreamTimestamp.getTime(),
  );
}

async function loadDatabase(
  database: EarthquakeDatabase,
): Promise<EarthquakeDatabaseSnapshot> {
  return database.loadSnapshot();
}

async function liveSnapshot(
  config: EarthquakeRuntimeConfig,
  now: Date,
  loadLive: typeof fetchLiveEarthquakes,
  fallbackReason: EarthquakeFallbackReason | null,
  databaseResponseReceivedAt: Date | null = null,
  databaseUpstreamTimestamp: Date | null = null,
): Promise<EarthquakeSnapshot> {
  const earthquakes = await loadLive();
  return {
    response: buildEarthquakeResponse(earthquakes, now),
    mode: config.mode,
    source: fallbackReason === null ? 'usgs-live' : 'usgs-live-fallback',
    databaseResponseReceivedAt,
    databaseUpstreamTimestamp,
    databaseStale: fallbackReason === 'database-stale',
    fallbackReason,
  };
}

export async function loadEarthquakeSnapshot(
  config: EarthquakeRuntimeConfig = loadEarthquakeRuntimeConfig(),
  dependencies: EarthquakeServiceDependencies = {},
): Promise<EarthquakeSnapshot> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError('Current time must be a valid date');

  const loadLive = dependencies.loadLive ?? fetchLiveEarthquakes;
  if (config.mode === 'live') {
    return liveSnapshot(config, now, loadLive, null);
  }

  const getDatabase = dependencies.getDatabase ?? (() => getEarthquakeDatabase());
  let database: EarthquakeDatabase | null;
  try {
    database = getDatabase();
  } catch (error) {
    if (config.mode === 'database_with_live_fallback') {
      dependencies.warn?.('[earthquakes] Database configuration failed; using live USGS fallback');
      return liveSnapshot(config, now, loadLive, 'database-unavailable');
    }
    throw new EarthquakeDatabaseUnavailableError(
      'Earthquake database configuration is invalid',
      { cause: error },
    );
  }

  if (database === null) {
    if (config.mode === 'database_with_live_fallback') {
      dependencies.warn?.('[earthquakes] Database is unconfigured; using live USGS fallback');
      return liveSnapshot(config, now, loadLive, 'database-unconfigured');
    }
    throw new EarthquakeDatabaseUnavailableError('Earthquake database is not configured');
  }

  let databaseSnapshot: EarthquakeDatabaseSnapshot;
  try {
    databaseSnapshot = await loadDatabase(database);
  } catch (error) {
    if (config.mode === 'database_with_live_fallback') {
      dependencies.warn?.('[earthquakes] Database query failed; using live USGS fallback');
      return liveSnapshot(config, now, loadLive, 'database-unavailable');
    }
    throw new EarthquakeDatabaseUnavailableError('Earthquake database query failed', {
      cause: error,
    });
  }

  const age = databaseAge(databaseSnapshot, now);
  if (age === null) {
    if (config.mode === 'database_with_live_fallback') {
      dependencies.warn?.(
        '[earthquakes] Database has no complete successful snapshot; using live USGS fallback',
      );
      return liveSnapshot(config, now, loadLive, 'database-without-success');
    }
    throw new EarthquakeDatabaseUnavailableError(
      'Earthquake database has no successful collection',
    );
  }

  const stale = age > config.databaseMaxAgeMs;
  if (stale && config.mode === 'database_with_live_fallback') {
    dependencies.warn?.('[earthquakes] Database snapshot is stale; using live USGS fallback');
    return liveSnapshot(
      config,
      now,
      loadLive,
      'database-stale',
      databaseSnapshot.responseReceivedAt,
      databaseSnapshot.upstreamTimestamp,
    );
  }

  if (stale) {
    throw new EarthquakeDatabaseUnavailableError('Earthquake database snapshot is stale');
  }

  return {
    response: buildEarthquakeResponse(databaseSnapshot.earthquakes, now),
    mode: config.mode,
    source: 'worldstate-database',
    databaseResponseReceivedAt: databaseSnapshot.responseReceivedAt,
    databaseUpstreamTimestamp: databaseSnapshot.upstreamTimestamp,
    databaseStale: false,
    fallbackReason: null,
  };
}

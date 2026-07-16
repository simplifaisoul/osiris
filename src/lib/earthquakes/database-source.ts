import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

import type { Earthquake } from './contract';

const USGS_SOURCE_ID = 'usgs-earthquakes';
type Environment = Readonly<Record<string, string | undefined>>;

const DATABASE_QUERY = `
WITH latest_success AS (
  SELECT
    id,
    response_received_at,
    upstream_timestamp,
    record_count
  FROM collection_runs
  WHERE source_id = $1
    AND status = 'succeeded'
    AND legacy_provenance_incomplete = FALSE
    AND response_received_at IS NOT NULL
  ORDER BY response_received_at DESC, id DESC
  LIMIT 1
)
SELECT
  latest_success.response_received_at,
  latest_success.upstream_timestamp,
  latest_success.record_count,
  recent.source_event_id,
  recent.latitude,
  recent.longitude,
  recent.depth_km,
  recent.magnitude,
  recent.place,
  recent.time_ms,
  recent.url,
  recent.tsunami,
  recent.event_type,
  recent.felt,
  recent.alert
FROM latest_success
LEFT JOIN LATERAL (
  SELECT
    event.source_event_id,
    ST_Y(event.geometry)::double precision AS latitude,
    ST_X(event.geometry)::double precision AS longitude,
    event.depth_km,
    event.magnitude,
    event.place,
    (EXTRACT(EPOCH FROM event.occurred_at) * 1000)::double precision AS time_ms,
    COALESCE(
      NULLIF(event.metadata #>> '{compatibility,url}', ''),
      NULLIF(raw.payload #>> '{properties,url}', '')
    ) AS url,
    CASE WHEN event.tsunami THEN 1 ELSE 0 END AS tsunami,
    event.event_type,
    event.felt,
    event.alert,
    event.occurred_at
  FROM raw_observations AS raw
  INNER JOIN seismic_events AS event
    ON event.source_id = raw.source_id
   AND event.source_event_id = raw.source_record_id
   AND event.raw_observation_id = raw.id
  WHERE raw.source_id = $1
    AND raw.last_seen_at = latest_success.response_received_at
    AND raw.source_record_id IS NOT NULL
  ORDER BY event.occurred_at DESC, event.source_event_id ASC
) AS recent ON TRUE
ORDER BY recent.occurred_at DESC NULLS LAST, recent.source_event_id ASC`;

interface DatabaseEarthquakeRow extends QueryResultRow {
  response_received_at: Date | string;
  upstream_timestamp: Date | string | null;
  record_count: number | null;
  source_event_id: string | null;
  latitude: number | null;
  longitude: number | null;
  depth_km: number | null;
  magnitude: number | null;
  place: string | null;
  time_ms: number | null;
  url: string | null;
  tsunami: number | null;
  event_type: string | null;
  felt: number | null;
  alert: string | null;
}

export interface EarthquakeDatabaseSnapshot {
  earthquakes: Earthquake[];
  responseReceivedAt: Date | null;
  upstreamTimestamp: Date | null;
}

export interface EarthquakeDatabase {
  loadSnapshot(): Promise<EarthquakeDatabaseSnapshot>;
}

export interface EarthquakeQueryExecutor {
  query<Row extends QueryResultRow>(
    queryText: string,
    values: unknown[],
  ): Promise<{ rows: Row[] }>;
}

export class EarthquakeDatabaseDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EarthquakeDatabaseDataError';
  }
}

function parseTimestamp(value: Date | string | null | undefined, field: string): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new EarthquakeDatabaseDataError(`Database returned an invalid ${field} timestamp`);
  }
  return parsed;
}

function mapDatabaseRow(row: DatabaseEarthquakeRow): Earthquake | null {
  if (row.source_event_id === null) return null;

  if (
    typeof row.latitude !== 'number'
    || !Number.isFinite(row.latitude)
    || typeof row.longitude !== 'number'
    || !Number.isFinite(row.longitude)
    || typeof row.depth_km !== 'number'
    || !Number.isFinite(row.depth_km)
    || typeof row.time_ms !== 'number'
    || !Number.isFinite(row.time_ms)
    || (row.tsunami !== 0 && row.tsunami !== 1)
  ) {
    throw new EarthquakeDatabaseDataError(
      `Database returned an invalid compatibility row for ${row.source_event_id}`,
    );
  }

  return {
    id: row.source_event_id,
    lat: row.latitude,
    lng: row.longitude,
    depth: row.depth_km,
    magnitude: row.magnitude,
    place: row.place,
    time: row.time_ms,
    url: row.url,
    tsunami: row.tsunami,
    type: row.event_type,
    felt: row.felt,
    alert: row.alert,
  };
}

export class PostgresEarthquakeDatabase implements EarthquakeDatabase {
  constructor(private readonly executor: EarthquakeQueryExecutor) {}

  async loadSnapshot(): Promise<EarthquakeDatabaseSnapshot> {
    const result = await this.executor.query<DatabaseEarthquakeRow>(DATABASE_QUERY, [
      USGS_SOURCE_ID,
    ]);
    const responseReceivedAt = parseTimestamp(
      result.rows[0]?.response_received_at,
      'response-received',
    );
    const upstreamTimestamp = parseTimestamp(
      result.rows[0]?.upstream_timestamp,
      'upstream',
    );
    const earthquakes = result.rows.flatMap((row) => {
      const mapped = mapDatabaseRow(row);
      return mapped === null ? [] : [mapped];
    });

    const expectedRecordCount = result.rows[0]?.record_count;
    if (expectedRecordCount !== undefined) {
      if (
        expectedRecordCount === null
        || !Number.isInteger(expectedRecordCount)
        || expectedRecordCount < 0
      ) {
        throw new EarthquakeDatabaseDataError('Database returned an invalid collection count');
      }
      if (expectedRecordCount !== earthquakes.length) {
        throw new EarthquakeDatabaseDataError(
          `Database snapshot count mismatch: expected ${expectedRecordCount}, found ${earthquakes.length}`,
        );
      }
    }

    return { earthquakes, responseReceivedAt, upstreamTimestamp };
  }
}

function environmentValue(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name]?.trim();
  return value === '' ? undefined : value;
}

function environmentSecret(
  environment: Environment,
  name: string,
): string | undefined {
  const value = environment[name];
  return value === undefined || value === '' ? undefined : value;
}

function environmentDuration(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = environmentValue(environment, name);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('DATABASE_URL must be an absolute PostgreSQL URL', { cause: error });
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!url.hostname || url.pathname.length <= 1 || !url.username || !url.password) {
    throw new Error('DATABASE_URL must include a host, database, username, and password');
  }
}

/** Resolve server-only connection settings without ever exposing them to React. */
export function resolveEarthquakePoolConfig(
  environment: Environment = process.env,
): PoolConfig | null {
  const discrete = {
    database: environmentValue(environment, 'WORLDSTATE_PGDATABASE'),
    host: environmentValue(environment, 'WORLDSTATE_PGHOST'),
    password: environmentSecret(environment, 'WORLDSTATE_PGPASSWORD'),
    port: environmentValue(environment, 'WORLDSTATE_PGPORT'),
    user: environmentValue(environment, 'WORLDSTATE_PGUSER'),
  };
  const discreteValues = Object.values(discrete);
  const hasCompleteDiscreteConfig = discreteValues.every((value) => value !== undefined);
  const hasPartialDiscreteConfig = discreteValues.some((value) => value !== undefined);

  const connectionTimeoutMillis = environmentDuration(
    environment,
    'DB_CONNECTION_TIMEOUT_MS',
    5_000,
    250,
    60_000,
  );
  const queryTimeoutMillis = environmentDuration(
    environment,
    'DB_QUERY_TIMEOUT_MS',
    15_000,
    250,
    120_000,
  );
  const statementTimeoutMillis = environmentDuration(
    environment,
    'DB_STATEMENT_TIMEOUT_MS',
    15_000,
    250,
    120_000,
  );
  const lockTimeoutMillis = environmentDuration(
    environment,
    'DB_LOCK_TIMEOUT_MS',
    5_000,
    250,
    60_000,
  );
  const common: PoolConfig = {
    application_name: 'osiris-earthquake-api',
    connectionTimeoutMillis,
    idleTimeoutMillis: 30_000,
    lock_timeout: lockTimeoutMillis,
    max: 5,
    query_timeout: queryTimeoutMillis,
    statement_timeout: statementTimeoutMillis,
  };

  if (hasCompleteDiscreteConfig) {
    const port = Number(discrete.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('WORLDSTATE_PGPORT must be an integer between 1 and 65535');
    }
    return {
      ...common,
      database: discrete.database,
      host: discrete.host,
      password: discrete.password,
      port,
      user: discrete.user,
    };
  }

  const databaseUrl = environmentValue(environment, 'DATABASE_URL');
  if (databaseUrl !== undefined) {
    validateDatabaseUrl(databaseUrl);
    return { ...common, connectionString: databaseUrl };
  }

  if (hasPartialDiscreteConfig) {
    const missing = Object.entries(discrete)
      .filter(([, value]) => value === undefined)
      .map(([name]) => `WORLDSTATE_PG${name.toUpperCase()}`);
    throw new Error(`Incomplete World-State database settings; missing: ${missing.join(', ')}`);
  }

  return null;
}

type EarthquakeGlobal = typeof globalThis & {
  __osirisEarthquakePool?: Pool;
  __osirisEarthquakeDatabase?: PostgresEarthquakeDatabase;
};

export function getEarthquakeDatabase(
  environment: Environment = process.env,
): EarthquakeDatabase | null {
  const config = resolveEarthquakePoolConfig(environment);
  if (config === null) return null;

  const shared = globalThis as EarthquakeGlobal;
  if (shared.__osirisEarthquakeDatabase !== undefined) {
    return shared.__osirisEarthquakeDatabase;
  }

  const pool = new Pool(config);
  pool.on('error', (error) => {
    console.error('[earthquakes] Idle database client error:', error.message);
  });
  const database = new PostgresEarthquakeDatabase(pool);
  shared.__osirisEarthquakePool = pool;
  shared.__osirisEarthquakeDatabase = database;
  return database;
}

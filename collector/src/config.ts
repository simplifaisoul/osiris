import { isAbsolute } from "node:path";

import type { PoolConfig } from "pg";
import { z } from "zod";

const OFFICIAL_USGS_HOST = "earthquake.usgs.gov";
const DEFAULT_USGS_ENDPOINT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

const booleanFromEnvironment = z
  .enum(["0", "1", "false", "true"])
  .default("0")
  .transform((value) => value === "1" || value === "true");

const optionalEnvironmentString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalEnvironmentPort = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(65_535).optional(),
);

const environmentSchema = z.object({
  COLLECT_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(300_000),
  COLLECT_ON_STARTUP: z
    .enum(["0", "1", "false", "true"])
    .default("1")
    .transform((value) => value === "1" || value === "true"),
  COLLECT_ONCE: booleanFromEnvironment,
  DATABASE_URL: optionalEnvironmentString,
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(250).max(60_000).default(5_000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(250).max(60_000).default(5_000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(250).max(120_000).default(15_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(250).max(120_000).default(15_000),
  HEALTH_HOST: z.string().min(1).default("0.0.0.0"),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MAX_FETCH_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  MAX_RESPONSE_BYTES: z.coerce.number().int().min(1_024).max(100 * 1024 * 1024).default(25 * 1024 * 1024),
  PGDATABASE: optionalEnvironmentString,
  PGHOST: optionalEnvironmentString,
  PGPASSWORD: optionalEnvironmentString,
  PGPORT: optionalEnvironmentPort,
  PGUSER: optionalEnvironmentString,
  RAW_ARCHIVE_PATH: z.string().min(1),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  RETRY_BASE_MS: z.coerce.number().int().min(50).max(10_000).default(500),
  STALE_RUN_AFTER_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
  USGS_EARTHQUAKE_URL: z.string().url().default(DEFAULT_USGS_ENDPOINT),
});

export interface CollectorConfig {
  archiveRoot: string;
  collectIntervalMs: number;
  collectOnStartup: boolean;
  collectOnce: boolean;
  databaseConfig: PoolConfig;
  healthHost: string;
  healthPort: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  maxFetchAttempts: number;
  maxResponseBytes: number;
  requestTimeoutMs: number;
  retryBaseMs: number;
  staleRunAfterMs: number;
  usgsEndpoint: URL;
}

function validateDatabaseUrl(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("DATABASE_URL must be an absolute PostgreSQL URL", { cause: error });
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  if (url.hostname.length === 0 || url.pathname.length <= 1) {
    throw new Error("DATABASE_URL must include a host and database name");
  }

  if (url.username.length === 0 || url.password.length === 0) {
    throw new Error("DATABASE_URL must include an explicit username and password");
  }
}

function databaseConfig(
  parsed: z.infer<typeof environmentSchema>,
): PoolConfig {
  const timeouts = {
    connectionTimeoutMillis: parsed.DB_CONNECTION_TIMEOUT_MS,
    lock_timeout: parsed.DB_LOCK_TIMEOUT_MS,
    query_timeout: parsed.DB_QUERY_TIMEOUT_MS,
    statement_timeout: parsed.DB_STATEMENT_TIMEOUT_MS,
  };

  if (parsed.DATABASE_URL !== undefined) {
    validateDatabaseUrl(parsed.DATABASE_URL);
    return {
      ...timeouts,
      application_name: "osiris-worldstate-collector",
      connectionString: parsed.DATABASE_URL,
      max: 5,
    };
  }

  const required = {
    PGDATABASE: parsed.PGDATABASE,
    PGHOST: parsed.PGHOST,
    PGPASSWORD: parsed.PGPASSWORD,
    PGPORT: parsed.PGPORT,
    PGUSER: parsed.PGUSER,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Set DATABASE_URL or all discrete PostgreSQL settings; missing: ${missing.join(", ")}`,
    );
  }

  return {
    ...timeouts,
    application_name: "osiris-worldstate-collector",
    database: parsed.PGDATABASE,
    host: parsed.PGHOST,
    max: 5,
    password: parsed.PGPASSWORD,
    port: parsed.PGPORT,
    user: parsed.PGUSER,
  };
}

function validateUsgsEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_USGS_HOST) {
    throw new Error(`USGS_EARTHQUAKE_URL must use HTTPS on ${OFFICIAL_USGS_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error("USGS_EARTHQUAKE_URL must not contain credentials");
  }
  return url;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): CollectorConfig {
  const parsed = environmentSchema.parse(environment);

  if (!isAbsolute(parsed.RAW_ARCHIVE_PATH)) {
    throw new Error("RAW_ARCHIVE_PATH must be absolute");
  }

  return {
    archiveRoot: parsed.RAW_ARCHIVE_PATH,
    collectIntervalMs: parsed.COLLECT_INTERVAL_MS,
    collectOnStartup: parsed.COLLECT_ON_STARTUP,
    collectOnce: parsed.COLLECT_ONCE,
    databaseConfig: databaseConfig(parsed),
    healthHost: parsed.HEALTH_HOST,
    healthPort: parsed.HEALTH_PORT,
    logLevel: parsed.LOG_LEVEL,
    maxFetchAttempts: parsed.MAX_FETCH_ATTEMPTS,
    maxResponseBytes: parsed.MAX_RESPONSE_BYTES,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    retryBaseMs: parsed.RETRY_BASE_MS,
    staleRunAfterMs: parsed.STALE_RUN_AFTER_MS,
    usgsEndpoint: validateUsgsEndpoint(parsed.USGS_EARTHQUAKE_URL),
  };
}

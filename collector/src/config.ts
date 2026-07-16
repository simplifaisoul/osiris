import { isAbsolute } from "node:path";

import type { PoolConfig } from "pg";
import { z } from "zod";

const OFFICIAL_USGS_HOST = "earthquake.usgs.gov";
const OFFICIAL_GDACS_HOST = "www.gdacs.org";
const OFFICIAL_FIRMS_HOST = "firms.modaps.eosdis.nasa.gov";
const OFFICIAL_EONET_HOST = "eonet.gsfc.nasa.gov";
const OFFICIAL_NWS_HOST = "api.weather.gov";
const OFFICIAL_SWPC_HOST = "services.swpc.noaa.gov";
const OFFICIAL_FEODO_HOST = "feodotracker.abuse.ch";
const OFFICIAL_URLHAUS_HOST = "urlhaus.abuse.ch";
const OFFICIAL_CISA_HOST = "www.cisa.gov";
const OFFICIAL_CELESTRAK_HOST = "celestrak.org";
const OFFICIAL_SATNOGS_HOST = "db.satnogs.org";
const DEFAULT_USGS_ENDPOINT =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const DEFAULT_GDACS_ENDPOINT = "https://www.gdacs.org/xml/rss.xml";
const DEFAULT_FIRMS_VIIRS_ENDPOINT =
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv";
const DEFAULT_FIRMS_MODIS_ENDPOINT =
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv";
const DEFAULT_EONET_VOLCANOES_ENDPOINT =
  "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes&limit=50";
const DEFAULT_EONET_WEATHER_ENDPOINT =
  "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100";
const DEFAULT_NWS_ALERTS_ENDPOINT =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";
const DEFAULT_SWPC_KP_ENDPOINT =
  "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
const DEFAULT_SWPC_ALERTS_ENDPOINT =
  "https://services.swpc.noaa.gov/products/alerts.json";
const DEFAULT_SWPC_XRAY_FLARES_ENDPOINT =
  "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json";
const DEFAULT_FEODO_ENDPOINT =
  "https://feodotracker.abuse.ch/downloads/ipblocklist.json";
const DEFAULT_URLHAUS_ENDPOINT =
  "https://urlhaus.abuse.ch/downloads/csv_online/";
const DEFAULT_CISA_KEV_ENDPOINT =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const DEFAULT_CELESTRAK_ACTIVE_TLE_ENDPOINT =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const DEFAULT_CELESTRAK_STARLINK_TLE_ENDPOINT =
  "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle";
const DEFAULT_SATNOGS_TLE_ENDPOINT = "https://db.satnogs.org/api/tle/?format=json";

const collectorSourceSchema = z.enum([
  "usgs-earthquakes",
  "gdacs-disasters",
  "nasa-firms-viirs",
  "nasa-firms-modis",
  "nasa-eonet-volcanoes",
  "nasa-eonet-weather",
  "noaa-nws-alerts",
  "noaa-swpc-planetary-k-index",
  "noaa-swpc-alerts",
  "noaa-swpc-xray-flares",
  "abusech-feodo-ipblocklist",
  "abusech-urlhaus-online",
  "cisa-known-exploited-vulnerabilities",
  "celestrak-active-tle",
  "celestrak-starlink-supplemental-tle",
  "satnogs-tle",
]);

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
  COLLECTOR_SOURCE: collectorSourceSchema.default("usgs-earthquakes"),
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
  EONET_VOLCANOES_URL: z.string().url().default(DEFAULT_EONET_VOLCANOES_ENDPOINT),
  EONET_WEATHER_URL: z.string().url().default(DEFAULT_EONET_WEATHER_ENDPOINT),
  FIRMS_MODIS_URL: z.string().url().default(DEFAULT_FIRMS_MODIS_ENDPOINT),
  FIRMS_VIIRS_URL: z.string().url().default(DEFAULT_FIRMS_VIIRS_ENDPOINT),
  GDACS_RSS_URL: z.string().url().default(DEFAULT_GDACS_ENDPOINT),
  NWS_ALERTS_URL: z.string().url().default(DEFAULT_NWS_ALERTS_ENDPOINT),
  SWPC_ALERTS_URL: z.string().url().default(DEFAULT_SWPC_ALERTS_ENDPOINT),
  SWPC_KP_URL: z.string().url().default(DEFAULT_SWPC_KP_ENDPOINT),
  SWPC_XRAY_FLARES_URL: z.string().url().default(DEFAULT_SWPC_XRAY_FLARES_ENDPOINT),
  FEODO_IPBLOCKLIST_URL: z.string().url().default(DEFAULT_FEODO_ENDPOINT),
  URLHAUS_ONLINE_URL: z.string().url().default(DEFAULT_URLHAUS_ENDPOINT),
  CISA_KEV_URL: z.string().url().default(DEFAULT_CISA_KEV_ENDPOINT),
  CELESTRAK_ACTIVE_TLE_URL: z.string().url().default(DEFAULT_CELESTRAK_ACTIVE_TLE_ENDPOINT),
  CELESTRAK_STARLINK_TLE_URL: z.string().url().default(DEFAULT_CELESTRAK_STARLINK_TLE_ENDPOINT),
  SATNOGS_TLE_URL: z.string().url().default(DEFAULT_SATNOGS_TLE_ENDPOINT),
  USGS_EARTHQUAKE_URL: z.string().url().default(DEFAULT_USGS_ENDPOINT),
});

export interface CollectorConfig {
  archiveRoot: string;
  collectIntervalMs: number;
  collectOnStartup: boolean;
  collectOnce: boolean;
  collectorSource: z.infer<typeof collectorSourceSchema>;
  databaseConfig: PoolConfig;
  eonetVolcanoesEndpoint: URL;
  eonetWeatherEndpoint: URL;
  firmsModisEndpoint: URL;
  firmsViirsEndpoint: URL;
  gdacsEndpoint: URL;
  healthHost: string;
  healthPort: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  maxFetchAttempts: number;
  nwsAlertsEndpoint: URL;
  maxResponseBytes: number;
  requestTimeoutMs: number;
  retryBaseMs: number;
  staleRunAfterMs: number;
  feodoEndpoint: URL;
  urlhausEndpoint: URL;
  cisaKevEndpoint: URL;
  celestrakActiveTleEndpoint: URL;
  celestrakStarlinkTleEndpoint: URL;
  satnogsTleEndpoint: URL;
  swpcAlertsEndpoint: URL;
  swpcKpEndpoint: URL;
  swpcXrayFlaresEndpoint: URL;
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

function validateGdacsEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_GDACS_HOST) {
    throw new Error(`GDACS_RSS_URL must use HTTPS on ${OFFICIAL_GDACS_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error("GDACS_RSS_URL must not contain credentials");
  }
  return url;
}

function validateFirmsEndpoint(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_FIRMS_HOST) {
    throw new Error(`${name} must use HTTPS on ${OFFICIAL_FIRMS_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
}

function validateEonetEndpoint(value: string, name = "EONET_VOLCANOES_URL"): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_EONET_HOST) {
    throw new Error(`${name} must use HTTPS on ${OFFICIAL_EONET_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
}

function validateNwsEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_NWS_HOST) {
    throw new Error(`NWS_ALERTS_URL must use HTTPS on ${OFFICIAL_NWS_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error("NWS_ALERTS_URL must not contain credentials");
  }
  return url;
}

function validateSwpcEndpoint(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== OFFICIAL_SWPC_HOST) {
    throw new Error(`${name} must use HTTPS on ${OFFICIAL_SWPC_HOST}`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
}

function validateThreatIntelEndpoint(value: string, name: string, host: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== host) {
    throw new Error(`${name} must use HTTPS on ${host}`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url;
}

function validateSatelliteEndpoint(value: string, name: string, host: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== host) {
    throw new Error(`${name} must use HTTPS on ${host}`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
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
    collectorSource: parsed.COLLECTOR_SOURCE,
    databaseConfig: databaseConfig(parsed),
    eonetVolcanoesEndpoint: validateEonetEndpoint(parsed.EONET_VOLCANOES_URL),
    eonetWeatherEndpoint: validateEonetEndpoint(parsed.EONET_WEATHER_URL, "EONET_WEATHER_URL"),
    firmsModisEndpoint: validateFirmsEndpoint(parsed.FIRMS_MODIS_URL, "FIRMS_MODIS_URL"),
    firmsViirsEndpoint: validateFirmsEndpoint(parsed.FIRMS_VIIRS_URL, "FIRMS_VIIRS_URL"),
    gdacsEndpoint: validateGdacsEndpoint(parsed.GDACS_RSS_URL),
    healthHost: parsed.HEALTH_HOST,
    healthPort: parsed.HEALTH_PORT,
    logLevel: parsed.LOG_LEVEL,
    maxFetchAttempts: parsed.MAX_FETCH_ATTEMPTS,
    maxResponseBytes: parsed.MAX_RESPONSE_BYTES,
    nwsAlertsEndpoint: validateNwsEndpoint(parsed.NWS_ALERTS_URL),
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    retryBaseMs: parsed.RETRY_BASE_MS,
    staleRunAfterMs: parsed.STALE_RUN_AFTER_MS,
    feodoEndpoint: validateThreatIntelEndpoint(
      parsed.FEODO_IPBLOCKLIST_URL,
      "FEODO_IPBLOCKLIST_URL",
      OFFICIAL_FEODO_HOST,
    ),
    urlhausEndpoint: validateThreatIntelEndpoint(
      parsed.URLHAUS_ONLINE_URL,
      "URLHAUS_ONLINE_URL",
      OFFICIAL_URLHAUS_HOST,
    ),
    cisaKevEndpoint: validateThreatIntelEndpoint(
      parsed.CISA_KEV_URL,
      "CISA_KEV_URL",
      OFFICIAL_CISA_HOST,
    ),
    celestrakActiveTleEndpoint: validateSatelliteEndpoint(
      parsed.CELESTRAK_ACTIVE_TLE_URL,
      "CELESTRAK_ACTIVE_TLE_URL",
      OFFICIAL_CELESTRAK_HOST,
    ),
    celestrakStarlinkTleEndpoint: validateSatelliteEndpoint(
      parsed.CELESTRAK_STARLINK_TLE_URL,
      "CELESTRAK_STARLINK_TLE_URL",
      OFFICIAL_CELESTRAK_HOST,
    ),
    satnogsTleEndpoint: validateSatelliteEndpoint(
      parsed.SATNOGS_TLE_URL,
      "SATNOGS_TLE_URL",
      OFFICIAL_SATNOGS_HOST,
    ),
    swpcAlertsEndpoint: validateSwpcEndpoint(parsed.SWPC_ALERTS_URL, "SWPC_ALERTS_URL"),
    swpcKpEndpoint: validateSwpcEndpoint(parsed.SWPC_KP_URL, "SWPC_KP_URL"),
    swpcXrayFlaresEndpoint: validateSwpcEndpoint(parsed.SWPC_XRAY_FLARES_URL, "SWPC_XRAY_FLARES_URL"),
    usgsEndpoint: validateUsgsEndpoint(parsed.USGS_EARTHQUAKE_URL),
  };
}

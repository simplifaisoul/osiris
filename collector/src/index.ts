import { ArchiveWriter } from "./storage/archive-writer.js";
import { BoundedHttpFetcher } from "./framework/http-fetcher.js";
import { CollectorHealthServer } from "./health/server.js";
import { PostgresStore } from "./storage/postgres-store.js";
import { SerialPollingScheduler } from "./framework/scheduler.js";
import {
  GdacsDisasterCollector,
} from "./collectors/gdacs-disasters.js";
import {
  NasaEonetVolcanoCollector,
  NasaFirmsCollector,
} from "./collectors/nasa-fire-sources.js";
import {
  NoaaSpaceWeatherCollector,
} from "./collectors/noaa-space-weather.js";
import {
  WeatherCollector,
} from "./collectors/weather-sources.js";
import {
  ThreatIntelCollector,
} from "./collectors/threat-intel-sources.js";
import {
  UsgsEarthquakeCollector,
} from "./collectors/usgs-earthquakes.js";
import { createLogger } from "./logger.js";
import { loadConfig } from "./config.js";
import { toSafeError } from "./framework/errors.js";

async function run(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const store = new PostgresStore(config.databaseConfig);
  const archiveWriter = new ArchiveWriter(config.archiveRoot);
  const fetcher = new BoundedHttpFetcher({
    maxBodyBytes: config.maxResponseBytes,
    timeoutMs: config.requestTimeoutMs,
  });
  const commonCollectorOptions = {
    archiveWriter,
    fetcher,
    logger,
    maxAttempts: config.maxFetchAttempts,
    retryBaseMs: config.retryBaseMs,
    staleRunAfterMs: config.staleRunAfterMs,
    store,
  };
  const collector = config.collectorSource === "gdacs-disasters"
    ? new GdacsDisasterCollector({
        ...commonCollectorOptions,
        endpoint: config.gdacsEndpoint,
      })
    : config.collectorSource === "nasa-firms-viirs"
    ? new NasaFirmsCollector({
        ...commonCollectorOptions,
        endpoint: config.firmsViirsEndpoint,
        sourceId: "nasa-firms-viirs",
      })
    : config.collectorSource === "nasa-firms-modis"
    ? new NasaFirmsCollector({
        ...commonCollectorOptions,
        endpoint: config.firmsModisEndpoint,
        sourceId: "nasa-firms-modis",
      })
    : config.collectorSource === "nasa-eonet-volcanoes"
    ? new NasaEonetVolcanoCollector({
        ...commonCollectorOptions,
        endpoint: config.eonetVolcanoesEndpoint,
      })
    : config.collectorSource === "nasa-eonet-weather"
    ? new WeatherCollector({
        ...commonCollectorOptions,
        endpoint: config.eonetWeatherEndpoint,
        sourceId: "nasa-eonet-weather",
      })
    : config.collectorSource === "noaa-nws-alerts"
    ? new WeatherCollector({
        ...commonCollectorOptions,
        endpoint: config.nwsAlertsEndpoint,
        sourceId: "noaa-nws-alerts",
      })
    : config.collectorSource === "noaa-swpc-planetary-k-index"
    ? new NoaaSpaceWeatherCollector({
        ...commonCollectorOptions,
        endpoint: config.swpcKpEndpoint,
        sourceId: "noaa-swpc-planetary-k-index",
      })
    : config.collectorSource === "noaa-swpc-alerts"
    ? new NoaaSpaceWeatherCollector({
        ...commonCollectorOptions,
        endpoint: config.swpcAlertsEndpoint,
        sourceId: "noaa-swpc-alerts",
      })
    : config.collectorSource === "noaa-swpc-xray-flares"
    ? new NoaaSpaceWeatherCollector({
        ...commonCollectorOptions,
        endpoint: config.swpcXrayFlaresEndpoint,
        sourceId: "noaa-swpc-xray-flares",
      })
    : config.collectorSource === "abusech-feodo-ipblocklist"
    ? new ThreatIntelCollector({
        ...commonCollectorOptions,
        endpoint: config.feodoEndpoint,
        sourceId: "abusech-feodo-ipblocklist",
      })
    : config.collectorSource === "abusech-urlhaus-online"
    ? new ThreatIntelCollector({
        ...commonCollectorOptions,
        endpoint: config.urlhausEndpoint,
        sourceId: "abusech-urlhaus-online",
      })
    : config.collectorSource === "cisa-known-exploited-vulnerabilities"
    ? new ThreatIntelCollector({
        ...commonCollectorOptions,
        endpoint: config.cisaKevEndpoint,
        sourceId: "cisa-known-exploited-vulnerabilities",
      })
    : new UsgsEarthquakeCollector({
        ...commonCollectorOptions,
        endpoint: config.usgsEndpoint,
      });

  if (config.collectOnce) {
    try {
      await collector.collect();
    } finally {
      await store.close();
    }
    return;
  }

  const healthServer = new CollectorHealthServer({
    host: config.healthHost,
    logger,
    port: config.healthPort,
    provider: store,
    sourceId: collector.sourceId,
    staleAfterMs: config.staleRunAfterMs,
  });
  const scheduler = new SerialPollingScheduler({
    intervalMs: config.collectIntervalMs,
    onError: (error) => {
      logger.error(
        { error: toSafeError(error), sourceId: collector.sourceId },
        "Scheduled collection failed",
      );
    },
    task: async (signal) => {
      await collector.collect(signal);
    },
  });

  let healthListening = false;

  try {
    await healthServer.listen();
    healthListening = true;
    scheduler.start(config.collectOnStartup);
    logger.info(
      {
        collectIntervalMs: config.collectIntervalMs,
        healthPort: config.healthPort,
        sourceId: collector.sourceId,
      },
      "World-State collector started",
    );

    await new Promise<void>((resolve) => {
      let shuttingDown = false;
      const shutdown = (signal: string) => {
        if (shuttingDown) {
          return;
        }
        shuttingDown = true;
        logger.info({ signal }, "Stopping World-State collector");
        resolve();
      };

      process.once("SIGINT", () => shutdown("SIGINT"));
      process.once("SIGTERM", () => shutdown("SIGTERM"));
    });
  } finally {
    await scheduler.stop();
    if (healthListening) {
      await healthServer.close();
    }
    await store.close();
  }
}

run().catch((error: unknown) => {
  const safe = toSafeError(error);
  process.stderr.write(
    `${JSON.stringify({ level: "fatal", service: "osiris-worldstate-collector", error: safe })}\n`,
  );
  process.exitCode = 1;
});

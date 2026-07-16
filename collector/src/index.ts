import { ArchiveWriter } from "./storage/archive-writer.js";
import { BoundedHttpFetcher } from "./framework/http-fetcher.js";
import { CollectorHealthServer } from "./health/server.js";
import { PostgresStore } from "./storage/postgres-store.js";
import { SerialPollingScheduler } from "./framework/scheduler.js";
import {
  GdacsDisasterCollector,
} from "./collectors/gdacs-disasters.js";
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
  const collector = config.collectorSource === "gdacs-disasters"
    ? new GdacsDisasterCollector({
        archiveWriter,
        endpoint: config.gdacsEndpoint,
        fetcher,
        logger,
        maxAttempts: config.maxFetchAttempts,
        retryBaseMs: config.retryBaseMs,
        staleRunAfterMs: config.staleRunAfterMs,
        store,
      })
    : new UsgsEarthquakeCollector({
        archiveWriter,
        endpoint: config.usgsEndpoint,
        fetcher,
        logger,
        maxAttempts: config.maxFetchAttempts,
        retryBaseMs: config.retryBaseMs,
        staleRunAfterMs: config.staleRunAfterMs,
        store,
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

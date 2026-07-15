import { ArchiveWriter } from "./storage/archive-writer.js";
import { BoundedHttpFetcher } from "./framework/http-fetcher.js";
import { CollectorHealthServer } from "./health/server.js";
import { PostgresStore } from "./storage/postgres-store.js";
import { SerialPollingScheduler } from "./framework/scheduler.js";
import {
  UsgsEarthquakeCollector,
} from "./collectors/usgs-earthquakes.js";
import { USGS_EARTHQUAKE_SOURCE_ID } from "./normalisers/usgs.js";
import { createLogger } from "./logger.js";
import { loadConfig } from "./config.js";
import { toSafeError } from "./framework/errors.js";

async function run(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const store = new PostgresStore(config.databaseConfig);
  const collector = new UsgsEarthquakeCollector({
    archiveWriter: new ArchiveWriter(config.archiveRoot),
    endpoint: config.usgsEndpoint,
    fetcher: new BoundedHttpFetcher({
      maxBodyBytes: config.maxResponseBytes,
      timeoutMs: config.requestTimeoutMs,
    }),
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
    sourceId: USGS_EARTHQUAKE_SOURCE_ID,
    staleAfterMs: config.staleRunAfterMs,
  });
  const scheduler = new SerialPollingScheduler({
    intervalMs: config.collectIntervalMs,
    onError: (error) => {
      logger.error(
        { error: toSafeError(error), sourceId: USGS_EARTHQUAKE_SOURCE_ID },
        "Scheduled USGS collection failed",
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
        sourceId: USGS_EARTHQUAKE_SOURCE_ID,
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

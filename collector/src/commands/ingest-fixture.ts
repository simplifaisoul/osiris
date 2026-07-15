import { readFile } from "node:fs/promises";

import { UsgsEarthquakeCollector } from "../collectors/usgs-earthquakes.js";
import { loadConfig } from "../config.js";
import type { RawResponse } from "../framework/http-fetcher.js";
import { createLogger } from "../logger.js";
import { ArchiveWriter } from "../storage/archive-writer.js";
import { PostgresStore } from "../storage/postgres-store.js";

const FIXTURE_RESPONSE_RECEIVED_AT = new Date("2026-01-01T00:00:02.000Z");

async function run(): Promise<void> {
  const source = process.argv[2];
  if (source !== "usgs-earthquakes") {
    throw new Error("Usage: npm run ingest:fixture -- usgs-earthquakes");
  }

  const config = loadConfig();
  const fixtureBody = await readFile(
    new URL("../../test/fixtures/usgs-earthquakes.geojson", import.meta.url),
  );
  const raw: RawResponse = {
    endpoint: config.usgsEndpoint.toString(),
    requestStartedAt: new Date(FIXTURE_RESPONSE_RECEIVED_AT.getTime() - 1_000),
    responseReceivedAt: FIXTURE_RESPONSE_RECEIVED_AT,
    status: 200,
    contentType: "application/geo+json",
    headers: {
      "content-type": "application/geo+json",
      "x-osiris-fixture": "usgs-earthquakes",
    },
    body: fixtureBody,
  };
  const store = new PostgresStore(config.databaseConfig);
  const clockValues = [
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-01-01T00:00:01.000Z"),
    new Date("2026-01-01T00:00:03.000Z"),
  ];
  const collector = new UsgsEarthquakeCollector({
    archiveWriter: new ArchiveWriter(config.archiveRoot),
    clock: () => clockValues.shift() ?? new Date("2026-01-01T00:00:03.000Z"),
    endpoint: config.usgsEndpoint,
    fetcher: {
      fetch: () => Promise.resolve(raw),
    },
    logger: createLogger(config.logLevel),
    maxAttempts: 1,
    retryBaseMs: config.retryBaseMs,
    staleRunAfterMs: config.staleRunAfterMs,
    store,
  });

  try {
    const result = await collector.collect();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await store.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Fixture ingestion failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

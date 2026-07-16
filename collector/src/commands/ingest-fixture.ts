import { readFile } from "node:fs/promises";

import { GdacsDisasterCollector } from "../collectors/gdacs-disasters.js";
import {
  NasaEonetVolcanoCollector,
  NasaFirmsCollector,
  isNasaFirmsSourceId,
} from "../collectors/nasa-fire-sources.js";
import { UsgsEarthquakeCollector } from "../collectors/usgs-earthquakes.js";
import { loadConfig } from "../config.js";
import type { RawResponse } from "../framework/http-fetcher.js";
import { createLogger } from "../logger.js";
import { ArchiveWriter } from "../storage/archive-writer.js";
import { PostgresStore } from "../storage/postgres-store.js";

const FIXTURE_RESPONSE_RECEIVED_AT = new Date("2026-01-01T00:00:02.000Z");

async function run(): Promise<void> {
  const source = process.argv[2];
  if (
    source !== "usgs-earthquakes" &&
    source !== "gdacs-disasters" &&
    source !== "nasa-firms-viirs" &&
    source !== "nasa-firms-modis" &&
    source !== "nasa-eonet-volcanoes"
  ) {
    throw new Error(
      "Usage: npm run ingest:fixture -- usgs-earthquakes|gdacs-disasters|nasa-firms-viirs|nasa-firms-modis|nasa-eonet-volcanoes",
    );
  }

  const config = loadConfig();
  const fixtureUrl =
    source === "usgs-earthquakes"
      ? new URL("../../test/fixtures/usgs-earthquakes.geojson", import.meta.url)
      : source === "gdacs-disasters"
      ? new URL("../../test/fixtures/gdacs-disasters.xml", import.meta.url)
      : source === "nasa-eonet-volcanoes"
      ? new URL("../../test/fixtures/nasa-eonet-volcanoes.json", import.meta.url)
      : new URL("../../test/fixtures/nasa-firms-viirs.csv", import.meta.url);
  const fixtureBody = await readFile(fixtureUrl);
  const endpoint =
    source === "usgs-earthquakes"
      ? config.usgsEndpoint
      : source === "gdacs-disasters"
      ? config.gdacsEndpoint
      : source === "nasa-eonet-volcanoes"
      ? config.eonetVolcanoesEndpoint
      : source === "nasa-firms-modis"
      ? config.firmsModisEndpoint
      : config.firmsViirsEndpoint;
  const contentType =
    source === "usgs-earthquakes"
      ? "application/geo+json"
      : source === "gdacs-disasters"
      ? "application/rss+xml"
      : source === "nasa-eonet-volcanoes"
      ? "application/json"
      : "text/csv";
  const raw: RawResponse = {
    endpoint: endpoint.toString(),
    requestStartedAt: new Date(FIXTURE_RESPONSE_RECEIVED_AT.getTime() - 1_000),
    responseReceivedAt: FIXTURE_RESPONSE_RECEIVED_AT,
    status: 200,
    contentType,
    headers: {
      "content-type": contentType,
      "x-osiris-fixture": source,
    },
    body: fixtureBody,
  };
  const store = new PostgresStore(config.databaseConfig);
  const clockValues = [
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-01-01T00:00:01.000Z"),
    new Date("2026-01-01T00:00:03.000Z"),
  ];
  const common = {
    archiveWriter: new ArchiveWriter(config.archiveRoot),
    clock: () => clockValues.shift() ?? new Date("2026-01-01T00:00:03.000Z"),
    fetcher: {
      fetch: () => Promise.resolve(raw),
    },
    logger: createLogger(config.logLevel),
    maxAttempts: 1,
    retryBaseMs: config.retryBaseMs,
    staleRunAfterMs: config.staleRunAfterMs,
    store,
  };
  const collector = source === "usgs-earthquakes"
    ? new UsgsEarthquakeCollector({
        ...common,
        endpoint: config.usgsEndpoint,
      })
    : isNasaFirmsSourceId(source)
    ? new NasaFirmsCollector({
        ...common,
        endpoint,
        sourceId: source,
      })
    : source === "nasa-eonet-volcanoes"
    ? new NasaEonetVolcanoCollector({
        ...common,
        endpoint,
      })
    : new GdacsDisasterCollector({
        ...common,
        endpoint: config.gdacsEndpoint,
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

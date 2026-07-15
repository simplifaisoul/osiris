import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const requiredEnvironment = {
  DATABASE_URL: "postgresql://osiris:local-test@127.0.0.1:5432/osiris_test",
  RAW_ARCHIVE_PATH: "/tmp/osiris-archive",
};

describe("loadConfig", () => {
  it("loads bounded defaults without exposing credentials", () => {
    const config = loadConfig(requiredEnvironment);

    expect(config.collectIntervalMs).toBe(300_000);
    expect(config.maxFetchAttempts).toBe(3);
    expect(config.maxResponseBytes).toBe(25 * 1024 * 1024);
    expect(config.usgsEndpoint.hostname).toBe("earthquake.usgs.gov");
    expect(config.databaseConfig).toMatchObject({
      connectionString: requiredEnvironment.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
      lock_timeout: 5_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
  });

  it("coerces supported booleans and numeric bounds", () => {
    const config = loadConfig({
      ...requiredEnvironment,
      COLLECT_ON_STARTUP: "false",
      COLLECT_ONCE: "1",
      MAX_FETCH_ATTEMPTS: "5",
    });

    expect(config.collectOnStartup).toBe(false);
    expect(config.collectOnce).toBe(true);
    expect(config.maxFetchAttempts).toBe(5);
  });

  it("rejects non-PostgreSQL database URLs and relative archive paths", () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        DATABASE_URL: "https://example.test/database",
      }),
    ).toThrow("postgres or postgresql");

    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        RAW_ARCHIVE_PATH: "../archive",
      }),
    ).toThrow("must be absolute");
  });

  it("rejects opaque or incomplete PostgreSQL URLs", () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        DATABASE_URL: "postgres:foo",
      }),
    ).toThrow("host and database name");

    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        DATABASE_URL: "postgresql://db/osiris_test",
      }),
    ).toThrow("explicit username and password");
  });

  it("accepts discrete PostgreSQL settings without URL-encoding the password", () => {
    const config = loadConfig({
      PGDATABASE: "osiris_worldstate",
      PGHOST: "db",
      PGPASSWORD: "a/b#c%d@strong",
      PGPORT: "5432",
      PGUSER: "osiris",
      RAW_ARCHIVE_PATH: "/archive",
    });

    expect(config.databaseConfig).toMatchObject({
      database: "osiris_worldstate",
      host: "db",
      password: "a/b#c%d@strong",
      port: 5432,
      user: "osiris",
    });
    expect(config.databaseConfig).not.toHaveProperty("connectionString");
  });

  it("requires a complete discrete PostgreSQL configuration when DATABASE_URL is absent", () => {
    expect(() =>
      loadConfig({
        PGDATABASE: "osiris_worldstate",
        PGHOST: "db",
        PGUSER: "osiris",
        RAW_ARCHIVE_PATH: "/archive",
      }),
    ).toThrow("missing: PGPASSWORD, PGPORT");
  });

  it("rejects endpoint overrides outside the official USGS HTTPS host", () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        USGS_EARTHQUAKE_URL: "https://example.test/feed.geojson",
      }),
    ).toThrow("earthquake.usgs.gov");

    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        USGS_EARTHQUAKE_URL: "http://earthquake.usgs.gov/feed.geojson",
      }),
    ).toThrow("must use HTTPS");
  });
});

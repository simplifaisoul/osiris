import { afterEach, describe, expect, it } from "vitest";

import {
  CollectorHealthServer,
  type SourceHealth,
} from "../src/health/server.js";
import { createLogger } from "../src/logger.js";

const now = new Date("2026-07-15T05:00:00.000Z");
const healthy: SourceHealth = {
  lastCompletedAt: new Date("2026-07-15T04:59:00.000Z"),
  lastErrorAt: null,
  lastSuccessAt: new Date("2026-07-15T04:59:00.000Z"),
  latestStartedAt: new Date("2026-07-15T04:58:00.000Z"),
  latestStatus: "succeeded",
  runningCount: 0,
};

const openServers: CollectorHealthServer[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

async function requestHealth(
  value: SourceHealth | Error,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const server = new CollectorHealthServer({
    clock: () => now,
    host: "127.0.0.1",
    logger: createLogger("silent"),
    port: 0,
    provider: {
      getSourceHealth: () =>
        value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
    },
    sourceId: "usgs-earthquakes",
    staleAfterMs: 15 * 60_000,
  });
  openServers.push(server);
  const port = await server.listen();
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

describe("CollectorHealthServer", () => {
  it("reports a recent successful run as healthy", async () => {
    const { response, body } = await requestHealth(healthy);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "healthy", latestStatus: "succeeded" });
  });

  it("reports fresh collection as available and an overdue run as stale", async () => {
    const collecting = await requestHealth({
      ...healthy,
      latestStartedAt: new Date("2026-07-15T04:59:30.000Z"),
      latestStatus: "running",
      runningCount: 1,
    });
    expect(collecting.response.status).toBe(200);
    expect(collecting.body.status).toBe("collecting");

    const stale = await requestHealth({
      ...healthy,
      latestStartedAt: new Date("2026-07-15T04:40:00.000Z"),
      latestStatus: "running",
      runningCount: 1,
    });
    expect(stale.response.status).toBe(503);
    expect(stale.body.status).toBe("stale");
  });

  it("reports a failed latest run, an overdue success, and query failure", async () => {
    const failed = await requestHealth({ ...healthy, latestStatus: "failed" });
    expect(failed.response.status).toBe(503);
    expect(failed.body.status).toBe("degraded");

    const stale = await requestHealth({
      ...healthy,
      lastSuccessAt: new Date("2026-07-15T04:40:00.000Z"),
    });
    expect(stale.response.status).toBe(503);
    expect(stale.body.status).toBe("stale");

    const unavailable = await requestHealth(new Error("database unavailable"));
    expect(unavailable.response.status).toBe(503);
    expect(unavailable.body.status).toBe("unavailable");
  });
});

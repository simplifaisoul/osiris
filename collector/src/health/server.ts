import { createServer, type Server } from "node:http";

import type { Logger } from "pino";

export interface SourceHealth {
  lastCompletedAt: Date | null;
  lastErrorAt: Date | null;
  lastSuccessAt: Date | null;
  latestStartedAt: Date | null;
  latestStatus: "running" | "succeeded" | "failed" | null;
  runningCount: number;
}

export interface SourceHealthProvider {
  getSourceHealth(sourceId: string): Promise<SourceHealth>;
}

export interface HealthServerOptions {
  host: string;
  logger: Logger;
  port: number;
  provider: SourceHealthProvider;
  sourceId: string;
  staleAfterMs: number;
  clock?: () => Date;
}

export function statusForHealth(
  health: SourceHealth,
  now: Date,
  staleAfterMs: number,
): { httpStatus: number; status: string } {
  const latestIsStale =
    health.latestStartedAt !== null &&
    now.getTime() - health.latestStartedAt.getTime() > staleAfterMs;

  if (health.latestStatus === "running") {
    if (latestIsStale) {
      return { httpStatus: 503, status: "stale" };
    }

    return {
      httpStatus: 200,
      status: health.lastSuccessAt === null ? "starting" : "collecting",
    };
  }

  if (health.latestStatus === "failed") {
    return { httpStatus: 503, status: "degraded" };
  }

  if (health.lastSuccessAt === null) {
    return { httpStatus: 200, status: "starting" };
  }

  if (now.getTime() - health.lastSuccessAt.getTime() > staleAfterMs) {
    return { httpStatus: 503, status: "stale" };
  }

  return { httpStatus: 200, status: "healthy" };
}

export class CollectorHealthServer {
  private server: Server | null = null;
  private readonly clock: () => Date;

  constructor(private readonly options: HealthServerOptions) {
    if (!Number.isSafeInteger(options.staleAfterMs) || options.staleAfterMs < 1) {
      throw new Error("staleAfterMs must be a positive integer");
    }

    this.clock = options.clock ?? (() => new Date());
  }

  async listen(): Promise<number> {
    if (this.server !== null) {
      throw new Error("Health server is already listening");
    }

    const server = createServer(async (request, response) => {
      if (request.method !== "GET" || request.url !== "/health") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      try {
        const health = await this.options.provider.getSourceHealth(this.options.sourceId);
        const now = this.clock();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
          throw new Error("Health clock returned an invalid Date");
        }
        const state = statusForHealth(health, now, this.options.staleAfterMs);
        response.writeHead(state.httpStatus, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            service: "osiris-worldstate-collector",
            sourceId: this.options.sourceId,
            status: state.status,
            latestStatus: health.latestStatus,
            latestStartedAt: health.latestStartedAt?.toISOString() ?? null,
            lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
            lastCompletedAt: health.lastCompletedAt?.toISOString() ?? null,
            lastErrorAt: health.lastErrorAt?.toISOString() ?? null,
            runningCount: health.runningCount,
          }),
        );
      } catch (error) {
        this.options.logger.error({ err: error }, "Collector health query failed");
        response.writeHead(503, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            service: "osiris-worldstate-collector",
            status: "unavailable",
          }),
        );
      }
    });

    this.server = server;

    return new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.options.port, this.options.host, () => {
        server.off("error", reject);
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("Health server did not expose a TCP address"));
          return;
        }
        resolve(address.port);
      });
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  HttpStatusError,
  UsgsEarthquakeCollector,
  type UsgsArchiveWriter,
  type UsgsCollectionStore,
  type UsgsFetcher,
} from "../src/collectors/usgs-earthquakes.js";
import { createLogger } from "../src/logger.js";
import type { RawResponse } from "../src/framework/http-fetcher.js";
import type {
  BeginRunInput,
  CompleteUsgsRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from "../src/storage/postgres-store.js";
import type { ArchiveWriteInput } from "../src/storage/archive-writer.js";

let fixtureBody: Buffer;

beforeAll(async () => {
  fixtureBody = await readFile(
    new URL("./fixtures/usgs-earthquakes.geojson", import.meta.url),
  );
});

function response(body: Buffer, status = 200, retryAfter?: string): RawResponse {
  return {
    endpoint:
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    requestStartedAt: new Date("2026-01-01T00:00:00.000Z"),
    responseReceivedAt: new Date("2026-01-01T00:00:01.000Z"),
    status,
    contentType: "application/geo+json",
    headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
    body,
  };
}

class FakeStore implements UsgsCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteUsgsRunInput[] = [];
  readonly failed: FailRunInput[] = [];
  readonly events: string[] = [];
  readonly published: RecordPublishedArchiveInput[] = [];
  readonly responses: RecordResponseMetadataInput[] = [];
  retryNotBefore: Date | null = null;

  async getRetryNotBefore(): Promise<Date | null> {
    return this.retryNotBefore === null
      ? null
      : new Date(this.retryNotBefore.getTime());
  }

  async recoverStaleRuns(): Promise<number> {
    this.events.push("recover");
    return 0;
  }

  async beginRun(input: BeginRunInput): Promise<void> {
    this.begun.push(input);
    this.events.push(`begin:${input.runId}`);
  }

  async recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void> {
    this.responses.push(input);
    this.events.push(`response:${input.runId}`);
  }

  async recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void> {
    this.published.push(input);
    this.events.push(`publish:${input.runId}`);
  }

  async completeUsgsRun(input: CompleteUsgsRunInput) {
    this.completed.push(input);
    this.events.push(`complete:${input.runId}`);
    return {
      runId: input.runId,
      sourceId: input.sourceId,
      recordsSeen: input.parsed.records.length,
      recordsInserted: input.parsed.records.length,
      recordsUpdated: 0,
      recordsUnchanged: 0,
    };
  }

  async failRun(input: FailRunInput): Promise<boolean> {
    this.failed.push(input);
    this.events.push(`fail:${input.runId}`);
    if (
      input.retryNotBefore !== undefined &&
      input.retryNotBefore !== null &&
      (this.retryNotBefore === null ||
        input.retryNotBefore.getTime() > this.retryNotBefore.getTime())
    ) {
      this.retryNotBefore = new Date(input.retryNotBefore.getTime());
    }
    return true;
  }
}

interface DependencyOverrides {
  maxAttempts?: number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

function dependencies(
  rawResponses: Array<RawResponse | Error>,
  overrides: DependencyOverrides = {},
) {
  const store = new FakeStore();
  const archiveInputs: ArchiveWriteInput[] = [];
  const fetchAttempt: UsgsFetcher["fetch"] = async () => {
    store.events.push("fetch");
    const next = rawResponses.shift();
    if (next === undefined) {
      throw new Error("No fake response remains");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  const fetchMock = vi.fn(fetchAttempt);
  const fetcher: UsgsFetcher = {
    fetch: fetchMock,
  };
  const writeArchive: UsgsArchiveWriter["write"] = async (
    input: ArchiveWriteInput,
  ) => {
    store.events.push("archive");
    archiveInputs.push(input);
    return {
      relativePath: `usgs-earthquakes/fixture-${archiveInputs.length}.geojson.gz`,
      absolutePath: `/archive/fixture-${archiveInputs.length}.geojson.gz`,
      contentHash: "a".repeat(64),
      compressedBytes: input.body.byteLength,
      created: true,
    };
  };
  const archiveWriteMock = vi.fn(writeArchive);
  const archiveWriter: UsgsArchiveWriter = {
    write: archiveWriteMock,
  };
  let clockTick = 0;
  let runId = 0;
  const delays: number[] = [];
  const collector = new UsgsEarthquakeCollector({
    archiveWriter,
    clock: () => new Date(1_767_225_600_000 + clockTick++ * 1_000),
    endpoint: new URL(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    ),
    fetcher,
    logger: createLogger("silent"),
    maxAttempts: overrides.maxAttempts ?? 3,
    random: () => 0,
    retryBaseMs: 500,
    runIdFactory: () => `00000000-0000-4000-8000-${String(++runId).padStart(12, "0")}`,
    sleep:
      overrides.sleep ??
      (async (delayMs) => {
        delays.push(delayMs);
        clockTick += Math.ceil(delayMs / 1_000);
      }),
    staleRunAfterMs: 900_000,
    store,
  });

  return {
    archiveInputs,
    archiveWriteMock,
    archiveWriter,
    collector,
    delays,
    fetcher,
    fetchMock,
    store,
  };
}

describe("UsgsEarthquakeCollector", () => {
  it("archives exact bytes before parsing and database completion", async () => {
    const context = dependencies([response(fixtureBody)]);

    const result = await context.collector.collect();

    expect(context.archiveInputs[0]?.body).toEqual(fixtureBody);
    expect(context.store.completed[0]?.parsed.records).toHaveLength(2);
    expect(context.store.events).toEqual([
      "recover",
      "begin:00000000-0000-4000-8000-000000000001",
      "fetch",
      "archive",
      "response:00000000-0000-4000-8000-000000000001",
      "publish:00000000-0000-4000-8000-000000000001",
      "complete:00000000-0000-4000-8000-000000000001",
    ]);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });

  it("archives and fails a transient HTTP response before retrying in a new run", async () => {
    const context = dependencies([
      response(Buffer.from("temporary outage"), 503, "2"),
      response(fixtureBody),
    ]);

    const result = await context.collector.collect();

    expect(context.store.begun).toHaveLength(2);
    expect(context.store.responses).toHaveLength(2);
    expect(context.store.published).toHaveLength(2);
    expect(context.store.failed).toHaveLength(1);
    expect(context.store.failed[0]?.retryNotBefore?.toISOString()).toBe(
      "2026-01-01T00:00:03.000Z",
    );
    expect(context.store.completed).toHaveLength(1);
    expect(context.delays).toEqual([2_000]);
    expect(result.retryCount).toBe(1);
  });

  it("archives malformed JSON, then marks the run failed without normalised writes", async () => {
    const context = dependencies([response(Buffer.from("{not-json"))]);

    await expect(context.collector.collect()).rejects.toThrow("Invalid USGS JSON");

    expect(context.archiveWriteMock).toHaveBeenCalledOnce();
    expect(context.store.responses).toHaveLength(1);
    expect(context.store.published).toHaveLength(1);
    expect(context.store.completed).toHaveLength(0);
    expect(context.store.failed[0]?.error).toMatchObject({ stage: "normalise_or_store" });
  });

  it("records response metadata but does not publish when archive writing fails", async () => {
    const context = dependencies([response(fixtureBody)]);
    context.archiveWriteMock.mockRejectedValueOnce(new Error("archive is read-only"));

    await expect(context.collector.collect()).rejects.toThrow("archive is read-only");

    expect(context.store.responses).toHaveLength(1);
    expect(context.store.published).toHaveLength(0);
    expect(context.store.completed).toHaveLength(0);
    expect(context.store.failed[0]?.error).toMatchObject({ stage: "archive" });
    expect(context.store.events).toEqual([
      "recover",
      "begin:00000000-0000-4000-8000-000000000001",
      "fetch",
      "response:00000000-0000-4000-8000-000000000001",
      "fail:00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("archives the response even when response-metadata persistence fails", async () => {
    const context = dependencies([response(fixtureBody)]);
    vi.spyOn(context.store, "recordResponseMetadata").mockRejectedValueOnce(
      new Error("database is unavailable"),
    );

    await expect(context.collector.collect()).rejects.toThrow(
      "database is unavailable",
    );

    expect(context.archiveWriteMock).toHaveBeenCalledOnce();
    expect(context.store.published).toHaveLength(0);
    expect(context.store.completed).toHaveLength(0);
    expect(context.store.failed[0]?.error).toMatchObject({
      stage: "response_metadata",
    });
  });

  it("does not retry ordinary client errors", async () => {
    const context = dependencies([
      response(Buffer.from("not found"), 404, "120"),
    ]);

    await expect(context.collector.collect()).rejects.toBeInstanceOf(HttpStatusError);

    expect(context.fetchMock).toHaveBeenCalledOnce();
    expect(context.store.failed).toHaveLength(1);
    expect(context.store.failed[0]?.retryNotBefore).toBeNull();
    expect(context.delays).toEqual([]);
  });

  it("does not cap a provider Retry-After deadline at the local retry limit", async () => {
    const context = dependencies([
      response(Buffer.from("rate limited"), 429, "120"),
      response(fixtureBody),
    ]);

    const result = await context.collector.collect();

    expect(context.delays).toEqual([120_000]);
    expect(context.store.failed[0]?.retryNotBefore?.toISOString()).toBe(
      "2026-01-01T00:02:01.000Z",
    );
    expect(result.retryCount).toBe(1);
  });

  it("persists Retry-After on the final attempt for the next cycle", async () => {
    const context = dependencies(
      [response(Buffer.from("rate limited"), 429, "120")],
      { maxAttempts: 1 },
    );

    await expect(context.collector.collect()).rejects.toBeInstanceOf(HttpStatusError);

    expect(context.fetchMock).toHaveBeenCalledOnce();
    expect(context.delays).toEqual([]);
    expect(context.store.failed[0]?.retryNotBefore?.toISOString()).toBe(
      "2026-01-01T00:02:01.000Z",
    );
  });

  it("waits for a durable provider deadline before beginning a new cycle", async () => {
    const context = dependencies([response(fixtureBody)]);
    context.store.retryNotBefore = new Date("2026-01-01T00:02:00.000Z");

    await context.collector.collect();

    expect(context.delays).toEqual([120_000]);
    expect(context.store.begun[0]?.startedAt.getTime()).toBeGreaterThanOrEqual(
      context.store.retryNotBefore.getTime(),
    );
  });

  it("clamps a stale HTTP-date retry deadline to the response time", async () => {
    const context = dependencies([
      response(
        Buffer.from("rate limited"),
        429,
        "Wed, 31 Dec 2025 23:59:00 GMT",
      ),
      response(fixtureBody),
    ]);

    await context.collector.collect();

    expect(context.store.failed[0]?.retryNotBefore?.toISOString()).toBe(
      "2026-01-01T00:00:01.000Z",
    );
    expect(context.delays).toEqual([0]);
  });

  it("passes cancellation to an active fetch and never retries it", async () => {
    const context = dependencies([response(fixtureBody)]);
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    context.fetchMock.mockImplementationOnce(
      async (_endpoint, signal) =>
        new Promise<RawResponse>((_resolve, reject) => {
          receivedSignal = signal;
          signal?.addEventListener(
            "abort",
            () =>
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new DOMException("Fetch aborted", "AbortError"),
              ),
            { once: true },
          );
        }),
    );

    const collection = context.collector.collect(controller.signal);
    await vi.waitFor(() => expect(context.fetchMock).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Collector stopped", "AbortError"));

    await expect(collection).rejects.toMatchObject({
      name: "AbortError",
      message: "Collector stopped",
    });
    expect(receivedSignal).toBe(controller.signal);
    expect(context.store.begun).toHaveLength(1);
    expect(context.store.failed).toHaveLength(1);
    expect(context.delays).toEqual([]);
  });

  it("aborts an active backoff and never begins the next retry", async () => {
    const controller = new AbortController();
    let signalReceivedBySleep: AbortSignal | undefined;
    let announceBackoff!: () => void;
    const backoffStarted = new Promise<void>((resolve) => {
      announceBackoff = resolve;
    });
    const sleep = vi.fn(
      async (_delayMs: number, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signalReceivedBySleep = signal;
          announceBackoff();
          signal?.addEventListener(
            "abort",
            () =>
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new DOMException("Backoff aborted", "AbortError"),
              ),
            { once: true },
          );
        }),
    );
    const context = dependencies(
      [response(Buffer.from("temporary outage"), 503), response(fixtureBody)],
      { sleep },
    );

    const collection = context.collector.collect(controller.signal);
    await backoffStarted;
    controller.abort(new DOMException("Scheduler stopped", "AbortError"));

    await expect(collection).rejects.toMatchObject({
      name: "AbortError",
      message: "Scheduler stopped",
    });
    expect(signalReceivedBySleep).toBe(controller.signal);
    expect(sleep).toHaveBeenCalledOnce();
    expect(context.fetchMock).toHaveBeenCalledOnce();
    expect(context.store.begun).toHaveLength(1);
    expect(context.store.failed).toHaveLength(1);
  });
});

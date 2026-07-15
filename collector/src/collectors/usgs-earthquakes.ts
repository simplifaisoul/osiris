import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import { toSafeError } from "../framework/errors.js";
import {
  ResponseTooLargeError,
  type BoundedHttpFetcher,
  type RawResponse,
} from "../framework/http-fetcher.js";
import {
  normaliseUsgsEarthquakeFeed,
  USGS_EARTHQUAKE_SOURCE_ID,
} from "../normalisers/usgs.js";
import type {
  BeginRunInput,
  CompleteUsgsRunInput,
  CompleteUsgsRunResult,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from "../storage/postgres-store.js";
import type {
  ArchiveWriteInput,
  ArchiveWriteResult,
  ArchiveWriter,
} from "../storage/archive-writer.js";

export const COLLECTOR_VERSION = "0.1.0";
export const USGS_PARSER_VERSION = "usgs-geojson-v1";
export const USGS_SCHEMA_VERSION = 1;

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_DATE_MS = 8_640_000_000_000_000;

export interface SourceCollector {
  readonly sourceId: string;
  collect(signal?: AbortSignal): Promise<CollectionResult>;
}

export interface CollectionResult extends CompleteUsgsRunResult {
  archivePath: string;
  rawHash: string;
  retryCount: number;
}

export interface UsgsCollectionStore {
  beginRun(input: BeginRunInput): Promise<void>;
  completeUsgsRun(input: CompleteUsgsRunInput): Promise<CompleteUsgsRunResult>;
  failRun(input: FailRunInput): Promise<boolean>;
  getRetryNotBefore(sourceId: string): Promise<Date | null>;
  recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void>;
  recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void>;
  recoverStaleRuns(sourceId: string, before: Date): Promise<number>;
}

export interface UsgsFetcher {
  fetch(
    endpoint: string | URL,
    signal?: AbortSignal,
  ): ReturnType<BoundedHttpFetcher["fetch"]>;
}

export interface UsgsArchiveWriter {
  write(input: ArchiveWriteInput): ReturnType<ArchiveWriter["write"]>;
}

export interface UsgsCollectorOptions {
  archiveWriter: UsgsArchiveWriter;
  clock?: () => Date;
  endpoint: URL;
  fetcher: UsgsFetcher;
  logger: Logger;
  maxAttempts: number;
  random?: () => number;
  retryBaseMs: number;
  runIdFactory?: () => string;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  staleRunAfterMs: number;
  store: UsgsCollectionStore;
}

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`USGS returned HTTP status ${status}`);
    this.name = "HttpStatusError";
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Collection aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
}

async function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  let remainingMs = delayMs;

  while (remainingMs > 0) {
    throwIfAborted(signal);
    const chunkMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, chunkMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortReason(signal!));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
    });
    remainingMs -= chunkMs;
  }

  throwIfAborted(signal);
}

function validDate(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Collector clock returned an invalid Date");
  }
  return new Date(value.getTime());
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof ResponseTooLargeError) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return (
    error instanceof Error &&
    ["AbortError", "TimeoutError", "UND_ERR_CONNECT_TIMEOUT"].includes(error.name)
  );
}

function retryNotBefore(raw: RawResponse): Date | null {
  const value = raw.headers["retry-after"];
  if (value === undefined) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    const responseReceivedMs = raw.responseReceivedAt.getTime();
    const delayMs = seconds * 1_000;
    const deadlineMs = responseReceivedMs + delayMs;
    if (
      !Number.isSafeInteger(seconds) ||
      !Number.isFinite(responseReceivedMs) ||
      !Number.isSafeInteger(delayMs) ||
      !Number.isFinite(deadlineMs) ||
      deadlineMs > MAX_DATE_MS
    ) {
      return null;
    }

    return new Date(deadlineMs);
  }

  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return null;
  }

  return new Date(Math.max(date, raw.responseReceivedAt.getTime()));
}

function retryDelayMs(
  attempt: number,
  retryBaseMs: number,
  random: () => number,
): number {
  const exponential = retryBaseMs * 2 ** (attempt - 1);
  const jitter = Math.floor(random() * retryBaseMs);
  return Math.min(exponential + jitter, MAX_RETRY_DELAY_MS);
}

function runMetrics(
  attempt: number,
  raw?: RawResponse,
  archive?: ArchiveWriteResult,
): Record<string, unknown> {
  return {
    attempt,
    ...(raw === undefined
      ? {}
      : {
          http_status: raw.status,
          raw_bytes: raw.body.byteLength,
          response_latency_ms:
            raw.responseReceivedAt.getTime() - raw.requestStartedAt.getTime(),
        }),
    ...(archive === undefined
      ? {}
      : {
          archive_created: archive.created,
          compressed_bytes: archive.compressedBytes,
        }),
  };
}

export class UsgsEarthquakeCollector implements SourceCollector {
  readonly sourceId = USGS_EARTHQUAKE_SOURCE_ID;

  private readonly clock: () => Date;
  private readonly random: () => number;
  private readonly runIdFactory: () => string;
  private readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: UsgsCollectorOptions) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
    if (!Number.isSafeInteger(options.retryBaseMs) || options.retryBaseMs < 1) {
      throw new Error("retryBaseMs must be a positive integer");
    }
    if (!Number.isSafeInteger(options.staleRunAfterMs) || options.staleRunAfterMs < 1) {
      throw new Error("staleRunAfterMs must be a positive integer");
    }

    this.clock = options.clock ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.runIdFactory = options.runIdFactory ?? randomUUID;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async collect(signal?: AbortSignal): Promise<CollectionResult> {
    throwIfAborted(signal);
    await this.waitForRetryEligibility(signal);
    throwIfAborted(signal);

    const recoveryCutoff = new Date(
      validDate(this.clock).getTime() - this.options.staleRunAfterMs,
    );
    const recovered = await this.options.store.recoverStaleRuns(
      this.sourceId,
      recoveryCutoff,
    );
    if (recovered > 0) {
      this.options.logger.warn(
        { recoveredRuns: recovered, sourceId: this.sourceId },
        "Recovered stale collection runs",
      );
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      throwIfAborted(signal);

      try {
        return await this.collectAttempt(attempt, signal);
      } catch (error) {
        const failure = error instanceof AttemptError ? error.cause : error;
        const failureError =
          failure instanceof Error ? failure : new Error("USGS collection failed");
        lastError = failureError;
        const retryable =
          failure instanceof HttpStatusError
            ? failure.retryable
            : isRetryableNetworkError(failure);
        const raw = error instanceof AttemptError ? error.raw : undefined;
        const providerDeadline =
          retryable && raw !== undefined ? retryNotBefore(raw) : null;

        throwIfAborted(signal);

        if (!retryable || attempt === this.options.maxAttempts) {
          throw failureError;
        }

        const delayMs =
          providerDeadline === null || raw === undefined
            ? retryDelayMs(attempt, this.options.retryBaseMs, this.random)
            : Math.max(
                0,
                providerDeadline.getTime() - raw.responseReceivedAt.getTime(),
              );
        this.options.logger.warn(
          { attempt, delayMs, sourceId: this.sourceId },
          "Retrying transient USGS collection failure",
        );
        await this.sleep(delayMs, signal);
        throwIfAborted(signal);

        if (providerDeadline !== null) {
          // Re-read the durable deadline after waiting. A concurrent collector
          // may have persisted a later provider deadline while this one slept.
          await this.waitForRetryEligibility(signal);
        }
      }
    }

    throw lastError ?? new Error("USGS collection exhausted without a result");
  }

  private async waitForRetryEligibility(signal?: AbortSignal): Promise<void> {
    while (true) {
      throwIfAborted(signal);
      const deadline = await this.options.store.getRetryNotBefore(this.sourceId);
      throwIfAborted(signal);

      if (deadline === null) {
        return;
      }
      if (!(deadline instanceof Date) || !Number.isFinite(deadline.getTime())) {
        throw new Error("Collection store returned an invalid retry deadline");
      }

      const now = validDate(this.clock);
      if (deadline.getTime() <= now.getTime()) {
        return;
      }

      await this.sleep(deadline.getTime() - now.getTime(), signal);
      throwIfAborted(signal);
    }
  }

  private async collectAttempt(
    attempt: number,
    signal?: AbortSignal,
  ): Promise<CollectionResult> {
    throwIfAborted(signal);
    const runId = this.runIdFactory();
    const startedAt = validDate(this.clock);
    await this.options.store.beginRun({
      runId,
      sourceId: this.sourceId,
      startedAt,
      endpoint: this.options.endpoint.toString(),
      collectorVersion: COLLECTOR_VERSION,
    });

    let raw: RawResponse | undefined;
    let archive: ArchiveWriteResult | undefined;
    let stage = "fetch";

    try {
      raw = await this.options.fetcher.fetch(this.options.endpoint, signal);
      stage = "archive";
      try {
        archive = await this.options.archiveWriter.write({
          sourceId: this.sourceId,
          timestamp: raw.responseReceivedAt,
          body: raw.body,
          extension: "geojson",
        });
      } catch (archiveError) {
        // Archive failure must still retain the response evidence we already
        // received, but a database failure must never prevent an archive
        // attempt in the successful path.
        try {
          await this.options.store.recordResponseMetadata({
            runId,
            sourceId: this.sourceId,
            raw,
          });
        } catch (metadataError) {
          stage = "archive_and_response_metadata";
          throw new AggregateError(
            [archiveError, metadataError],
            "Archive publication and response-metadata persistence both failed",
            { cause: metadataError },
          );
        }
        throw archiveError;
      }

      stage = "response_metadata";
      await this.options.store.recordResponseMetadata({
        runId,
        sourceId: this.sourceId,
        raw,
      });
      stage = "archive_metadata";
      await this.options.store.recordPublishedArchive({
        runId,
        sourceId: this.sourceId,
        archive,
      });
      throwIfAborted(signal);

      stage = "http";
      if (raw.status < 200 || raw.status > 299) {
        const statusError = new HttpStatusError(
          raw.status,
          TRANSIENT_HTTP_STATUSES.has(raw.status),
        );
        await this.persistFailure(
          runId,
          attempt,
          statusError,
          raw,
          archive,
          "http",
          statusError.retryable ? retryNotBefore(raw) : null,
        );
        throw new AttemptError(statusError, raw);
      }

      stage = "normalise_or_store";
      const parsed = normaliseUsgsEarthquakeFeed(raw.body);
      const completedAt = validDate(this.clock);
      const completed = await this.options.store.completeUsgsRun({
        runId,
        sourceId: this.sourceId,
        parsed,
        responseReceivedAt: raw.responseReceivedAt,
        completedAt,
        feedContentHash: archive.contentHash,
        archivePath: archive.relativePath,
        parserVersion: USGS_PARSER_VERSION,
        schemaVersion: USGS_SCHEMA_VERSION,
        metrics: runMetrics(attempt, raw, archive),
      });

      this.options.logger.info(
        {
          runId,
          sourceId: this.sourceId,
          recordsSeen: completed.recordsSeen,
          recordsInserted: completed.recordsInserted,
          recordsUpdated: completed.recordsUpdated,
          recordsUnchanged: completed.recordsUnchanged,
        },
        "USGS collection completed",
      );

      return {
        ...completed,
        archivePath: archive.relativePath,
        rawHash: archive.contentHash,
        retryCount: attempt - 1,
      };
    } catch (error) {
      if (error instanceof AttemptError) {
        throw error;
      }

      await this.persistFailure(
        runId,
        attempt,
        error,
        raw,
        archive,
        stage,
      );
      throw error;
    }
  }

  private async persistFailure(
    runId: string,
    attempt: number,
    error: unknown,
    raw: RawResponse | undefined,
    archive: ArchiveWriteResult | undefined,
    stage: string,
    retryDeadline: Date | null = null,
  ): Promise<void> {
    const safe = toSafeError(error);
    const persisted = await this.options.store.failRun({
      runId,
      sourceId: this.sourceId,
      completedAt: validDate(this.clock),
      parserVersion: stage === "normalise_or_store" ? USGS_PARSER_VERSION : null,
      retryNotBefore: retryDeadline,
      error: {
        ...safe,
        stage,
        retryable:
          error instanceof HttpStatusError
            ? error.retryable
            : isRetryableNetworkError(error),
      },
      metrics: runMetrics(attempt, raw, archive),
    });

    if (!persisted) {
      this.options.logger.debug(
        { runId, sourceId: this.sourceId },
        "Collection run was already completed while persisting failure",
      );
    }
  }
}

class AttemptError extends Error {
  constructor(
    readonly cause: HttpStatusError,
    readonly raw: RawResponse,
  ) {
    super(cause.message, { cause });
    this.name = "AttemptError";
  }
}

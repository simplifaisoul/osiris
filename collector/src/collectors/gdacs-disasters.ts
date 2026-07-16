import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import { toSafeError } from '../framework/errors.js';
import {
  ResponseTooLargeError,
  type BoundedHttpFetcher,
  type RawResponse,
} from '../framework/http-fetcher.js';
import {
  GDACS_DISASTER_SOURCE_ID,
  normaliseGdacsDisasterFeed,
} from '../normalisers/gdacs.js';
import type {
  BeginRunInput,
  CompleteGdacsRunInput,
  CompleteGdacsRunResult,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../storage/postgres-store.js';
import type {
  ArchiveWriteInput,
  ArchiveWriteResult,
  ArchiveWriter,
} from '../storage/archive-writer.js';
import { COLLECTOR_VERSION } from './usgs-earthquakes.js';

export const GDACS_PARSER_VERSION = 'gdacs-rss-v1';
export const GDACS_SCHEMA_VERSION = 1;

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 60_000;

export interface GdacsCollectionStore {
  beginRun(input: BeginRunInput): Promise<void>;
  completeGdacsRun(input: CompleteGdacsRunInput): Promise<CompleteGdacsRunResult>;
  failRun(input: FailRunInput): Promise<boolean>;
  getRetryNotBefore(sourceId: string): Promise<Date | null>;
  recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void>;
  recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void>;
  recoverStaleRuns(sourceId: string, before: Date): Promise<number>;
}

export interface GdacsFetcher {
  fetch(endpoint: string | URL, signal?: AbortSignal): ReturnType<BoundedHttpFetcher['fetch']>;
}

export interface GdacsArchiveWriter {
  write(input: ArchiveWriteInput): ReturnType<ArchiveWriter['write']>;
}

export interface GdacsCollectorOptions {
  archiveWriter: GdacsArchiveWriter;
  clock?: () => Date;
  endpoint: URL;
  fetcher: GdacsFetcher;
  logger: Logger;
  maxAttempts: number;
  random?: () => number;
  retryBaseMs: number;
  runIdFactory?: () => string;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  staleRunAfterMs: number;
  store: GdacsCollectionStore;
}

export interface GdacsCollectionResult extends CompleteGdacsRunResult {
  archivePath: string;
  rawHash: string;
  retryCount: number;
}

export class GdacsHttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`GDACS returned HTTP status ${status}`);
    this.name = 'GdacsHttpStatusError';
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Collection aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  throwIfAborted(signal);
}

function validDate(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('Collector clock returned an invalid Date');
  }
  return new Date(value.getTime());
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof ResponseTooLargeError) return false;
  if (error instanceof TypeError) return true;
  return (
    error instanceof Error &&
    ['AbortError', 'TimeoutError', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.name)
  );
}

function retryDelayMs(attempt: number, retryBaseMs: number, random: () => number): number {
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

export class GdacsDisasterCollector {
  readonly sourceId = GDACS_DISASTER_SOURCE_ID;

  private readonly clock: () => Date;
  private readonly random: () => number;
  private readonly runIdFactory: () => string;
  private readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: GdacsCollectorOptions) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new Error('maxAttempts must be a positive integer');
    }
    if (!Number.isSafeInteger(options.retryBaseMs) || options.retryBaseMs < 1) {
      throw new Error('retryBaseMs must be a positive integer');
    }
    if (!Number.isSafeInteger(options.staleRunAfterMs) || options.staleRunAfterMs < 1) {
      throw new Error('staleRunAfterMs must be a positive integer');
    }

    this.clock = options.clock ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.runIdFactory = options.runIdFactory ?? randomUUID;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async collect(signal?: AbortSignal): Promise<GdacsCollectionResult> {
    throwIfAborted(signal);
    const recoveryCutoff = new Date(validDate(this.clock).getTime() - this.options.staleRunAfterMs);
    await this.options.store.recoverStaleRuns(this.sourceId, recoveryCutoff);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      try {
        return await this.collectAttempt(attempt, signal);
      } catch (error) {
        const failure = error instanceof AttemptError ? error.cause : error;
        const failureError =
          failure instanceof Error ? failure : new Error('GDACS collection failed');
        lastError = failureError;
        const retryable =
          failure instanceof GdacsHttpStatusError
          ? failure.retryable
            : isRetryableNetworkError(failure);

        if (!retryable || attempt === this.options.maxAttempts) {
          throw failureError;
        }
        const delayMs = retryDelayMs(attempt, this.options.retryBaseMs, this.random);
        this.options.logger.warn(
          { attempt, delayMs, sourceId: this.sourceId },
          'Retrying transient GDACS collection failure',
        );
        await this.sleep(delayMs, signal);
      }
    }

    throw lastError ?? new Error('GDACS collection exhausted without a result');
  }

  private async collectAttempt(
    attempt: number,
    signal?: AbortSignal,
  ): Promise<GdacsCollectionResult> {
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
    let stage = 'fetch';

    try {
      raw = await this.options.fetcher.fetch(this.options.endpoint, signal);
      stage = 'archive';
      archive = await this.options.archiveWriter.write({
        sourceId: this.sourceId,
        timestamp: raw.responseReceivedAt,
        body: raw.body,
        extension: 'xml',
      });
      stage = 'response_metadata';
      await this.options.store.recordResponseMetadata({ runId, sourceId: this.sourceId, raw });
      stage = 'archive_metadata';
      await this.options.store.recordPublishedArchive({ runId, sourceId: this.sourceId, archive });

      stage = 'http';
      if (raw.status < 200 || raw.status > 299) {
        const statusError = new GdacsHttpStatusError(
          raw.status,
          TRANSIENT_HTTP_STATUSES.has(raw.status),
        );
        await this.persistFailure(runId, attempt, statusError, raw, archive, 'http');
        throw new AttemptError(statusError);
      }

      stage = 'normalise_or_store';
      const parsed = normaliseGdacsDisasterFeed(raw.body);
      const completedAt = validDate(this.clock);
      const completed = await this.options.store.completeGdacsRun({
        runId,
        sourceId: this.sourceId,
        parsed,
        responseReceivedAt: raw.responseReceivedAt,
        completedAt,
        feedContentHash: archive.contentHash,
        archivePath: archive.relativePath,
        parserVersion: GDACS_PARSER_VERSION,
        schemaVersion: GDACS_SCHEMA_VERSION,
        metrics: runMetrics(attempt, raw, archive),
      });

      this.options.logger.info(
        { runId, sourceId: this.sourceId, recordsSeen: completed.recordsSeen },
        'GDACS collection completed',
      );
      return {
        ...completed,
        archivePath: archive.relativePath,
        rawHash: archive.contentHash,
        retryCount: attempt - 1,
      };
    } catch (error) {
      if (error instanceof AttemptError) throw error;
      await this.persistFailure(runId, attempt, error, raw, archive, stage);
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
  ): Promise<void> {
    const safe = toSafeError(error);
    await this.options.store.failRun({
      runId,
      sourceId: this.sourceId,
      completedAt: validDate(this.clock),
      parserVersion: stage === 'normalise_or_store' ? GDACS_PARSER_VERSION : null,
      error: {
        ...safe,
        stage,
        retryable:
          error instanceof GdacsHttpStatusError
            ? error.retryable
            : isRetryableNetworkError(error),
      },
      metrics: runMetrics(attempt, raw, archive),
    });
  }
}

class AttemptError extends Error {
  constructor(readonly cause: GdacsHttpStatusError) {
    super(cause.message, { cause });
    this.name = 'AttemptError';
  }
}

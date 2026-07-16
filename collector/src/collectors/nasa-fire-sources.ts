import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import { toSafeError } from '../framework/errors.js';
import {
  ResponseTooLargeError,
  type BoundedHttpFetcher,
  type RawResponse,
} from '../framework/http-fetcher.js';
import {
  NASA_EONET_VOLCANOES_SOURCE_ID,
  normaliseNasaEonetVolcanoFeed,
  type NormalisedNasaEonetFeed,
} from '../normalisers/nasa-eonet.js';
import {
  NASA_FIRMS_MODIS_SOURCE_ID,
  NASA_FIRMS_VIIRS_SOURCE_ID,
  normaliseNasaFirmsFeed,
  type NasaFirmsSourceId,
  type NormalisedNasaFirmsFeed,
} from '../normalisers/nasa-firms.js';
import type {
  BeginRunInput,
  CompleteEonetRunInput,
  CompleteEonetRunResult,
  CompleteFirmsRunInput,
  CompleteFirmsRunResult,
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

export const NASA_FIRMS_PARSER_VERSION = 'nasa-firms-csv-v1';
export const NASA_EONET_PARSER_VERSION = 'nasa-eonet-v3-volcanoes-v1';
export const NASA_FIRE_SCHEMA_VERSION = 1;

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 60_000;

export interface NasaFireCollectionStore {
  beginRun(input: BeginRunInput): Promise<void>;
  completeEonetRun(input: CompleteEonetRunInput): Promise<CompleteEonetRunResult>;
  completeFirmsRun(input: CompleteFirmsRunInput): Promise<CompleteFirmsRunResult>;
  failRun(input: FailRunInput): Promise<boolean>;
  recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void>;
  recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void>;
  recoverStaleRuns(sourceId: string, before: Date): Promise<number>;
}

export interface NasaFireFetcher {
  fetch(endpoint: string | URL, signal?: AbortSignal): ReturnType<BoundedHttpFetcher['fetch']>;
}

export interface NasaFireArchiveWriter {
  write(input: ArchiveWriteInput): ReturnType<ArchiveWriter['write']>;
}

interface BaseOptions {
  archiveWriter: NasaFireArchiveWriter;
  clock?: () => Date;
  endpoint: URL;
  fetcher: NasaFireFetcher;
  logger: Logger;
  maxAttempts: number;
  random?: () => number;
  retryBaseMs: number;
  runIdFactory?: () => string;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  staleRunAfterMs: number;
  store: NasaFireCollectionStore;
}

export interface NasaFirmsCollectorOptions extends BaseOptions {
  sourceId: NasaFirmsSourceId;
}

export type NasaEonetVolcanoCollectorOptions = BaseOptions;

export type NasaFireCollectionResult =
  | (CompleteFirmsRunResult & { archivePath: string; rawHash: string; retryCount: number })
  | (CompleteEonetRunResult & { archivePath: string; rawHash: string; retryCount: number });

export class NasaFireHttpStatusError extends Error {
  constructor(
    readonly sourceId: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`${sourceId} returned HTTP status ${status}`);
    this.name = 'NasaFireHttpStatusError';
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

abstract class BaseNasaFireCollector {
  private readonly clock: () => Date;
  private readonly random: () => number;
  private readonly runIdFactory: () => string;
  private readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;

  protected constructor(protected readonly options: BaseOptions) {
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

  abstract readonly sourceId: string;
  protected abstract readonly archiveExtension: string;
  protected abstract readonly parserVersion: string;
  protected abstract complete(
    runId: string,
    raw: RawResponse,
    archive: ArchiveWriteResult,
    completedAt: Date,
    attempt: number,
  ): Promise<CompleteFirmsRunResult | CompleteEonetRunResult>;

  async collect(signal?: AbortSignal): Promise<NasaFireCollectionResult> {
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
          failure instanceof Error ? failure : new Error(`${this.sourceId} collection failed`);
        lastError = failureError;
        const retryable =
          failure instanceof NasaFireHttpStatusError
            ? failure.retryable
            : isRetryableNetworkError(failure);

        if (!retryable || attempt === this.options.maxAttempts) {
          throw failureError;
        }
        const delayMs = retryDelayMs(attempt, this.options.retryBaseMs, this.random);
        this.options.logger.warn(
          { attempt, delayMs, sourceId: this.sourceId },
          'Retrying transient NASA fire collection failure',
        );
        await this.sleep(delayMs, signal);
      }
    }

    throw lastError ?? new Error(`${this.sourceId} collection exhausted without a result`);
  }

  private async collectAttempt(
    attempt: number,
    signal?: AbortSignal,
  ): Promise<NasaFireCollectionResult> {
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
        extension: this.archiveExtension,
      });
      stage = 'response_metadata';
      await this.options.store.recordResponseMetadata({ runId, sourceId: this.sourceId, raw });
      stage = 'archive_metadata';
      await this.options.store.recordPublishedArchive({ runId, sourceId: this.sourceId, archive });

      stage = 'http';
      if (raw.status < 200 || raw.status > 299) {
        const statusError = new NasaFireHttpStatusError(
          this.sourceId,
          raw.status,
          TRANSIENT_HTTP_STATUSES.has(raw.status),
        );
        await this.persistFailure(runId, attempt, statusError, raw, archive, 'http');
        throw new AttemptError(statusError);
      }

      stage = 'normalise_or_store';
      const completedAt = validDate(this.clock);
      const completed = await this.complete(runId, raw, archive, completedAt, attempt);
      this.options.logger.info(
        { runId, sourceId: this.sourceId, recordsSeen: completed.recordsSeen },
        'NASA fire collection completed',
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
      parserVersion: stage === 'normalise_or_store' ? this.parserVersion : null,
      error: {
        ...safe,
        stage,
        retryable:
          error instanceof NasaFireHttpStatusError
            ? error.retryable
            : isRetryableNetworkError(error),
      },
      metrics: runMetrics(attempt, raw, archive),
    });
  }
}

export class NasaFirmsCollector extends BaseNasaFireCollector {
  readonly sourceId: NasaFirmsSourceId;
  protected readonly archiveExtension = 'csv';
  protected readonly parserVersion = NASA_FIRMS_PARSER_VERSION;

  constructor(options: NasaFirmsCollectorOptions) {
    super(options);
    this.sourceId = options.sourceId;
  }

  protected async complete(
    runId: string,
    raw: RawResponse,
    archive: ArchiveWriteResult,
    completedAt: Date,
    attempt: number,
  ): Promise<CompleteFirmsRunResult> {
    const parsed: NormalisedNasaFirmsFeed = normaliseNasaFirmsFeed(raw.body, this.sourceId);
    return this.options.store.completeFirmsRun({
      runId,
      sourceId: this.sourceId,
      parsed,
      responseReceivedAt: raw.responseReceivedAt,
      completedAt,
      feedContentHash: archive.contentHash,
      archivePath: archive.relativePath,
      parserVersion: NASA_FIRMS_PARSER_VERSION,
      schemaVersion: NASA_FIRE_SCHEMA_VERSION,
      metrics: runMetrics(attempt, raw, archive),
    });
  }
}

export class NasaEonetVolcanoCollector extends BaseNasaFireCollector {
  readonly sourceId = NASA_EONET_VOLCANOES_SOURCE_ID;
  protected readonly archiveExtension = 'json';
  protected readonly parserVersion = NASA_EONET_PARSER_VERSION;

  constructor(options: NasaEonetVolcanoCollectorOptions) {
    super(options);
  }

  protected async complete(
    runId: string,
    raw: RawResponse,
    archive: ArchiveWriteResult,
    completedAt: Date,
    attempt: number,
  ): Promise<CompleteEonetRunResult> {
    const parsed: NormalisedNasaEonetFeed = normaliseNasaEonetVolcanoFeed(raw.body);
    return this.options.store.completeEonetRun({
      runId,
      sourceId: this.sourceId,
      parsed,
      responseReceivedAt: raw.responseReceivedAt,
      completedAt,
      feedContentHash: archive.contentHash,
      archivePath: archive.relativePath,
      parserVersion: NASA_EONET_PARSER_VERSION,
      schemaVersion: NASA_FIRE_SCHEMA_VERSION,
      metrics: runMetrics(attempt, raw, archive),
    });
  }
}

export function isNasaFirmsSourceId(value: string): value is NasaFirmsSourceId {
  return value === NASA_FIRMS_VIIRS_SOURCE_ID || value === NASA_FIRMS_MODIS_SOURCE_ID;
}

class AttemptError extends Error {
  constructor(readonly cause: NasaFireHttpStatusError) {
    super(cause.message, { cause });
    this.name = 'AttemptError';
  }
}

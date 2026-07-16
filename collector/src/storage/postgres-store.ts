import { randomUUID } from 'node:crypto';

import { Pool, type PoolClient, type PoolConfig } from 'pg';

import type { RawResponse } from '../framework/http-fetcher.js';
import type { NormalisedNoaaSpaceWeatherFeed } from '../normalisers/noaa-space-weather.js';
import type { NormalisedNasaFirmsFeed } from '../normalisers/nasa-firms.js';
import type { NormalisedUsgsFeed } from '../normalisers/usgs.js';
import type { NormalisedWeatherFeed } from '../normalisers/weather.js';
import { sha256Hex, type ArchiveWriteResult } from './archive-writer.js';

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface BeginRunInput {
  runId: string;
  sourceId: string;
  startedAt: Date;
  endpoint: string;
  collectorVersion: string;
}

export interface RecordArchivedResponseInput {
  runId: string;
  sourceId: string;
  raw: RawResponse;
  archive: ArchiveWriteResult;
}

export interface RecordResponseMetadataInput {
  runId: string;
  sourceId: string;
  raw: RawResponse;
}

export interface RecordPublishedArchiveInput {
  runId: string;
  sourceId: string;
  archive: ArchiveWriteResult;
}

export interface CompleteUsgsRunInput {
  runId: string;
  sourceId: string;
  parsed: NormalisedUsgsFeed;
  responseReceivedAt: Date;
  completedAt: Date;
  feedContentHash: string;
  archivePath: string;
  parserVersion: string;
  schemaVersion: number;
  metrics?: Record<string, unknown>;
}

export interface CompleteUsgsRunResult {
  runId: string;
  sourceId: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
}

interface NormalisedDisasterRecordForStore {
  sourceId: string;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  title: string;
  description: string | null;
  link: string | null;
  eventType: string;
  longitude: number;
  latitude: number;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: unknown;
  metadata: Record<string, unknown>;
}

interface NormalisedDisasterFeedForStore {
  sourceId: string;
  upstreamTimestamp: Date | null;
  records: NormalisedDisasterRecordForStore[];
}

export interface CompleteGdacsRunInput {
  runId: string;
  sourceId: string;
  parsed: NormalisedDisasterFeedForStore;
  responseReceivedAt: Date;
  completedAt: Date;
  feedContentHash: string;
  archivePath: string;
  parserVersion: string;
  schemaVersion: number;
  metrics?: Record<string, unknown>;
}

export interface CompleteGdacsRunResult {
  runId: string;
  sourceId: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
}

export type CompleteEonetRunInput = CompleteGdacsRunInput;

export type CompleteEonetRunResult = CompleteGdacsRunResult;

export interface CompleteFirmsRunInput {
  runId: string;
  sourceId: string;
  parsed: NormalisedNasaFirmsFeed;
  responseReceivedAt: Date;
  completedAt: Date;
  feedContentHash: string;
  archivePath: string;
  parserVersion: string;
  schemaVersion: number;
  metrics?: Record<string, unknown>;
}

export interface CompleteFirmsRunResult {
  runId: string;
  sourceId: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
}

export interface CompleteSpaceWeatherRunInput {
  runId: string;
  sourceId: string;
  parsed: NormalisedNoaaSpaceWeatherFeed;
  responseReceivedAt: Date;
  completedAt: Date;
  feedContentHash: string;
  archivePath: string;
  parserVersion: string;
  schemaVersion: number;
  metrics?: Record<string, unknown>;
}

export interface CompleteWeatherRunInput {
  runId: string;
  sourceId: string;
  parsed: NormalisedWeatherFeed;
  responseReceivedAt: Date;
  completedAt: Date;
  feedContentHash: string;
  archivePath: string;
  parserVersion: string;
  schemaVersion: number;
  metrics?: Record<string, unknown>;
}

export interface CompleteSpaceWeatherRunResult {
  runId: string;
  sourceId: string;
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
}

export type CompleteWeatherRunResult = CompleteSpaceWeatherRunResult;

export interface RunFailure {
  stage: string;
  message: string;
  name?: string;
  code?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface FailRunInput {
  runId: string;
  sourceId: string;
  completedAt: Date;
  error: unknown;
  parserVersion?: string | null;
  retryNotBefore?: Date | null;
  metrics?: Record<string, unknown>;
}

export interface SourceHealth {
  lastCompletedAt: Date | null;
  lastErrorAt: Date | null;
  lastSuccessAt: Date | null;
  latestStartedAt: Date | null;
  latestStatus: 'running' | 'succeeded' | 'failed' | null;
  runningCount: number;
}

interface ExistingRawObservation {
  feature_content_hash: string | null;
  id: string;
  parser_version: string;
  schema_version: number;
  source_updated_at: Date | null;
}

type PersistenceDecision = 'insert' | 'provider_update' | 'reprocess' | 'unchanged';

interface SourceHealthRow {
  latest_status: SourceHealth['latestStatus'];
  latest_started_at: Date | null;
  last_completed_at: Date | null;
  last_error_at: Date | null;
  last_success_at: Date | null;
  running_count: number;
}

interface RetryDeadlineRow {
  retry_not_before: Date | null;
}

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }
}

function assertContentHash(value: string, name: string): void {
  if (!CONTENT_HASH_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 hash`);
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
}

function assertOneRow(rowCount: number | null, operation: string): void {
  if (rowCount !== 1) {
    throw new Error(`${operation} did not update exactly one running collection run`);
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

function serialisableFailure(error: unknown, fallbackStage = 'unknown'): RunFailure {
  if (error instanceof Error) {
    return {
      stage: fallbackStage,
      name: error.name,
      message: error.message,
      ...(errorCode(error) === undefined ? {} : { code: errorCode(error) }),
    };
  }

  if (typeof error === 'object' && error !== null) {
    try {
      const value = JSON.parse(JSON.stringify(error)) as unknown;
      if (
        typeof value === 'object' &&
        value !== null &&
        'stage' in value &&
        typeof value.stage === 'string' &&
        'message' in value &&
        typeof value.message === 'string'
      ) {
        return value as RunFailure;
      }

      return {
        stage: fallbackStage,
        message: 'Collection failed with structured error details',
        details: value as Record<string, unknown>,
      };
    } catch {
      return {
        stage: fallbackStage,
        message: 'Collection failed with a non-serialisable error',
      };
    }
  }

  return {
    stage: fallbackStage,
    message: typeof error === 'string' ? error : 'Collection failed',
  };
}

function persistenceDecision(
  existing: ExistingRawObservation | undefined,
  incomingSourceUpdatedAt: Date,
  incomingFeatureHash: string,
  incomingSchemaVersion: number,
  incomingParserVersion: string,
  sourceRecordId: string,
): PersistenceDecision {
  if (existing === undefined) {
    return 'insert';
  }

  if (existing.source_updated_at === null) {
    return 'provider_update';
  }

  const existingTimestamp = existing.source_updated_at.getTime();
  const incomingTimestamp = incomingSourceUpdatedAt.getTime();

  if (incomingTimestamp < existingTimestamp) {
    return 'unchanged';
  }

  if (incomingTimestamp > existingTimestamp) {
    if (incomingSchemaVersion < existing.schema_version) {
      throw new Error(
        `Refusing schema downgrade for newer provider record ${sourceRecordId}`,
      );
    }
    return 'provider_update';
  }

  if (existing.feature_content_hash === null) {
    throw new Error(
      `Cannot verify equal-timestamp content for provider record ${sourceRecordId}`,
    );
  }

  if (incomingFeatureHash !== existing.feature_content_hash) {
    throw new Error(
      `Provider record ${sourceRecordId} changed without advancing its updated timestamp`,
    );
  }

  if (incomingSchemaVersion > existing.schema_version) {
    return 'reprocess';
  }

  if (incomingSchemaVersion < existing.schema_version) {
    return 'unchanged';
  }

  if (incomingParserVersion !== existing.parser_version) {
    throw new Error(
      `Parser version changed without a schema-version increment for provider record ${sourceRecordId}`,
    );
  }

  return 'unchanged';
}

export class PostgresStore {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(databaseConfigOrPool: string | PoolConfig | Pool) {
    if (databaseConfigOrPool instanceof Pool) {
      this.pool = databaseConfigOrPool;
      this.ownsPool = false;
      return;
    }

    if (typeof databaseConfigOrPool === 'string') {
      assertNonEmpty(databaseConfigOrPool, 'databaseUrl');
      this.pool = new Pool({ connectionString: databaseConfigOrPool });
    } else {
      this.pool = new Pool(databaseConfigOrPool);
    }
    this.ownsPool = true;
  }

  async recoverStaleRuns(sourceId: string, before: Date): Promise<number> {
    assertNonEmpty(sourceId, 'sourceId');
    assertValidDate(before, 'before');

    const result = await this.pool.query(
      `UPDATE collection_runs
       SET status = 'failed',
           completed_at = GREATEST(
             NOW(),
             started_at,
             COALESCE(request_started_at, started_at),
             COALESCE(response_received_at, started_at)
           ),
           error = $3::jsonb,
           metrics = metrics || $4::jsonb
       WHERE source_id = $1
         AND status = 'running'
         AND started_at < $2`,
      [
        sourceId,
        before,
        JSON.stringify({
          stage: 'recovery',
          name: 'InterruptedCollectionRun',
          message: 'Collector recovered a stale running collection run',
          retryable: true,
        } satisfies RunFailure),
        JSON.stringify({ recovered_as_stale: true }),
      ],
    );

    return result.rowCount ?? 0;
  }

  async beginRun(input: BeginRunInput): Promise<void> {
    assertValidDate(input.startedAt, 'startedAt');
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertNonEmpty(input.endpoint, 'endpoint');
    assertNonEmpty(input.collectorVersion, 'collectorVersion');

    await this.pool.query(
      `INSERT INTO collection_runs (
         id,
         source_id,
         started_at,
         status,
         endpoint,
         collector_version,
         legacy_provenance_incomplete
       ) VALUES ($1, $2, $3, 'running', $4, $5, FALSE)`,
      [
        input.runId,
        input.sourceId,
        input.startedAt,
        input.endpoint,
        input.collectorVersion,
      ],
    );
  }

  async recordArchivedResponse(input: RecordArchivedResponseInput): Promise<void> {
    await this.recordResponseMetadata(input);
    await this.recordPublishedArchive(input);
  }

  async recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void> {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.raw.requestStartedAt, 'raw.requestStartedAt');
    assertValidDate(input.raw.responseReceivedAt, 'raw.responseReceivedAt');

    if (input.raw.responseReceivedAt.getTime() < input.raw.requestStartedAt.getTime()) {
      throw new Error('raw.responseReceivedAt must not be earlier than raw.requestStartedAt');
    }

    const contentHash = sha256Hex(input.raw.body);

    const result = await this.pool.query(
      `UPDATE collection_runs
       SET request_started_at = $4,
           response_received_at = $5,
           http_status = $6,
           content_type = $7,
           content_hash = $8,
           response_headers = $9::jsonb
       WHERE id = $1
         AND source_id = $2
         AND status = 'running'
         AND endpoint = $3`,
      [
        input.runId,
        input.sourceId,
        input.raw.endpoint,
        input.raw.requestStartedAt,
        input.raw.responseReceivedAt,
        input.raw.status,
        input.raw.contentType,
        contentHash,
        JSON.stringify(input.raw.headers),
      ],
    );

    assertOneRow(result.rowCount, 'Recording response metadata');
  }

  async recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void> {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertContentHash(input.archive.contentHash, 'archive.contentHash');
    assertNonEmpty(input.archive.relativePath, 'archive.relativePath');

    const result = await this.pool.query(
      `UPDATE collection_runs
       SET archive_path = $4
       WHERE id = $1
         AND source_id = $2
         AND status = 'running'
         AND content_hash = $3
         AND (archive_path IS NULL OR archive_path = $4)`,
      [
        input.runId,
        input.sourceId,
        input.archive.contentHash,
        input.archive.relativePath,
      ],
    );

    assertOneRow(result.rowCount, 'Recording a published archive');
  }

  async completeUsgsRun(input: CompleteUsgsRunInput): Promise<CompleteUsgsRunResult> {
    this.validateCompletionInput(input);

    const client = await this.pool.connect();
    let result: CompleteUsgsRunResult | undefined;
    let completionError: unknown;
    let destroyClient = false;

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [input.sourceId],
      );

      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsReprocessed = 0;
      let recordsUnchanged = 0;

      for (const record of input.parsed.records) {
        assertContentHash(record.contentHash, `record ${record.sourceEventId} contentHash`);
        const existingResult = await client.query<ExistingRawObservation>(
          `SELECT
             id,
             source_updated_at,
             metadata ->> 'feature_content_hash' AS feature_content_hash,
             schema_version,
             parser_version
           FROM raw_observations
           WHERE source_id = $1
             AND source_record_id = $2
           FOR UPDATE`,
          [input.sourceId, record.sourceEventId],
        );
        const existing = existingResult.rows[0];
        const decision = persistenceDecision(
          existing,
          record.sourceUpdatedAt,
          record.contentHash,
          input.schemaVersion,
          input.parserVersion,
          record.sourceEventId,
        );

        if (decision === 'insert') {
          recordsInserted += 1;
        } else if (decision === 'provider_update') {
          recordsUpdated += 1;
        } else if (decision === 'reprocess') {
          recordsUpdated += 1;
          recordsReprocessed += 1;
        } else {
          recordsUnchanged += 1;
        }

        const rawObservationId = await this.upsertRawObservation(
          client,
          input,
          record,
          decision !== 'unchanged',
        );
        await this.upsertSeismicEvent(
          client,
          input,
          record,
          rawObservationId,
          decision !== 'unchanged',
        );
      }

      const metrics = {
        ...(input.metrics ?? {}),
        records_seen: input.parsed.records.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_reprocessed: recordsReprocessed,
        records_unchanged: recordsUnchanged,
      };
      const completion = await client.query(
        `UPDATE collection_runs
         SET completed_at = GREATEST($5, clock_timestamp()),
             upstream_timestamp = $6,
             status = 'succeeded',
             record_count = $7,
             parser_version = $8,
             error = NULL,
             metrics = $9::jsonb
         WHERE id = $1
           AND source_id = $2
           AND status = 'running'
           AND content_hash = $3
           AND archive_path = $10
           AND response_received_at = $4
           AND http_status BETWEEN 200 AND 299
         RETURNING id`,
        [
          input.runId,
          input.sourceId,
          input.feedContentHash,
          input.responseReceivedAt,
          input.completedAt,
          input.parsed.upstreamTimestamp,
          input.parsed.records.length,
          input.parserVersion,
          JSON.stringify(metrics),
          input.archivePath,
        ],
      );
      assertOneRow(completion.rowCount, 'Completing a USGS collection run');

      result = {
        runId: input.runId,
        sourceId: input.sourceId,
        recordsSeen: input.parsed.records.length,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
      };
      await client.query('COMMIT');
    } catch (error) {
      completionError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        completionError = new AggregateError(
          [error, rollbackError],
          'USGS completion and transaction rollback both failed',
        );
      }
    } finally {
      client.release(destroyClient);
    }

    if (completionError !== undefined) {
      try {
        await this.failRun({
          runId: input.runId,
          sourceId: input.sourceId,
          completedAt: input.completedAt,
          parserVersion: input.parserVersion,
          error: serialisableFailure(completionError, 'database_completion'),
          metrics: input.metrics,
        });
      } catch (failurePersistenceError) {
        throw new AggregateError(
          [completionError, failurePersistenceError],
          'USGS completion failed and its failure could not be persisted',
          { cause: failurePersistenceError },
        );
      }

      if (completionError instanceof Error) {
        throw completionError;
      }

      throw new Error('USGS completion failed', { cause: completionError });
    }

    if (result === undefined) {
      throw new Error('USGS completion ended without a result');
    }

    return result;
  }

  async completeGdacsRun(input: CompleteGdacsRunInput): Promise<CompleteGdacsRunResult> {
    this.validateGdacsCompletionInput(input);

    const client = await this.pool.connect();
    let result: CompleteGdacsRunResult | undefined;
    let completionError: unknown;
    let destroyClient = false;

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [input.sourceId],
      );

      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsUnchanged = 0;

      for (const record of input.parsed.records) {
        assertContentHash(record.contentHash, `record ${record.sourceEventId} contentHash`);
        const existingResult = await client.query<ExistingRawObservation>(
          `SELECT
             id,
             source_updated_at,
             COALESCE(
               metadata ->> 'item_content_hash',
               metadata ->> 'event_content_hash'
             ) AS feature_content_hash,
             schema_version,
             parser_version
           FROM raw_observations
           WHERE source_id = $1
             AND source_record_id = $2
           FOR UPDATE`,
          [input.sourceId, record.sourceEventId],
        );
        const existing = existingResult.rows[0];
        const decision = persistenceDecision(
          existing,
          record.sourceUpdatedAt,
          record.contentHash,
          input.schemaVersion,
          input.parserVersion,
          record.sourceEventId,
        );

        if (decision === 'insert') {
          recordsInserted += 1;
        } else if (decision === 'provider_update' || decision === 'reprocess') {
          recordsUpdated += 1;
        } else {
          recordsUnchanged += 1;
        }

        const rawObservationId = await this.upsertGdacsRawObservation(
          client,
          input,
          record,
          decision !== 'unchanged',
        );
        await this.upsertDisasterEvent(
          client,
          input,
          record,
          rawObservationId,
          decision !== 'unchanged',
        );
      }

      const metrics = {
        ...(input.metrics ?? {}),
        records_seen: input.parsed.records.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: recordsUnchanged,
      };
      const completion = await client.query(
        `UPDATE collection_runs
         SET completed_at = GREATEST($5, clock_timestamp()),
             upstream_timestamp = $6,
             status = 'succeeded',
             record_count = $7,
             parser_version = $8,
             error = NULL,
             metrics = $9::jsonb
         WHERE id = $1
           AND source_id = $2
           AND status = 'running'
           AND content_hash = $3
           AND archive_path = $10
           AND response_received_at = $4
           AND http_status BETWEEN 200 AND 299
         RETURNING id`,
        [
          input.runId,
          input.sourceId,
          input.feedContentHash,
          input.responseReceivedAt,
          input.completedAt,
          input.parsed.upstreamTimestamp,
          input.parsed.records.length,
          input.parserVersion,
          JSON.stringify(metrics),
          input.archivePath,
        ],
      );
      assertOneRow(completion.rowCount, 'Completing a GDACS collection run');

      result = {
        runId: input.runId,
        sourceId: input.sourceId,
        recordsSeen: input.parsed.records.length,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
      };
      await client.query('COMMIT');
    } catch (error) {
      completionError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        completionError = new AggregateError(
          [error, rollbackError],
          'GDACS completion and transaction rollback both failed',
        );
      }
    } finally {
      client.release(destroyClient);
    }

    if (completionError !== undefined) {
      try {
        await this.failRun({
          runId: input.runId,
          sourceId: input.sourceId,
          completedAt: input.completedAt,
          parserVersion: input.parserVersion,
          error: serialisableFailure(completionError, 'database_completion'),
          metrics: input.metrics,
        });
      } catch (failurePersistenceError) {
        throw new AggregateError(
          [completionError, failurePersistenceError],
          'GDACS completion failed and its failure could not be persisted',
          { cause: failurePersistenceError },
        );
      }

      if (completionError instanceof Error) {
        throw completionError;
      }
      throw new Error('GDACS completion failed', { cause: completionError });
    }

    if (result === undefined) {
      throw new Error('GDACS completion ended without a result');
    }

    return result;
  }

  async completeEonetRun(input: CompleteEonetRunInput): Promise<CompleteEonetRunResult> {
    return this.completeGdacsRun(input);
  }

  async completeFirmsRun(input: CompleteFirmsRunInput): Promise<CompleteFirmsRunResult> {
    this.validateFirmsCompletionInput(input);

    const client = await this.pool.connect();
    let result: CompleteFirmsRunResult | undefined;
    let completionError: unknown;
    let destroyClient = false;

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [input.sourceId],
      );

      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsUnchanged = 0;

      for (const record of input.parsed.records) {
        assertContentHash(record.contentHash, `record ${record.sourceEventId} contentHash`);
        const existingResult = await client.query<ExistingRawObservation>(
          `SELECT
             id,
             source_updated_at,
             metadata ->> 'detection_content_hash' AS feature_content_hash,
             schema_version,
             parser_version
           FROM raw_observations
           WHERE source_id = $1
             AND source_record_id = $2
           FOR UPDATE`,
          [input.sourceId, record.sourceEventId],
        );
        const existing = existingResult.rows[0];
        const decision = persistenceDecision(
          existing,
          record.sourceUpdatedAt,
          record.contentHash,
          input.schemaVersion,
          input.parserVersion,
          record.sourceEventId,
        );

        if (decision === 'insert') {
          recordsInserted += 1;
        } else if (decision === 'provider_update' || decision === 'reprocess') {
          recordsUpdated += 1;
        } else {
          recordsUnchanged += 1;
        }

        const rawObservationId = await this.upsertFirmsRawObservation(
          client,
          input,
          record,
          decision !== 'unchanged',
        );
        await this.upsertActiveFireDetection(
          client,
          input,
          record,
          rawObservationId,
          decision !== 'unchanged',
        );
      }

      const metrics = {
        ...(input.metrics ?? {}),
        records_seen: input.parsed.records.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: recordsUnchanged,
      };
      const completion = await client.query(
        `UPDATE collection_runs
         SET completed_at = GREATEST($5, clock_timestamp()),
             upstream_timestamp = $6,
             status = 'succeeded',
             record_count = $7,
             parser_version = $8,
             error = NULL,
             metrics = $9::jsonb
         WHERE id = $1
           AND source_id = $2
           AND status = 'running'
           AND content_hash = $3
           AND archive_path = $10
           AND response_received_at = $4
           AND http_status BETWEEN 200 AND 299
         RETURNING id`,
        [
          input.runId,
          input.sourceId,
          input.feedContentHash,
          input.responseReceivedAt,
          input.completedAt,
          input.parsed.upstreamTimestamp,
          input.parsed.records.length,
          input.parserVersion,
          JSON.stringify(metrics),
          input.archivePath,
        ],
      );
      assertOneRow(completion.rowCount, 'Completing a FIRMS collection run');

      result = {
        runId: input.runId,
        sourceId: input.sourceId,
        recordsSeen: input.parsed.records.length,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
      };
      await client.query('COMMIT');
    } catch (error) {
      completionError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        completionError = new AggregateError(
          [error, rollbackError],
          'FIRMS completion and transaction rollback both failed',
        );
      }
    } finally {
      client.release(destroyClient);
    }

    if (completionError !== undefined) {
      try {
        await this.failRun({
          runId: input.runId,
          sourceId: input.sourceId,
          completedAt: input.completedAt,
          parserVersion: input.parserVersion,
          error: serialisableFailure(completionError, 'database_completion'),
          metrics: input.metrics,
        });
      } catch (failurePersistenceError) {
        throw new AggregateError(
          [completionError, failurePersistenceError],
          'FIRMS completion failed and its failure could not be persisted',
          { cause: failurePersistenceError },
        );
      }

      if (completionError instanceof Error) {
        throw completionError;
      }
      throw new Error('FIRMS completion failed', { cause: completionError });
    }

    if (result === undefined) {
      throw new Error('FIRMS completion ended without a result');
    }

    return result;
  }

  async completeSpaceWeatherRun(
    input: CompleteSpaceWeatherRunInput,
  ): Promise<CompleteSpaceWeatherRunResult> {
    this.validateSpaceWeatherCompletionInput(input);

    const client = await this.pool.connect();
    let result: CompleteSpaceWeatherRunResult | undefined;
    let completionError: unknown;
    let destroyClient = false;

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [input.sourceId],
      );

      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsUnchanged = 0;

      for (const record of input.parsed.records) {
        assertContentHash(record.contentHash, `record ${record.sourceObservationId} contentHash`);
        const existingResult = await client.query<ExistingRawObservation>(
          `SELECT
             id,
             source_updated_at,
             metadata ->> 'observation_content_hash' AS feature_content_hash,
             schema_version,
             parser_version
           FROM raw_observations
           WHERE source_id = $1
             AND source_record_id = $2
           FOR UPDATE`,
          [input.sourceId, record.sourceObservationId],
        );
        const existing = existingResult.rows[0];
        const decision = persistenceDecision(
          existing,
          record.sourceUpdatedAt,
          record.contentHash,
          input.schemaVersion,
          input.parserVersion,
          record.sourceObservationId,
        );

        if (decision === 'insert') {
          recordsInserted += 1;
        } else if (decision === 'provider_update' || decision === 'reprocess') {
          recordsUpdated += 1;
        } else {
          recordsUnchanged += 1;
        }

        const rawObservationId = await this.upsertSpaceWeatherRawObservation(
          client,
          input,
          record,
          decision !== 'unchanged',
        );
        await this.upsertSpaceWeatherObservation(
          client,
          input,
          record,
          rawObservationId,
          decision !== 'unchanged',
        );
      }

      const metrics = {
        ...(input.metrics ?? {}),
        records_seen: input.parsed.records.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: recordsUnchanged,
      };
      const completion = await client.query(
        `UPDATE collection_runs
         SET completed_at = GREATEST($5, clock_timestamp()),
             upstream_timestamp = $6,
             status = 'succeeded',
             record_count = $7,
             parser_version = $8,
             error = NULL,
             metrics = $9::jsonb
         WHERE id = $1
           AND source_id = $2
           AND status = 'running'
           AND content_hash = $3
           AND archive_path = $10
           AND response_received_at = $4
           AND http_status BETWEEN 200 AND 299
         RETURNING id`,
        [
          input.runId,
          input.sourceId,
          input.feedContentHash,
          input.responseReceivedAt,
          input.completedAt,
          input.parsed.upstreamTimestamp,
          input.parsed.records.length,
          input.parserVersion,
          JSON.stringify(metrics),
          input.archivePath,
        ],
      );
      assertOneRow(completion.rowCount, 'Completing a NOAA space-weather collection run');

      result = {
        runId: input.runId,
        sourceId: input.sourceId,
        recordsSeen: input.parsed.records.length,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
      };
      await client.query('COMMIT');
    } catch (error) {
      completionError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        completionError = new AggregateError(
          [error, rollbackError],
          'NOAA space-weather completion and transaction rollback both failed',
        );
      }
    } finally {
      client.release(destroyClient);
    }

    if (completionError !== undefined) {
      try {
        await this.failRun({
          runId: input.runId,
          sourceId: input.sourceId,
          completedAt: input.completedAt,
          parserVersion: input.parserVersion,
          error: serialisableFailure(completionError, 'database_completion'),
          metrics: input.metrics,
        });
      } catch (failurePersistenceError) {
        throw new AggregateError(
          [completionError, failurePersistenceError],
          'NOAA space-weather completion failed and its failure could not be persisted',
          { cause: failurePersistenceError },
        );
      }

      if (completionError instanceof Error) {
        throw completionError;
      }
      throw new Error('NOAA space-weather completion failed', { cause: completionError });
    }

    if (result === undefined) {
      throw new Error('NOAA space-weather completion ended without a result');
    }

    return result;
  }

  async completeWeatherRun(input: CompleteWeatherRunInput): Promise<CompleteWeatherRunResult> {
    this.validateWeatherCompletionInput(input);

    const client = await this.pool.connect();
    let result: CompleteWeatherRunResult | undefined;
    let completionError: unknown;
    let destroyClient = false;

    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [input.sourceId],
      );

      let recordsInserted = 0;
      let recordsUpdated = 0;
      let recordsUnchanged = 0;

      for (const record of input.parsed.records) {
        assertContentHash(record.contentHash, `record ${record.sourceEventId} contentHash`);
        const existingResult = await client.query<ExistingRawObservation>(
          `SELECT
             id,
             source_updated_at,
             metadata ->> 'event_content_hash' AS feature_content_hash,
             schema_version,
             parser_version
           FROM raw_observations
           WHERE source_id = $1
             AND source_record_id = $2
           FOR UPDATE`,
          [input.sourceId, record.sourceEventId],
        );
        const existing = existingResult.rows[0];
        const decision = persistenceDecision(
          existing,
          record.sourceUpdatedAt,
          record.contentHash,
          input.schemaVersion,
          input.parserVersion,
          record.sourceEventId,
        );

        if (decision === 'insert') {
          recordsInserted += 1;
        } else if (decision === 'provider_update' || decision === 'reprocess') {
          recordsUpdated += 1;
        } else {
          recordsUnchanged += 1;
        }

        const rawObservationId = await this.upsertWeatherRawObservation(
          client,
          input,
          record,
          decision !== 'unchanged',
        );
        await this.upsertWeatherEvent(
          client,
          input,
          record,
          rawObservationId,
          decision !== 'unchanged',
        );
      }

      const metrics = {
        ...(input.metrics ?? {}),
        records_seen: input.parsed.records.length,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_unchanged: recordsUnchanged,
      };
      const completion = await client.query(
        `UPDATE collection_runs
         SET completed_at = GREATEST($5, clock_timestamp()),
             upstream_timestamp = $6,
             status = 'succeeded',
             record_count = $7,
             parser_version = $8,
             error = NULL,
             metrics = $9::jsonb
         WHERE id = $1
           AND source_id = $2
           AND status = 'running'
           AND content_hash = $3
           AND archive_path = $10
           AND response_received_at = $4
           AND http_status BETWEEN 200 AND 299
         RETURNING id`,
        [
          input.runId,
          input.sourceId,
          input.feedContentHash,
          input.responseReceivedAt,
          input.completedAt,
          input.parsed.upstreamTimestamp,
          input.parsed.records.length,
          input.parserVersion,
          JSON.stringify(metrics),
          input.archivePath,
        ],
      );
      assertOneRow(completion.rowCount, 'Completing a weather collection run');

      result = {
        runId: input.runId,
        sourceId: input.sourceId,
        recordsSeen: input.parsed.records.length,
        recordsInserted,
        recordsUpdated,
        recordsUnchanged,
      };
      await client.query('COMMIT');
    } catch (error) {
      completionError = error;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        completionError = new AggregateError(
          [error, rollbackError],
          'Weather completion and transaction rollback both failed',
        );
      }
    } finally {
      client.release(destroyClient);
    }

    if (completionError !== undefined) {
      try {
        await this.failRun({
          runId: input.runId,
          sourceId: input.sourceId,
          completedAt: input.completedAt,
          parserVersion: input.parserVersion,
          error: serialisableFailure(completionError, 'database_completion'),
          metrics: input.metrics,
        });
      } catch (failurePersistenceError) {
        throw new AggregateError(
          [completionError, failurePersistenceError],
          'Weather completion failed and its failure could not be persisted',
          { cause: failurePersistenceError },
        );
      }

      if (completionError instanceof Error) {
        throw completionError;
      }
      throw new Error('Weather completion failed', { cause: completionError });
    }

    if (result === undefined) {
      throw new Error('Weather completion ended without a result');
    }

    return result;
  }

  async failRun(input: FailRunInput): Promise<boolean> {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.completedAt, 'completedAt');
    if (input.retryNotBefore !== undefined && input.retryNotBefore !== null) {
      assertValidDate(input.retryNotBefore, 'retryNotBefore');
    }

    const result = await this.pool.query(
      `UPDATE collection_runs
       SET status = 'failed',
           completed_at = GREATEST(
             $3,
             clock_timestamp(),
             started_at,
             COALESCE(request_started_at, started_at),
             COALESCE(response_received_at, started_at)
           ),
           parser_version = COALESCE($4, parser_version),
           error = $5::jsonb,
           retry_not_before = $7,
           metrics = metrics || $6::jsonb || CASE
             WHEN $3 < GREATEST(
               started_at,
               COALESCE(request_started_at, started_at),
               COALESCE(response_received_at, started_at)
             ) THEN jsonb_build_object(
               'completion_time_clamped', TRUE,
               'reported_completed_at', to_jsonb($3::timestamptz)
             )
             ELSE '{}'::jsonb
           END
       WHERE id = $1
         AND source_id = $2
         AND status = 'running'`,
      [
        input.runId,
        input.sourceId,
        input.completedAt,
        input.parserVersion ?? null,
        JSON.stringify(serialisableFailure(input.error)),
        JSON.stringify(input.metrics ?? {}),
        input.retryNotBefore ?? null,
      ],
    );

    return result.rowCount === 1;
  }

  async getRetryNotBefore(sourceId: string): Promise<Date | null> {
    assertNonEmpty(sourceId, 'sourceId');

    const result = await this.pool.query<RetryDeadlineRow>(
      `SELECT retry.retry_not_before
       FROM source_catalogue AS source
       LEFT JOIN LATERAL (
         SELECT MAX(retry_not_before) AS retry_not_before
         FROM collection_runs
         WHERE source_id = source.source_id
           AND retry_not_before > NOW()
       ) AS retry ON TRUE
       WHERE source.source_id = $1`,
      [sourceId],
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(`Unknown source ID: ${sourceId}`);
    }

    return row.retry_not_before;
  }

  async getSourceHealth(sourceId: string): Promise<SourceHealth> {
    assertNonEmpty(sourceId, 'sourceId');

    const result = await this.pool.query<SourceHealthRow>(
      `SELECT
         latest.status AS latest_status,
         latest.started_at AS latest_started_at,
         completion.last_completed_at,
         failure.last_error_at,
         success.last_success_at,
         running.running_count
       FROM source_catalogue AS source
       LEFT JOIN LATERAL (
         SELECT status, started_at
         FROM collection_runs
         WHERE source_id = source.source_id
         ORDER BY started_at DESC, id DESC
         LIMIT 1
       ) AS latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(completed_at) AS last_completed_at
         FROM collection_runs
         WHERE source_id = source.source_id
           AND status IN ('succeeded', 'failed')
       ) AS completion ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(completed_at) AS last_success_at
         FROM collection_runs
         WHERE source_id = source.source_id
           AND status = 'succeeded'
       ) AS success ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(completed_at) AS last_error_at
         FROM collection_runs
         WHERE source_id = source.source_id
           AND status = 'failed'
       ) AS failure ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::integer AS running_count
         FROM collection_runs
         WHERE source_id = source.source_id
           AND status = 'running'
       ) AS running ON TRUE
       WHERE source.source_id = $1`,
      [sourceId],
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(`Unknown source ID: ${sourceId}`);
    }

    return {
      lastCompletedAt: row.last_completed_at,
      lastErrorAt: row.last_error_at,
      lastSuccessAt: row.last_success_at,
      latestStartedAt: row.latest_started_at,
      latestStatus: row.latest_status,
      runningCount: row.running_count,
    };
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  private validateCompletionInput(input: CompleteUsgsRunInput): void {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.responseReceivedAt, 'responseReceivedAt');
    assertValidDate(input.completedAt, 'completedAt');
    assertContentHash(input.feedContentHash, 'feedContentHash');
    assertNonEmpty(input.archivePath, 'archivePath');
    assertNonEmpty(input.parserVersion, 'parserVersion');

    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion must be a positive integer');
    }

    if (input.parsed.sourceId !== input.sourceId) {
      throw new Error('Parsed feed source ID does not match the collection run source ID');
    }

    if (input.completedAt.getTime() < input.responseReceivedAt.getTime()) {
      throw new Error('completedAt must not be earlier than responseReceivedAt');
    }
  }

  private validateGdacsCompletionInput(input: CompleteGdacsRunInput): void {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.responseReceivedAt, 'responseReceivedAt');
    assertValidDate(input.completedAt, 'completedAt');
    assertContentHash(input.feedContentHash, 'feedContentHash');
    assertNonEmpty(input.archivePath, 'archivePath');
    assertNonEmpty(input.parserVersion, 'parserVersion');

    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion must be a positive integer');
    }

    if (input.parsed.sourceId !== input.sourceId) {
      throw new Error('Parsed GDACS feed source ID does not match the collection run source ID');
    }

    if (input.completedAt.getTime() < input.responseReceivedAt.getTime()) {
      throw new Error('completedAt must not be earlier than responseReceivedAt');
    }
  }

  private validateFirmsCompletionInput(input: CompleteFirmsRunInput): void {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.responseReceivedAt, 'responseReceivedAt');
    assertValidDate(input.completedAt, 'completedAt');
    assertContentHash(input.feedContentHash, 'feedContentHash');
    assertNonEmpty(input.archivePath, 'archivePath');
    assertNonEmpty(input.parserVersion, 'parserVersion');

    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion must be a positive integer');
    }

    if (input.parsed.sourceId !== input.sourceId) {
      throw new Error('Parsed FIRMS feed source ID does not match the collection run source ID');
    }

    if (input.completedAt.getTime() < input.responseReceivedAt.getTime()) {
      throw new Error('completedAt must not be earlier than responseReceivedAt');
    }
  }

  private validateSpaceWeatherCompletionInput(input: CompleteSpaceWeatherRunInput): void {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.responseReceivedAt, 'responseReceivedAt');
    assertValidDate(input.completedAt, 'completedAt');
    assertContentHash(input.feedContentHash, 'feedContentHash');
    assertNonEmpty(input.archivePath, 'archivePath');
    assertNonEmpty(input.parserVersion, 'parserVersion');

    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion must be a positive integer');
    }

    if (input.parsed.sourceId !== input.sourceId) {
      throw new Error('Parsed NOAA feed source ID does not match the collection run source ID');
    }

    if (input.completedAt.getTime() < input.responseReceivedAt.getTime()) {
      throw new Error('completedAt must not be earlier than responseReceivedAt');
    }
  }

  private validateWeatherCompletionInput(input: CompleteWeatherRunInput): void {
    assertNonEmpty(input.runId, 'runId');
    assertNonEmpty(input.sourceId, 'sourceId');
    assertValidDate(input.responseReceivedAt, 'responseReceivedAt');
    assertValidDate(input.completedAt, 'completedAt');
    assertContentHash(input.feedContentHash, 'feedContentHash');
    assertNonEmpty(input.archivePath, 'archivePath');
    assertNonEmpty(input.parserVersion, 'parserVersion');

    if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion must be a positive integer');
    }

    if (input.parsed.sourceId !== input.sourceId) {
      throw new Error('Parsed weather feed source ID does not match the collection run source ID');
    }

    if (input.completedAt.getTime() < input.responseReceivedAt.getTime()) {
      throw new Error('completedAt must not be earlier than responseReceivedAt');
    }
  }

  private async upsertRawObservation(
    client: PoolClient,
    input: CompleteUsgsRunInput,
    record: NormalisedUsgsFeed['records'][number],
    updateSnapshot: boolean,
  ): Promise<string> {
    const candidateId = randomUUID();
    const metadata = {
      ...record.metadata,
      feature_content_hash: record.contentHash,
    };
    const result = await client.query<{ id: string }>(
      `INSERT INTO raw_observations AS current (
         id,
         source_id,
         collection_run_id,
         source_record_id,
         observed_at,
         occurred_at,
         source_updated_at,
         first_seen_at,
         last_seen_at,
         content_hash,
         archive_path,
         payload,
         schema_version,
         parser_version,
         evidence_classification,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $5, $5, $8, $9,
         $10::jsonb, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT (source_id, source_record_id)
       WHERE source_record_id IS NOT NULL
       DO UPDATE SET
         first_seen_at = LEAST(current.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(current.last_seen_at, EXCLUDED.last_seen_at),
         collection_run_id = CASE
           WHEN $15
           THEN EXCLUDED.collection_run_id ELSE current.collection_run_id END,
         observed_at = CASE
           WHEN $15
           THEN EXCLUDED.observed_at ELSE current.observed_at END,
         occurred_at = CASE
           WHEN $15
           THEN EXCLUDED.occurred_at ELSE current.occurred_at END,
         source_updated_at = CASE
           WHEN $15
           THEN EXCLUDED.source_updated_at ELSE current.source_updated_at END,
         content_hash = CASE
           WHEN $15
           THEN EXCLUDED.content_hash ELSE current.content_hash END,
         archive_path = CASE
           WHEN $15
           THEN EXCLUDED.archive_path ELSE current.archive_path END,
         payload = CASE
           WHEN $15
           THEN EXCLUDED.payload ELSE current.payload END,
         schema_version = CASE
           WHEN $15
           THEN EXCLUDED.schema_version ELSE current.schema_version END,
         parser_version = CASE
           WHEN $15
           THEN EXCLUDED.parser_version ELSE current.parser_version END,
         evidence_classification = CASE
           WHEN $15
           THEN EXCLUDED.evidence_classification ELSE current.evidence_classification END,
         metadata = CASE
           WHEN $15
           THEN EXCLUDED.metadata ELSE current.metadata END,
         updated_at = NOW()
       RETURNING id`,
      [
        candidateId,
        input.sourceId,
        input.runId,
        record.sourceEventId,
        input.responseReceivedAt,
        record.occurredAt,
        record.sourceUpdatedAt,
        input.feedContentHash,
        input.archivePath,
        JSON.stringify(record.rawPayload),
        input.schemaVersion,
        input.parserVersion,
        record.evidenceClassification,
        JSON.stringify(metadata),
        updateSnapshot,
      ],
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error(`Raw observation upsert returned no ID for ${record.sourceEventId}`);
    }

    return row.id;
  }

  private async upsertSeismicEvent(
    client: PoolClient,
    input: CompleteUsgsRunInput,
    record: NormalisedUsgsFeed['records'][number],
    rawObservationId: string,
    updateSnapshot: boolean,
  ): Promise<void> {
    const metadata = {
      ...record.metadata,
      feature_content_hash: record.contentHash,
    };
    await client.query(
      `INSERT INTO seismic_events AS current (
         id,
         source_id,
         source_event_id,
         occurred_at,
         updated_at,
         magnitude,
         depth_km,
         place,
         tsunami,
         felt,
         alert,
         event_type,
         geometry,
         raw_observation_id,
         evidence_classification,
         parser_version,
         normalised_at,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         ST_SetSRID(ST_MakePoint($13, $14), 4326),
         $15, $16, $17, $18, $19::jsonb
       )
       ON CONFLICT ON CONSTRAINT seismic_events_source_event_unique
       DO UPDATE SET
         occurred_at = EXCLUDED.occurred_at,
         updated_at = EXCLUDED.updated_at,
         magnitude = EXCLUDED.magnitude,
         depth_km = EXCLUDED.depth_km,
         place = EXCLUDED.place,
         tsunami = EXCLUDED.tsunami,
         felt = EXCLUDED.felt,
         alert = EXCLUDED.alert,
         event_type = EXCLUDED.event_type,
         geometry = EXCLUDED.geometry,
         raw_observation_id = EXCLUDED.raw_observation_id,
         evidence_classification = EXCLUDED.evidence_classification,
         parser_version = EXCLUDED.parser_version,
         normalised_at = EXCLUDED.normalised_at,
         metadata = EXCLUDED.metadata
       WHERE $20::boolean`,
      [
        randomUUID(),
        input.sourceId,
        record.sourceEventId,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.magnitude,
        record.depthKm,
        record.place,
        record.tsunami,
        record.felt,
        record.alert,
        record.eventType,
        record.longitude,
        record.latitude,
        rawObservationId,
        record.evidenceClassification,
        input.parserVersion,
        input.completedAt,
        JSON.stringify(metadata),
        updateSnapshot,
      ],
    );
  }

  private async upsertGdacsRawObservation(
    client: PoolClient,
    input: CompleteGdacsRunInput,
    record: NormalisedDisasterFeedForStore['records'][number],
    updateSnapshot: boolean,
  ): Promise<string> {
    const candidateId = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO raw_observations AS current (
         id,
         source_id,
         collection_run_id,
         source_record_id,
         observed_at,
         occurred_at,
         source_updated_at,
         first_seen_at,
         last_seen_at,
         content_hash,
         archive_path,
         payload,
         schema_version,
         parser_version,
         evidence_classification,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $5, $5, $8, $9,
         $10::jsonb, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT (source_id, source_record_id)
       WHERE source_record_id IS NOT NULL
       DO UPDATE SET
         first_seen_at = LEAST(current.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(current.last_seen_at, EXCLUDED.last_seen_at),
         collection_run_id = CASE WHEN $15 THEN EXCLUDED.collection_run_id ELSE current.collection_run_id END,
         observed_at = CASE WHEN $15 THEN EXCLUDED.observed_at ELSE current.observed_at END,
         occurred_at = CASE WHEN $15 THEN EXCLUDED.occurred_at ELSE current.occurred_at END,
         source_updated_at = CASE WHEN $15 THEN EXCLUDED.source_updated_at ELSE current.source_updated_at END,
         content_hash = CASE WHEN $15 THEN EXCLUDED.content_hash ELSE current.content_hash END,
         archive_path = CASE WHEN $15 THEN EXCLUDED.archive_path ELSE current.archive_path END,
         payload = CASE WHEN $15 THEN EXCLUDED.payload ELSE current.payload END,
         schema_version = CASE WHEN $15 THEN EXCLUDED.schema_version ELSE current.schema_version END,
         parser_version = CASE WHEN $15 THEN EXCLUDED.parser_version ELSE current.parser_version END,
         evidence_classification = CASE WHEN $15 THEN EXCLUDED.evidence_classification ELSE current.evidence_classification END,
         metadata = CASE WHEN $15 THEN EXCLUDED.metadata ELSE current.metadata END,
         updated_at = NOW()
       RETURNING id`,
      [
        candidateId,
        input.sourceId,
        input.runId,
        record.sourceEventId,
        input.responseReceivedAt,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.contentHash,
        input.archivePath,
        JSON.stringify(record.rawPayload),
        input.schemaVersion,
        input.parserVersion,
        record.evidenceClassification,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Raw observation upsert returned no ID for ${record.sourceEventId}`);
    }
    return row.id;
  }

  private async upsertDisasterEvent(
    client: PoolClient,
    input: CompleteGdacsRunInput,
    record: NormalisedDisasterFeedForStore['records'][number],
    rawObservationId: string,
    updateSnapshot: boolean,
  ): Promise<void> {
    await client.query(
      `INSERT INTO disaster_events AS current (
         id,
         source_id,
         source_event_id,
         occurred_at,
         updated_at,
         title,
         description,
         link,
         event_type,
         geometry,
         raw_observation_id,
         evidence_classification,
         parser_version,
         normalised_at,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         ST_SetSRID(ST_MakePoint($10, $11), 4326),
         $12, $13, $14, $15, $16::jsonb
       )
       ON CONFLICT ON CONSTRAINT disaster_events_source_event_unique
       DO UPDATE SET
         occurred_at = EXCLUDED.occurred_at,
         updated_at = EXCLUDED.updated_at,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         link = EXCLUDED.link,
         event_type = EXCLUDED.event_type,
         geometry = EXCLUDED.geometry,
         raw_observation_id = EXCLUDED.raw_observation_id,
         evidence_classification = EXCLUDED.evidence_classification,
         parser_version = EXCLUDED.parser_version,
         normalised_at = EXCLUDED.normalised_at,
         metadata = EXCLUDED.metadata
       WHERE $17::boolean`,
      [
        randomUUID(),
        input.sourceId,
        record.sourceEventId,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.title,
        record.description,
        record.link,
        record.eventType,
        record.longitude,
        record.latitude,
        rawObservationId,
        record.evidenceClassification,
        input.parserVersion,
        input.completedAt,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
  }

  private async upsertFirmsRawObservation(
    client: PoolClient,
    input: CompleteFirmsRunInput,
    record: NormalisedNasaFirmsFeed['records'][number],
    updateSnapshot: boolean,
  ): Promise<string> {
    const candidateId = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO raw_observations AS current (
         id,
         source_id,
         collection_run_id,
         source_record_id,
         observed_at,
         occurred_at,
         source_updated_at,
         first_seen_at,
         last_seen_at,
         content_hash,
         archive_path,
         payload,
         schema_version,
         parser_version,
         evidence_classification,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $5, $5, $8, $9,
         $10::jsonb, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT (source_id, source_record_id)
       WHERE source_record_id IS NOT NULL
       DO UPDATE SET
         first_seen_at = LEAST(current.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(current.last_seen_at, EXCLUDED.last_seen_at),
         collection_run_id = CASE WHEN $15 THEN EXCLUDED.collection_run_id ELSE current.collection_run_id END,
         observed_at = CASE WHEN $15 THEN EXCLUDED.observed_at ELSE current.observed_at END,
         occurred_at = CASE WHEN $15 THEN EXCLUDED.occurred_at ELSE current.occurred_at END,
         source_updated_at = CASE WHEN $15 THEN EXCLUDED.source_updated_at ELSE current.source_updated_at END,
         content_hash = CASE WHEN $15 THEN EXCLUDED.content_hash ELSE current.content_hash END,
         archive_path = CASE WHEN $15 THEN EXCLUDED.archive_path ELSE current.archive_path END,
         payload = CASE WHEN $15 THEN EXCLUDED.payload ELSE current.payload END,
         schema_version = CASE WHEN $15 THEN EXCLUDED.schema_version ELSE current.schema_version END,
         parser_version = CASE WHEN $15 THEN EXCLUDED.parser_version ELSE current.parser_version END,
         evidence_classification = CASE WHEN $15 THEN EXCLUDED.evidence_classification ELSE current.evidence_classification END,
         metadata = CASE WHEN $15 THEN EXCLUDED.metadata ELSE current.metadata END,
         updated_at = NOW()
       RETURNING id`,
      [
        candidateId,
        input.sourceId,
        input.runId,
        record.sourceEventId,
        input.responseReceivedAt,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.contentHash,
        input.archivePath,
        JSON.stringify(record.rawPayload),
        input.schemaVersion,
        input.parserVersion,
        record.evidenceClassification,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Raw observation upsert returned no ID for ${record.sourceEventId}`);
    }
    return row.id;
  }

  private async upsertActiveFireDetection(
    client: PoolClient,
    input: CompleteFirmsRunInput,
    record: NormalisedNasaFirmsFeed['records'][number],
    rawObservationId: string,
    updateSnapshot: boolean,
  ): Promise<void> {
    await client.query(
      `INSERT INTO active_fire_detections AS current (
         id,
         source_id,
         source_detection_id,
         occurred_at,
         updated_at,
         satellite,
         instrument,
         confidence,
         brightness_kelvin,
         fire_radiative_power_mw,
         daynight,
         geometry,
         raw_observation_id,
         evidence_classification,
         parser_version,
         normalised_at,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         ST_SetSRID(ST_MakePoint($12, $13), 4326),
         $14, $15, $16, $17, $18::jsonb
       )
       ON CONFLICT ON CONSTRAINT active_fire_detections_source_detection_unique
       DO UPDATE SET
         occurred_at = EXCLUDED.occurred_at,
         updated_at = EXCLUDED.updated_at,
         satellite = EXCLUDED.satellite,
         instrument = EXCLUDED.instrument,
         confidence = EXCLUDED.confidence,
         brightness_kelvin = EXCLUDED.brightness_kelvin,
         fire_radiative_power_mw = EXCLUDED.fire_radiative_power_mw,
         daynight = EXCLUDED.daynight,
         geometry = EXCLUDED.geometry,
         raw_observation_id = EXCLUDED.raw_observation_id,
         evidence_classification = EXCLUDED.evidence_classification,
         parser_version = EXCLUDED.parser_version,
         normalised_at = EXCLUDED.normalised_at,
         metadata = EXCLUDED.metadata
       WHERE $19::boolean`,
      [
        randomUUID(),
        input.sourceId,
        record.sourceEventId,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.satellite,
        record.instrument,
        record.confidence,
        record.brightnessKelvin,
        record.fireRadiativePowerMw,
        record.dayNight,
        record.longitude,
        record.latitude,
        rawObservationId,
        record.evidenceClassification,
        input.parserVersion,
        input.completedAt,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
  }

  private async upsertSpaceWeatherRawObservation(
    client: PoolClient,
    input: CompleteSpaceWeatherRunInput,
    record: NormalisedNoaaSpaceWeatherFeed['records'][number],
    updateSnapshot: boolean,
  ): Promise<string> {
    const candidateId = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO raw_observations AS current (
         id,
         source_id,
         collection_run_id,
         source_record_id,
         observed_at,
         occurred_at,
         source_updated_at,
         first_seen_at,
         last_seen_at,
         content_hash,
         archive_path,
         payload,
         schema_version,
         parser_version,
         evidence_classification,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $5, $5, $8, $9,
         $10::jsonb, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT (source_id, source_record_id)
       WHERE source_record_id IS NOT NULL
       DO UPDATE SET
         first_seen_at = LEAST(current.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(current.last_seen_at, EXCLUDED.last_seen_at),
         collection_run_id = CASE WHEN $15 THEN EXCLUDED.collection_run_id ELSE current.collection_run_id END,
         observed_at = CASE WHEN $15 THEN EXCLUDED.observed_at ELSE current.observed_at END,
         occurred_at = CASE WHEN $15 THEN EXCLUDED.occurred_at ELSE current.occurred_at END,
         source_updated_at = CASE WHEN $15 THEN EXCLUDED.source_updated_at ELSE current.source_updated_at END,
         content_hash = CASE WHEN $15 THEN EXCLUDED.content_hash ELSE current.content_hash END,
         archive_path = CASE WHEN $15 THEN EXCLUDED.archive_path ELSE current.archive_path END,
         payload = CASE WHEN $15 THEN EXCLUDED.payload ELSE current.payload END,
         schema_version = CASE WHEN $15 THEN EXCLUDED.schema_version ELSE current.schema_version END,
         parser_version = CASE WHEN $15 THEN EXCLUDED.parser_version ELSE current.parser_version END,
         evidence_classification = CASE WHEN $15 THEN EXCLUDED.evidence_classification ELSE current.evidence_classification END,
         metadata = CASE WHEN $15 THEN EXCLUDED.metadata ELSE current.metadata END,
         updated_at = NOW()
       RETURNING id`,
      [
        candidateId,
        input.sourceId,
        input.runId,
        record.sourceObservationId,
        input.responseReceivedAt,
        record.observedAt,
        record.sourceUpdatedAt,
        record.contentHash,
        input.archivePath,
        JSON.stringify(record.rawPayload),
        input.schemaVersion,
        input.parserVersion,
        record.evidenceClassification,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Raw observation upsert returned no ID for ${record.sourceObservationId}`);
    }
    return row.id;
  }

  private async upsertSpaceWeatherObservation(
    client: PoolClient,
    input: CompleteSpaceWeatherRunInput,
    record: NormalisedNoaaSpaceWeatherFeed['records'][number],
    rawObservationId: string,
    updateSnapshot: boolean,
  ): Promise<void> {
    await client.query(
      `INSERT INTO space_weather_observations AS current (
         id,
         source_id,
         source_observation_id,
         observed_at,
         updated_at,
         event_kind,
         numeric_value,
         classification,
         message,
         raw_observation_id,
         evidence_classification,
         parser_version,
         normalised_at,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT ON CONSTRAINT space_weather_observations_source_observation_unique
       DO UPDATE SET
         observed_at = EXCLUDED.observed_at,
         updated_at = EXCLUDED.updated_at,
         event_kind = EXCLUDED.event_kind,
         numeric_value = EXCLUDED.numeric_value,
         classification = EXCLUDED.classification,
         message = EXCLUDED.message,
         raw_observation_id = EXCLUDED.raw_observation_id,
         evidence_classification = EXCLUDED.evidence_classification,
         parser_version = EXCLUDED.parser_version,
         normalised_at = EXCLUDED.normalised_at,
         metadata = EXCLUDED.metadata
       WHERE $15::boolean`,
      [
        randomUUID(),
        input.sourceId,
        record.sourceObservationId,
        record.observedAt,
        record.sourceUpdatedAt,
        record.eventKind,
        record.numericValue,
        record.classification,
        record.message,
        rawObservationId,
        record.evidenceClassification,
        input.parserVersion,
        input.completedAt,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
  }

  private async upsertWeatherRawObservation(
    client: PoolClient,
    input: CompleteWeatherRunInput,
    record: NormalisedWeatherFeed['records'][number],
    updateSnapshot: boolean,
  ): Promise<string> {
    const candidateId = randomUUID();
    const result = await client.query<{ id: string }>(
      `INSERT INTO raw_observations AS current (
         id,
         source_id,
         collection_run_id,
         source_record_id,
         observed_at,
         occurred_at,
         source_updated_at,
         first_seen_at,
         last_seen_at,
         content_hash,
         archive_path,
         payload,
         schema_version,
         parser_version,
         evidence_classification,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $5, $5, $8, $9,
         $10::jsonb, $11, $12, $13, $14::jsonb
       )
       ON CONFLICT (source_id, source_record_id)
       WHERE source_record_id IS NOT NULL
       DO UPDATE SET
         first_seen_at = LEAST(current.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(current.last_seen_at, EXCLUDED.last_seen_at),
         collection_run_id = CASE WHEN $15 THEN EXCLUDED.collection_run_id ELSE current.collection_run_id END,
         observed_at = CASE WHEN $15 THEN EXCLUDED.observed_at ELSE current.observed_at END,
         occurred_at = CASE WHEN $15 THEN EXCLUDED.occurred_at ELSE current.occurred_at END,
         source_updated_at = CASE WHEN $15 THEN EXCLUDED.source_updated_at ELSE current.source_updated_at END,
         content_hash = CASE WHEN $15 THEN EXCLUDED.content_hash ELSE current.content_hash END,
         archive_path = CASE WHEN $15 THEN EXCLUDED.archive_path ELSE current.archive_path END,
         payload = CASE WHEN $15 THEN EXCLUDED.payload ELSE current.payload END,
         schema_version = CASE WHEN $15 THEN EXCLUDED.schema_version ELSE current.schema_version END,
         parser_version = CASE WHEN $15 THEN EXCLUDED.parser_version ELSE current.parser_version END,
         evidence_classification = CASE WHEN $15 THEN EXCLUDED.evidence_classification ELSE current.evidence_classification END,
         metadata = CASE WHEN $15 THEN EXCLUDED.metadata ELSE current.metadata END,
         updated_at = NOW()
       RETURNING id`,
      [
        candidateId,
        input.sourceId,
        input.runId,
        record.sourceEventId,
        input.responseReceivedAt,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.contentHash,
        input.archivePath,
        JSON.stringify(record.rawPayload),
        input.schemaVersion,
        input.parserVersion,
        record.evidenceClassification,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Raw observation upsert returned no ID for ${record.sourceEventId}`);
    }
    return row.id;
  }

  private async upsertWeatherEvent(
    client: PoolClient,
    input: CompleteWeatherRunInput,
    record: NormalisedWeatherFeed['records'][number],
    rawObservationId: string,
    updateSnapshot: boolean,
  ): Promise<void> {
    await client.query(
      `INSERT INTO weather_events AS current (
         id,
         source_id,
         source_event_id,
         occurred_at,
         updated_at,
         title,
         category,
         event_type,
         severity,
         area,
         expires_at,
         link,
         geometry,
         raw_observation_id,
         evidence_classification,
         parser_version,
         normalised_at,
         metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, ST_SetSRID(ST_MakePoint($13, $14), 4326),
         $15, $16, $17, $18, $19::jsonb
       )
       ON CONFLICT ON CONSTRAINT weather_events_source_event_unique
       DO UPDATE SET
         occurred_at = EXCLUDED.occurred_at,
         updated_at = EXCLUDED.updated_at,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         event_type = EXCLUDED.event_type,
         severity = EXCLUDED.severity,
         area = EXCLUDED.area,
         expires_at = EXCLUDED.expires_at,
         link = EXCLUDED.link,
         geometry = EXCLUDED.geometry,
         raw_observation_id = EXCLUDED.raw_observation_id,
         evidence_classification = EXCLUDED.evidence_classification,
         parser_version = EXCLUDED.parser_version,
         normalised_at = EXCLUDED.normalised_at,
         metadata = EXCLUDED.metadata
       WHERE $20::boolean`,
      [
        randomUUID(),
        input.sourceId,
        record.sourceEventId,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.title,
        record.category,
        record.eventType,
        record.severity,
        record.area,
        record.expiresAt,
        record.link,
        record.longitude,
        record.latitude,
        rawObservationId,
        record.evidenceClassification,
        input.parserVersion,
        input.completedAt,
        JSON.stringify(record.metadata),
        updateSnapshot,
      ],
    );
  }
}

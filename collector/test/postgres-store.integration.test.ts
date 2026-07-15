import { readFile } from 'node:fs/promises';

import { Pool, type QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RawResponse } from '../src/framework/http-fetcher.js';
import {
  normaliseUsgsEarthquakeFeed,
  type NormalisedUsgsFeed,
} from '../src/normalisers/usgs.js';
import {
  sha256Hex,
  type ArchiveWriteResult,
} from '../src/storage/archive-writer.js';
import { PostgresStore } from '../src/storage/postgres-store.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const sourceId = 'usgs-earthquakes';
const endpoint = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const eventIds = [
  'integration-usgs-store-001',
  'integration-usgs-store-002',
] as const;
const runIds = {
  initial: '10000000-0000-4000-8000-000000000001',
  replay: '10000000-0000-4000-8000-000000000002',
  changed: '10000000-0000-4000-8000-000000000003',
  stale: '10000000-0000-4000-8000-000000000004',
  recovery: '10000000-0000-4000-8000-000000000005',
  reprocess: '10000000-0000-4000-8000-000000000006',
  atomicConflict: '10000000-0000-4000-8000-000000000007',
  retryDeadline: '10000000-0000-4000-8000-000000000008',
  archiveFailure: '10000000-0000-4000-8000-000000000009',
  latestRunning: '10000000-0000-4000-8000-00000000000a',
} as const;
const allRunIds = Object.values(runIds);
const fixtureUrl = new URL('./fixtures/usgs-earthquakes.geojson', import.meta.url);

interface PersistedSnapshotRow extends QueryResultRow {
  raw_id: string;
  event_id: string;
  collection_run_id: string;
  first_seen_at: Date;
  last_seen_at: Date;
  observed_at: Date;
  source_updated_at: Date;
  content_hash: string;
  archive_path: string;
  payload: unknown;
  raw_parser_version: string;
  raw_schema_version: number;
  event_updated_at: Date;
  event_parser_version: string;
  magnitude: number | null;
  place: string | null;
  longitude: number;
  latitude: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface RunRow extends QueryResultRow {
  archive_path: string | null;
  completed_at: Date | null;
  content_hash: string | null;
  http_status: number | null;
  id: string;
  status: string;
  error: Record<string, unknown> | null;
  metrics: Record<string, unknown>;
  request_started_at: Date | null;
  response_received_at: Date | null;
  retry_not_before: Date | null;
}

interface Attempt {
  raw: RawResponse;
  archive: ArchiveWriteResult;
  responseReceivedAt: Date;
  completedAt: Date;
}

function integrationFixtureBody(template: NormalisedUsgsFeed): Buffer {
  const features = template.records.map((record, index) => ({
    ...record.rawPayload,
    id: eventIds[index] ?? `integration-usgs-store-${index}`,
  }));

  return Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        ...template.feedMetadata,
        generated: Date.parse('2026-07-15T00:00:00.000Z'),
        count: features.length,
      },
      features,
    }),
    'utf8',
  );
}

function changedFixtureBody(base: NormalisedUsgsFeed): Buffer {
  const first = base.records[0];
  if (first === undefined) {
    throw new Error('USGS integration fixture must contain at least one record');
  }

  const changedFirst = {
    ...first.rawPayload,
    properties: {
      ...first.rawPayload.properties,
      mag: 6.4,
      place: 'Revised integration fixture location',
      updated: first.sourceUpdatedAt.getTime() + 60_000,
    },
  };
  const features = base.records.map((record, index) =>
    index === 0 ? changedFirst : record.rawPayload,
  );

  return Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        ...base.feedMetadata,
        generated: base.upstreamTimestamp.getTime() + 60_000,
        count: features.length,
      },
      features,
    }),
    'utf8',
  );
}

function atomicConflictFixtureBody(current: NormalisedUsgsFeed): Buffer {
  const first = current.records[0];
  const second = current.records[1];
  if (first === undefined || second === undefined) {
    throw new Error('USGS integration fixture must contain two records');
  }

  const features = [
    {
      ...first.rawPayload,
      properties: {
        ...first.rawPayload.properties,
        mag: 6.5,
        place: 'This newer update must roll back',
        updated: first.sourceUpdatedAt.getTime() + 60_000,
      },
    },
    {
      ...second.rawPayload,
      properties: {
        ...second.rawPayload.properties,
        place: 'Conflicting content with an unchanged provider timestamp',
      },
    },
  ];

  return Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        ...current.feedMetadata,
        generated: current.upstreamTimestamp.getTime() + 60_000,
        count: features.length,
      },
      features,
    }),
    'utf8',
  );
}

function attempt(body: Buffer, responseReceivedAt: Date, label: string): Attempt {
  const contentHash = sha256Hex(body);
  const relativePath = `usgs-earthquakes/2026/07/15/${label}-${contentHash}.geojson.gz`;

  return {
    raw: {
      endpoint,
      requestStartedAt: new Date(responseReceivedAt.getTime() - 1_000),
      responseReceivedAt,
      status: 200,
      contentType: 'application/geo+json',
      headers: {
        'content-type': 'application/geo+json',
        etag: `"${label}"`,
      },
      body,
    },
    archive: {
      relativePath,
      absolutePath: `/tmp/${relativePath}`,
      contentHash,
      compressedBytes: body.byteLength,
      created: true,
    },
    responseReceivedAt,
    completedAt: new Date(responseReceivedAt.getTime() + 1_000),
  };
}

describe.skipIf(testDatabaseUrl.length === 0)('PostgresStore integration', () => {
  let pool: Pool;
  let store: PostgresStore;
  let baseBody: Buffer;
  let baseFeed: NormalisedUsgsFeed;
  let changedBody: Buffer;
  let changedFeed: NormalisedUsgsFeed;
  let latestSuccessCompletedAt: Date;
  let latestTerminalCompletedAt: Date;

  function completedAtNotBefore(
    row: RunRow | undefined,
    lowerBound: Date,
  ): Date {
    const completedAt = row?.completed_at;
    expect(completedAt).toBeInstanceOf(Date);
    if (completedAt === null || completedAt === undefined) {
      throw new Error('Expected a persisted completion timestamp');
    }
    expect(completedAt.getTime()).toBeGreaterThanOrEqual(lowerBound.getTime());
    return completedAt;
  }

  async function cleanup(): Promise<void> {
    await pool.query(
      `DELETE FROM seismic_events
       WHERE source_id = $1
         AND source_event_id = ANY($2::text[])`,
      [sourceId, eventIds],
    );
    await pool.query(
      `DELETE FROM raw_observations
       WHERE source_id = $1
         AND source_record_id = ANY($2::text[])`,
      [sourceId, eventIds],
    );
    await pool.query(
      'DELETE FROM collection_runs WHERE id = ANY($1::uuid[])',
      [allRunIds],
    );
  }

  async function beginAndArchive(runId: string, value: Attempt): Promise<void> {
    await store.beginRun({
      runId,
      sourceId,
      startedAt: value.raw.requestStartedAt,
      endpoint,
      collectorVersion: 'postgres-store-integration-test',
    });
    await store.recordResponseMetadata({
      runId,
      sourceId,
      raw: value.raw,
    });
    await store.recordPublishedArchive({
      runId,
      sourceId,
      archive: value.archive,
    });
  }

  async function complete(
    runId: string,
    parsed: NormalisedUsgsFeed,
    value: Attempt,
    parserVersion = 'usgs-test-v1',
    schemaVersion = 1,
  ) {
    return store.completeUsgsRun({
      runId,
      sourceId,
      parsed,
      responseReceivedAt: value.responseReceivedAt,
      completedAt: value.completedAt,
      feedContentHash: value.archive.contentHash,
      archivePath: value.archive.relativePath,
      parserVersion,
      schemaVersion,
      metrics: { fixture: true },
    });
  }

  async function snapshots(): Promise<PersistedSnapshotRow[]> {
    const result = await pool.query<PersistedSnapshotRow>(
      `SELECT
         raw.id AS raw_id,
         event.id AS event_id,
         raw.source_record_id,
         raw.collection_run_id,
         raw.first_seen_at,
         raw.last_seen_at,
         raw.observed_at,
         raw.source_updated_at,
         raw.content_hash,
         raw.archive_path,
         raw.payload,
         raw.parser_version AS raw_parser_version,
         raw.schema_version AS raw_schema_version,
         event.updated_at AS event_updated_at,
         event.parser_version AS event_parser_version,
         event.magnitude,
         event.place,
         ST_X(event.geometry) AS longitude,
         ST_Y(event.geometry) AS latitude
       FROM raw_observations AS raw
       JOIN seismic_events AS event
         ON event.raw_observation_id = raw.id
        AND event.source_id = raw.source_id
       WHERE raw.source_id = $1
         AND raw.source_record_id = ANY($2::text[])
       ORDER BY raw.source_record_id`,
      [sourceId, eventIds],
    );

    return result.rows;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    store = new PostgresStore(pool);

    const source = await pool.query(
      'SELECT source_id FROM source_catalogue WHERE source_id = $1',
      [sourceId],
    );
    if (source.rowCount !== 1) {
      throw new Error('TEST_DATABASE_URL must point to a migrated database with the USGS source seed');
    }

    await cleanup();

    const templateBody = await readFile(fixtureUrl);
    const template = normaliseUsgsEarthquakeFeed(templateBody);
    baseBody = integrationFixtureBody(template);
    baseFeed = normaliseUsgsEarthquakeFeed(baseBody);
    changedBody = changedFixtureBody(baseFeed);
    changedFeed = normaliseUsgsEarthquakeFeed(changedBody);
  });

  afterAll(async () => {
    await cleanup();
    await store.close();
    await pool.end();
  });

  it('keeps replay idempotent, applies only newer provider data, and preserves axes and UUIDs', async () => {
    const initialAttempt = attempt(
      baseBody,
      new Date('2026-07-15T01:00:00.000Z'),
      'initial',
    );
    await beginAndArchive(runIds.initial, initialAttempt);
    await expect(complete(runIds.initial, baseFeed, initialAttempt)).resolves.toMatchObject({
      recordsSeen: 2,
      recordsInserted: 2,
      recordsUpdated: 0,
      recordsUnchanged: 0,
    });

    const initialSnapshots = await snapshots();
    expect(initialSnapshots).toHaveLength(2);
    const initialFirst = initialSnapshots[0];
    expect(initialFirst).toBeDefined();
    expect(initialFirst).toMatchObject({
      collection_run_id: runIds.initial,
      longitude: 151.2093,
      latitude: -33.8688,
    });

    const replayAttempt = attempt(
      baseBody,
      new Date('2026-07-15T02:00:00.000Z'),
      'replay',
    );
    await beginAndArchive(runIds.replay, replayAttempt);
    await expect(complete(runIds.replay, baseFeed, replayAttempt)).resolves.toMatchObject({
      recordsSeen: 2,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 2,
    });

    const changedAttempt = attempt(
      changedBody,
      new Date('2026-07-15T03:00:00.000Z'),
      'changed',
    );
    await beginAndArchive(runIds.changed, changedAttempt);
    await expect(complete(runIds.changed, changedFeed, changedAttempt)).resolves.toMatchObject({
      recordsSeen: 2,
      recordsInserted: 0,
      recordsUpdated: 1,
      recordsUnchanged: 1,
    });

    const reprocessAttempt = attempt(
      changedBody,
      new Date('2026-07-15T03:30:00.000Z'),
      'reprocess',
    );
    await beginAndArchive(runIds.reprocess, reprocessAttempt);
    await expect(
      complete(runIds.reprocess, changedFeed, reprocessAttempt, 'usgs-test-v2', 2),
    ).resolves.toMatchObject({
      recordsSeen: 2,
      recordsInserted: 0,
      recordsUpdated: 2,
      recordsUnchanged: 0,
    });

    const staleAttempt = attempt(
      baseBody,
      new Date('2026-07-15T04:00:00.000Z'),
      'stale',
    );
    await beginAndArchive(runIds.stale, staleAttempt);
    await expect(complete(runIds.stale, baseFeed, staleAttempt)).resolves.toMatchObject({
      recordsSeen: 2,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 2,
    });

    const finalSnapshots = await snapshots();
    expect(finalSnapshots).toHaveLength(2);
    const finalFirst = finalSnapshots[0];
    expect(finalFirst).toBeDefined();
    expect(finalFirst).toMatchObject({
      raw_id: initialFirst?.raw_id,
      event_id: initialFirst?.event_id,
      collection_run_id: runIds.reprocess,
      first_seen_at: initialAttempt.responseReceivedAt,
      last_seen_at: staleAttempt.responseReceivedAt,
      observed_at: reprocessAttempt.responseReceivedAt,
      source_updated_at: changedFeed.records[0]?.sourceUpdatedAt,
      content_hash: reprocessAttempt.archive.contentHash,
      archive_path: reprocessAttempt.archive.relativePath,
      raw_parser_version: 'usgs-test-v2',
      raw_schema_version: 2,
      event_updated_at: changedFeed.records[0]?.sourceUpdatedAt,
      event_parser_version: 'usgs-test-v2',
      magnitude: 6.4,
      place: 'Revised integration fixture location',
      longitude: 151.2093,
      latitude: -33.8688,
    });
    expect(finalFirst?.payload).toMatchObject({
      id: eventIds[0],
      properties: {
        mag: 6.4,
        place: 'Revised integration fixture location',
      },
    });

    const rawCount = await pool.query<CountRow>(
      `SELECT COUNT(*)::integer AS count
       FROM raw_observations
       WHERE source_id = $1
         AND source_record_id = ANY($2::text[])`,
      [sourceId, eventIds],
    );
    const eventCount = await pool.query<CountRow>(
      `SELECT COUNT(*)::integer AS count
       FROM seismic_events
       WHERE source_id = $1
         AND source_event_id = ANY($2::text[])`,
      [sourceId, eventIds],
    );
    const runCount = await pool.query<CountRow>(
      'SELECT COUNT(*)::integer AS count FROM collection_runs WHERE id = ANY($1::uuid[])',
      [allRunIds],
    );
    expect(rawCount.rows[0]?.count).toBe(2);
    expect(eventCount.rows[0]?.count).toBe(2);
    expect(runCount.rows[0]?.count).toBe(5);

    const runs = await pool.query<RunRow>(
      `SELECT
         id,
         status,
         error,
         metrics,
         request_started_at,
         response_received_at,
         completed_at,
         retry_not_before
       FROM collection_runs
       WHERE id = ANY($1::uuid[])
       ORDER BY started_at`,
      [allRunIds],
    );
    expect(runs.rows).toHaveLength(5);
    expect(runs.rows.every((row) => row.status === 'succeeded')).toBe(true);
    expect(runs.rows[0]).toMatchObject({
      request_started_at: initialAttempt.raw.requestStartedAt,
      response_received_at: initialAttempt.raw.responseReceivedAt,
    });
    completedAtNotBefore(runs.rows[0], initialAttempt.completedAt);
    expect(runs.rows[2]?.metrics).toMatchObject({
      fixture: true,
      records_seen: 2,
      records_inserted: 0,
      records_updated: 1,
      records_unchanged: 1,
    });
    expect(runs.rows[3]?.metrics).toMatchObject({
      fixture: true,
      records_seen: 2,
      records_inserted: 0,
      records_updated: 2,
      records_reprocessed: 2,
      records_unchanged: 0,
    });
    latestSuccessCompletedAt = completedAtNotBefore(
      runs.rows[4],
      staleAttempt.completedAt,
    );

    await expect(store.getSourceHealth(sourceId)).resolves.toMatchObject({
      latestStatus: 'succeeded',
      lastCompletedAt: latestSuccessCompletedAt,
      lastErrorAt: null,
      lastSuccessAt: latestSuccessCompletedAt,
      latestStartedAt: staleAttempt.raw.requestStartedAt,
      runningCount: 0,
    });
  });

  it('rolls back the whole snapshot transaction on equal-timestamp content conflict', async () => {
    const before = await snapshots();
    const conflictBody = atomicConflictFixtureBody(changedFeed);
    const conflictFeed = normaliseUsgsEarthquakeFeed(conflictBody);
    const conflictAttempt = attempt(
      conflictBody,
      new Date('2026-07-15T05:00:00.000Z'),
      'atomic-conflict',
    );
    await beginAndArchive(runIds.atomicConflict, conflictAttempt);

    await expect(
      complete(
        runIds.atomicConflict,
        conflictFeed,
        conflictAttempt,
        'usgs-test-v2',
        2,
      ),
    ).rejects.toThrow(
      `Provider record ${eventIds[1]} changed without advancing its updated timestamp`,
    );

    await expect(snapshots()).resolves.toEqual(before);
    const failed = await pool.query<RunRow>(
      `SELECT
         id, status, error, metrics, request_started_at,
         response_received_at, completed_at, retry_not_before
       FROM collection_runs
       WHERE id = $1`,
      [runIds.atomicConflict],
    );
    expect(failed.rows[0]).toMatchObject({
      id: runIds.atomicConflict,
      status: 'failed',
      error: {
        stage: 'database_completion',
        message: `Provider record ${eventIds[1]} changed without advancing its updated timestamp`,
      },
      metrics: { fixture: true },
      request_started_at: conflictAttempt.raw.requestStartedAt,
      response_received_at: conflictAttempt.responseReceivedAt,
      retry_not_before: null,
    });
    completedAtNotBefore(failed.rows[0], conflictAttempt.completedAt);
  });

  it('persists a provider retry deadline and clamps a backwards failure time', async () => {
    const retryAttempt = attempt(
      baseBody,
      new Date('2026-07-15T06:00:00.000Z'),
      'retry-deadline',
    );
    retryAttempt.raw.status = 429;
    retryAttempt.raw.headers['retry-after'] = '3600';
    await beginAndArchive(runIds.retryDeadline, retryAttempt);

    const retryNotBefore = new Date('2099-01-01T00:00:00.000Z');
    await expect(
      store.failRun({
        runId: runIds.retryDeadline,
        sourceId,
        completedAt: new Date('2026-07-15T05:59:00.000Z'),
        retryNotBefore,
        error: {
          stage: 'http',
          message: 'Rate limited by provider',
          retryable: true,
        },
      }),
    ).resolves.toBe(true);

    await expect(store.getRetryNotBefore(sourceId)).resolves.toEqual(retryNotBefore);
    const result = await pool.query<RunRow>(
      `SELECT
         id, status, error, metrics, request_started_at,
         response_received_at, completed_at, retry_not_before
       FROM collection_runs
       WHERE id = $1`,
      [runIds.retryDeadline],
    );
    expect(result.rows[0]).toMatchObject({
      id: runIds.retryDeadline,
      status: 'failed',
      error: {
        stage: 'http',
        retryable: true,
      },
      metrics: {
        completion_time_clamped: true,
        reported_completed_at: '2026-07-15T05:59:00+00:00',
      },
      request_started_at: retryAttempt.raw.requestStartedAt,
      response_received_at: retryAttempt.responseReceivedAt,
      retry_not_before: retryNotBefore,
    });
    completedAtNotBefore(result.rows[0], retryAttempt.responseReceivedAt);
  });

  it('retains exact response evidence when archive publication fails', async () => {
    const archiveFailureAttempt = attempt(
      baseBody,
      new Date('2026-07-15T07:00:00.000Z'),
      'archive-failure',
    );
    await store.beginRun({
      runId: runIds.archiveFailure,
      sourceId,
      startedAt: new Date(archiveFailureAttempt.raw.requestStartedAt.getTime() - 250),
      endpoint,
      collectorVersion: 'postgres-store-integration-test',
    });
    await store.recordResponseMetadata({
      runId: runIds.archiveFailure,
      sourceId,
      raw: archiveFailureAttempt.raw,
    });
    await store.failRun({
      runId: runIds.archiveFailure,
      sourceId,
      completedAt: archiveFailureAttempt.completedAt,
      error: {
        stage: 'archive',
        message: 'Fixture archive publication failed',
        retryable: false,
      },
    });

    const result = await pool.query<RunRow>(
      `SELECT
         id, status, error, metrics, request_started_at,
         response_received_at, completed_at, retry_not_before,
         http_status, content_hash, archive_path
       FROM collection_runs
       WHERE id = $1`,
      [runIds.archiveFailure],
    );
    expect(result.rows[0]).toMatchObject({
      id: runIds.archiveFailure,
      status: 'failed',
      error: {
        stage: 'archive',
        retryable: false,
      },
      request_started_at: archiveFailureAttempt.raw.requestStartedAt,
      response_received_at: archiveFailureAttempt.raw.responseReceivedAt,
      http_status: 200,
      content_hash: archiveFailureAttempt.archive.contentHash,
      archive_path: null,
    });
    latestTerminalCompletedAt = completedAtNotBefore(
      result.rows[0],
      archiveFailureAttempt.completedAt,
    );
  });

  it('reports latest start separately from the latest terminal completion', async () => {
    const latestStartedAt = new Date('2026-07-15T08:00:00.000Z');
    await store.beginRun({
      runId: runIds.latestRunning,
      sourceId,
      startedAt: latestStartedAt,
      endpoint,
      collectorVersion: 'postgres-store-integration-test',
    });

    await expect(store.getSourceHealth(sourceId)).resolves.toMatchObject({
      latestStatus: 'running',
      latestStartedAt,
      lastCompletedAt: latestTerminalCompletedAt,
      lastSuccessAt: latestSuccessCompletedAt,
      runningCount: 1,
    });

    await expect(
      store.recoverStaleRuns(sourceId, new Date('2026-07-15T09:00:00.000Z')),
    ).resolves.toBe(1);
  });

  it('recovers an interrupted stale run as a recorded failure', async () => {
    const startedAt = new Date('2026-07-10T00:00:00.000Z');
    await store.beginRun({
      runId: runIds.recovery,
      sourceId,
      startedAt,
      endpoint,
      collectorVersion: 'postgres-store-integration-test',
    });

    await expect(
      store.recoverStaleRuns(sourceId, new Date('2026-07-11T00:00:00.000Z')),
    ).resolves.toBe(1);

    const result = await pool.query<RunRow>(
      'SELECT id, status, error, metrics FROM collection_runs WHERE id = $1',
      [runIds.recovery],
    );
    expect(result.rows[0]).toMatchObject({
      id: runIds.recovery,
      status: 'failed',
      error: {
        stage: 'recovery',
        name: 'InterruptedCollectionRun',
        retryable: true,
      },
      metrics: { recovered_as_stale: true },
    });
  });
});

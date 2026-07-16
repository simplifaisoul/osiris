import { randomUUID } from 'node:crypto';

import { Pool, type QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  EarthquakeDatabaseDataError,
  PostgresEarthquakeDatabase,
  resolveEarthquakePoolConfig,
  type EarthquakeQueryExecutor,
} from './database-source';
import { expectedFixtureEarthquakes } from './test-fixture';

class StubExecutor implements EarthquakeQueryExecutor {
  readonly calls: Array<{ queryText: string; values: unknown[] }> = [];

  constructor(private readonly rows: QueryResultRow[]) {}

  async query<Row extends QueryResultRow>(
    queryText: string,
    values: unknown[],
  ): Promise<{ rows: Row[] }> {
    this.calls.push({ queryText, values });
    return { rows: this.rows as Row[] };
  }
}

const responseReceivedAt = new Date('2026-01-01T00:01:00.000Z');
const upstreamTimestamp = new Date('2026-01-01T00:00:00.000Z');

function databaseRows(recordCount = 2): QueryResultRow[] {
  return [
    {
      response_received_at: responseReceivedAt,
      upstream_timestamp: upstreamTimestamp,
      record_count: recordCount,
      source_event_id: 'test-us-001',
      latitude: -33.8688,
      longitude: 151.2093,
      depth_km: 12.5,
      magnitude: 5.2,
      place: '42 km E of Test Harbour',
      time_ms: 1767222000123,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test-us-001',
      tsunami: 1,
      event_type: 'earthquake',
      felt: 27,
      alert: 'green',
    },
    {
      response_received_at: responseReceivedAt,
      upstream_timestamp: upstreamTimestamp,
      record_count: recordCount,
      source_event_id: 'test-us-002',
      latitude: 37.7749,
      longitude: -122.4194,
      depth_km: -1.25,
      magnitude: null,
      place: null,
      time_ms: 1767218400000,
      url: null,
      tsunami: 0,
      event_type: null,
      felt: null,
      alert: null,
    },
  ];
}

describe('PostgresEarthquakeDatabase', () => {
  it('maps the latest complete database snapshot to the live contract', async () => {
    const executor = new StubExecutor(databaseRows());
    const database = new PostgresEarthquakeDatabase(executor);

    await expect(database.loadSnapshot()).resolves.toEqual({
      earthquakes: expectedFixtureEarthquakes,
      responseReceivedAt,
      upstreamTimestamp,
    });

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]?.values).toEqual(['usgs-earthquakes']);
    expect(executor.calls[0]?.queryText).toContain(
      'raw.last_seen_at = latest_success.response_received_at',
    );
    expect(executor.calls[0]?.queryText).toContain('legacy_provenance_incomplete = FALSE');
    expect(executor.calls[0]?.queryText).not.toContain('upstream_timestamp IS NOT NULL');
  });

  it('keeps a complete zero-record feed as a valid empty snapshot', async () => {
    const database = new PostgresEarthquakeDatabase(new StubExecutor([{
      response_received_at: responseReceivedAt,
      upstream_timestamp: upstreamTimestamp,
      record_count: 0,
      source_event_id: null,
    }]));

    await expect(database.loadSnapshot()).resolves.toEqual({
      earthquakes: [],
      responseReceivedAt,
      upstreamTimestamp,
    });
  });

  it('rejects incomplete normalisation instead of serving a partial feed', async () => {
    const database = new PostgresEarthquakeDatabase(new StubExecutor(databaseRows(3)));

    await expect(database.loadSnapshot()).rejects.toThrow(EarthquakeDatabaseDataError);
    await expect(database.loadSnapshot()).rejects.toThrow(
      'Database snapshot count mismatch: expected 3, found 2',
    );
  });
});

describe('resolveEarthquakePoolConfig', () => {
  it('keeps PostgreSQL optional when no connection is configured', () => {
    expect(resolveEarthquakePoolConfig({})).toBeNull();
  });

  it('uses a validated host connection URL', () => {
    expect(resolveEarthquakePoolConfig({
      DATABASE_URL: 'postgresql://osiris:secret@127.0.0.1:5432/osiris_worldstate',
    })).toMatchObject({
      application_name: 'osiris-earthquake-api',
      connectionString: 'postgresql://osiris:secret@127.0.0.1:5432/osiris_worldstate',
      connectionTimeoutMillis: 5_000,
      max: 5,
    });
  });

  it('prefers complete container-safe discrete settings', () => {
    expect(resolveEarthquakePoolConfig({
      DATABASE_URL: 'postgresql://ignored:ignored@127.0.0.1:5432/ignored',
      WORLDSTATE_PGDATABASE: 'osiris_worldstate',
      WORLDSTATE_PGHOST: 'db',
      WORLDSTATE_PGPASSWORD: ' secret with spaces ',
      WORLDSTATE_PGPORT: '5432',
      WORLDSTATE_PGUSER: 'osiris',
    })).toMatchObject({
      database: 'osiris_worldstate',
      host: 'db',
      password: ' secret with spaces ',
      port: 5432,
      user: 'osiris',
    });
  });
});

const databaseIt = process.env.TEST_DATABASE_URL ? it : it.skip;

describe('PostgresEarthquakeDatabase (integration)', () => {
  databaseIt('returns only membership of the latest successful feed', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    const firstRunId = randomUUID();
    const secondRunId = randomUUID();
    const incompleteRunId = randomUUID();
    const oldRawId = randomUUID();
    const currentRawId = randomUUID();

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO collection_runs (
           id, source_id, started_at, request_started_at, response_received_at,
           completed_at, upstream_timestamp, status, endpoint, http_status,
           content_type, content_hash, archive_path, record_count,
           collector_version, parser_version, metrics
         ) VALUES
         ($1, 'usgs-earthquakes', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z',
          '2026-01-01T00:00:02Z', '2026-01-01T00:06:00Z', '2026-01-01T00:00:00Z',
          'succeeded', 'fixture://first-feed', 200, 'application/json', $3,
          'usgs/2026/01/01/first.json.gz', 2, 'integration', 'integration', '{}'::jsonb),
         ($2, 'usgs-earthquakes', '2026-01-01T00:05:00Z', '2026-01-01T00:05:01Z',
          '2026-01-01T00:05:02Z', '2026-01-01T00:05:03Z', '2026-01-01T00:05:00Z',
          'succeeded', 'fixture://second-feed', 200, 'application/json', $4,
          'usgs/2026/01/01/second.json.gz', 1, 'integration', 'integration', '{}'::jsonb)`,
        [firstRunId, secondRunId, 'a'.repeat(64), 'b'.repeat(64)],
      );
      await client.query(
        `INSERT INTO raw_observations (
           id, source_id, collection_run_id, source_record_id, observed_at,
           occurred_at, source_updated_at, first_seen_at, last_seen_at,
           content_hash, archive_path, payload, schema_version, parser_version,
           evidence_classification, metadata
         ) VALUES
         ($1, 'usgs-earthquakes', $2, 'event-no-longer-current', '2026-01-01T00:00:02Z',
          '2025-12-31T23:55:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:02Z',
          '2026-01-01T00:00:02Z', $5, 'first.json.gz', '{}'::jsonb, 1,
          'integration', 'reported', '{}'::jsonb),
         ($3, 'usgs-earthquakes', $4, 'event-current', '2026-01-01T00:00:02Z',
          '2026-01-01T00:04:00Z', '2026-01-01T00:05:00Z', '2026-01-01T00:05:02Z',
          '2026-01-01T00:05:02Z', $6, 'second.json.gz', '{}'::jsonb, 1,
          'integration', 'reported', '{}'::jsonb)`,
        [oldRawId, firstRunId, currentRawId, firstRunId, 'c'.repeat(64), 'd'.repeat(64)],
      );
      await client.query(
        `INSERT INTO seismic_events (
           id, source_id, source_event_id, occurred_at, updated_at, magnitude,
           depth_km, place, tsunami, felt, alert, event_type, geometry,
           raw_observation_id, evidence_classification, parser_version, metadata
         ) VALUES
         ($1, 'usgs-earthquakes', 'event-no-longer-current', '2025-12-31T23:55:00Z',
          '2026-01-01T00:00:00Z', 4.1, 9.5, 'Old event', FALSE, NULL, NULL,
          'earthquake', ST_SetSRID(ST_MakePoint(10, 20), 4326), $2, 'reported',
          'integration', '{"compatibility":{"url":null}}'::jsonb),
         ($3, 'usgs-earthquakes', 'event-current', '2026-01-01T00:04:00Z',
          '2026-01-01T00:05:00Z', 5.4, 11.25, 'Current event', TRUE, 3, 'green',
          'earthquake', ST_SetSRID(ST_MakePoint(151.2, -33.8), 4326), $4, 'reported',
          'integration', '{"compatibility":{"url":"https://earthquake.usgs.gov/earthquakes/eventpage/event-current"}}'::jsonb)`,
        [randomUUID(), oldRawId, randomUUID(), currentRawId],
      );

      const database = new PostgresEarthquakeDatabase(client);
      await expect(database.loadSnapshot()).resolves.toEqual({
        earthquakes: [
          {
            id: 'event-current',
            lat: -33.8,
            lng: 151.2,
            depth: 11.25,
            magnitude: 5.4,
            place: 'Current event',
            time: 1767225840000,
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/event-current',
            tsunami: 1,
            type: 'earthquake',
            felt: 3,
            alert: 'green',
          },
        ],
        responseReceivedAt: new Date('2026-01-01T00:05:02.000Z'),
        upstreamTimestamp: new Date('2026-01-01T00:05:00.000Z'),
      });

      // Migration 0007 permits a successful run without an upstream timestamp.
      // It must become the selected latest run and be treated as incomplete by
      // the service; the query must never skip back to an older fresh snapshot.
      await client.query(
        `INSERT INTO collection_runs (
           id, source_id, started_at, request_started_at, response_received_at,
           completed_at, upstream_timestamp, status, endpoint, http_status,
           content_type, content_hash, archive_path, record_count,
           collector_version, parser_version, metrics
         ) VALUES (
           $1, 'usgs-earthquakes', '2026-01-01T00:10:00Z', '2026-01-01T00:10:01Z',
           '2026-01-01T00:10:02Z', '2026-01-01T00:10:03Z', NULL, 'succeeded',
           'fixture://incomplete-latest-feed', 200, 'application/json', $2,
           'usgs/2026/01/01/incomplete.json.gz', 0, 'integration', 'integration',
           '{}'::jsonb
         )`,
        [incompleteRunId, 'e'.repeat(64)],
      );
      await expect(database.loadSnapshot()).resolves.toEqual({
        earthquakes: [],
        responseReceivedAt: new Date('2026-01-01T00:10:02.000Z'),
        upstreamTimestamp: null,
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});

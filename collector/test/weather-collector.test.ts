import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  WeatherCollector,
  type WeatherArchiveWriter,
  type WeatherCollectionStore,
  type WeatherFetcher,
} from '../src/collectors/weather-sources.js';
import { NASA_EONET_WEATHER_SOURCE_ID } from '../src/normalisers/weather.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteWeatherRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let eonetFixture: Buffer;

beforeAll(async () => {
  eonetFixture = await readFile(new URL('./fixtures/nasa-eonet-weather.json', import.meta.url));
});

function response(body: Buffer): RawResponse {
  return {
    endpoint: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status: 200,
    contentType: 'application/json',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

class FakeStore implements WeatherCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteWeatherRunInput[] = [];
  readonly failed: FailRunInput[] = [];
  readonly events: string[] = [];
  readonly published: RecordPublishedArchiveInput[] = [];
  readonly responses: RecordResponseMetadataInput[] = [];

  async recoverStaleRuns(): Promise<number> {
    this.events.push('recover');
    return 0;
  }

  async beginRun(input: BeginRunInput): Promise<void> {
    this.begun.push(input);
    this.events.push(`begin:${input.sourceId}`);
  }

  async recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void> {
    this.responses.push(input);
    this.events.push(`response:${input.sourceId}`);
  }

  async recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void> {
    this.published.push(input);
    this.events.push(`publish:${input.sourceId}`);
  }

  async completeWeatherRun(input: CompleteWeatherRunInput) {
    this.completed.push(input);
    this.events.push(`complete:${input.sourceId}`);
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
    this.events.push(`fail:${input.sourceId}`);
    return true;
  }
}

describe('WeatherCollector', () => {
  it('archives weather JSON bytes before normalising events', async () => {
    const store = new FakeStore();
    const archiveInputs: ArchiveWriteInput[] = [];
    const fetcher: WeatherFetcher = {
      fetch: vi.fn(async () => {
        store.events.push('fetch');
        return response(eonetFixture);
      }),
    };
    const archiveWriter: WeatherArchiveWriter = {
      write: vi.fn(async (input: ArchiveWriteInput) => {
        store.events.push('archive');
        archiveInputs.push(input);
        return {
          relativePath: `${input.sourceId}/fixture.json.gz`,
          absolutePath: `/archive/${input.sourceId}/fixture.json.gz`,
          contentHash: 'e'.repeat(64),
          compressedBytes: input.body.byteLength,
          created: true,
        };
      }),
    };
    const collector = new WeatherCollector({
      archiveWriter,
      clock: () => new Date('2026-01-01T00:00:02.000Z'),
      endpoint: new URL('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100'),
      fetcher,
      logger: createLogger('silent'),
      maxAttempts: 1,
      retryBaseMs: 500,
      runIdFactory: () => '50000000-0000-4000-8000-000000000001',
      sourceId: NASA_EONET_WEATHER_SOURCE_ID,
      staleRunAfterMs: 900_000,
      store,
    });

    const result = await collector.collect();

    expect(archiveInputs[0]?.body).toEqual(eonetFixture);
    expect(archiveInputs[0]?.extension).toBe('json');
    expect(store.completed[0]?.parsed.records).toHaveLength(2);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });
});

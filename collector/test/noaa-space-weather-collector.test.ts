import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  NoaaSpaceWeatherCollector,
  type NoaaSpaceWeatherArchiveWriter,
  type NoaaSpaceWeatherCollectionStore,
  type NoaaSpaceWeatherFetcher,
} from '../src/collectors/noaa-space-weather.js';
import { NOAA_SWPC_KP_SOURCE_ID } from '../src/normalisers/noaa-space-weather.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteSpaceWeatherRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let kpFixture: Buffer;

beforeAll(async () => {
  kpFixture = await readFile(new URL('./fixtures/noaa-swpc-kp.json', import.meta.url));
});

function response(body: Buffer): RawResponse {
  return {
    endpoint: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status: 200,
    contentType: 'application/json',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

class FakeStore implements NoaaSpaceWeatherCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteSpaceWeatherRunInput[] = [];
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

  async completeSpaceWeatherRun(input: CompleteSpaceWeatherRunInput) {
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

describe('NoaaSpaceWeatherCollector', () => {
  it('archives NOAA JSON bytes before normalising space-weather observations', async () => {
    const store = new FakeStore();
    const archiveInputs: ArchiveWriteInput[] = [];
    const fetcher: NoaaSpaceWeatherFetcher = {
      fetch: vi.fn(async () => {
        store.events.push('fetch');
        return response(kpFixture);
      }),
    };
    const archiveWriter: NoaaSpaceWeatherArchiveWriter = {
      write: vi.fn(async (input: ArchiveWriteInput) => {
        store.events.push('archive');
        archiveInputs.push(input);
        return {
          relativePath: `${input.sourceId}/fixture.json.gz`,
          absolutePath: `/archive/${input.sourceId}/fixture.json.gz`,
          contentHash: 'd'.repeat(64),
          compressedBytes: input.body.byteLength,
          created: true,
        };
      }),
    };
    const collector = new NoaaSpaceWeatherCollector({
      archiveWriter,
      clock: () => new Date('2026-01-01T00:00:02.000Z'),
      endpoint: new URL('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'),
      fetcher,
      logger: createLogger('silent'),
      maxAttempts: 1,
      retryBaseMs: 500,
      runIdFactory: () => '40000000-0000-4000-8000-000000000001',
      sourceId: NOAA_SWPC_KP_SOURCE_ID,
      staleRunAfterMs: 900_000,
      store,
    });

    const result = await collector.collect();

    expect(archiveInputs[0]?.body).toEqual(kpFixture);
    expect(archiveInputs[0]?.extension).toBe('json');
    expect(store.completed[0]?.parsed.records).toHaveLength(2);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });
});

import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  SatelliteCollector,
  type SatelliteArchiveWriter,
  type SatelliteCollectionStore,
  type SatelliteFetcher,
} from '../src/collectors/satellite-sources.js';
import { CELESTRAK_ACTIVE_SOURCE_ID } from '../src/normalisers/satellites.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteSatelliteRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let activeFixture: Buffer;

beforeAll(async () => {
  activeFixture = await readFile(new URL('./fixtures/celestrak-active.tle', import.meta.url));
});

function response(body: Buffer): RawResponse {
  return {
    endpoint: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status: 200,
    contentType: 'text/plain',
    headers: { 'content-type': 'text/plain' },
    body,
  };
}

class FakeStore implements SatelliteCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteSatelliteRunInput[] = [];
  readonly failed: FailRunInput[] = [];
  readonly published: RecordPublishedArchiveInput[] = [];
  readonly responses: RecordResponseMetadataInput[] = [];

  async recoverStaleRuns(): Promise<number> {
    return 0;
  }

  async beginRun(input: BeginRunInput): Promise<void> {
    this.begun.push(input);
  }

  async recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void> {
    this.responses.push(input);
  }

  async recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void> {
    this.published.push(input);
  }

  async completeSatelliteRun(input: CompleteSatelliteRunInput) {
    this.completed.push(input);
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
    return true;
  }
}

describe('SatelliteCollector', () => {
  it('archives satellite bytes before normalising TLE records', async () => {
    const store = new FakeStore();
    const archiveInputs: ArchiveWriteInput[] = [];
    const fetcher: SatelliteFetcher = {
      fetch: vi.fn(async () => response(activeFixture)),
    };
    const archiveWriter: SatelliteArchiveWriter = {
      write: vi.fn(async (input: ArchiveWriteInput) => {
        archiveInputs.push(input);
        return {
          relativePath: `${input.sourceId}/fixture.${input.extension}.gz`,
          absolutePath: `/archive/${input.sourceId}/fixture.${input.extension}.gz`,
          contentHash: 'f'.repeat(64),
          compressedBytes: input.body.byteLength,
          created: true,
        };
      }),
    };
    const collector = new SatelliteCollector({
      archiveWriter,
      clock: () => new Date('2026-01-01T00:00:02.000Z'),
      endpoint: new URL('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'),
      fetcher,
      logger: createLogger('silent'),
      maxAttempts: 1,
      retryBaseMs: 500,
      runIdFactory: () => '60000000-0000-4000-8000-000000000001',
      sourceId: CELESTRAK_ACTIVE_SOURCE_ID,
      staleRunAfterMs: 900_000,
      store,
    });

    const result = await collector.collect();

    expect(archiveInputs[0]?.body).toEqual(activeFixture);
    expect(archiveInputs[0]?.extension).toBe('tle');
    expect(store.completed[0]?.parsed.records).toHaveLength(2);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });
});

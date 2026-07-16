import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ThreatIntelCollector,
  type ThreatIntelArchiveWriter,
  type ThreatIntelCollectionStore,
  type ThreatIntelFetcher,
} from '../src/collectors/threat-intel-sources.js';
import { ABUSECH_FEODO_SOURCE_ID } from '../src/normalisers/threat-intel.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteThreatIntelRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let feodoFixture: Buffer;

beforeAll(async () => {
  feodoFixture = await readFile(new URL('./fixtures/abusech-feodo-ipblocklist.json', import.meta.url));
});

function response(body: Buffer): RawResponse {
  return {
    endpoint: 'https://feodotracker.abuse.ch/downloads/ipblocklist.json',
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status: 200,
    contentType: 'application/json',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

class FakeStore implements ThreatIntelCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteThreatIntelRunInput[] = [];
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

  async completeThreatIntelRun(input: CompleteThreatIntelRunInput) {
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

describe('ThreatIntelCollector', () => {
  it('archives threat intel bytes before normalising indicators', async () => {
    const store = new FakeStore();
    const archiveInputs: ArchiveWriteInput[] = [];
    const fetcher: ThreatIntelFetcher = {
      fetch: vi.fn(async () => response(feodoFixture)),
    };
    const archiveWriter: ThreatIntelArchiveWriter = {
      write: vi.fn(async (input: ArchiveWriteInput) => {
        archiveInputs.push(input);
        return {
          relativePath: `${input.sourceId}/fixture.json.gz`,
          absolutePath: `/archive/${input.sourceId}/fixture.json.gz`,
          contentHash: 'f'.repeat(64),
          compressedBytes: input.body.byteLength,
          created: true,
        };
      }),
    };
    const collector = new ThreatIntelCollector({
      archiveWriter,
      clock: () => new Date('2026-01-01T00:00:02.000Z'),
      endpoint: new URL('https://feodotracker.abuse.ch/downloads/ipblocklist.json'),
      fetcher,
      logger: createLogger('silent'),
      maxAttempts: 1,
      retryBaseMs: 500,
      runIdFactory: () => '60000000-0000-4000-8000-000000000001',
      sourceId: ABUSECH_FEODO_SOURCE_ID,
      staleRunAfterMs: 900_000,
      store,
    });

    const result = await collector.collect();

    expect(archiveInputs[0]?.body).toEqual(feodoFixture);
    expect(archiveInputs[0]?.extension).toBe('json');
    expect(store.completed[0]?.parsed.records).toHaveLength(1);
    expect(result).toMatchObject({ recordsSeen: 1, retryCount: 0 });
  });
});

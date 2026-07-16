import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  NasaEonetVolcanoCollector,
  NasaFirmsCollector,
  type NasaFireArchiveWriter,
  type NasaFireCollectionStore,
  type NasaFireFetcher,
} from '../src/collectors/nasa-fire-sources.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteEonetRunInput,
  CompleteFirmsRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let firmsFixture: Buffer;
let eonetFixture: Buffer;

beforeAll(async () => {
  firmsFixture = await readFile(new URL('./fixtures/nasa-firms-viirs.csv', import.meta.url));
  eonetFixture = await readFile(new URL('./fixtures/nasa-eonet-volcanoes.json', import.meta.url));
});

function response(endpoint: string, body: Buffer, contentType: string): RawResponse {
  return {
    endpoint,
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status: 200,
    contentType,
    headers: { 'content-type': contentType },
    body,
  };
}

class FakeStore implements NasaFireCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completedEonet: CompleteEonetRunInput[] = [];
  readonly completedFirms: CompleteFirmsRunInput[] = [];
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

  async completeFirmsRun(input: CompleteFirmsRunInput) {
    this.completedFirms.push(input);
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

  async completeEonetRun(input: CompleteEonetRunInput) {
    this.completedEonet.push(input);
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

function dependencies(raw: RawResponse) {
  const store = new FakeStore();
  const archiveInputs: ArchiveWriteInput[] = [];
  const fetcher: NasaFireFetcher = {
    fetch: vi.fn(async () => {
      store.events.push('fetch');
      return raw;
    }),
  };
  const archiveWriter: NasaFireArchiveWriter = {
    write: vi.fn(async (input: ArchiveWriteInput) => {
      store.events.push('archive');
      archiveInputs.push(input);
      return {
        relativePath: `${input.sourceId}/fixture.${input.extension}.gz`,
        absolutePath: `/archive/${input.sourceId}/fixture.${input.extension}.gz`,
        contentHash: 'c'.repeat(64),
        compressedBytes: input.body.byteLength,
        created: true,
      };
    }),
  };
  const common = {
    archiveWriter,
    clock: () => new Date('2026-01-01T00:00:02.000Z'),
    fetcher,
    logger: createLogger('silent'),
    maxAttempts: 1,
    retryBaseMs: 500,
    runIdFactory: () => '30000000-0000-4000-8000-000000000001',
    staleRunAfterMs: 900_000,
    store,
  };
  return { archiveInputs, common, store };
}

describe('NASA fire source collectors', () => {
  it('archives FIRMS CSV before normalising detections', async () => {
    const context = dependencies(
      response('https://firms.modaps.eosdis.nasa.gov/data.csv', firmsFixture, 'text/csv'),
    );
    const collector = new NasaFirmsCollector({
      ...context.common,
      endpoint: new URL('https://firms.modaps.eosdis.nasa.gov/data.csv'),
      sourceId: 'nasa-firms-viirs',
    });

    const result = await collector.collect();

    expect(context.archiveInputs[0]?.body).toEqual(firmsFixture);
    expect(context.archiveInputs[0]?.extension).toBe('csv');
    expect(context.store.completedFirms[0]?.parsed.records).toHaveLength(2);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });

  it('archives EONET JSON before normalising volcano events', async () => {
    const context = dependencies(
      response('https://eonet.gsfc.nasa.gov/api/v3/events', eonetFixture, 'application/json'),
    );
    const collector = new NasaEonetVolcanoCollector({
      ...context.common,
      endpoint: new URL('https://eonet.gsfc.nasa.gov/api/v3/events'),
    });

    const result = await collector.collect();

    expect(context.archiveInputs[0]?.body).toEqual(eonetFixture);
    expect(context.archiveInputs[0]?.extension).toBe('json');
    expect(context.store.completedEonet[0]?.parsed.records).toHaveLength(1);
    expect(result).toMatchObject({ recordsSeen: 1, retryCount: 0 });
  });
});

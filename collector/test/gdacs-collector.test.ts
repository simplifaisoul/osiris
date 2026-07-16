import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GdacsDisasterCollector,
  type GdacsArchiveWriter,
  type GdacsCollectionStore,
  type GdacsFetcher,
} from '../src/collectors/gdacs-disasters.js';
import { createLogger } from '../src/logger.js';
import type { RawResponse } from '../src/framework/http-fetcher.js';
import type {
  BeginRunInput,
  CompleteGdacsRunInput,
  FailRunInput,
  RecordPublishedArchiveInput,
  RecordResponseMetadataInput,
} from '../src/storage/postgres-store.js';
import type { ArchiveWriteInput } from '../src/storage/archive-writer.js';

let fixtureBody: Buffer;

beforeAll(async () => {
  fixtureBody = await readFile(new URL('./fixtures/gdacs-disasters.xml', import.meta.url));
});

function response(body: Buffer, status = 200): RawResponse {
  return {
    endpoint: 'https://www.gdacs.org/xml/rss.xml',
    requestStartedAt: new Date('2026-01-01T00:00:00.000Z'),
    responseReceivedAt: new Date('2026-01-01T00:00:01.000Z'),
    status,
    contentType: 'application/rss+xml',
    headers: { 'content-type': 'application/rss+xml' },
    body,
  };
}

class FakeStore implements GdacsCollectionStore {
  readonly begun: BeginRunInput[] = [];
  readonly completed: CompleteGdacsRunInput[] = [];
  readonly failed: FailRunInput[] = [];
  readonly events: string[] = [];
  readonly published: RecordPublishedArchiveInput[] = [];
  readonly responses: RecordResponseMetadataInput[] = [];

  async getRetryNotBefore(): Promise<Date | null> {
    return null;
  }

  async recoverStaleRuns(): Promise<number> {
    this.events.push('recover');
    return 0;
  }

  async beginRun(input: BeginRunInput): Promise<void> {
    this.begun.push(input);
    this.events.push(`begin:${input.runId}`);
  }

  async recordResponseMetadata(input: RecordResponseMetadataInput): Promise<void> {
    this.responses.push(input);
    this.events.push(`response:${input.runId}`);
  }

  async recordPublishedArchive(input: RecordPublishedArchiveInput): Promise<void> {
    this.published.push(input);
    this.events.push(`publish:${input.runId}`);
  }

  async completeGdacsRun(input: CompleteGdacsRunInput) {
    this.completed.push(input);
    this.events.push(`complete:${input.runId}`);
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
    this.events.push(`fail:${input.runId}`);
    return true;
  }
}

function dependencies(rawResponses: Array<RawResponse | Error>) {
  const store = new FakeStore();
  const archiveInputs: ArchiveWriteInput[] = [];
  const fetcher: GdacsFetcher = {
    fetch: vi.fn(async () => {
      store.events.push('fetch');
      const next = rawResponses.shift();
      if (next === undefined) throw new Error('No fake response remains');
      if (next instanceof Error) throw next;
      return next;
    }),
  };
  const archiveWriter: GdacsArchiveWriter = {
    write: vi.fn(async (input: ArchiveWriteInput) => {
      store.events.push('archive');
      archiveInputs.push(input);
      return {
        relativePath: `gdacs-disasters/fixture-${archiveInputs.length}.xml.gz`,
        absolutePath: `/archive/fixture-${archiveInputs.length}.xml.gz`,
        contentHash: 'b'.repeat(64),
        compressedBytes: input.body.byteLength,
        created: true,
      };
    }),
  };
  let clockTick = 0;
  const collector = new GdacsDisasterCollector({
    archiveWriter,
    clock: () => new Date(1_767_225_600_000 + clockTick++ * 1_000),
    endpoint: new URL('https://www.gdacs.org/xml/rss.xml'),
    fetcher,
    logger: createLogger('silent'),
    maxAttempts: 2,
    random: () => 0,
    retryBaseMs: 500,
    runIdFactory: () => '20000000-0000-4000-8000-000000000001',
    sleep: async () => undefined,
    staleRunAfterMs: 900_000,
    store,
  });

  return { archiveInputs, collector, store };
}

describe('GdacsDisasterCollector', () => {
  it('archives exact RSS bytes before parsing and database completion', async () => {
    const context = dependencies([response(fixtureBody)]);

    const result = await context.collector.collect();

    expect(context.archiveInputs[0]?.body).toEqual(fixtureBody);
    expect(context.archiveInputs[0]?.extension).toBe('xml');
    expect(context.store.completed[0]?.parsed.records).toHaveLength(2);
    expect(context.store.events).toEqual([
      'recover',
      'begin:20000000-0000-4000-8000-000000000001',
      'fetch',
      'archive',
      'response:20000000-0000-4000-8000-000000000001',
      'publish:20000000-0000-4000-8000-000000000001',
      'complete:20000000-0000-4000-8000-000000000001',
    ]);
    expect(result).toMatchObject({ recordsSeen: 2, retryCount: 0 });
  });

  it('marks malformed archived RSS as failed without normalised writes', async () => {
    const context = dependencies([response(Buffer.from('<rss><channel></channel></rss>'))]);

    await expect(context.collector.collect()).resolves.toMatchObject({ recordsSeen: 0 });

    expect(context.store.completed[0]?.parsed.records).toHaveLength(0);
    expect(context.store.failed).toHaveLength(0);
  });
});

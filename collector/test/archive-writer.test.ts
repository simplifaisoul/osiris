import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';

import { ArchiveWriter, sha256Hex } from '../src/storage/archive-writer.js';

const gunzipAsync = promisify(gunzip);
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'osiris-archive-writer-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('sha256Hex', () => {
  it('hashes the exact bytes', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('ArchiveWriter', () => {
  it('writes an exact gzip archive under a UTC content-addressed path', async () => {
    const root = await temporaryRoot();
    const writer = new ArchiveWriter(root);
    const timestamp = new Date('2026-07-15T04:05:06.789Z');
    const body = Buffer.from([0x00, 0xff, 0x7b, 0x0a, 0x7d]);

    const result = await writer.write({
      sourceId: 'usgs-earthquakes',
      timestamp,
      body,
      extension: 'geojson',
    });

    expect(result.created).toBe(true);
    expect(result.contentHash).toBe(sha256Hex(body));
    expect(result.relativePath).toBe(
      `usgs-earthquakes/2026/07/15/2026-07-15T04-05-06.789Z-${result.contentHash}.geojson.gz`,
    );
    expect(result.absolutePath).toBe(join(root, result.relativePath));

    const compressed = await readFile(result.absolutePath);
    expect(result.compressedBytes).toBe(compressed.byteLength);
    expect(await gunzipAsync(compressed)).toEqual(body);

    const directoryEntries = await readdir(join(root, 'usgs-earthquakes/2026/07/15'));
    expect(directoryEntries).toEqual([result.relativePath.split('/').at(-1)]);
  });

  it('publishes concurrent identical writes once without overwriting', async () => {
    const root = await temporaryRoot();
    const writer = new ArchiveWriter(root);
    const input = {
      sourceId: 'usgs-earthquakes',
      timestamp: new Date('2026-07-15T04:05:06.789Z'),
      body: Buffer.from('{"type":"FeatureCollection","features":[]}'),
      extension: '.geojson',
    };

    const results = await Promise.all([writer.write(input), writer.write(input)]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => !result.created)).toHaveLength(1);
    const [firstResult, secondResult] = results;
    if (!firstResult || !secondResult) {
      throw new Error('Expected two archive write results');
    }
    expect(firstResult.absolutePath).toBe(secondResult.absolutePath);

    const compressed = await readFile(firstResult.absolutePath);
    expect(await gunzipAsync(compressed)).toEqual(input.body);

    const directoryEntries = await readdir(join(root, 'usgs-earthquakes/2026/07/15'));
    expect(directoryEntries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
  });

  it('rejects a mismatched existing archive and removes its temporary file', async () => {
    const root = await temporaryRoot();
    const writer = new ArchiveWriter(root);
    const input = {
      sourceId: 'usgs-earthquakes',
      timestamp: new Date('2026-07-15T04:05:06.789Z'),
      body: Buffer.from('expected raw response'),
      extension: 'json',
    };
    const first = await writer.write(input);
    await writeFile(first.absolutePath, Buffer.from('not gzip'));

    await expect(writer.write(input)).rejects.toThrow(
      'Existing archive is not valid gzip data',
    );

    const directoryEntries = await readdir(join(root, 'usgs-earthquakes/2026/07/15'));
    expect(directoryEntries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
  });

  it('rejects path traversal inputs before writing', async () => {
    const root = await temporaryRoot();
    const writer = new ArchiveWriter(root);
    const common = {
      timestamp: new Date('2026-07-15T04:05:06.789Z'),
      body: Buffer.from('raw'),
    };

    await expect(
      writer.write({ ...common, sourceId: '../escape', extension: 'json' }),
    ).rejects.toThrow('Invalid archive source ID');
    await expect(
      writer.write({ ...common, sourceId: 'usgs-earthquakes', extension: '../json' }),
    ).rejects.toThrow('Invalid archive extension');
    await expect(readdir(root)).resolves.toEqual([]);
  });
});

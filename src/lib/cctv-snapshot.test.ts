import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPayload, clearPayload, getPayload, readSnapshot, writeSnapshot } from './cctv-snapshot';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'osiris-snap-'));
  process.env.OSIRIS_CCTV_SNAPSHOT = join(directory, 'nested', 'cctv-catalog.json');
  clearPayload();
});

afterEach(async () => {
  delete process.env.OSIRIS_CCTV_SNAPSHOT;
  await rm(directory, { recursive: true, force: true });
});

describe('camera catalogue snapshot', () => {
  it('round-trips a catalogue through disk, creating the directory', async () => {
    await writeSnapshot({ uk: [{ id: 'JamCams_1', source: 'TfL' }], japan: [{ id: 'jp-1' }] });

    const restored = await readSnapshot();
    expect(restored?.regions.uk).toHaveLength(1);
    expect(restored?.regions.japan[0]).toEqual({ id: 'jp-1' });
    expect(restored?.builtAt).toBeGreaterThan(0);
  });

  /* A boot must never be blocked by a catalogue it cannot read — it just
     rebuilds. Half-written files are the realistic case: the process can be
     killed mid-write, which is why writeSnapshot renames into place. */
  it('treats a missing or damaged catalogue as simply absent', async () => {
    expect(await readSnapshot()).toBeNull();

    await writeSnapshot({ uk: [{ id: 'a' }] });
    await writeFile(process.env.OSIRIS_CCTV_SNAPSHOT!, '{"version":1,"regions":{"uk":[{"id"');
    expect(await readSnapshot()).toBeNull();
  });

  it('rejects a catalogue written by a different format version', async () => {
    await writeFile(process.env.OSIRIS_CCTV_SNAPSHOT!.replace(/nested[\\/]/, ''), '{}').catch(() => {});
    await writeSnapshot({ uk: [{ id: 'a' }] });
    const path = process.env.OSIRIS_CCTV_SNAPSHOT!;
    await writeFile(path, JSON.stringify({ version: 99, builtAt: Date.now(), regions: { uk: [{ id: 'a' }] } }));
    expect(await readSnapshot()).toBeNull();
  });

  it('serialises and compresses once, and the gzip matches the json', () => {
    const body = { cameras: [{ id: 'a' }, { id: 'b' }], total: 2 };
    const payload = buildPayload(body, 2, true);

    expect(JSON.parse(payload.json.toString())).toEqual(body);
    expect(JSON.parse(gunzipSync(payload.gzip).toString())).toEqual(body);
    // Gzip's header costs more than it saves on a tiny body; the catalogue is
    // ~8MB, so measure the claim at a size that resembles it.
    const many = buildPayload({ cameras: Array.from({ length: 2000 }, (_, i) => ({ id: 'cam-' + i, source: 'DOT' })) }, 2000, true);
    expect(many.gzip.length).toBeLessThan(many.json.length / 5);
    expect(getPayload()).toBe(many); // the newest build is what callers get
  });

  it('records whether the catalogue was complete when it was built', () => {
    expect(buildPayload({ cameras: [] }, 0, false).complete).toBe(false);
    expect(buildPayload({ cameras: [] }, 0, true).complete).toBe(true);
  });

  it('changes its etag only when the catalogue changes', () => {
    const first = buildPayload({ cameras: [{ id: 'a' }] }, 1, true).etag;
    const same = buildPayload({ cameras: [{ id: 'a' }] }, 1, true).etag;
    const different = buildPayload({ cameras: [{ id: 'b' }] }, 1, true).etag;

    expect(same).toBe(first);
    expect(different).not.toBe(first);
  });
});

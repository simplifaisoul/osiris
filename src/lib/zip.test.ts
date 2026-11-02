import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'zlib';
import { inflateEntry, localDataStart, locateCentralDirectory, parseCentralDirectory, readEntry, unzipFirstEntry } from './zip';

/** A whole archive with a central directory, the way a timetable zip is laid out. */
function fullArchive(files: Record<string, string>, zip64 = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    // In ZIP64 form the sizes and offset overflow into extra field 0x0001.
    const extra = zip64 ? Buffer.alloc(4 + 24) : Buffer.alloc(0);
    if (zip64) {
      extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(text.length), 4);
      extra.writeBigUInt64LE(BigInt(data.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(zip64 ? 0xffffffff : data.length, 20);
    central.writeUInt32LE(zip64 ? 0xffffffff : text.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    centrals.push(central, nameBuf, extra);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const tail: Buffer[] = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(BigInt(cd.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(offset + cd.length), 8);
    tail.push(record, locator);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : cd.length, 12);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  return Buffer.concat([...locals, cd, ...tail, eocd]);
}

const ROUTES = 'route_id,route_short_name,route_type\n100001,1,3\n';
const files = { 'agency.txt': 'agency_id\nKCM\n', 'gtfs/routes.txt': ROUTES, 'stops.txt': 'stop_id\n1\n' };

describe('reading one entry of an archive', () => {
  it('finds an entry by name through the central directory', () => {
    const out = readEntry(fullArchive(files), n => n.endsWith('routes.txt'));
    expect(out?.toString()).toBe(ROUTES);
  });

  it('reads ZIP64 sizes and offsets', () => {
    const out = readEntry(fullArchive(files, true), n => n.endsWith('routes.txt'));
    expect(out?.toString()).toBe(ROUTES);
  });

  it('works from a tail and ranges alone, as over HTTP', () => {
    const zip = fullArchive(files);
    const tailStart = zip.length - 200;
    const { offset, size } = locateCentralDirectory(zip.subarray(tailStart), tailStart);
    const entry = parseCentralDirectory(zip.subarray(offset, offset + size)).find(e => e.name === 'gtfs/routes.txt')!;
    const start = entry.localHeaderOffset + localDataStart(zip.subarray(entry.localHeaderOffset, entry.localHeaderOffset + 64));
    expect(inflateEntry(entry, zip.subarray(start, start + entry.compressedSize)).toString()).toBe(ROUTES);
  });

  it('returns null when there is no such entry', () => {
    expect(readEntry(fullArchive(files), n => n === 'shapes.txt')).toBeNull();
  });
});

/** A one-entry archive as a ZIP writer lays it out: local header, name, data. */
function archive(name: string, content: Buffer, method: 0 | 8, streamed = false): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(streamed ? 0 : data.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  const central = Buffer.from('PK\x01\x02 rest of the central directory', 'binary');
  return Buffer.concat([header, Buffer.from(name), data, central]);
}

describe('unzipFirstEntry', () => {
  const payload = Buffer.from('gtfsrt bytes '.repeat(200));

  it('inflates a deflated entry', () => {
    expect(unzipFirstEntry(archive('gtfsrt.bin', payload, 8)).equals(payload)).toBe(true);
  });

  it('returns a stored entry as it is', () => {
    expect(unzipFirstEntry(archive('gtfsrt.bin', payload, 0)).equals(payload)).toBe(true);
  });

  it('reads a streamed entry up to the central directory', () => {
    expect(unzipFirstEntry(archive('gtfsrt.bin', payload, 8, true)).equals(payload)).toBe(true);
  });

  it('refuses what is not an archive', () => {
    expect(() => unzipFirstEntry(Buffer.from('<html>error page</html>'))).toThrow('Not a ZIP archive');
  });
});

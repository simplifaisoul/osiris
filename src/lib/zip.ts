import { inflateRawSync } from 'zlib';

/**
 * The first entry of a ZIP archive, decompressed.
 *
 * Feeds that ship as a one-file archive (GDELT's event exports, the UK's
 * nationwide bus positions) need nothing more than this, so there is no
 * archive library: the local file header gives the method and the sizes.
 */
export function unzipFirstEntry(buf: Buffer): Buffer {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Not a ZIP archive');
  }
  const method = buf.readUInt16LE(8);
  const compressedSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;

  // A streamed archive can report size 0 here and defer to the data descriptor;
  // in that case take everything up to the central directory.
  const end = compressedSize > 0 ? start + compressedSize : buf.indexOf('PK\x01\x02', start, 'binary');
  const body = buf.subarray(start, end > start ? end : undefined);

  return decompress(method, body);
}

function decompress(method: number, body: Buffer): Buffer {
  // 8 = deflate, 0 = stored.
  if (method === 8) return inflateRawSync(body);
  if (method === 0) return body;
  throw new Error(`Unsupported ZIP compression method ${method}`);
}

/*
 * Reading one named entry out of a large archive.
 *
 * A timetable zip runs to hundreds of megabytes, and only its routes.txt is
 * wanted. The archive's central directory, at its end, says where every entry
 * starts, so with HTTP range requests a reader can take the tail, then the one
 * entry, and nothing else. These functions do the parsing; the fetching is the
 * caller's.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const U32_MAX = 0xffffffff;

/**
 * Where the central directory is, from a tail of the archive. `tailStart` is
 * the tail's offset in the whole file. Reads ZIP64 records, which archives
 * over 4 GB or with over 65,535 entries use.
 */
export function locateCentralDirectory(tail: Buffer, tailStart: number): { offset: number; size: number } {
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('No end of central directory in the tail');
  let size = tail.readUInt32LE(eocd + 12);
  let offset = tail.readUInt32LE(eocd + 16);
  if (size === U32_MAX || offset === U32_MAX) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error('ZIP64 locator missing');
    const record = Number(tail.readBigUInt64LE(locator + 8)) - tailStart;
    if (record < 0 || tail.readUInt32LE(record) !== 0x06064b50) throw new Error('ZIP64 record outside the tail');
    size = Number(tail.readBigUInt64LE(record + 40));
    offset = Number(tail.readBigUInt64LE(record + 48));
  }
  return { offset, size };
}

/** Every entry the central directory lists. */
export function parseCentralDirectory(cd: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    const uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    let localHeaderOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    // ZIP64 sizes and offsets live in extra field 0x0001, in a fixed order,
    // present only for the values that overflowed.
    let x = p + 46 + nameLen;
    const extraEnd = x + extraLen;
    while (x + 4 <= extraEnd) {
      const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (uncompressedSize === U32_MAX) q += 8;
        if (compressedSize === U32_MAX) { compressedSize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (localHeaderOffset === U32_MAX) localHeaderOffset = Number(cd.readBigUInt64LE(q));
      }
      x += 4 + len;
    }
    entries.push({ name, method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The bytes from an entry's local header onwards hold how far its data is in. */
export function localDataStart(localHeader: Buffer): number {
  if (localHeader.readUInt32LE(0) !== 0x04034b50) throw new Error('Not a local file header');
  return 30 + localHeader.readUInt16LE(26) + localHeader.readUInt16LE(28);
}

/** An entry's contents, from its compressed bytes. */
export function inflateEntry(entry: ZipEntry, compressed: Buffer): Buffer {
  return decompress(entry.method, compressed);
}

/** One named entry out of an archive held whole in memory, or null. */
export function readEntry(archive: Buffer, match: (name: string) => boolean): Buffer | null {
  const { offset, size } = locateCentralDirectory(archive.subarray(Math.max(0, archive.length - 65_557 - 76)), Math.max(0, archive.length - 65_557 - 76));
  const entry = parseCentralDirectory(archive.subarray(offset, offset + size)).find(e => match(e.name));
  if (!entry) return null;
  const start = entry.localHeaderOffset + localDataStart(archive.subarray(entry.localHeaderOffset, entry.localHeaderOffset + 30 + 0xffff * 2));
  return inflateEntry(entry, archive.subarray(start, start + entry.compressedSize));
}

import { createHash } from 'node:crypto';
import type { HashResult } from './types';

export function computeHashes(buffer: Buffer, mimeType: string): HashResult {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const md5 = createHash('md5').update(buffer).digest('hex');
  const crc32 = crc32Checksum(buffer);

  return {
    sha256,
    md5,
    crc32,
    fileSize: buffer.length,
    mimeType,
  };
}

function crc32Checksum(buf: Buffer): string {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

export function anfaLayerSign(buffer: Buffer): { hash: string; signature: string } {
  const hash = createHash('sha256').update(buffer).digest('hex');
  const signature = `OSIRIS_ANFA::SHA256:${hash}::TS:${Date.now()}`;
  return { hash, signature };
}

export function stripMetadataFromBuffer(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType === 'image/jpeg') {
    return stripJpegMetadata(buffer);
  }
  if (mimeType === 'image/png') {
    return stripPngMetadata(buffer);
  }
  return buffer;
}

function stripJpegMetadata(buffer: Buffer): Buffer {
  const soi = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
  const eoi = buffer.lastIndexOf(Buffer.from([0xFF, 0xD9]));
  if (soi === -1 || eoi === -1) return buffer;

  const markers = [0xFF, 0xE1, 0xFF, 0xE2, 0xFF, 0xE3, 0xFF, 0xED, 0xFF, 0xEE, 0xFF, 0xFE, 0xFF, 0xDB];
  const result: number[] = [0xFF, 0xD8];
  let pos = 2;

  while (pos < buffer.length - 1) {
    if (buffer[pos] !== 0xFF) { pos++; continue; }
    const marker = buffer[pos + 1];
    if (marker === 0xD9) { result.push(0xFF, 0xD9); break; }
    if (marker === 0x00) { result.push(buffer[pos]); pos++; continue; }
    if (markers.includes(marker)) {
      if (pos + 3 < buffer.length) {
        const len = (buffer[pos + 2] << 8) | buffer[pos + 3];
        pos += 2 + len;
        continue;
      }
    }
    result.push(buffer[pos], buffer[pos + 1]);
    pos += 2;
  }

  return Buffer.from(result);
}

function stripPngMetadata(buffer: Buffer): Buffer {
  const result: number[] = [];
  let pos = 0;
  const signature = buffer.slice(0, 8);
  result.push(...signature);
  pos = 8;

  while (pos < buffer.length - 4) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.slice(pos + 4, pos + 8).toString('ascii');
    if (type === 'IEND') {
      result.push(...buffer.slice(pos, pos + 12 + len));
      break;
    }
    if (type !== 'tEXt' && type !== 'zTXt' && type !== 'iTXt' && type !== 'tEXt' && type !== 'gAMA' && type !== 'cHRM' && type !== 'sRGB' && type !== 'iCCP') {
      result.push(...buffer.slice(pos, pos + 12 + len));
    }
    pos += 12 + len;
  }

  return Buffer.from(result);
}

import { createHash, randomUUID } from 'node:crypto';
import { open, link, mkdir, readFile, unlink, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const EXTENSION_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

export interface ArchiveWriteInput {
  sourceId: string;
  timestamp: Date;
  body: Buffer;
  extension: string;
}

export interface ArchiveWriteResult {
  relativePath: string;
  absolutePath: string;
  contentHash: string;
  compressedBytes: number;
  created: boolean;
}

export function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function normaliseExtension(extension: string): string {
  const normalised = extension.startsWith('.') ? extension.slice(1) : extension;

  if (!EXTENSION_PATTERN.test(normalised) || normalised.includes('..')) {
    throw new Error(`Invalid archive extension: ${extension}`);
  }

  return normalised.toLowerCase();
}

function validateTimestamp(timestamp: Date): void {
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
    throw new Error('Archive timestamp must be a valid Date');
  }
}

function timestampForFilename(timestamp: Date): string {
  return timestamp.toISOString().replaceAll(':', '-');
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return String(error.code);
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle: FileHandle | undefined;

  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    // Some filesystems do not support syncing directory handles. The file
    // itself is always synced before publication; ignore only known platform
    // limitations and surface all other filesystem errors.
    if (!['EBADF', 'EINVAL', 'ENOTSUP', 'EISDIR'].includes(errorCode(error) ?? '')) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

async function removeTemporaryFile(temporaryPath: string): Promise<void> {
  try {
    await unlink(temporaryPath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }
}

async function verifyExistingArchive(
  absolutePath: string,
  expectedBody: Buffer,
  expectedHash: string,
): Promise<number> {
  let compressed: Buffer;

  try {
    compressed = await readFile(absolutePath);
  } catch (error) {
    throw new Error(`Unable to read existing archive: ${absolutePath}`, { cause: error });
  }

  let body: Buffer;

  try {
    body = await gunzipAsync(compressed);
  } catch (error) {
    throw new Error(`Existing archive is not valid gzip data: ${absolutePath}`, {
      cause: error,
    });
  }

  if (sha256Hex(body) !== expectedHash || !body.equals(expectedBody)) {
    throw new Error(`Existing archive content does not match: ${absolutePath}`);
  }

  return compressed.byteLength;
}

/**
 * Writes immutable, gzip-compressed source responses below one archive root.
 *
 * A complete temporary file is flushed in the destination directory, then a
 * hard link publishes it atomically. `link` cannot replace an existing path,
 * so concurrent writers either create the archive or verify the winner's
 * byte-equivalent archive without mutating it.
 */
export class ArchiveWriter {
  readonly root: string;

  constructor(root: string) {
    if (root.trim().length === 0) {
      throw new Error('Archive root must not be empty');
    }

    this.root = resolve(root);
  }

  async write(input: ArchiveWriteInput): Promise<ArchiveWriteResult> {
    if (!SOURCE_ID_PATTERN.test(input.sourceId)) {
      throw new Error(`Invalid archive source ID: ${input.sourceId}`);
    }

    validateTimestamp(input.timestamp);

    if (!Buffer.isBuffer(input.body)) {
      throw new TypeError('Archive body must be a Buffer');
    }

    const extension = normaliseExtension(input.extension);
    const year = input.timestamp.getUTCFullYear().toString().padStart(4, '0');
    const month = (input.timestamp.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = input.timestamp.getUTCDate().toString().padStart(2, '0');
    const directory = join(this.root, input.sourceId, year, month, day);
    const contentHash = sha256Hex(input.body);
    const filename = `${timestampForFilename(input.timestamp)}-${contentHash}.${extension}.gz`;
    const absolutePath = join(directory, filename);
    const relativePath = relative(this.root, absolutePath);

    if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
      throw new Error('Archive path escaped its configured root');
    }

    await mkdir(directory, { recursive: true });

    const compressed = await gzipAsync(input.body);
    const temporaryPath = join(directory, `.${filename}.${randomUUID()}.tmp`);
    let temporaryHandle: FileHandle | undefined;

    try {
      temporaryHandle = await open(temporaryPath, 'wx', 0o600);
      await temporaryHandle.writeFile(compressed);
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = undefined;

      try {
        await link(temporaryPath, absolutePath);
        await fsyncDirectory(directory);

        return {
          relativePath,
          absolutePath,
          contentHash,
          compressedBytes: compressed.byteLength,
          created: true,
        };
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          throw error;
        }

        const compressedBytes = await verifyExistingArchive(
          absolutePath,
          input.body,
          contentHash,
        );

        return {
          relativePath,
          absolutePath,
          contentHash,
          compressedBytes,
          created: false,
        };
      }
    } finally {
      await temporaryHandle?.close();
      await removeTemporaryFile(temporaryPath);
    }
  }
}

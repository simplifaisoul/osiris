const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024 * 1024;

const SAFE_RESPONSE_HEADER_NAMES = [
  'cache-control',
  'content-length',
  'content-type',
  'date',
  'etag',
  'expires',
  'last-modified',
  'location',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const;

export interface RawResponse {
  endpoint: string;
  requestStartedAt: Date;
  responseReceivedAt: Date;
  status: number;
  contentType: string | null;
  headers: Record<string, string>;
  body: Buffer;
}

export type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Clock = () => Date;

export interface BoundedHttpFetcherOptions {
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: FetchImplementation;
  clock?: Clock;
}

export class ResponseTooLargeError extends Error {
  readonly maxBodyBytes: number;
  readonly declaredBodyBytes: number | null;

  constructor(maxBodyBytes: number, declaredBodyBytes: number | null = null) {
    const detail =
      declaredBodyBytes === null ? '' : ` (declared ${declaredBodyBytes} bytes)`;
    super(`HTTP response exceeded the ${maxBodyBytes}-byte limit${detail}`);
    this.name = 'ResponseTooLargeError';
    this.maxBodyBytes = maxBodyBytes;
    this.declaredBodyBytes = declaredBodyBytes;
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function clockDate(clock: Clock): Date {
  const value = clock();

  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('HTTP fetcher clock returned an invalid Date');
  }

  return new Date(value.getTime());
}

function validateEndpoint(endpoint: string | URL): string {
  let url: URL;

  try {
    url = new URL(endpoint.toString());
  } catch (error) {
    throw new Error('HTTP endpoint must be an absolute URL', { cause: error });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('HTTP endpoint must use http or https');
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('HTTP endpoint must not contain credentials');
  }

  return typeof endpoint === 'string' ? endpoint : endpoint.toString();
}

function selectedHeaders(headers: Headers): Record<string, string> {
  const selected: Record<string, string> = {};

  for (const name of SAFE_RESPONSE_HEADER_NAMES) {
    const value = headers.get(name);

    if (value !== null) {
      selected[name] = value;
    }
  }

  return selected;
}

function declaredContentLength(headers: Headers): number | null {
  const value = headers.get('content-length');

  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function cancelBody(response: Response, reason: unknown): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // The request signal is aborted as well. Cancellation errors do not make
    // an oversized response safe and should not replace the bounded-size error.
  }
}

async function readBoundedBody(
  response: Response,
  maxBodyBytes: number,
  bodyLimitController: AbortController,
): Promise<Buffer> {
  const declaredBytes = declaredContentLength(response.headers);

  if (declaredBytes !== null && declaredBytes > maxBodyBytes) {
    const error = new ResponseTooLargeError(maxBodyBytes, declaredBytes);
    bodyLimitController.abort(error);
    await cancelBody(response, error);
    throw error;
  }

  if (response.body === null) {
    return Buffer.alloc(0);
  }

  const bodyStream = response.body as ReadableStream<Uint8Array>;
  const reader = bodyStream.getReader();
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bytesRead += value.byteLength;

      if (bytesRead > maxBodyBytes) {
        const error = new ResponseTooLargeError(maxBodyBytes);
        bodyLimitController.abort(error);

        try {
          await reader.cancel(error);
        } catch {
          // Preserve the deterministic size-limit error below.
        }

        throw error;
      }

      // Copy each chunk because fetch implementations may reuse their backing
      // storage after the reader advances.
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, bytesRead);
}

/** Performs exactly one bounded HTTP attempt. Retry policy belongs upstream. */
export class BoundedHttpFetcher {
  readonly timeoutMs: number;
  readonly maxBodyBytes: number;

  private readonly fetchImpl: FetchImplementation;
  private readonly clock: Clock;

  constructor(options: BoundedHttpFetcherOptions = {}) {
    this.timeoutMs = positiveInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'timeoutMs',
    );
    this.maxBodyBytes = positiveInteger(
      options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      'maxBodyBytes',
    );
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.clock = options.clock ?? (() => new Date());
  }

  async fetch(endpoint: string | URL, externalSignal?: AbortSignal): Promise<RawResponse> {
    const validatedEndpoint = validateEndpoint(endpoint);
    externalSignal?.throwIfAborted();
    const requestStartedAt = clockDate(this.clock);
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const bodyLimitController = new AbortController();
    const signal = AbortSignal.any([
      timeoutSignal,
      bodyLimitController.signal,
      ...(externalSignal === undefined ? [] : [externalSignal]),
    ]);
    // Never follow redirects: preserve the 3xx response as raw evidence while
    // preventing an approved source URL from silently moving collection onto
    // an unvalidated host.
    const response = await this.fetchImpl(validatedEndpoint, {
      redirect: 'manual',
      signal,
    });
    const body = await readBoundedBody(
      response,
      this.maxBodyBytes,
      bodyLimitController,
    );
    const responseReceivedAt = clockDate(this.clock);

    return {
      endpoint: validatedEndpoint,
      requestStartedAt,
      responseReceivedAt,
      status: response.status,
      contentType: response.headers.get('content-type'),
      headers: selectedHeaders(response.headers),
      body,
    };
  }
}

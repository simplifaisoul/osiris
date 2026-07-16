import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const NOAA_SWPC_KP_SOURCE_ID = 'noaa-swpc-planetary-k-index' as const;
export const NOAA_SWPC_ALERTS_SOURCE_ID = 'noaa-swpc-alerts' as const;
export const NOAA_SWPC_XRAY_FLARES_SOURCE_ID = 'noaa-swpc-xray-flares' as const;

export type NoaaSpaceWeatherSourceId =
  | typeof NOAA_SWPC_KP_SOURCE_ID
  | typeof NOAA_SWPC_ALERTS_SOURCE_ID
  | typeof NOAA_SWPC_XRAY_FLARES_SOURCE_ID;

const finiteNumberSchema = z.number().refine(Number.isFinite, 'must be finite');

const kpRecordSchema = z
  .object({
    time_tag: z.string().min(1),
    kp_index: z.union([z.string(), finiteNumberSchema]).optional(),
    Kp: z.union([z.string(), finiteNumberSchema]).optional(),
  })
  .passthrough();

const alertRecordSchema = z
  .object({
    product_id: z.string().min(1),
    issue_datetime: z.string().min(1),
    message: z.string().min(1),
  })
  .passthrough();

const flareRecordSchema = z
  .object({
    begin_time: z.string().min(1),
    max_time: z.string().min(1),
    end_time: z.string().min(1).nullable().optional(),
    max_class: z.string().min(1),
  })
  .passthrough();

type KpRecord = z.infer<typeof kpRecordSchema>;
type AlertRecord = z.infer<typeof alertRecordSchema>;
type FlareRecord = z.infer<typeof flareRecordSchema>;

export interface NormalisedNoaaSpaceWeatherObservation {
  sourceId: NoaaSpaceWeatherSourceId;
  sourceObservationId: string;
  observedAt: Date;
  sourceUpdatedAt: Date;
  eventKind: 'planetary_k_index' | 'alert' | 'xray_flare';
  numericValue: number | null;
  classification: string | null;
  message: string | null;
  contentHash: string;
  evidenceClassification: 'observed' | 'reported';
  rawPayload: unknown;
  metadata: {
    provider: 'NOAA SWPC';
    format: 'json';
    observation_content_hash: string;
    stableIdentifierSource: 'time_tag' | 'product_id_issue_datetime' | 'max_time_class';
  };
}

export interface NormalisedNoaaSpaceWeatherFeed {
  sourceId: NoaaSpaceWeatherSourceId;
  upstreamTimestamp: Date | null;
  records: NormalisedNoaaSpaceWeatherObservation[];
}

export class NoaaSpaceWeatherNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoaaSpaceWeatherNormalisationError';
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function parseJsonArray(body: Buffer): unknown[] {
  if (!Buffer.isBuffer(body)) {
    throw new NoaaSpaceWeatherNormalisationError('NOAA response body must be a Buffer');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new NoaaSpaceWeatherNormalisationError('Invalid NOAA JSON response body');
  }
  if (!Array.isArray(decoded)) {
    throw new NoaaSpaceWeatherNormalisationError('NOAA response must be a JSON array');
  }
  return decoded;
}

function parseFiniteValue(value: string | number | undefined, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new NoaaSpaceWeatherNormalisationError(`NOAA row has invalid ${name}`);
  }
  return parsed;
}

function parseNoaaUtcTimestamp(value: string, label: string): Date {
  const trimmed = value.trim();
  const normalised = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalised);
  const date = new Date(hasTimezone ? normalised : `${normalised}Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new NoaaSpaceWeatherNormalisationError(`NOAA row has invalid ${label}`);
  }
  return date;
}

function latestTimestamp(records: NormalisedNoaaSpaceWeatherObservation[]): Date | null {
  return records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);
}

function normaliseKp(body: Buffer): NormalisedNoaaSpaceWeatherFeed {
  const records = parseJsonArray(body).map((value): NormalisedNoaaSpaceWeatherObservation => {
    const parsed = kpRecordSchema.safeParse(value);
    if (!parsed.success) {
      throw new NoaaSpaceWeatherNormalisationError('Invalid NOAA Kp record');
    }
    const row: KpRecord = parsed.data;
    const observedAt = parseNoaaUtcTimestamp(row.time_tag, 'time_tag');
    const kp = parseFiniteValue(row.kp_index ?? row.Kp, 'kp_index');
    const contentHash = hashJson(value);

    return {
      sourceId: NOAA_SWPC_KP_SOURCE_ID,
      sourceObservationId: `kp-${observedAt.toISOString()}`,
      observedAt,
      sourceUpdatedAt: observedAt,
      eventKind: 'planetary_k_index',
      numericValue: kp,
      classification: kp >= 5 ? `G${Math.min(5, Math.max(1, Math.floor(kp - 3)))}` : null,
      message: null,
      contentHash,
      evidenceClassification: 'observed',
      rawPayload: value,
      metadata: {
        provider: 'NOAA SWPC',
        format: 'json',
        observation_content_hash: contentHash,
        stableIdentifierSource: 'time_tag',
      },
    };
  });

  return {
    sourceId: NOAA_SWPC_KP_SOURCE_ID,
    upstreamTimestamp: latestTimestamp(records),
    records,
  };
}

function normaliseAlerts(body: Buffer): NormalisedNoaaSpaceWeatherFeed {
  const records = parseJsonArray(body).map((value): NormalisedNoaaSpaceWeatherObservation => {
    const parsed = alertRecordSchema.safeParse(value);
    if (!parsed.success) {
      throw new NoaaSpaceWeatherNormalisationError('Invalid NOAA alert record');
    }
    const row: AlertRecord = parsed.data;
    const observedAt = parseNoaaUtcTimestamp(row.issue_datetime, 'issue_datetime');
    const contentHash = hashJson(value);

    return {
      sourceId: NOAA_SWPC_ALERTS_SOURCE_ID,
      sourceObservationId: `alert-${row.product_id}-${observedAt.toISOString()}`,
      observedAt,
      sourceUpdatedAt: observedAt,
      eventKind: 'alert',
      numericValue: null,
      classification: row.product_id,
      message: row.message,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: value,
      metadata: {
        provider: 'NOAA SWPC',
        format: 'json',
        observation_content_hash: contentHash,
        stableIdentifierSource: 'product_id_issue_datetime',
      },
    };
  });

  return {
    sourceId: NOAA_SWPC_ALERTS_SOURCE_ID,
    upstreamTimestamp: latestTimestamp(records),
    records,
  };
}

function normaliseFlares(body: Buffer): NormalisedNoaaSpaceWeatherFeed {
  const records = parseJsonArray(body).map((value): NormalisedNoaaSpaceWeatherObservation => {
    const parsed = flareRecordSchema.safeParse(value);
    if (!parsed.success) {
      throw new NoaaSpaceWeatherNormalisationError('Invalid NOAA X-ray flare record');
    }
    const row: FlareRecord = parsed.data;
    const peakAt = parseNoaaUtcTimestamp(row.max_time, 'max_time');
    const contentHash = hashJson(value);

    return {
      sourceId: NOAA_SWPC_XRAY_FLARES_SOURCE_ID,
      sourceObservationId: `xray-${peakAt.toISOString()}-${row.max_class}`,
      observedAt: peakAt,
      sourceUpdatedAt: peakAt,
      eventKind: 'xray_flare',
      numericValue: null,
      classification: row.max_class,
      message: null,
      contentHash,
      evidenceClassification: 'observed',
      rawPayload: value,
      metadata: {
        provider: 'NOAA SWPC',
        format: 'json',
        observation_content_hash: contentHash,
        stableIdentifierSource: 'max_time_class',
      },
    };
  });

  return {
    sourceId: NOAA_SWPC_XRAY_FLARES_SOURCE_ID,
    upstreamTimestamp: latestTimestamp(records),
    records,
  };
}

export function normaliseNoaaSpaceWeatherFeed(
  body: Buffer,
  sourceId: NoaaSpaceWeatherSourceId,
): NormalisedNoaaSpaceWeatherFeed {
  if (sourceId === NOAA_SWPC_KP_SOURCE_ID) return normaliseKp(body);
  if (sourceId === NOAA_SWPC_ALERTS_SOURCE_ID) return normaliseAlerts(body);
  return normaliseFlares(body);
}

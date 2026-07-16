import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const CELESTRAK_ACTIVE_SOURCE_ID = 'celestrak-active-tle' as const;
export const CELESTRAK_STARLINK_SOURCE_ID = 'celestrak-starlink-supplemental-tle' as const;
export const SATNOGS_TLE_SOURCE_ID = 'satnogs-tle' as const;

export type SatelliteSourceId =
  | typeof CELESTRAK_ACTIVE_SOURCE_ID
  | typeof CELESTRAK_STARLINK_SOURCE_ID
  | typeof SATNOGS_TLE_SOURCE_ID;

const satnogsTleSchema = z
  .object({
    tle0: z.string().min(1),
    tle1: z.string().min(1),
    tle2: z.string().min(1),
    tle_source: z.string().min(1).optional(),
    sat_id: z.string().min(1).optional(),
    norad_cat_id: z.number().int().positive(),
    updated: z.string().min(1),
  })
  .passthrough();

type SatnogsTleRecord = z.infer<typeof satnogsTleSchema>;

export interface NormalisedSatelliteTleRecord {
  sourceId: SatelliteSourceId;
  sourceTleId: string;
  observedAt: Date;
  sourceUpdatedAt: Date;
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  epochAt: Date | null;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: unknown;
  metadata: {
    provider: 'CelesTrak' | 'SatNOGS';
    format: 'tle' | 'json';
    tle_content_hash: string;
    stableIdentifierSource: string;
    [key: string]: unknown;
  };
}

export interface NormalisedSatelliteFeed {
  sourceId: SatelliteSourceId;
  upstreamTimestamp: Date | null;
  records: NormalisedSatelliteTleRecord[];
}

export class SatelliteNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SatelliteNormalisationError';
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseDate(value: string, label: string): Date {
  const normalised = value.endsWith('+0000') ? value.replace('+0000', 'Z') : value;
  const parsed = new Date(normalised);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SatelliteNormalisationError(`Satellite row has invalid ${label}`);
  }
  return parsed;
}

function parseTleEpoch(line1: string): Date | null {
  const epochYear = Number(line1.substring(18, 20));
  const epochDay = Number(line1.substring(20, 32));
  if (!Number.isFinite(epochYear) || !Number.isFinite(epochDay)) return null;
  const year = epochYear > 56 ? 1900 + epochYear : 2000 + epochYear;
  const start = Date.UTC(year, 0, 1, 0, 0, 0, 0);
  return new Date(start + (epochDay - 1) * 86_400_000);
}

function parseNoradId(line1: string): number {
  const match = line1.match(/^1\s+(\d{5})/u);
  if (match === null) {
    throw new SatelliteNormalisationError('TLE line 1 missing NORAD identifier');
  }
  return Number(match[1]);
}

function parseTleTriples(text: string): { name: string; line1: string; line2: string; raw: string }[] {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  const records: { name: string; line1: string; line2: string; raw: string }[] = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index];
    const next = lines[index + 1];
    const third = lines[index + 2];
    if (current === undefined) break;

    if (current.startsWith('1 ') && next?.startsWith('2 ')) {
      records.push({
        name: `SAT-${parseNoradId(current)}`,
        line1: current,
        line2: next,
        raw: `${current}\n${next}`,
      });
      index += 2;
    } else if (next?.startsWith('1 ') && third?.startsWith('2 ')) {
      records.push({
        name: current.replace(/^0\s+/u, '').trim(),
        line1: next,
        line2: third,
        raw: `${current}\n${next}\n${third}`,
      });
      index += 3;
    } else {
      index += 1;
    }
  }

  if (records.length === 0) {
    throw new SatelliteNormalisationError('TLE response contained no records');
  }

  return records;
}

function normaliseCelestrakTle(body: Buffer, sourceId: SatelliteSourceId): NormalisedSatelliteFeed {
  if (!Buffer.isBuffer(body)) {
    throw new SatelliteNormalisationError('CelesTrak response body must be a Buffer');
  }
  const records = parseTleTriples(body.toString('utf8')).map((record) => {
    const noradId = parseNoradId(record.line1);
    const epochAt = parseTleEpoch(record.line1);
    const contentHash = hashText(record.raw);

    return {
      sourceId,
      sourceTleId: `${noradId}`,
      observedAt: epochAt ?? new Date(0),
      sourceUpdatedAt: epochAt ?? new Date(0),
      noradId,
      name: record.name,
      line1: record.line1,
      line2: record.line2,
      epochAt,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: record.raw,
      metadata: {
        provider: 'CelesTrak',
        format: 'tle',
        tle_content_hash: contentHash,
        stableIdentifierSource: 'norad_id',
      },
    } satisfies NormalisedSatelliteTleRecord;
  });

  return { sourceId, upstreamTimestamp: latestTimestamp(records), records };
}

function normaliseSatnogsTle(body: Buffer): NormalisedSatelliteFeed {
  if (!Buffer.isBuffer(body)) {
    throw new SatelliteNormalisationError('SatNOGS response body must be a Buffer');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new SatelliteNormalisationError('Invalid SatNOGS JSON response body');
  }
  if (!Array.isArray(decoded)) {
    throw new SatelliteNormalisationError('SatNOGS response must be a JSON array');
  }

  const records = decoded.map((value): NormalisedSatelliteTleRecord => {
    const parsed = satnogsTleSchema.safeParse(value);
    if (!parsed.success) {
      throw new SatelliteNormalisationError('Invalid SatNOGS TLE record');
    }
    const row: SatnogsTleRecord = parsed.data;
    const updatedAt = parseDate(row.updated, 'updated');
    const epochAt = parseTleEpoch(row.tle1);
    const contentHash = hashJson(value);

    return {
      sourceId: SATNOGS_TLE_SOURCE_ID,
      sourceTleId: `${row.norad_cat_id}`,
      observedAt: updatedAt,
      sourceUpdatedAt: updatedAt,
      noradId: row.norad_cat_id,
      name: row.tle0.replace(/^0\s+/u, '').trim(),
      line1: row.tle1,
      line2: row.tle2,
      epochAt,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: value,
      metadata: {
        provider: 'SatNOGS',
        format: 'json',
        tle_content_hash: contentHash,
        stableIdentifierSource: 'norad_cat_id',
        satId: row.sat_id ?? null,
        tleSource: row.tle_source ?? null,
      },
    };
  });

  return { sourceId: SATNOGS_TLE_SOURCE_ID, upstreamTimestamp: latestTimestamp(records), records };
}

function latestTimestamp(records: NormalisedSatelliteTleRecord[]): Date | null {
  return records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);
}

export function normaliseSatelliteFeed(body: Buffer, sourceId: SatelliteSourceId): NormalisedSatelliteFeed {
  if (sourceId === SATNOGS_TLE_SOURCE_ID) return normaliseSatnogsTle(body);
  return normaliseCelestrakTle(body, sourceId);
}

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

export const NASA_FIRMS_VIIRS_SOURCE_ID = 'nasa-firms-viirs' as const;
export const NASA_FIRMS_MODIS_SOURCE_ID = 'nasa-firms-modis' as const;
export type NasaFirmsSourceId =
  | typeof NASA_FIRMS_VIIRS_SOURCE_ID
  | typeof NASA_FIRMS_MODIS_SOURCE_ID;

export interface NasaFirmsCsvRecord {
  latitude: string;
  longitude: string;
  brightness?: string;
  bright_ti4?: string;
  bright_ti5?: string;
  scan?: string;
  track?: string;
  acq_date: string;
  acq_time: string;
  satellite?: string;
  instrument?: string;
  confidence?: string;
  version?: string;
  frp?: string;
  daynight?: string;
  [key: string]: string | undefined;
}

export interface NormalisedNasaFirmsDetection {
  sourceId: NasaFirmsSourceId;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  satellite: string | null;
  instrument: string | null;
  confidence: string | null;
  brightnessKelvin: number;
  fireRadiativePowerMw: number | null;
  dayNight: string | null;
  longitude: number;
  latitude: number;
  contentHash: string;
  evidenceClassification: 'observed';
  rawPayload: NasaFirmsCsvRecord;
  metadata: {
    provider: 'NASA FIRMS';
    format: 'csv';
    stableIdentifierSource: 'content_fingerprint';
    detection_content_hash: string;
  };
}

export interface NormalisedNasaFirmsFeed {
  sourceId: NasaFirmsSourceId;
  upstreamTimestamp: Date | null;
  records: NormalisedNasaFirmsDetection[];
}

export class NasaFirmsNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NasaFirmsNormalisationError';
  }
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else if (char !== undefined) {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseFinite(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new NasaFirmsNormalisationError(`FIRMS row has invalid ${name}`);
  }
  return parsed;
}

function parseOptionalFinite(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAcquiredAt(date: string | undefined, time: string | undefined): Date {
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new NasaFirmsNormalisationError('FIRMS row has invalid acq_date');
  }
  if (time === undefined || !/^\d{1,4}$/.test(time)) {
    throw new NasaFirmsNormalisationError('FIRMS row has invalid acq_time');
  }
  const padded = time.padStart(4, '0');
  const value = new Date(`${date}T${padded.slice(0, 2)}:${padded.slice(2)}:00.000Z`);
  if (!Number.isFinite(value.getTime())) {
    throw new NasaFirmsNormalisationError('FIRMS row has invalid acquisition timestamp');
  }
  return value;
}

function csvRecords(csv: string): Array<{ rawLine: string; record: NasaFirmsCsvRecord }> {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new NasaFirmsNormalisationError('FIRMS CSV must include a header and at least one row');
  }
  const headerLine = lines[0];
  if (headerLine === undefined) throw new NasaFirmsNormalisationError('FIRMS CSV missing header');
  const headers = splitCsvLine(headerLine);
  for (const required of ['latitude', 'longitude', 'acq_date', 'acq_time']) {
    if (!headers.includes(required)) {
      throw new NasaFirmsNormalisationError(`FIRMS CSV missing required column: ${required}`);
    }
  }

  return lines.slice(1).map((rawLine) => {
    const values = splitCsvLine(rawLine);
    const record: NasaFirmsCsvRecord = {
      latitude: '',
      longitude: '',
      acq_date: '',
      acq_time: '',
    };
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return { rawLine, record };
  });
}

export function normaliseNasaFirmsFeed(
  body: Buffer,
  sourceId: NasaFirmsSourceId,
): NormalisedNasaFirmsFeed {
  if (!Buffer.isBuffer(body)) {
    throw new NasaFirmsNormalisationError('FIRMS response body must be a Buffer');
  }

  const records = csvRecords(body.toString('utf8')).map(({ rawLine, record }) => {
    const latitude = parseFinite(record.latitude, 'latitude');
    const longitude = parseFinite(record.longitude, 'longitude');
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new NasaFirmsNormalisationError('FIRMS row coordinates are out of range');
    }
    const brightnessKelvin = parseFinite(record.bright_ti4 ?? record.brightness, 'brightness');
    const occurredAt = parseAcquiredAt(record.acq_date, record.acq_time);
    const contentHash = hashText(rawLine);

    return {
      sourceId,
      sourceEventId: contentHash,
      occurredAt,
      sourceUpdatedAt: occurredAt,
      satellite: record.satellite || null,
      instrument: record.instrument || null,
      confidence: record.confidence || null,
      brightnessKelvin,
      fireRadiativePowerMw: parseOptionalFinite(record.frp),
      dayNight: record.daynight || null,
      longitude,
      latitude,
      contentHash,
      evidenceClassification: 'observed',
      rawPayload: record,
      metadata: {
        provider: 'NASA FIRMS',
        format: 'csv',
        stableIdentifierSource: 'content_fingerprint',
        detection_content_hash: contentHash,
      },
    } satisfies NormalisedNasaFirmsDetection;
  });

  const latest = records.reduce<Date | null>((current, record) => {
    if (current === null || record.occurredAt.getTime() > current.getTime()) {
      return record.occurredAt;
    }
    return current;
  }, null);

  return { sourceId, upstreamTimestamp: latest, records };
}

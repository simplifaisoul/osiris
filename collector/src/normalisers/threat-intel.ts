import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const ABUSECH_FEODO_SOURCE_ID = 'abusech-feodo-ipblocklist' as const;
export const ABUSECH_URLHAUS_SOURCE_ID = 'abusech-urlhaus-online' as const;
export const CISA_KEV_SOURCE_ID = 'cisa-known-exploited-vulnerabilities' as const;

export type ThreatIntelSourceId =
  | typeof ABUSECH_FEODO_SOURCE_ID
  | typeof ABUSECH_URLHAUS_SOURCE_ID
  | typeof CISA_KEV_SOURCE_ID;

export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

const ipAddressSchema = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u,
);
const finitePortSchema = z.number().int().min(1).max(65_535);

const feodoRecordSchema = z
  .object({
    ip_address: ipAddressSchema,
    port: finitePortSchema,
    status: z.string().min(1),
    hostname: z.string().nullable().optional(),
    as_number: z.number().int().nullable().optional(),
    as_name: z.string().nullable().optional(),
    country: z.string().length(2).nullable().optional(),
    first_seen: z.string().min(1),
    last_online: z.string().min(1).nullable().optional(),
    malware: z.string().min(1),
  })
  .passthrough();

const cisaKevRecordSchema = z
  .object({
    cveID: z.string().regex(/^CVE-\d{4}-\d+$/u),
    vendorProject: z.string().min(1),
    product: z.string().min(1),
    vulnerabilityName: z.string().min(1),
    dateAdded: z.string().min(1),
    shortDescription: z.string().min(1).optional(),
    requiredAction: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    knownRansomwareCampaignUse: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const cisaKevResponseSchema = z
  .object({
    title: z.string().optional(),
    catalogVersion: z.string().optional(),
    dateReleased: z.string().min(1).optional(),
    count: z.number().int().nonnegative().optional(),
    vulnerabilities: z.array(cisaKevRecordSchema).default([]),
  })
  .passthrough();

type FeodoRecord = z.infer<typeof feodoRecordSchema>;
type CisaKevRecord = z.infer<typeof cisaKevRecordSchema>;

interface UrlhausRecord {
  id: string;
  dateadded: string;
  url: string;
  url_status: string;
  last_online: string;
  threat: string;
  tags: string;
  urlhaus_link: string;
  reporter: string;
}

export interface NormalisedThreatIntelRecord {
  sourceId: ThreatIntelSourceId;
  sourceIndicatorId: string;
  observedAt: Date;
  sourceUpdatedAt: Date;
  indicatorType: 'ip' | 'url' | 'cve';
  indicatorValue: string;
  threatKind: 'botnet_c2' | 'malware_url' | 'exploited_vulnerability';
  severity: ThreatSeverity;
  status: string | null;
  malwareFamily: string | null;
  port: number | null;
  countryCode: string | null;
  title: string | null;
  description: string | null;
  referenceUrl: string | null;
  dueAt: Date | null;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: unknown;
  metadata: {
    provider: 'abuse.ch' | 'CISA';
    format: 'json' | 'csv';
    indicator_content_hash: string;
    stableIdentifierSource: string;
    [key: string]: unknown;
  };
}

export interface NormalisedThreatIntelFeed {
  sourceId: ThreatIntelSourceId;
  upstreamTimestamp: Date | null;
  records: NormalisedThreatIntelRecord[];
}

export class ThreatIntelNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreatIntelNormalisationError';
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function parseJson(body: Buffer): unknown {
  if (!Buffer.isBuffer(body)) {
    throw new ThreatIntelNormalisationError('Threat intel response body must be a Buffer');
  }
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new ThreatIntelNormalisationError('Invalid threat intel JSON response body');
  }
}

function parseThreatDate(value: string | null | undefined, label: string): Date {
  if (value === undefined || value === null || value.trim().length === 0) {
    throw new ThreatIntelNormalisationError(`Threat intel row missing ${label}`);
  }
  const trimmed = value.trim();
  const normalised = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(trimmed);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalised);
  const candidate = dateOnly ? `${trimmed}T00:00:00Z` : hasTimezone ? normalised : `${normalised}Z`;
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ThreatIntelNormalisationError(`Threat intel row has invalid ${label}`);
  }
  return parsed;
}

function optionalThreatDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value.trim().length === 0) return null;
  try {
    return parseThreatDate(value, 'optional date');
  } catch {
    return null;
  }
}

function latestTimestamp(records: NormalisedThreatIntelRecord[]): Date | null {
  return records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);
}

function normaliseFeodo(body: Buffer): NormalisedThreatIntelFeed {
  const decoded = parseJson(body);
  if (!Array.isArray(decoded)) {
    throw new ThreatIntelNormalisationError('Feodo response must be a JSON array');
  }

  const records = decoded.map((value): NormalisedThreatIntelRecord => {
    const parsed = feodoRecordSchema.safeParse(value);
    if (!parsed.success) {
      throw new ThreatIntelNormalisationError('Invalid Feodo record');
    }
    const row: FeodoRecord = parsed.data;
    const observedAt = parseThreatDate(row.first_seen, 'first_seen');
    const sourceUpdatedAt = optionalThreatDate(row.last_online) ?? observedAt;
    const contentHash = hashJson(value);

    return {
      sourceId: ABUSECH_FEODO_SOURCE_ID,
      sourceIndicatorId: `${row.ip_address}:${row.port}`,
      observedAt,
      sourceUpdatedAt,
      indicatorType: 'ip',
      indicatorValue: row.ip_address,
      threatKind: 'botnet_c2',
      severity: row.status === 'online' ? 'high' : 'medium',
      status: row.status,
      malwareFamily: row.malware,
      port: row.port,
      countryCode: row.country ?? null,
      title: `${row.malware} C2 ${row.ip_address}:${row.port}`,
      description: row.hostname ?? row.as_name ?? null,
      referenceUrl: 'https://feodotracker.abuse.ch/blocklist/',
      dueAt: null,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: value,
      metadata: {
        provider: 'abuse.ch',
        format: 'json',
        indicator_content_hash: contentHash,
        stableIdentifierSource: 'ip_address_port',
        asNumber: row.as_number ?? null,
        asName: row.as_name ?? null,
        hostname: row.hostname ?? null,
      },
    };
  });

  return { sourceId: ABUSECH_FEODO_SOURCE_ID, upstreamTimestamp: latestTimestamp(records), records };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseUrlhausCsv(body: Buffer): UrlhausRecord[] {
  const text = body.toString('utf8');
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  return lines.map((line) => {
    const [
      id,
      dateadded,
      url,
      url_status,
      last_online,
      threat,
      tags,
      urlhaus_link,
      reporter,
    ] = parseCsvLine(line);
    if (!id || !dateadded || !url || !url_status || !last_online || !threat || !urlhaus_link) {
      throw new ThreatIntelNormalisationError('Invalid URLhaus CSV row');
    }
    return { id, dateadded, url, url_status, last_online, threat, tags: tags ?? '', urlhaus_link, reporter: reporter ?? '' };
  });
}

function urlPort(value: string): number | null {
  try {
    const url = new URL(value);
    if (url.port.length > 0) return Number(url.port);
    if (url.protocol === 'https:') return 443;
    if (url.protocol === 'http:') return 80;
  } catch {
    return null;
  }
  return null;
}

function normaliseUrlhaus(body: Buffer): NormalisedThreatIntelFeed {
  const rows = parseUrlhausCsv(body);
  const records = rows.map((row): NormalisedThreatIntelRecord => {
    const observedAt = parseThreatDate(row.dateadded, 'dateadded');
    const sourceUpdatedAt = optionalThreatDate(row.last_online) ?? observedAt;
    const contentHash = hashJson(row);

    return {
      sourceId: ABUSECH_URLHAUS_SOURCE_ID,
      sourceIndicatorId: row.id,
      observedAt,
      sourceUpdatedAt,
      indicatorType: 'url',
      indicatorValue: row.url,
      threatKind: 'malware_url',
      severity: row.url_status === 'online' ? 'high' : 'medium',
      status: row.url_status,
      malwareFamily: row.tags.length > 0 ? row.tags : null,
      port: urlPort(row.url),
      countryCode: null,
      title: row.threat,
      description: row.tags.length > 0 ? row.tags : null,
      referenceUrl: row.urlhaus_link,
      dueAt: null,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: row,
      metadata: {
        provider: 'abuse.ch',
        format: 'csv',
        indicator_content_hash: contentHash,
        stableIdentifierSource: 'urlhaus_id',
        reporter: row.reporter,
      },
    };
  });

  return { sourceId: ABUSECH_URLHAUS_SOURCE_ID, upstreamTimestamp: latestTimestamp(records), records };
}

function normaliseCisaKev(body: Buffer): NormalisedThreatIntelFeed {
  const decoded = parseJson(body);
  const validation = cisaKevResponseSchema.safeParse(decoded);
  if (!validation.success) {
    throw new ThreatIntelNormalisationError('Invalid CISA KEV response');
  }
  const raw = decoded as { vulnerabilities?: CisaKevRecord[] };
  const catalogUpdatedAt = optionalThreatDate(validation.data.dateReleased);

  const records = validation.data.vulnerabilities.map((row, index): NormalisedThreatIntelRecord => {
    const rawRow = raw.vulnerabilities?.[index] ?? row;
    const observedAt = parseThreatDate(row.dateAdded, 'dateAdded');
    const sourceUpdatedAt = catalogUpdatedAt ?? observedAt;
    const contentHash = hashJson(rawRow);

    return {
      sourceId: CISA_KEV_SOURCE_ID,
      sourceIndicatorId: row.cveID,
      observedAt,
      sourceUpdatedAt,
      indicatorType: 'cve',
      indicatorValue: row.cveID,
      threatKind: 'exploited_vulnerability',
      severity: 'critical',
      status: row.knownRansomwareCampaignUse ?? null,
      malwareFamily: null,
      port: null,
      countryCode: null,
      title: row.vulnerabilityName,
      description: row.shortDescription ?? null,
      referenceUrl: row.notes ?? null,
      dueAt: optionalThreatDate(row.dueDate),
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: rawRow,
      metadata: {
        provider: 'CISA',
        format: 'json',
        indicator_content_hash: contentHash,
        stableIdentifierSource: 'cveID',
        vendorProject: row.vendorProject,
        product: row.product,
        requiredAction: row.requiredAction ?? null,
        catalogVersion: validation.data.catalogVersion ?? null,
      },
    };
  });

  return { sourceId: CISA_KEV_SOURCE_ID, upstreamTimestamp: latestTimestamp(records), records };
}

export function normaliseThreatIntelFeed(
  body: Buffer,
  sourceId: ThreatIntelSourceId,
): NormalisedThreatIntelFeed {
  if (sourceId === ABUSECH_FEODO_SOURCE_ID) return normaliseFeodo(body);
  if (sourceId === ABUSECH_URLHAUS_SOURCE_ID) return normaliseUrlhaus(body);
  return normaliseCisaKev(body);
}

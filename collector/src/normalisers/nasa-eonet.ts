import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const NASA_EONET_VOLCANOES_SOURCE_ID = 'nasa-eonet-volcanoes' as const;

const finiteNumberSchema = z.number().refine(Number.isFinite, 'must be finite');

const eonetGeometrySchema = z
  .object({
    date: z.string().datetime({ offset: true }),
    type: z.literal('Point'),
    coordinates: z.tuple([
      finiteNumberSchema.min(-180).max(180),
      finiteNumberSchema.min(-90).max(90),
    ]),
  })
  .passthrough();

const eonetEventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    link: z.string().url().nullable().optional(),
    closed: z.string().datetime({ offset: true }).nullable().optional(),
    categories: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()),
    sources: z.array(z.object({ id: z.string(), url: z.string().optional() }).passthrough()).optional(),
    geometry: z.array(eonetGeometrySchema).min(1),
  })
  .passthrough();

const eonetResponseSchema = z
  .object({
    title: z.string().optional(),
    events: z.array(eonetEventSchema),
  })
  .passthrough();

type EonetEvent = z.infer<typeof eonetEventSchema>;

export interface NormalisedNasaEonetVolcano {
  sourceId: typeof NASA_EONET_VOLCANOES_SOURCE_ID;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  title: string;
  description: string | null;
  link: string | null;
  eventType: 'volcano';
  longitude: number;
  latitude: number;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: EonetEvent;
  metadata: {
    provider: 'NASA EONET';
    format: 'json';
    categoryIds: string[];
    sourceIds: string[];
    event_content_hash: string;
  };
}

export interface NormalisedNasaEonetFeed {
  sourceId: typeof NASA_EONET_VOLCANOES_SOURCE_ID;
  upstreamTimestamp: Date | null;
  records: NormalisedNasaEonetVolcano[];
}

export class NasaEonetNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NasaEonetNormalisationError';
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function latestGeometry(event: EonetEvent): EonetEvent['geometry'][number] {
  const sorted = [...event.geometry].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const latest = sorted.at(-1);
  if (latest === undefined) {
    throw new NasaEonetNormalisationError(`EONET event ${event.id} has no geometry`);
  }
  return latest;
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
}

export function normaliseNasaEonetVolcanoFeed(body: Buffer): NormalisedNasaEonetFeed {
  if (!Buffer.isBuffer(body)) {
    throw new NasaEonetNormalisationError('EONET response body must be a Buffer');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new NasaEonetNormalisationError('Invalid EONET JSON response body');
  }

  const validation = eonetResponseSchema.safeParse(decoded);
  if (!validation.success) {
    throw new NasaEonetNormalisationError(
      `Invalid EONET response: ${formatIssues(validation.error.issues)}`,
    );
  }

  const parsed = validation.data;
  const raw = decoded as { events: EonetEvent[] };
  const records = parsed.events.map((event, index) => {
    const rawEvent = raw.events[index];
    if (rawEvent === undefined) {
      throw new NasaEonetNormalisationError(`Missing raw EONET event at index ${index}`);
    }
    if (!event.categories.some((category) => category.id === 'volcanoes')) {
      throw new NasaEonetNormalisationError(`EONET event ${event.id} is not a volcano event`);
    }
    const geo = latestGeometry(event);
    const [longitude, latitude] = geo.coordinates;
    const occurredAt = new Date(geo.date);
    const contentHash = hashJson(rawEvent);

    return {
      sourceId: NASA_EONET_VOLCANOES_SOURCE_ID,
      sourceEventId: event.id,
      occurredAt,
      sourceUpdatedAt: occurredAt,
      title: event.title,
      description: event.description ?? null,
      link: event.link ?? null,
      eventType: 'volcano',
      longitude,
      latitude,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: rawEvent,
      metadata: {
        provider: 'NASA EONET',
        format: 'json',
        categoryIds: event.categories.map((category) => category.id),
        sourceIds: event.sources?.map((source) => source.id) ?? [],
        event_content_hash: contentHash,
      },
    } satisfies NormalisedNasaEonetVolcano;
  });

  const latest = records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);

  return {
    sourceId: NASA_EONET_VOLCANOES_SOURCE_ID,
    upstreamTimestamp: latest,
    records,
  };
}

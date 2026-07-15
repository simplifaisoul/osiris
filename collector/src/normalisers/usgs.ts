import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const USGS_EARTHQUAKE_SOURCE_ID = 'usgs-earthquakes' as const;

const epochMillisecondsSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(
    (value) => Number.isSafeInteger(value) && value <= 8_640_000_000_000_000,
    'must be a valid Unix epoch timestamp in milliseconds',
  );

const finiteNumberSchema = z.number().refine(Number.isFinite, 'must be finite');

export const usgsFeedMetadataSchema = z
  .object({
    generated: epochMillisecondsSchema,
    url: z.string().url(),
    title: z.string().min(1),
    status: z.number().int().min(100).max(599),
    api: z.string().min(1),
    count: z.number().int().nonnegative(),
  })
  .passthrough();

export const usgsFeaturePropertiesSchema = z
  .object({
    mag: finiteNumberSchema.nullable(),
    place: z.string().nullable(),
    time: epochMillisecondsSchema,
    updated: epochMillisecondsSchema,
    url: z.string().url().nullable(),
    tsunami: z.union([z.literal(0), z.literal(1)]),
    felt: z.number().int().nonnegative().nullable(),
    alert: z.string().min(1).nullable(),
    type: z.string().min(1).nullable(),
  })
  .passthrough();

export const usgsFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    id: z.string().min(1),
    properties: usgsFeaturePropertiesSchema,
    geometry: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([
          finiteNumberSchema.min(-180).max(180),
          finiteNumberSchema.min(-90).max(90),
          finiteNumberSchema,
        ]),
      })
      .passthrough(),
  })
  .passthrough();

export const usgsFeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    metadata: usgsFeedMetadataSchema,
    features: z.array(usgsFeatureSchema),
    bbox: z
      .tuple([
        finiteNumberSchema,
        finiteNumberSchema,
        finiteNumberSchema,
        finiteNumberSchema,
        finiteNumberSchema,
        finiteNumberSchema,
      ])
      .optional(),
  })
  .passthrough();

export type UsgsFeedMetadata = z.infer<typeof usgsFeedMetadataSchema>;
export type UsgsFeatureProperties = z.infer<typeof usgsFeaturePropertiesSchema>;
export type UsgsFeature = z.infer<typeof usgsFeatureSchema>;
export type UsgsFeatureCollection = z.infer<typeof usgsFeatureCollectionSchema>;

export interface UsgsRecordMetadata {
  /** Original feed metadata, including provider extensions. */
  feed: UsgsFeedMetadata;
  /** Original feature properties, including fields not normalised yet. */
  providerProperties: UsgsFeatureProperties;
  /** Values whose database representation differs from the live API contract. */
  compatibility: {
    tsunami: 0 | 1;
    url: string | null;
  };
}

export interface NormalisedUsgsEarthquake {
  sourceId: typeof USGS_EARTHQUAKE_SOURCE_ID;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  magnitude: number | null;
  depthKm: number;
  place: string | null;
  tsunami: boolean;
  /** The numeric value returned by the existing OSIRIS compatibility API. */
  compatibilityTsunami: 0 | 1;
  felt: number | null;
  alert: string | null;
  eventType: string | null;
  url: string | null;
  longitude: number;
  latitude: number;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: UsgsFeature;
  metadata: UsgsRecordMetadata;
}

export interface NormalisedUsgsFeed {
  sourceId: typeof USGS_EARTHQUAKE_SOURCE_ID;
  upstreamTimestamp: Date;
  feedMetadata: UsgsFeedMetadata;
  records: NormalisedUsgsEarthquake[];
}

export class UsgsNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsgsNormalisationError';
  }
}

function hashFeature(feature: UsgsFeature): string {
  return createHash('sha256').update(JSON.stringify(feature), 'utf8').digest('hex');
}

function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('; ');
}

/**
 * Validate and normalise an already-archived USGS response body.
 *
 * This function intentionally accepts raw bytes and performs no fetch or archive
 * write. Its caller must archive those bytes successfully before invoking it.
 */
export function normaliseUsgsEarthquakeFeed(body: Buffer): NormalisedUsgsFeed {
  if (!Buffer.isBuffer(body)) {
    throw new UsgsNormalisationError('USGS response body must be a Buffer');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new UsgsNormalisationError('Invalid USGS JSON response body');
  }

  const validation = usgsFeatureCollectionSchema.safeParse(decoded);
  if (!validation.success) {
    throw new UsgsNormalisationError(
      `Invalid USGS FeatureCollection: ${formatValidationIssues(validation.error.issues)}`,
    );
  }

  const feed = validation.data;
  if (feed.metadata.count !== feed.features.length) {
    throw new UsgsNormalisationError(
      `USGS metadata.count (${feed.metadata.count}) does not match features length (${feed.features.length})`,
    );
  }

  const seenIds = new Set<string>();
  for (const feature of feed.features) {
    if (seenIds.has(feature.id)) {
      throw new UsgsNormalisationError(`Duplicate USGS feature id: ${feature.id}`);
    }
    seenIds.add(feature.id);
  }

  // Validation proves that decoded has this shape. Use the original parsed
  // objects for rawPayload and hashing so unknown provider fields and key order
  // are not changed by Zod's parsed-object reconstruction.
  const rawFeed = decoded as UsgsFeatureCollection;
  const records = feed.features.map((feature, index): NormalisedUsgsEarthquake => {
    const rawFeature = rawFeed.features[index];
    if (rawFeature === undefined) {
      // Both arrays originate from the same validated object. Keep this guard so
      // strict indexed-access checking also protects future refactors.
      throw new UsgsNormalisationError(`Missing raw USGS feature at index ${index}`);
    }
    const [longitude, latitude, depthKm] = feature.geometry.coordinates;
    const properties = feature.properties;

    return {
      sourceId: USGS_EARTHQUAKE_SOURCE_ID,
      sourceEventId: feature.id,
      occurredAt: new Date(properties.time),
      sourceUpdatedAt: new Date(properties.updated),
      magnitude: properties.mag,
      depthKm,
      place: properties.place,
      tsunami: properties.tsunami === 1,
      compatibilityTsunami: properties.tsunami,
      felt: properties.felt,
      alert: properties.alert,
      eventType: properties.type,
      url: properties.url,
      longitude,
      latitude,
      contentHash: hashFeature(rawFeature),
      evidenceClassification: 'reported',
      rawPayload: rawFeature,
      metadata: {
        feed: rawFeed.metadata,
        providerProperties: rawFeature.properties,
        compatibility: {
          tsunami: properties.tsunami,
          url: properties.url,
        },
      },
    };
  });

  return {
    sourceId: USGS_EARTHQUAKE_SOURCE_ID,
    upstreamTimestamp: new Date(feed.metadata.generated),
    feedMetadata: rawFeed.metadata,
    records,
  };
}

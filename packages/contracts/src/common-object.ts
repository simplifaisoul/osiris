import { z } from 'zod';

export const ClassificationSchema = z.enum([
  'UNCLASSIFIED',
  'RESTRICTED',
  'CONFIDENTIAL',
  'SECRET',
  'TOP_SECRET',
]);

export const GeoJsonGeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']),
  coordinates: z.unknown(),
});

export const CommonObjectSchema = z.object({
  id: z.string().uuid(),
  object_type: z.string().min(1),
  source_id: z.string().min(1),
  source_type: z.string().min(1),
  collector_id: z.string().min(1),
  source_reference: z.string().min(1),
  observed_at: z.iso.datetime({ offset: true }),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  ingested_at: z.iso.datetime({ offset: true }),
  processed_at: z.iso.datetime({ offset: true }),
  geometry: GeoJsonGeometrySchema.nullable(),
  bounding_box: z.array(z.number()).min(4).max(6).nullable(),
  raw_object_uri: z.string().min(1),
  normalized_payload: z.record(z.string(), z.unknown()),
  content_hash: z.string().regex(/^[a-fA-F0-9]{64}$/),
  language: z.string().nullable(),
  country: z.string().length(2).nullable(),
  classification: ClassificationSchema,
  handling_caveat: z.string().nullable(),
  tenant_id: z.string().min(1),
  source_reliability: z.number().int().min(1).max(6),
  information_credibility: z.number().int().min(1).max(6),
  machine_confidence: z.string().nullable(),
  analyst_confidence: z.string().nullable(),
  licence_or_usage_basis: z.string().min(1),
  retention_policy: z.record(z.string(), z.unknown()),
  processing_history: z.array(z.record(z.string(), z.unknown())),
  model_versions: z.array(z.string()),
  correlation_ids: z.array(z.string()),
  chain_of_custody: z.array(z.record(z.string(), z.unknown())),
  is_synthetic: z.boolean(),
  version: z.number().int().positive(),
});

export type CommonObject = z.infer<typeof CommonObjectSchema>;


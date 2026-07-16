import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { z } from 'zod';

export const NASA_EONET_WEATHER_SOURCE_ID = 'nasa-eonet-weather' as const;
export const NOAA_NWS_ALERTS_SOURCE_ID = 'noaa-nws-alerts' as const;

export type WeatherSourceId =
  | typeof NASA_EONET_WEATHER_SOURCE_ID
  | typeof NOAA_NWS_ALERTS_SOURCE_ID;

export type WeatherSeverity = 'low' | 'medium' | 'high';

const finiteNumberSchema = z.number().refine(Number.isFinite, 'must be finite');

const eonetGeometrySchema = z
  .object({
    date: z.string().min(1),
    type: z.string().min(1),
    coordinates: z.array(finiteNumberSchema),
  })
  .passthrough();

const eonetEventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    categories: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()).optional(),
    geometry: z.array(eonetGeometrySchema).optional(),
    sources: z.array(z.object({ id: z.string().optional(), url: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();

const eonetResponseSchema = z
  .object({
    events: z.array(eonetEventSchema).default([]),
  })
  .passthrough();

const nwsGeometrySchema = z
  .object({
    type: z.enum(['Point', 'Polygon', 'MultiPolygon']),
    coordinates: z.unknown(),
  })
  .passthrough();

const nwsFeatureSchema = z
  .object({
    id: z.string().optional(),
    geometry: nwsGeometrySchema.nullable().optional(),
    properties: z
      .object({
        '@id': z.string().optional(),
        id: z.string().optional(),
        headline: z.string().nullable().optional(),
        event: z.string().nullable().optional(),
        severity: z.string().nullable().optional(),
        effective: z.string().nullable().optional(),
        sent: z.string().nullable().optional(),
        expires: z.string().nullable().optional(),
        areaDesc: z.string().nullable().optional(),
      })
      .passthrough()
      .default({}),
  })
  .passthrough();

const nwsResponseSchema = z
  .object({
    features: z.array(nwsFeatureSchema).default([]),
  })
  .passthrough();

type EonetEvent = z.infer<typeof eonetEventSchema>;
type EonetGeometry = NonNullable<EonetEvent['geometry']>[number];
type NwsFeature = z.infer<typeof nwsFeatureSchema>;

export interface NormalisedWeatherEvent {
  sourceId: WeatherSourceId;
  sourceEventId: string;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  title: string;
  category: string;
  eventType: string;
  severity: WeatherSeverity;
  longitude: number;
  latitude: number;
  area: string | null;
  expiresAt: Date | null;
  link: string | null;
  contentHash: string;
  evidenceClassification: 'reported';
  rawPayload: unknown;
  metadata: {
    provider: 'NASA EONET' | 'NOAA/NWS';
    format: 'json' | 'geojson';
    event_content_hash: string;
    stableIdentifierSource: string;
    [key: string]: unknown;
  };
}

export interface NormalisedWeatherFeed {
  sourceId: WeatherSourceId;
  upstreamTimestamp: Date | null;
  records: NormalisedWeatherEvent[];
}

export class WeatherNormalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherNormalisationError';
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function parseJson(body: Buffer): unknown {
  if (!Buffer.isBuffer(body)) {
    throw new WeatherNormalisationError('Weather response body must be a Buffer');
  }
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new WeatherNormalisationError('Invalid weather JSON response body');
  }
}

function parseDate(value: string | null | undefined, label: string): Date {
  if (value === undefined || value === null || value.trim().length === 0) {
    throw new WeatherNormalisationError(`Weather row missing ${label}`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new WeatherNormalisationError(`Weather row has invalid ${label}`);
  }
  return parsed;
}

function optionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value.trim().length === 0) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pointFromCoordinates(value: unknown): { longitude: number; latitude: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude };
}

function averageCoordinates(coords: unknown): { longitude: number; latitude: number } | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let longitude = 0;
  let latitude = 0;
  let count = 0;
  for (const coord of coords) {
    const point = pointFromCoordinates(coord);
    if (point === null) continue;
    longitude += point.longitude;
    latitude += point.latitude;
    count += 1;
  }
  if (count === 0) return null;
  return { longitude: longitude / count, latitude: latitude / count };
}

function firstArrayItem(value: unknown): unknown {
  return Array.isArray(value) ? (value as readonly unknown[])[0] : undefined;
}

function representativeNwsPoint(geometry: NwsFeature['geometry']): {
  longitude: number;
  latitude: number;
} | null {
  if (geometry === undefined || geometry === null) return null;
  if (geometry.type === 'Point') return pointFromCoordinates(geometry.coordinates);
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return averageCoordinates(firstArrayItem(geometry.coordinates));
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return averageCoordinates(firstArrayItem(firstArrayItem(geometry.coordinates)));
  }
  return null;
}

function eonetType(category: string, title: string): {
  eventType: string;
  severity: WeatherSeverity;
  keep: boolean;
} {
  if (category === 'wildfires' || category === 'earthquakes') {
    return { eventType: title, severity: 'low', keep: false };
  }
  if (category === 'severeStorms') return { eventType: 'Severe Storm', severity: 'high', keep: true };
  if (category === 'volcanoes') return { eventType: 'Volcano Eruption', severity: 'high', keep: true };
  if (category === 'seaIce') return { eventType: 'Iceberg / Sea Ice', severity: 'medium', keep: true };
  return { eventType: title || 'Weather Anomaly', severity: 'low', keep: true };
}

function latestPointGeometry(event: EonetEvent): EonetGeometry | null {
  const points = (event.geometry ?? []).filter(
    (geometry) => geometry.type === 'Point' && pointFromCoordinates(geometry.coordinates) !== null,
  );
  return [...points].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1) ?? null;
}

function normaliseEonetWeather(body: Buffer): NormalisedWeatherFeed {
  const decoded = parseJson(body);
  const validation = eonetResponseSchema.safeParse(decoded);
  if (!validation.success) {
    throw new WeatherNormalisationError('Invalid NASA EONET weather response');
  }
  const raw = decoded as { events?: EonetEvent[] };
  const records: NormalisedWeatherEvent[] = [];

  validation.data.events.forEach((event, index) => {
    const category = event.categories?.[0]?.id ?? 'unknown';
    const categoryTitle = event.categories?.[0]?.title ?? 'Weather Anomaly';
    const type = eonetType(category, categoryTitle);
    if (!type.keep) return;
    const geometry = latestPointGeometry(event);
    if (geometry === null) return;
    const point = pointFromCoordinates(geometry.coordinates);
    if (point === null) return;
    const occurredAt = parseDate(geometry.date, 'geometry.date');
    const rawEvent = raw.events?.[index] ?? event;
    const contentHash = hashJson(rawEvent);

    records.push({
      sourceId: NASA_EONET_WEATHER_SOURCE_ID,
      sourceEventId: event.id,
      occurredAt,
      sourceUpdatedAt: occurredAt,
      title: event.title,
      category,
      eventType: type.eventType,
      severity: type.severity,
      longitude: point.longitude,
      latitude: point.latitude,
      area: null,
      expiresAt: null,
      link: event.link ?? event.sources?.[0]?.url ?? null,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: rawEvent,
      metadata: {
        provider: 'NASA EONET',
        format: 'json',
        event_content_hash: contentHash,
        stableIdentifierSource: 'event_id',
        categoryIds: event.categories?.map((item) => item.id) ?? [],
        sourceIds: event.sources?.map((item) => item.id).filter((id) => id !== undefined) ?? [],
      },
    });
  });

  return {
    sourceId: NASA_EONET_WEATHER_SOURCE_ID,
    upstreamTimestamp: latestTimestamp(records),
    records,
  };
}

function normaliseNwsSeverity(severity: string | null | undefined): WeatherSeverity {
  if (severity === 'Extreme' || severity === 'Severe') return 'high';
  if (severity === 'Moderate') return 'medium';
  return 'low';
}

function normaliseNwsAlerts(body: Buffer): NormalisedWeatherFeed {
  const decoded = parseJson(body);
  const validation = nwsResponseSchema.safeParse(decoded);
  if (!validation.success) {
    throw new WeatherNormalisationError('Invalid NOAA/NWS alerts response');
  }
  const raw = decoded as { features?: NwsFeature[] };
  const records: NormalisedWeatherEvent[] = [];

  validation.data.features.forEach((feature, index) => {
    const point = representativeNwsPoint(feature.geometry);
    if (point === null) return;
    const props = feature.properties;
    const occurredAt = parseDate(props.effective ?? props.sent, 'effective');
    const sourceEventId = props.id ?? props['@id'] ?? feature.id;
    if (sourceEventId === undefined || sourceEventId.length === 0) {
      throw new WeatherNormalisationError('NOAA/NWS alert missing stable id');
    }
    const rawFeature = raw.features?.[index] ?? feature;
    const contentHash = hashJson(rawFeature);

    records.push({
      sourceId: NOAA_NWS_ALERTS_SOURCE_ID,
      sourceEventId,
      occurredAt,
      sourceUpdatedAt: optionalDate(props.sent) ?? occurredAt,
      title: props.headline ?? props.event ?? 'NWS Weather Alert',
      category: 'weatherAlerts',
      eventType: props.event ?? 'Weather Alert',
      severity: normaliseNwsSeverity(props.severity),
      longitude: point.longitude,
      latitude: point.latitude,
      area: props.areaDesc ?? null,
      expiresAt: optionalDate(props.expires),
      link: props['@id'] ?? null,
      contentHash,
      evidenceClassification: 'reported',
      rawPayload: rawFeature,
      metadata: {
        provider: 'NOAA/NWS',
        format: 'geojson',
        event_content_hash: contentHash,
        stableIdentifierSource: props.id !== undefined ? 'properties.id' : 'properties.@id',
        geometryType: feature.geometry?.type ?? null,
        nwsSeverity: props.severity ?? null,
      },
    });
  });

  return {
    sourceId: NOAA_NWS_ALERTS_SOURCE_ID,
    upstreamTimestamp: latestTimestamp(records),
    records,
  };
}

function latestTimestamp(records: NormalisedWeatherEvent[]): Date | null {
  return records.reduce<Date | null>((current, record) => {
    if (current === null || record.sourceUpdatedAt.getTime() > current.getTime()) {
      return record.sourceUpdatedAt;
    }
    return current;
  }, null);
}

export function normaliseWeatherFeed(body: Buffer, sourceId: WeatherSourceId): NormalisedWeatherFeed {
  if (sourceId === NASA_EONET_WEATHER_SOURCE_ID) return normaliseEonetWeather(body);
  return normaliseNwsAlerts(body);
}

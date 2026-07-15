import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  UsgsNormalisationError,
  normaliseUsgsEarthquakeFeed,
  usgsFeatureCollectionSchema,
} from '../src/normalisers/usgs.js';
import type {
  NormalisedUsgsEarthquake,
  UsgsFeature,
  UsgsFeatureCollection,
} from '../src/normalisers/usgs.js';

const fixtureUrl = new URL('./fixtures/usgs-earthquakes.geojson', import.meta.url);

let fixtureBody: Buffer;
let fixtureValue: UsgsFeatureCollection;

interface MutableTestFeature {
  id: string;
  geometry: {
    type: string;
    coordinates: unknown[];
  };
  properties: Record<string, unknown>;
}

interface MutableTestFeed {
  metadata: Record<string, unknown>;
  features: MutableTestFeature[];
}

function parseUnknownJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function requireItem<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Fixture is missing ${label} at index ${index}`);
  return item;
}

function fixtureFeature(index: number): UsgsFeature {
  return requireItem(fixtureValue.features, index, 'feature');
}

function resultRecord(records: readonly NormalisedUsgsEarthquake[], index: number): NormalisedUsgsEarthquake {
  return requireItem(records, index, 'normalised record');
}

function mutableFixture(): MutableTestFeed {
  return structuredClone(fixtureValue);
}

function mutableFeature(feed: MutableTestFeed, index = 0): MutableTestFeature {
  return requireItem(feed.features, index, 'mutable feature');
}

beforeAll(async () => {
  fixtureBody = await readFile(fixtureUrl);
  const parsed = parseUnknownJson(fixtureBody.toString('utf8'));
  const validation = usgsFeatureCollectionSchema.safeParse(parsed);
  if (!validation.success) throw validation.error;
  fixtureValue = parsed as UsgsFeatureCollection;
});

function asBody(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

describe('normaliseUsgsEarthquakeFeed', () => {
  it('normalises a deterministic feed without losing the original features', () => {
    const result = normaliseUsgsEarthquakeFeed(fixtureBody);

    expect(result.sourceId).toBe('usgs-earthquakes');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(result.feedMetadata).toEqual(fixtureValue.metadata);
    expect(result.records).toHaveLength(2);

    const first = resultRecord(result.records, 0);
    expect(first).toMatchObject({
      sourceId: 'usgs-earthquakes',
      sourceEventId: 'test-us-001',
      magnitude: 5.2,
      depthKm: 12.5,
      place: '42 km E of Test Harbour',
      tsunami: true,
      compatibilityTsunami: 1,
      felt: 27,
      alert: 'green',
      eventType: 'earthquake',
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test-us-001',
      longitude: 151.2093,
      latitude: -33.8688,
      evidenceClassification: 'reported',
    });
    expect(first.occurredAt).toEqual(new Date(1767222000123));
    expect(first.sourceUpdatedAt).toEqual(new Date(1767223800456));
    expect(first.rawPayload).toEqual(fixtureFeature(0));
    expect(first.rawPayload).toHaveProperty('provider_extension.reviewedBy', 'synthetic-fixture');
    expect(first.metadata.providerProperties).toHaveProperty('customProviderField', 'preserve-me');
    expect(first.metadata.compatibility).toEqual({
      tsunami: 1,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test-us-001',
    });
  });

  it('preserves nullable values, coordinate axes, negative depth, and zero tsunami', () => {
    const second = resultRecord(normaliseUsgsEarthquakeFeed(fixtureBody).records, 1);

    expect(second).toMatchObject({
      sourceEventId: 'test-us-002',
      magnitude: null,
      place: null,
      felt: null,
      alert: null,
      eventType: null,
      url: null,
      longitude: -122.4194,
      latitude: 37.7749,
      depthKm: -1.25,
      tsunami: false,
      compatibilityTsunami: 0,
    });
    expect(second.occurredAt).toEqual(new Date(1767218400000));
    expect(second.sourceUpdatedAt).toEqual(new Date(1767220200000));
  });

  it('hashes JSON.stringify of each unmodified feature with SHA-256', () => {
    const result = normaliseUsgsEarthquakeFeed(fixtureBody);

    for (const [index, record] of result.records.entries()) {
      const expectedHash = createHash('sha256')
        .update(JSON.stringify(fixtureFeature(index)), 'utf8')
        .digest('hex');
      expect(record.contentHash).toBe(expectedHash);
      expect(record.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('rejects malformed JSON', () => {
    expect(() => normaliseUsgsEarthquakeFeed(Buffer.from('{not-json', 'utf8')))
      .toThrowError(new UsgsNormalisationError('Invalid USGS JSON response body'));
  });

  it('rejects missing or invalid feed metadata', () => {
    const invalid = mutableFixture();
    delete invalid.metadata.generated;

    expect(() => normaliseUsgsEarthquakeFeed(asBody(invalid))).toThrow(/metadata\.generated/);
  });

  it('rejects a metadata count that differs from the feature array length', () => {
    const invalid = mutableFixture();
    invalid.metadata.count = 1;

    expect(() => normaliseUsgsEarthquakeFeed(asBody(invalid))).toThrow(/metadata\.count \(1\).*features length \(2\)/);
  });

  it.each([
    ['non-Point geometry', (value: MutableTestFeed) => { mutableFeature(value).geometry.type = 'LineString'; }],
    ['longitude outside its range', (value: MutableTestFeed) => { mutableFeature(value).geometry.coordinates[0] = 181; }],
    ['latitude outside its range', (value: MutableTestFeed) => { mutableFeature(value).geometry.coordinates[1] = -91; }],
    ['missing numeric depth', (value: MutableTestFeed) => { mutableFeature(value).geometry.coordinates.pop(); }],
  ])('rejects %s', (_label, mutate) => {
    const invalid = mutableFixture();
    mutate(invalid);

    expect(() => normaliseUsgsEarthquakeFeed(asBody(invalid))).toThrow(/geometry/);
  });

  it('rejects invalid event timestamps instead of inventing a time', () => {
    const invalid = mutableFixture();
    mutableFeature(invalid).properties.time = null;

    expect(() => normaliseUsgsEarthquakeFeed(asBody(invalid))).toThrow(/properties\.time/);
  });

  it('rejects duplicate provider IDs', () => {
    const invalid = mutableFixture();
    mutableFeature(invalid, 1).id = mutableFeature(invalid, 0).id;

    expect(() => normaliseUsgsEarthquakeFeed(asBody(invalid))).toThrow(/Duplicate USGS feature id/);
  });
});

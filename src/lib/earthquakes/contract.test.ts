import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildEarthquakeResponse,
  mapUsgsEarthquakeFeed,
  parseEarthquakeResponse,
} from './contract';
import { expectedFixtureEarthquakes } from './test-fixture';

const fixtureUrl = new URL(
  '../../../collector/test/fixtures/usgs-earthquakes.geojson',
  import.meta.url,
);

async function loadFixture(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as unknown;
}

describe('USGS earthquake compatibility contract', () => {
  it('maps the committed provider fixture without changing field semantics', async () => {
    expect(mapUsgsEarthquakeFeed(await loadFixture())).toEqual(expectedFixtureEarthquakes);
  });

  it('rejects a malformed row atomically instead of replacing last-good data', () => {
    expect(() => mapUsgsEarthquakeFeed({
      type: 'FeatureCollection',
      metadata: { count: 1 },
      features: [
        {
          id: 'missing-coordinates',
          geometry: { type: 'Point', coordinates: [] },
          properties: { time: 1, tsunami: 0 },
        },
      ],
    })).toThrow('USGS feature at index 0 has invalid geometry');
  });

  it('accepts a valid zero-record provider feed', () => {
    expect(mapUsgsEarthquakeFeed({
      type: 'FeatureCollection',
      metadata: { count: 0 },
      features: [],
    })).toEqual([]);
  });

  it('validates successful API envelopes and rejects error payloads', () => {
    const generatedAt = new Date('2026-01-01T01:00:00.000Z');
    const response = buildEarthquakeResponse(expectedFixtureEarthquakes, generatedAt);

    expect(parseEarthquakeResponse(response)).toEqual(response);
    expect(parseEarthquakeResponse({ earthquakes: [], error: 'USGS unavailable' })).toBeNull();
    expect(parseEarthquakeResponse({ ...response, total: 99 })).toBeNull();
  });
});

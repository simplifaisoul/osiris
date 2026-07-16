import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  NASA_EONET_WEATHER_SOURCE_ID,
  NOAA_NWS_ALERTS_SOURCE_ID,
  WeatherNormalisationError,
  normaliseWeatherFeed,
} from '../src/normalisers/weather.js';

let eonetFixture: Buffer;
let nwsFixture: Buffer;

beforeAll(async () => {
  eonetFixture = await readFile(new URL('./fixtures/nasa-eonet-weather.json', import.meta.url));
  nwsFixture = await readFile(new URL('./fixtures/noaa-nws-alerts.json', import.meta.url));
});

describe('normaliseWeatherFeed', () => {
  it('normalises open NASA EONET weather events and skips fire duplicates', () => {
    const result = normaliseWeatherFeed(eonetFixture, NASA_EONET_WEATHER_SOURCE_ID);

    expect(result.sourceId).toBe('nasa-eonet-weather');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-01T01:00:00.000Z'));
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceEventId: 'EONET_7001',
      category: 'severeStorms',
      eventType: 'Severe Storm',
      severity: 'high',
      longitude: 140.5,
      latitude: -12.25,
      evidenceClassification: 'reported',
    });
  });

  it('normalises NOAA/NWS active alerts with representative geometry', () => {
    const result = normaliseWeatherFeed(nwsFixture, NOAA_NWS_ALERTS_SOURCE_ID);

    expect(result.sourceId).toBe('noaa-nws-alerts');
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceEventId: 'urn:oid:fixture-1',
      eventType: 'Severe Thunderstorm Warning',
      severity: 'high',
      area: 'Fixture County',
      expiresAt: new Date('2026-01-01T04:00:00.000Z'),
      longitude: -99.2,
      latitude: 40.8,
      evidenceClassification: 'reported',
    });
    expect(result.records[1]).toMatchObject({
      sourceEventId: 'https://api.weather.gov/alerts/urn:oid:fixture-2',
      eventType: 'Flood Watch',
      severity: 'medium',
      longitude: -75.5,
      latitude: 39.2,
    });
  });

  it('rejects invalid JSON', () => {
    expect(() => normaliseWeatherFeed(Buffer.from('{'), NASA_EONET_WEATHER_SOURCE_ID)).toThrowError(
      new WeatherNormalisationError('Invalid weather JSON response body'),
    );
  });
});

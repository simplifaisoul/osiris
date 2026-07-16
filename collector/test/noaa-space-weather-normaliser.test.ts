import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  NOAA_SWPC_ALERTS_SOURCE_ID,
  NOAA_SWPC_KP_SOURCE_ID,
  NOAA_SWPC_XRAY_FLARES_SOURCE_ID,
  NoaaSpaceWeatherNormalisationError,
  normaliseNoaaSpaceWeatherFeed,
} from '../src/normalisers/noaa-space-weather.js';

let kpFixture: Buffer;
let alertsFixture: Buffer;
let flareFixture: Buffer;

beforeAll(async () => {
  kpFixture = await readFile(new URL('./fixtures/noaa-swpc-kp.json', import.meta.url));
  alertsFixture = await readFile(new URL('./fixtures/noaa-swpc-alerts.json', import.meta.url));
  flareFixture = await readFile(new URL('./fixtures/noaa-swpc-xray-flares.json', import.meta.url));
});

describe('normaliseNoaaSpaceWeatherFeed', () => {
  it('normalises planetary Kp observations with storm classification', () => {
    const result = normaliseNoaaSpaceWeatherFeed(kpFixture, NOAA_SWPC_KP_SOURCE_ID);

    expect(result.sourceId).toBe('noaa-swpc-planetary-k-index');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-01T00:01:00.000Z'));
    expect(result.records).toHaveLength(2);
    expect(result.records[1]).toMatchObject({
      sourceObservationId: 'kp-2026-01-01T00:01:00.000Z',
      observedAt: new Date('2026-01-01T00:01:00.000Z'),
      eventKind: 'planetary_k_index',
      numericValue: 5.67,
      classification: 'G2',
      evidenceClassification: 'observed',
    });
  });

  it('normalises SWPC alert products with reported provenance', () => {
    const result = normaliseNoaaSpaceWeatherFeed(alertsFixture, NOAA_SWPC_ALERTS_SOURCE_ID);

    expect(result.records[0]).toMatchObject({
      sourceObservationId: 'alert-ALTK05-2026-01-01T00:05:00.000Z',
      observedAt: new Date('2026-01-01T00:05:00.000Z'),
      eventKind: 'alert',
      classification: 'ALTK05',
      message: 'Geomagnetic K-index of 5 threshold reached fixture.',
      evidenceClassification: 'reported',
    });
  });

  it('normalises GOES X-ray flares by peak time and class', () => {
    const result = normaliseNoaaSpaceWeatherFeed(flareFixture, NOAA_SWPC_XRAY_FLARES_SOURCE_ID);

    expect(result.records[0]).toMatchObject({
      sourceObservationId: 'xray-2026-01-01T01:12:00.000Z-M1.2',
      observedAt: new Date('2026-01-01T01:12:00.000Z'),
      eventKind: 'xray_flare',
      classification: 'M1.2',
      evidenceClassification: 'observed',
    });
  });

  it('rejects non-array JSON', () => {
    expect(() =>
      normaliseNoaaSpaceWeatherFeed(Buffer.from('{}'), NOAA_SWPC_KP_SOURCE_ID),
    ).toThrowError(new NoaaSpaceWeatherNormalisationError('NOAA response must be a JSON array'));
  });
});

import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  NASA_FIRMS_VIIRS_SOURCE_ID,
  NasaFirmsNormalisationError,
  normaliseNasaFirmsFeed,
} from '../src/normalisers/nasa-firms.js';

let fixtureBody: Buffer;

beforeAll(async () => {
  fixtureBody = await readFile(new URL('./fixtures/nasa-firms-viirs.csv', import.meta.url));
});

describe('normaliseNasaFirmsFeed', () => {
  it('normalises FIRMS CSV detections with acquisition timestamps and raw payloads', () => {
    const result = normaliseNasaFirmsFeed(fixtureBody, NASA_FIRMS_VIIRS_SOURCE_ID);

    expect(result.sourceId).toBe('nasa-firms-viirs');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-01T12:15:00.000Z'));
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceId: 'nasa-firms-viirs',
      occurredAt: new Date('2026-01-01T00:30:00.000Z'),
      sourceUpdatedAt: new Date('2026-01-01T00:30:00.000Z'),
      latitude: -33.8688,
      longitude: 151.2093,
      brightnessKelvin: 331.2,
      fireRadiativePowerMw: 12.4,
      satellite: 'N',
      instrument: 'VIIRS',
      confidence: 'n',
      dayNight: 'D',
      evidenceClassification: 'observed',
      metadata: {
        provider: 'NASA FIRMS',
        stableIdentifierSource: 'content_fingerprint',
      },
    });
    expect(result.records[0]?.sourceEventId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.records[0]?.rawPayload.version).toBe('2.0NRT');
  });

  it('rejects missing required columns', () => {
    expect(() =>
      normaliseNasaFirmsFeed(Buffer.from('latitude,longitude\n1,2\n'), NASA_FIRMS_VIIRS_SOURCE_ID),
    ).toThrow(/acq_date/);
  });

  it('rejects out-of-range coordinates', () => {
    const invalid = fixtureBody.toString('utf8').replace('-33.8688', '-93.0000');

    expect(() =>
      normaliseNasaFirmsFeed(Buffer.from(invalid, 'utf8'), NASA_FIRMS_VIIRS_SOURCE_ID),
    ).toThrowError(new NasaFirmsNormalisationError('FIRMS row coordinates are out of range'));
  });
});

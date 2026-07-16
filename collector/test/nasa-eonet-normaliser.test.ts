import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  NasaEonetNormalisationError,
  normaliseNasaEonetVolcanoFeed,
} from '../src/normalisers/nasa-eonet.js';

let fixtureBody: Buffer;

beforeAll(async () => {
  fixtureBody = await readFile(new URL('./fixtures/nasa-eonet-volcanoes.json', import.meta.url));
});

describe('normaliseNasaEonetVolcanoFeed', () => {
  it('normalises EONET volcanoes using the latest point geometry', () => {
    const result = normaliseNasaEonetVolcanoFeed(fixtureBody);

    expect(result.sourceId).toBe('nasa-eonet-volcanoes');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-02T03:30:00.000Z'));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceId: 'nasa-eonet-volcanoes',
      sourceEventId: 'EONET_1001',
      occurredAt: new Date('2026-01-02T03:30:00.000Z'),
      title: 'Fixture Volcano, Test Island',
      description: 'Visible ash emission fixture.',
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1001',
      eventType: 'volcano',
      longitude: 145.22,
      latitude: -6.19,
      evidenceClassification: 'reported',
      metadata: {
        provider: 'NASA EONET',
        categoryIds: ['volcanoes'],
        sourceIds: ['EO'],
      },
    });
    expect(result.records[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects malformed JSON', () => {
    expect(() => normaliseNasaEonetVolcanoFeed(Buffer.from('{not-json')))
      .toThrowError(new NasaEonetNormalisationError('Invalid EONET JSON response body'));
  });

  it('rejects non-volcano events for this source adapter', () => {
    const invalid = fixtureBody.toString('utf8').replace('"volcanoes"', '"wildfires"');

    expect(() => normaliseNasaEonetVolcanoFeed(Buffer.from(invalid, 'utf8')))
      .toThrow(/not a volcano event/);
  });
});

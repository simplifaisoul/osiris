import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  GdacsNormalisationError,
  normaliseGdacsDisasterFeed,
} from '../src/normalisers/gdacs.js';

let fixtureBody: Buffer;

beforeAll(async () => {
  fixtureBody = await readFile(new URL('./fixtures/gdacs-disasters.xml', import.meta.url));
});

describe('normaliseGdacsDisasterFeed', () => {
  it('normalises GDACS RSS items without losing the original item evidence', () => {
    const result = normaliseGdacsDisasterFeed(fixtureBody);

    expect(result.sourceId).toBe('gdacs-disasters');
    expect(result.upstreamTimestamp).toEqual(new Date('2026-01-01T01:15:00.000Z'));
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sourceId: 'gdacs-disasters',
      occurredAt: new Date('2026-01-01T00:10:00.000Z'),
      sourceUpdatedAt: new Date('2026-01-01T00:10:00.000Z'),
      title: 'Green earthquake alert (Magnitude 5.9M, Depth:10km) in Test Region',
      description: 'GDACS earthquake fixture description.',
      eventType: 'EQ',
      latitude: -12.345,
      longitude: 45.678,
      evidenceClassification: 'reported',
      metadata: {
        provider: 'GDACS',
        format: 'rss',
        stableIdentifierSource: 'guid',
      },
    });
    expect(result.records[0]?.link).toContain('&episodeid=1&');
    expect(result.records[0]?.rawPayload.rawXml).toContain('<gdacs:eventtype>EQ</gdacs:eventtype>');
    expect(result.records[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.records[1]?.metadata.stableIdentifierSource).toBe('link');
  });

  it('rejects non-RSS bodies', () => {
    expect(() => normaliseGdacsDisasterFeed(Buffer.from('not xml', 'utf8')))
      .toThrowError(new GdacsNormalisationError('GDACS response is not an RSS document'));
  });

  it('rejects invalid coordinates instead of inventing a location', () => {
    const invalid = fixtureBody.toString('utf8').replace('<geo:lat>-12.345</geo:lat>', '');

    expect(() => normaliseGdacsDisasterFeed(Buffer.from(invalid, 'utf8')))
      .toThrow(/geo:lat/);
  });
});

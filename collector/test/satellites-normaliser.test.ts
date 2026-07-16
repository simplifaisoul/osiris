import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  CELESTRAK_ACTIVE_SOURCE_ID,
  CELESTRAK_STARLINK_SOURCE_ID,
  SATNOGS_TLE_SOURCE_ID,
  SatelliteNormalisationError,
  normaliseSatelliteFeed,
} from '../src/normalisers/satellites.js';

let activeFixture: Buffer;
let starlinkFixture: Buffer;
let satnogsFixture: Buffer;

beforeAll(async () => {
  activeFixture = await readFile(new URL('./fixtures/celestrak-active.tle', import.meta.url));
  starlinkFixture = await readFile(new URL('./fixtures/celestrak-starlink.tle', import.meta.url));
  satnogsFixture = await readFile(new URL('./fixtures/satnogs-tle.json', import.meta.url));
});

describe('normaliseSatelliteFeed', () => {
  it('normalises CelesTrak active TLE triples', () => {
    const result = normaliseSatelliteFeed(activeFixture, CELESTRAK_ACTIVE_SOURCE_ID);

    expect(result.sourceId).toBe(CELESTRAK_ACTIVE_SOURCE_ID);
    expect(result.records).toHaveLength(2);
    expect(result.upstreamTimestamp).toBeInstanceOf(Date);
    expect(result.records[0]).toMatchObject({
      sourceId: CELESTRAK_ACTIVE_SOURCE_ID,
      sourceTleId: '900',
      noradId: 900,
      name: 'CALSPHERE 1',
      evidenceClassification: 'reported',
      metadata: {
        provider: 'CelesTrak',
        format: 'tle',
        stableIdentifierSource: 'norad_id',
      },
    });
    expect(result.records[0]?.epochAt?.getUTCFullYear()).toBe(2026);
    expect(result.records[0]?.metadata.tle_content_hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('normalises Starlink supplemental TLE records with NORAD suffixes', () => {
    const result = normaliseSatelliteFeed(starlinkFixture, CELESTRAK_STARLINK_SOURCE_ID);

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceId: CELESTRAK_STARLINK_SOURCE_ID,
      sourceTleId: '44714',
      noradId: 44714,
      name: 'STARLINK-1007',
    });
  });

  it('normalises SatNOGS JSON TLE records', () => {
    const result = normaliseSatelliteFeed(satnogsFixture, SATNOGS_TLE_SOURCE_ID);

    expect(result.sourceId).toBe(SATNOGS_TLE_SOURCE_ID);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      sourceTleId: '25544',
      noradId: 25544,
      name: 'ISS (ZARYA)',
      metadata: {
        provider: 'SatNOGS',
        format: 'json',
        stableIdentifierSource: 'norad_cat_id',
        satId: 'QO-100-fixture',
        tleSource: 'Space-Track.org',
      },
    });
    expect(result.records[0]?.sourceUpdatedAt.toISOString()).toBe('2026-07-15T23:33:31.524Z');
  });

  it('rejects invalid satellite feed bodies', () => {
    expect(() => normaliseSatelliteFeed(Buffer.from('not tle'), CELESTRAK_ACTIVE_SOURCE_ID)).toThrow(
      SatelliteNormalisationError,
    );
    expect(() => normaliseSatelliteFeed(Buffer.from('{'), SATNOGS_TLE_SOURCE_ID)).toThrow(
      SatelliteNormalisationError,
    );
  });
});

import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  ABUSECH_FEODO_SOURCE_ID,
  ABUSECH_URLHAUS_SOURCE_ID,
  CISA_KEV_SOURCE_ID,
  ThreatIntelNormalisationError,
  normaliseThreatIntelFeed,
} from '../src/normalisers/threat-intel.js';

let feodoFixture: Buffer;
let urlhausFixture: Buffer;
let cisaFixture: Buffer;

beforeAll(async () => {
  feodoFixture = await readFile(new URL('./fixtures/abusech-feodo-ipblocklist.json', import.meta.url));
  urlhausFixture = await readFile(new URL('./fixtures/abusech-urlhaus-online.csv', import.meta.url));
  cisaFixture = await readFile(
    new URL('./fixtures/cisa-known-exploited-vulnerabilities.json', import.meta.url),
  );
});

describe('normaliseThreatIntelFeed', () => {
  it('normalises Feodo botnet C2 IP indicators', () => {
    const result = normaliseThreatIntelFeed(feodoFixture, ABUSECH_FEODO_SOURCE_ID);

    expect(result.sourceId).toBe('abusech-feodo-ipblocklist');
    expect(result.records[0]).toMatchObject({
      sourceIndicatorId: '50.16.16.211:443',
      indicatorType: 'ip',
      indicatorValue: '50.16.16.211',
      threatKind: 'botnet_c2',
      severity: 'high',
      malwareFamily: 'QakBot',
      port: 443,
      countryCode: 'US',
    });
  });

  it('normalises URLhaus malware URL indicators', () => {
    const result = normaliseThreatIntelFeed(urlhausFixture, ABUSECH_URLHAUS_SOURCE_ID);

    expect(result.records[0]).toMatchObject({
      sourceIndicatorId: '3887133',
      indicatorType: 'url',
      indicatorValue: 'http://77.247.88.103:43260/bin.sh',
      threatKind: 'malware_url',
      severity: 'high',
      port: 43260,
      referenceUrl: 'https://urlhaus.abuse.ch/url/3887133/',
    });
  });

  it('normalises CISA KEV CVE records', () => {
    const result = normaliseThreatIntelFeed(cisaFixture, CISA_KEV_SOURCE_ID);

    expect(result.upstreamTimestamp).toEqual(new Date('2026-07-15T16:42:14.826Z'));
    expect(result.records[0]).toMatchObject({
      sourceIndicatorId: 'CVE-2026-46817',
      indicatorType: 'cve',
      indicatorValue: 'CVE-2026-46817',
      threatKind: 'exploited_vulnerability',
      severity: 'critical',
      dueAt: new Date('2026-07-18T00:00:00.000Z'),
    });
  });

  it('rejects invalid JSON', () => {
    expect(() => normaliseThreatIntelFeed(Buffer.from('{'), ABUSECH_FEODO_SOURCE_ID)).toThrowError(
      new ThreatIntelNormalisationError('Invalid threat intel JSON response body'),
    );
  });
});

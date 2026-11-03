import { describe, it, expect } from 'vitest';
import {
  parseFeodoBlocklist,
  parseTweetFeedC2,
  placeIndicator,
  toIndicator,
  TWEETFEED_SOURCE,
  type FeodoRecord,
} from './c2-indicators';

/** The single-record fixture from the audit that reported the fabrication. */
const AUDIT_FIXTURE: FeodoRecord[] = [
  { ip_address: '192.0.2.10', country: 'US', malware: 'Emotet', dst_port: 443, status: 'offline' },
];

/** A row shaped the way the live dump publishes one. */
const LIVE_ROW: FeodoRecord = {
  ip_address: '198.51.100.7',
  port: 8080,
  status: 'online',
  hostname: 'c2.example.invalid',
  as_number: 64500,
  as_name: 'EXAMPLE-AS',
  as_country: 'de',
  first_seen: '2026-01-04 11:02:17',
  last_online: '2026-09-14',
  malware: 'QakBot',
};

describe('parseFeodoBlocklist', () => {
  it('reports one indicator per source record, not an arc target', () => {
    const indicators = parseFeodoBlocklist(AUDIT_FIXTURE);
    expect(indicators).toHaveLength(1);
  });

  it('asserts nothing the record does not contain', () => {
    const [indicator] = parseFeodoBlocklist(AUDIT_FIXTURE);
    // The record has no attacker, no victim, no attack verb and no severity.
    expect(indicator).not.toHaveProperty('action');
    expect(indicator).not.toHaveProperty('severity');
    expect(indicator).not.toHaveProperty('src_lat');
    expect(indicator).not.toHaveProperty('src_lng');
    expect(indicator).not.toHaveProperty('target_ip');
  });

  it('keeps the reported status rather than assuming an active attack', () => {
    const [indicator] = parseFeodoBlocklist(AUDIT_FIXTURE);
    expect(indicator.status).toBe('offline');
  });

  it('is deterministic across repeated parses of identical input', () => {
    expect(parseFeodoBlocklist(AUDIT_FIXTURE)).toEqual(parseFeodoBlocklist(AUDIT_FIXTURE));
    expect(parseFeodoBlocklist([LIVE_ROW])).toEqual(parseFeodoBlocklist([LIVE_ROW]));
  });

  it('deduplicates a C2 listed more than once', () => {
    const indicators = parseFeodoBlocklist([LIVE_ROW, { ...LIVE_ROW, malware: 'QakBot' }]);
    expect(indicators).toHaveLength(1);
    expect(indicators[0].id).toBe('198.51.100.7:8080');
  });

  it('carries the observation timestamps the record supplies', () => {
    const [indicator] = parseFeodoBlocklist([LIVE_ROW]);
    expect(indicator.first_seen).toBe('2026-01-04 11:02:17');
    expect(indicator.last_online).toBe('2026-09-14');
  });

  it('places a C2 at its hosting-country centroid and says so', () => {
    const [indicator] = parseFeodoBlocklist([LIVE_ROW]);
    expect(indicator.country).toBe('DE');
    expect(indicator.lng).toBe(10);
    expect(indicator.lat).toBe(51);
    expect(indicator.location_precision).toBe('country');
  });

  it('keeps a C2 with an unmappable country, without inventing a position', () => {
    const [indicator] = parseFeodoBlocklist([{ ...LIVE_ROW, as_country: 'ZZ' }]);
    expect(indicator.lng).toBeNull();
    expect(indicator.lat).toBeNull();
    expect(indicator.location_precision).toBeNull();
  });

  it('reads either port spelling and tolerates a missing one', () => {
    expect(toIndicator({ ip_address: '203.0.113.1', dst_port: '445' })?.port).toBe(445);
    expect(toIndicator({ ip_address: '203.0.113.1', port: 445 })?.port).toBe(445);
    expect(toIndicator({ ip_address: '203.0.113.1' })).toMatchObject({ port: null, id: '203.0.113.1' });
  });

  it('drops rows with no address and non-array payloads', () => {
    expect(parseFeodoBlocklist([{ malware: 'Emotet' }, null, 'nope'])).toEqual([]);
    expect(parseFeodoBlocklist({ attacks: [] })).toEqual([]);
  });

  it('links each row to its Feodo host record', () => {
    const [indicator] = parseFeodoBlocklist([LIVE_ROW]);
    expect(indicator.reference).toBe('https://feodotracker.abuse.ch/browse/host/198.51.100.7/');
    expect(indicator.source).toBe('abuse.ch Feodo Tracker');
  });
});

/** Rows shaped as TweetFeed's month.csv publishes them (addresses from the documentation ranges). */
const TWEETFEED = [
  '2026-10-05 09:45:23,etugenio,ip,203.0.113.5,#C2 #malware,https://x.com/etugenio/status/2107044472198693028',
  '2026-10-15 08:09:00,Fact_Finder03,ip,203.0.113.6,#C2 #ValleyRAT,https://x.com/Fact_Finder03/status/2110644092547846348',
  '2026-10-16 10:00:00,someone,ip,203.0.113.7,#phishing,https://x.com/someone/status/1',
  '2026-10-17 10:00:00,someone,domain,c2.example.invalid,#C2,https://x.com/someone/status/2',
  '2026-10-18 10:00:00,other,ip,203.0.113.5,#C2 #Mythic,https://x.com/other/status/3',
  '2026-10-19 10:00:00,other,ip,203.0.113.8,#botnet,https://evil.example/status/4',
].join('\n');

const NOW = Date.UTC(2026, 10, 2, 12);

describe('parseTweetFeedC2', () => {
  it('keeps addresses posted as #C2 or #botnet, once each', () => {
    const rows = parseTweetFeedC2(TWEETFEED, NOW);
    expect(rows.map(r => r.ip)).toEqual(['203.0.113.5', '203.0.113.6', '203.0.113.8']);
  });

  it('carries the post, its author and its day, and claims no status it was not given', () => {
    const [first] = parseTweetFeedC2(TWEETFEED, NOW);
    expect(first).toMatchObject({
      id: '203.0.113.5', status: 'reported', first_seen: '2026-10-05', last_online: null,
      reporter: 'etugenio', reference: 'https://x.com/etugenio/status/2107044472198693028',
      source: TWEETFEED_SOURCE, lat: null, lng: null, location_precision: null,
    });
  });

  it('names the family from the first tag that is one, and only then', () => {
    const rows = parseTweetFeedC2(TWEETFEED, NOW);
    expect(rows.find(r => r.ip === '203.0.113.6')!.malware).toBe('ValleyRAT');
    // The first post named none; a later post about the same address did.
    expect(rows.find(r => r.ip === '203.0.113.5')!.malware).toBe('Mythic');
    expect(rows.find(r => r.ip === '203.0.113.8')!.malware).toBeNull();
  });

  it('keeps only links to the post itself', () => {
    expect(parseTweetFeedC2(TWEETFEED, NOW).find(r => r.ip === '203.0.113.8')!.reference).toBeNull();
  });

  it('leaves out posts older than the window', () => {
    // 20 days back is 13 October: the first post about .5 falls outside, its later one inside.
    const rows = parseTweetFeedC2(TWEETFEED, NOW, 20);
    expect(rows.map(r => r.ip)).toEqual(['203.0.113.6', '203.0.113.5', '203.0.113.8']);
    expect(rows.find(r => r.ip === '203.0.113.5')).toMatchObject({ first_seen: '2026-10-18', reporter: 'other' });
  });
});

describe('placeIndicator', () => {
  const GEO = { ip: '198.51.100.7', lat: 50.11, lng: 8.68, country: 'DE', city: 'Frankfurt am Main', asn: 64500, as_name: 'EXAMPLE-AS' };

  it('moves an indicator to its own geolocation and says so', () => {
    const [indicator] = parseFeodoBlocklist([LIVE_ROW]);
    expect(placeIndicator(indicator, GEO)).toMatchObject({
      lat: 50.11, lng: 8.68, city: 'Frankfurt am Main', country: 'DE', location_precision: 'city',
    });
  });

  it('fills the country and AS a post did not carry, and keeps what a row did', () => {
    const [post] = parseTweetFeedC2(TWEETFEED, NOW);
    expect(placeIndicator(post, { ...GEO, ip: post.ip })).toMatchObject({ country: 'DE', as_number: 64500, as_name: 'EXAMPLE-AS' });
    const [row] = parseFeodoBlocklist([{ ...LIVE_ROW, as_country: 'nl' }]);
    expect(placeIndicator(row, GEO).country).toBe('NL');
  });

  it('leaves an indicator where it was without a geolocation', () => {
    const [indicator] = parseFeodoBlocklist([LIVE_ROW]);
    expect(placeIndicator(indicator, undefined)).toBe(indicator);
    expect(placeIndicator(indicator, { ...GEO, lat: NaN })).toBe(indicator);
  });
});

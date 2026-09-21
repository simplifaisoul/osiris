import { describe, it, expect } from 'vitest';
import { toWarning, urgency, expiryLabel, type WarningAlert } from './LiveAlerts';

/* Shaped as /api/weather sends them — NOAA/NWS, GDACS and NASA EONET. */
const nws = {
  id: 'nws-1',
  title: 'Flash Flood Warning issued September 20 at 4:38AM EDT until September 20 at 8:45AM EDT by NWS Charleston WV',
  category: 'weather',
  type: 'Flash Flood Warning',
  severity: 'high',
  lat: 38.8,
  lng: -82.1,
  date: '2026-09-20T08:38:00.000Z',
  expires: '2026-09-20T12:45:00.000Z',
  area: 'Gallia, OH; Jackson, OH; Lawrence, OH',
  source: 'https://api.weather.gov/alerts/urn:oid:1.2.3',
  provider: 'NOAA/NWS',
};

describe('toWarning', () => {
  it('reads a warning as the issuer wrote it', () => {
    expect(toWarning(nws)).toEqual({
      kind: 'warning',
      id: 'nws-1',
      ts: Date.parse('2026-09-20T08:38:00.000Z'),
      title: nws.title,
      type: 'Flash Flood Warning',
      severity: 'high',
      area: 'Gallia, OH; Jackson, OH; Lawrence, OH',
      expires: Date.parse('2026-09-20T12:45:00.000Z'),
      provider: 'NOAA/NWS',
      url: 'https://api.weather.gov/alerts/urn:oid:1.2.3',
      lat: 38.8,
      lng: -82.1,
      haystack: expect.stringContaining('flash flood warning'),
    });
  });

  it('keeps an undated warning rather than dropping it', () => {
    const undated = { ...nws, date: undefined };
    const before = Date.now();
    const warning = toWarning(undated)!;
    expect(warning.ts).toBeGreaterThanOrEqual(before);
    expect(warning.expires).toBe(Date.parse(nws.expires));
  });

  it('treats an unknown severity as the mildest', () => {
    expect(toWarning({ ...nws, severity: 'catastrophic' })?.severity).toBe('low');
    expect(toWarning({ ...nws, severity: undefined })?.severity).toBe('low');
  });

  it('drops anything it cannot put on a map or name', () => {
    expect(toWarning({ ...nws, lat: undefined })).toBeNull();
    expect(toWarning({ ...nws, lng: null })).toBeNull();
    expect(toWarning({ ...nws, title: '' })).toBeNull();
    expect(toWarning(null)).toBeNull();
  });

  it('ignores a source link that is not a web address', () => {
    expect(toWarning({ ...nws, source: 'javascript:alert(1)' })?.url).toBeNull();
  });
});

describe('expiryLabel', () => {
  const now = Date.parse('2026-09-20T10:00:00.000Z');
  it('counts down in the unit a reader thinks in', () => {
    expect(expiryLabel(now + 25 * 60_000, now)).toBe('25 min left');
    expect(expiryLabel(now + 4 * 3_600_000, now)).toBe('4h left');
    expect(expiryLabel(now + 3 * 24 * 3_600_000, now)).toBe('3d left');
  });

  it('says so when the warning has run out', () => {
    expect(expiryLabel(now - 60_000, now)).toBe('expired');
  });
});

describe('urgency', () => {
  const warning = (severity: WarningAlert['severity']) => toWarning({ ...nws, severity })!;
  const quake = (magnitude: number) => ({ kind: 'quake' as const, magnitude } as never);
  const report = (over: Record<string, unknown>) => ({ kind: 'news' as const, flag: null, alertKind: 'news', ...over } as never);

  it('puts a severe warning above everything else posted in the same minute', () => {
    expect(urgency(warning('high'))).toBeGreaterThan(urgency(warning('medium')));
    expect(urgency(warning('high'))).toBeGreaterThan(urgency(report({ alertKind: 'rocket' })));
    expect(urgency(warning('medium'))).toBeGreaterThan(urgency(quake(4.2)));
  });

  it('ranks a breaking report and a big quake above an ordinary one', () => {
    expect(urgency(report({ flag: 'BREAKING' }))).toBeGreaterThan(urgency(report({})));
    expect(urgency(quake(6.1))).toBeGreaterThan(urgency(quake(4.9)));
    expect(urgency(report({ alertKind: 'rocket' }))).toBeGreaterThan(urgency(report({})));
  });
});

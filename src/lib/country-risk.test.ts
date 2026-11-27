import { describe, it, expect } from 'vitest';
import { quakeMagnitudeByCountry, buildCountryRisk, RISK_FACTORS } from './country-risk';

const quake = (place: string, mag: number) => ({ properties: { place, mag } });

describe('quakeMagnitudeByCountry', () => {
  /* The bug this replaced: matching the two-letter code as a substring of the
     place string, so prose containing those letters scored the country. */
  it('does not credit Ukraine for a Papua New Guinea earthquake', () => {
    expect(quakeMagnitudeByCountry([quake('Papua New Guinea region', 6.1)]).UA).toBeUndefined();
  });

  it('does not credit Somalia for Solomon Islands, Sonora or Fiji', () => {
    const totals = quakeMagnitudeByCountry([
      quake('Solomon Islands', 5.2),
      quake('96 km SW of Sonora, Mexico', 4.8),
      quake('south of the Fiji Islands', 5.9),
    ]);
    expect(totals.SO).toBeUndefined();
  });

  it('does not credit Venezuela for a Nevada earthquake', () => {
    expect(quakeMagnitudeByCountry([quake('10km NE of Reno, Nevada', 4.6)]).VE).toBeUndefined();
  });

  /* "South Sudan" ends in the whole word "sudan", so word boundaries alone
     still scored Sudan. These are place strings USGS has published. */
  it('does not credit Sudan for a South Sudan earthquake', () => {
    expect(quakeMagnitudeByCountry([
      quake('50 km E of Juba, South Sudan', 4.8),
      quake('80 km NNW of Torit, South Sudan', 4.5),
    ]).SD).toBeUndefined();
  });

  it('still credits Sudan where the place names Sudan itself', () => {
    const totals = quakeMagnitudeByCountry([
      quake('30 km N of Kassala, Sudan', 4.6),
      quake('Sudan-South Sudan border region', 4.5),
    ]);
    expect(totals.SD).toBeCloseTo(9.1);
  });

  it('still sums real matches for the right country', () => {
    const totals = quakeMagnitudeByCountry([
      quake('12 km NE of Kyiv, Ukraine', 4.5),
      quake('central Ukraine', 5.0),
    ]);
    expect(totals.UA).toBeCloseTo(9.5);
  });

  it('matches a territory under any of its listed names', () => {
    expect(quakeMagnitudeByCountry([quake('Gaza Strip', 4.7)]).PS).toBeCloseTo(4.7);
    expect(quakeMagnitudeByCountry([quake('offshore Burma', 5.1)]).MM).toBeCloseTo(5.1);
  });

  it('ignores rows with no place or no usable magnitude', () => {
    expect(quakeMagnitudeByCountry([
      quake('', 5), { properties: { place: 'Ukraine' } }, { properties: {} },
    ])).toEqual({});
  });
});

describe('buildCountryRisk', () => {
  it('keeps the editorial judgement separate from the observed component', () => {
    const ua = buildCountryRisk({ UA: 9.5 }).find(c => c.code === 'UA')!;
    expect(ua.base_risk).toBe(RISK_FACTORS.UA.base);
    expect(ua.quake_magnitude).toBeCloseTo(9.5);
    expect(ua.risk_score).toBeCloseTo(94.5);
    expect(ua.basis).toBe('editorial');
  });

  it('labels every entry as editorial rather than derived', () => {
    expect(buildCountryRisk({}).every(c => c.basis === 'editorial')).toBe(true);
  });

  it('caps the combined score at 100 without touching the baseline', () => {
    const ps = buildCountryRisk({ PS: 40 }).find(c => c.code === 'PS')!;
    expect(ps.risk_score).toBe(100);
    expect(ps.base_risk).toBe(90);
  });

  it('is deterministic for identical input', () => {
    expect(buildCountryRisk({ UA: 3 })).toEqual(buildCountryRisk({ UA: 3 }));
  });
});

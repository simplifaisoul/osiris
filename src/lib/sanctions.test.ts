import { describe, it, expect } from 'vitest';
import { buildIndex, normName, SANCTIONS_CSV_URLS } from './sanctions';

// Excerpts of OpenSanctions targets.simple.csv (2026-11-20).
const HEADER = 'id,schema,name,aliases,countries,program_ids,dataset';
const usSanctions = [HEADER,
  'NK-HYQpJVFfjnrATqKwpZpit7,Company,"Hangzhou Hikvision Digital Technology Co., Ltd.",Hikvision,cn,US-DOD-1260H,' +
    'US DoD Chinese military companies',
  'NK-3TTjCXsbmB97w8Wh2kQD86,Company,"New Guomai Digital Culture Co., Ltd.",,,US-DOD-1260H,US DoD Chinese military companies',
].join('\n');
const fccCovered = [HEADER,
  'NK-HYQpJVFfjnrATqKwpZpit7,Company,Hangzhou Hikvision Digital Technology Company,,,US-FCC,US FCC Covered List',
  'NK-ccz32tYQsygbihggXDWSfd,Company,China Mobile International USA Inc,,,US-FCC,US FCC Covered List',
].join('\n');

describe('sanctions index', () => {
  it('reads both the US sanctions collection and the FCC Covered List', () => {
    expect(SANCTIONS_CSV_URLS.some((u) => u.includes('/us_sanctions/'))).toBe(true);
    expect(SANCTIONS_CSV_URLS.some((u) => u.includes('/us_fcc_covered_list/'))).toBe(true);
  });

  it('indexes entities outside the SDN and merges repeats by id', () => {
    const { entries, byNormName } = buildIndex([usSanctions, fccCovered]);
    expect(entries).toHaveLength(3);
    expect(byNormName.get(normName('China Mobile International USA Inc'))?.[0].datasets).toEqual(['US FCC Covered List']);
    expect(byNormName.get('hikvision')?.[0].datasets).toEqual(['US DoD Chinese military companies', 'US FCC Covered List']);
    expect(byNormName.get(normName('New Guomai Digital Culture Co., Ltd.'))).toHaveLength(1);
  });
});

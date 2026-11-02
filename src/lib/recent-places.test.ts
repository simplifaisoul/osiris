import { describe, it, expect } from 'vitest';
import { RECENT_CAP, parseRecent, withRecent, type RecentPlace } from './recent-places';

const place = (label: string, lat = 48.8584, lng = 2.2945) => ({ label, lat, lng, kind: 'poi' });

describe('withRecent', () => {
  it('puts the newest place first', () => {
    const list = withRecent(withRecent([], place('Louvre', 48.8606, 2.3376), 1), place('Eiffel Tower'), 2);
    expect(list.map(p => p.label)).toEqual(['Eiffel Tower', 'Louvre']);
  });

  it('keeps one entry for the same place, moved to the front', () => {
    let list: RecentPlace[] = [];
    list = withRecent(list, place('Eiffel Tower'), 1);
    list = withRecent(list, place('Louvre', 48.8606, 2.3376), 2);
    list = withRecent(list, place('eiffel tower', 48.85845, 2.29452), 3);
    expect(list.map(p => p.label)).toEqual(['eiffel tower', 'Louvre']);
    expect(list[0].at).toBe(3);
  });

  it('keeps two places of the same name that are far apart', () => {
    const list = withRecent(withRecent([], place('Springfield', 39.78, -89.65), 1), place('Springfield', 42.1, -72.59), 2);
    expect(list).toHaveLength(2);
  });

  it(`holds at most ${RECENT_CAP}`, () => {
    let list: RecentPlace[] = [];
    for (let i = 0; i < RECENT_CAP + 3; i++) list = withRecent(list, place(`P${i}`, i, i), i);
    expect(list).toHaveLength(RECENT_CAP);
    expect(list[0].label).toBe(`P${RECENT_CAP + 2}`);
  });

  it('ignores a place with no name or no position', () => {
    expect(withRecent([], place('  '), 1)).toEqual([]);
    expect(withRecent([], { label: 'Nowhere', lat: NaN, lng: 0 }, 1)).toEqual([]);
  });
});

describe('parseRecent', () => {
  it('reads what was stored', () => {
    const stored = JSON.stringify([{ label: 'Louvre', lat: 48.86, lng: 2.33, at: 1 }]);
    expect(parseRecent(stored)).toEqual([{ label: 'Louvre', lat: 48.86, lng: 2.33, at: 1 }]);
  });

  it('drops anything malformed rather than failing', () => {
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('{"label":"x"}')).toEqual([]);
    expect(parseRecent(JSON.stringify([{ label: 'ok', lat: 1, lng: 2, at: 3 }, { label: 'bad', lat: 'x' }, null]))).toHaveLength(1);
  });
});

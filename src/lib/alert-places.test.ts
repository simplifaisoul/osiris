import { describe, it, expect } from 'vitest';
import { alertKind, placeCandidates, pickRow, locateReport, type GeoRow } from './alert-places';

/* Headlines and leads below are real posts from the feed, captured 2026-09-19. */

const names = (text: string) => placeCandidates(text).map(c => c.name);

describe('alertKind', () => {
  it('calls a missile or rocket report a rocket alert', () => {
    expect(alertKind('Missiles are flying over Riyadh.', '')).toBe('rocket');
    expect(alertKind("Saudi Arabia's capital was under missile attack overnight.", '')).toBe('rocket');
    expect(alertKind('Удар ракетами по городу', '')).toBe('rocket');
  });

  it('calls strikes, drones, attacks and casualties events', () => {
    expect(alertKind('Russian attack on Sumy kills 2, injures 7 as guided aerial bombs hit apartment building.', '')).toBe('event');
    expect(alertKind('Suspected drone activity halts flights at Luxembourg airport.', '')).toBe('event');
    expect(alertKind('Early this morning, Israeli settlers vandalized the main water pipeline', '')).toBe('event');
  });

  it('calls everything else news', () => {
    expect(alertKind('Denmark preserved Greenland. In a nutshell.', '')).toBe('news');
    expect(alertKind('Trump signs sweeping Russia sanctions bill into law.', '')).toBe('news');
  });

  it('reads the headline and lead, not a word deep in the body', () => {
    const body = `${'The ministry published its annual budget review today. '.repeat(8)}It mentions missile procurement.`;
    expect(alertKind('Budget review published', body)).toBe('news');
  });

  it('does not take "grad" out of "gradually"', () => {
    expect(alertKind('Talks are gradually resuming', '')).toBe('news');
  });
});

describe('placeCandidates', () => {
  it('puts places introduced as places first', () => {
    const text = 'Israeli settlers are herding their sheep on Palestinian land the village of Tayasir, northeast of Tubas in the occupied West Bank';
    expect(placeCandidates(text).slice(0, 2)).toEqual([
      { name: 'Tayasir', locative: true },
      { name: 'Tubas', locative: true },
    ]);
  });

  it('reads a sentence-opening "In" as introducing a place', () => {
    expect(placeCandidates('In Al-Bureij refugee camp, central Gaza, hundreds of students')[0]).toEqual({ name: 'Al-Bureij', locative: true });
  });

  it('finds the place in the lead when the headline has none', () => {
    expect(names("Saudi Arabia's capital was under missile attack overnight.\nAFP reported an explosion in Riyadh")[0]).toBe('Riyadh');
  });

  it('cuts titles and offices out of a capitalised run', () => {
    const found = placeCandidates('Russian attack on Sumy kills 2. Sumy Oblast Governor Oleh Hryhorov said.');
    expect(found[0]).toEqual({ name: 'Sumy', locative: true });
    expect(found.map(c => c.name)).not.toContain('Sumy Oblast Governor Oleh Hryhorov');
  });

  it('skips names that follow a title — they belong to a person', () => {
    expect(names("An overnight attack on King Fahd Air Base in Ta'if, Saudi Arabia")).toEqual(["Ta'if"]);
    expect(names('US President Donald Trump said on Friday')).toEqual([]);
    expect(names('Yemeni Armed Forces spokesperson Brigadier General Yahya Saree said')).toEqual([]);
  });

  it('does not take an ocean for a town', () => {
    expect(names('the Arctic and North Atlantic security agreement')).toEqual([]);
  });

  it('keeps multi-word and particle names whole', () => {
    expect(names('Airstrike in Khan Younis and near Deir al-Balah').slice(0, 2)).toEqual(['Khan Younis', 'Deir al-Balah']);
    expect(names('Trump to meet her in New York next week')).toEqual(['New York']);
  });

  it('ends a name at a possessive', () => {
    expect(names("Flights in and out of Luxembourg's Findel Airport were suspended")[0]).toBe('Luxembourg');
  });

  it('drops compounds, contractions, acronyms, demonyms and countries', () => {
    const found = names("They're saying UK-led talks on Shahed-type drones hit Palestinian-owned land in Ukraine, per AFP and the IDF");
    expect(found).toEqual([]);
  });

  it('treats names listed after a place as places', () => {
    expect(placeCandidates('Strikes hit Kharkiv, Sumy and Odesa overnight')).toEqual([
      { name: 'Kharkiv', locative: true },
      { name: 'Sumy', locative: true },
      { name: 'Odesa', locative: true },
    ]);
  });

  it('takes at most three, without repeats', () => {
    expect(names('Strikes in Kharkiv, Kharkiv again, then in Sumy, in Odesa and in Dnipro')).toEqual(['Kharkiv', 'Sumy', 'Odesa']);
  });
});

const row = (over: Partial<GeoRow>): GeoRow => ({ name: 'X', display_name: 'X, Region, Country', lat: '1', lon: '2', addresstype: 'city', importance: 0.3, ...over });

describe('pickRow', () => {
  it('prefers a settlement to the region of the same name', () => {
    const pick = pickRow('Zaporizhia', [
      row({ name: 'Zaporizhia Oblast', addresstype: 'state' }),
      row({ name: 'Zaporizhzhia', addresstype: 'city', lat: '47.85', lon: '35.11' }),
    ]);
    expect(pick?.row.name).toBe('Zaporizhzhia');
    expect(pick?.precision).toBe('settlement');
  });

  it('keeps Nominatim’s order among places of the same name', () => {
    const pick = pickRow('Kohat', [
      row({ name: 'Kohat', addresstype: 'city', importance: 0.46, display_name: 'Kohat, Khyber Pakhtunkhwa, Pakistan' }),
      row({ name: 'Kohat', addresstype: 'hamlet', importance: 0.13, display_name: 'Kohat, Mohkhed Tahsil, India' }),
    ]);
    expect(pick?.row.display_name).toContain('Pakistan');
  });

  it('accepts a spelling that differs, but not a result that shares nothing with the query', () => {
    expect(pickRow('Khan Younis', [row({ name: 'Khan Yunis' })])).not.toBeNull();
    expect(pickRow("Ta'if", [row({ name: "At Ta'if" })])).not.toBeNull();
    expect(pickRow('Al-Mughayir', [row({ name: 'Qaryat Abd Allah al Mahdawi', addresstype: 'village' })])).toBeNull();
  });

  it('trusts only a city at least as prominent as asked', () => {
    expect(pickRow('Amsterdam', [row({ name: 'Amsterdam', importance: 0.79 })], 0.6)).not.toBeNull();
    expect(pickRow('Independence', [row({ name: 'Independence', addresstype: 'city', importance: 0.57 })], 0.6)).toBeNull();
    expect(pickRow('Donald', [row({ name: 'Donald', addresstype: 'city', importance: 0.3 })], 0.5)).toBeNull();
    expect(pickRow('Bank', [row({ name: 'Bank', addresstype: 'village', importance: 0.2 })], 0.5)).toBeNull();
    expect(pickRow('Tayasir', [row({ name: 'Tayasir', addresstype: 'village', importance: 0.9 })], 0.5)).toBeNull();
  });

  it('falls back to a region when that is all there is', () => {
    expect(pickRow('Sumy', [row({ name: 'Sumy Oblast', addresstype: 'state' })])?.precision).toBe('region');
  });

  it('skips rows without coordinates', () => {
    expect(pickRow('Sumy', [row({ name: 'Sumy', lat: undefined })])).toBeNull();
  });
});

describe('locateReport', () => {
  /** A stand-in for Nominatim: answers from a table, and records what was asked. */
  function fakeLookup(table: Record<string, GeoRow[]>) {
    const asked: string[] = [];
    const lookup = async (name: string, countries: string[] | null) => {
      asked.push(`${countries ? 'theatre' : 'world'}:${name}`);
      return table[`${countries ? 'theatre' : 'world'}:${name}`] ?? [];
    };
    return { lookup, asked };
  }

  it('pins to the village, not the town it is "northeast of"', async () => {
    const { lookup } = fakeLookup({
      'theatre:Tayasir': [row({ name: 'Tayasir', addresstype: 'village', lat: '32.34', lon: '35.40', display_name: 'Tayasir, Tubas, West Bank, Palestinian Territories' })],
      'theatre:Tubas': [row({ name: 'Tubas', addresstype: 'town', lat: '32.32', lon: '35.36' })],
    });
    const place = await locateReport('Israeli settlers are herding their sheep on Palestinian land the village of Tayasir, northeast of Tubas in the occupied West Bank', '', lookup);
    expect(place).toEqual({ name: 'Tayasir', label: 'Tayasir, Tubas, Palestinian Territories', lat: 32.34, lng: 35.40, precision: 'settlement' });
  });

  it('falls through to the next place when the first is not on the map', async () => {
    const { lookup } = fakeLookup({
      'theatre:Ramallah': [row({ name: 'Ramallah', addresstype: 'city', lat: '31.9', lon: '35.2' })],
    });
    const place = await locateReport('Armed Israeli settlers are grazing their sheep near the village of Al-Mughayir, located northeast of Ramallah', '', lookup);
    expect(place?.name).toBe('Ramallah');
  });

  it('never lets a capitalised word outrank a place introduced as one', async () => {
    const { lookup } = fakeLookup({
      'theatre:Sumy': [row({ name: 'Sumy', addresstype: 'city' })],
      'theatre:Oleh': [row({ name: 'Oleh', addresstype: 'village' })], // a village that happens to share a first name
    });
    const place = await locateReport('Russian attack on Sumy kills 2', 'Regional governor Oleh said three are in serious condition.', lookup);
    expect(place?.name).toBe('Sumy');
  });

  it('looks inside the theatre first, and worldwide only when nothing resolves there', async () => {
    const { lookup, asked } = fakeLookup({
      'world:Amsterdam': [row({ name: 'Amsterdam', addresstype: 'city', importance: 0.79 })],
    });
    const place = await locateReport('Amsterdam police arrested a woman at a pro-Israel rally', '', lookup);
    expect(place?.name).toBe('Amsterdam');
    expect(asked[0]).toBe('theatre:Amsterdam');
    expect(asked).toContain('world:Amsterdam');
  });

  it('does not pin to a capitalised word that is only a village somewhere', async () => {
    const { lookup } = fakeLookup({
      'theatre:Donald': [row({ name: 'Donald', addresstype: 'city', importance: 0.3, display_name: 'Donald, Marion County, Oregon, United States' })],
    });
    expect(await locateReport('Expect a Donald Trump crash out, White House says', '', lookup)).toBeNull();
  });

  it('keeps a bare name that is a prominent city', async () => {
    const { lookup } = fakeLookup({
      'theatre:Damascus': [row({ name: 'Damascus', addresstype: 'city', importance: 0.72 })],
    });
    const place = await locateReport('Saudi Arabia asked Syria to provide manpower, but Damascus refused', '', lookup);
    expect(place?.name).toBe('Damascus');
  });

  it('settles on nothing while a lookup has failed, rather than on a worse place', async () => {
    const lookup = async (name: string) => (name === 'Al-Bureij' ? null : [row({ name: 'Gaza', addresstype: 'city', importance: 0.6 })]);
    expect(await locateReport('In Al-Bureij refugee camp, central Gaza, students returned', '', lookup)).toBeNull();
  });

  it('returns null when the report names no place that resolves', async () => {
    const { lookup } = fakeLookup({});
    expect(await locateReport('Russian attacks kill 11, injure over 64 in Ukraine over past day.', '', lookup)).toBeNull();
  });
});

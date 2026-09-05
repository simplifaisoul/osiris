import { describe, it, expect } from 'vitest';
import {
  nuclearState, nuclearStyle, seismicMagnitude, summarise,
  selectFacilities, formatCapacity, type NuclearFacility,
} from './nuclear';

const fac = (over: Partial<NuclearFacility>): NuclearFacility => ({
  id: 'x', name: 'Site', city: 'City', country: 'Country',
  lat: 0, lng: 0, status: 'Operational', reactors: 1, capacityMW: 1000, owner: 'Owner',
  ...over,
});

describe('nuclearState', () => {
  it('reads the statuses the API actually emits', () => {
    expect(nuclearState('Operational')).toBe('online');
    expect(nuclearState('Under Construction')).toBe('construction');
    expect(nuclearState('Active Conflict Zone')).toBe('conflict');
    expect(nuclearState('SEISMIC RISK (M5.2)')).toBe('seismic');
    expect(nuclearState('Decommissioned / Exclusion Zone')).toBe('offline');
    expect(nuclearState('Decommissioned / Safe Enclosure')).toBe('offline');
    expect(nuclearState('Destroyed / Decommissioning')).toBe('offline');
    expect(nuclearState('Suspended')).toBe('offline');
  });

  it('treats an unrecognised or missing status as running', () => {
    expect(nuclearState('Operational (Extended)')).toBe('online');
    expect(nuclearState('Partially Operational')).toBe('online');
    expect(nuclearState('')).toBe('online');
  });

  it('marks only conflict and seismic as urgent', () => {
    expect(nuclearStyle('Active Conflict Zone').urgent).toBe(true);
    expect(nuclearStyle('SEISMIC RISK (M4.8)').urgent).toBe(true);
    expect(nuclearStyle('Operational').urgent).toBe(false);
    expect(nuclearStyle('Under Construction').urgent).toBe(false);
  });
});

describe('seismicMagnitude', () => {
  it('pulls the magnitude the route embedded', () => {
    expect(seismicMagnitude('SEISMIC RISK (M5.2)')).toBe(5.2);
    expect(seismicMagnitude('SEISMIC RISK (M6.0)')).toBe(6);
  });

  it('returns null when there is no magnitude to read', () => {
    expect(seismicMagnitude('Operational')).toBeNull();
    expect(seismicMagnitude('')).toBeNull();
  });
});

describe('summarise', () => {
  it('counts states, countries and alerts', () => {
    const s = summarise([
      fac({ country: 'Ukraine', status: 'Active Conflict Zone' }),
      fac({ country: 'Japan', status: 'SEISMIC RISK (M5.1)' }),
      fac({ country: 'Japan', status: 'Operational' }),
      fac({ country: 'UK', status: 'Under Construction' }),
      fac({ country: 'UK', status: 'Decommissioned / Safe Enclosure' }),
    ]);

    expect(s.total).toBe(5);
    expect(s.countries).toBe(3);
    expect(s.alerts).toBe(2);
    expect(s.byState).toEqual({ conflict: 1, seismic: 1, construction: 1, offline: 1, online: 1 });
  });

  /* A decommissioned reactor generates nothing — counting Chernobyl's four
     units as capacity would overstate the running fleet. */
  it('excludes offline sites from the reactor and capacity totals', () => {
    const s = summarise([
      fac({ status: 'Operational', reactors: 4, capacityMW: 4000 }),
      fac({ status: 'Decommissioned / Exclusion Zone', reactors: 4, capacityMW: 0 }),
      fac({ status: 'Destroyed / Decommissioning', reactors: 6, capacityMW: 0 }),
    ]);

    expect(s.reactors).toBe(4);
    expect(s.capacityMW).toBe(4000);
  });

  it('tolerates missing reactor and capacity figures', () => {
    const s = summarise([fac({ reactors: 0, capacityMW: 0 })]);
    expect(s.reactors).toBe(0);
    expect(s.capacityMW).toBe(0);
  });

  it('handles an empty list', () => {
    const s = summarise([]);
    expect(s.total).toBe(0);
    expect(s.countries).toBe(0);
    expect(s.alerts).toBe(0);
  });
});

describe('selectFacilities', () => {
  const list = [
    fac({ id: 'small', name: 'Small NPP', status: 'Operational', capacityMW: 500 }),
    fac({ id: 'big', name: 'Big NPP', status: 'Operational', capacityMW: 5000 }),
    fac({ id: 'war', name: 'Zaporizhzhia NPP', status: 'Active Conflict Zone', capacityMW: 5700 }),
    fac({ id: 'quake', name: 'Ohi NPP', status: 'SEISMIC RISK (M5.0)', capacityMW: 4710 }),
    fac({ id: 'dead', name: 'Dodewaard NPP', status: 'Decommissioned / Safe Enclosure', capacityMW: 0 }),
    fac({ id: 'new', name: 'Hinkley Point C', status: 'Under Construction', capacityMW: 3200 }),
  ];

  it('puts what needs attention first, then the biggest sites', () => {
    expect(selectFacilities(list, 'all', '').map(f => f.id))
      .toEqual(['war', 'quake', 'new', 'big', 'small', 'dead']);
  });

  it('narrows to the urgent sites', () => {
    expect(selectFacilities(list, 'alerts', '').map(f => f.id)).toEqual(['war', 'quake']);
  });

  it('narrows to a single state', () => {
    expect(selectFacilities(list, 'online', '').map(f => f.id)).toEqual(['big', 'small']);
    expect(selectFacilities(list, 'offline', '').map(f => f.id)).toEqual(['dead']);
  });

  it('searches name, city, country and owner, case-insensitively', () => {
    expect(selectFacilities(list, 'all', 'zapor').map(f => f.id)).toEqual(['war']);
    expect(selectFacilities(list, 'all', 'HINKLEY').map(f => f.id)).toEqual(['new']);
    expect(selectFacilities([fac({ id: 'o', owner: 'Energoatom' })], 'all', 'energo')).toHaveLength(1);
    expect(selectFacilities(list, 'all', 'nothing here')).toEqual([]);
  });

  it('combines a state filter with a query', () => {
    expect(selectFacilities(list, 'online', 'big').map(f => f.id)).toEqual(['big']);
    expect(selectFacilities(list, 'offline', 'big')).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(selectFacilities(list, 'all', '  big  ').map(f => f.id)).toEqual(['big']);
  });

  it('does not mutate the list it was given', () => {
    const order = list.map(f => f.id);
    selectFacilities(list, 'all', '');
    expect(list.map(f => f.id)).toEqual(order);
  });
});

describe('sourceUrl on the facility record', () => {
  /* The reference link is data, not something derived from the name — a search
     built from "PALLAS (HFR Successor)" lands on a Prussian naturalist, and
     "HOR (Reactor Institute Delft)" on an Egyptian pharaoh. Filtering and
     sorting must not drop the field on the way to the panel. */
  it('survives selection', () => {
    const withUrl = fac({ id: 'u', sourceUrl: 'https://en.wikipedia.org/wiki/COVRA' });
    expect(selectFacilities([withUrl], 'all', '')[0].sourceUrl)
      .toBe('https://en.wikipedia.org/wiki/COVRA');
  });

  it('is optional — a facility without one is still valid', () => {
    expect(selectFacilities([fac({ id: 'n' })], 'all', '')[0].sourceUrl).toBeUndefined();
  });
});

describe('formatCapacity', () => {
  it('switches to GW once MW stops being readable', () => {
    expect(formatCapacity(485)).toBe('485 MW');
    expect(formatCapacity(5700)).toBe('5,700 MW');
    expect(formatCapacity(10_000)).toBe('10.0 GW');
    expect(formatCapacity(12_400)).toBe('12.4 GW');
  });

  it('shows a dash where there is no generating capacity', () => {
    expect(formatCapacity(0)).toBe('—');
  });
});

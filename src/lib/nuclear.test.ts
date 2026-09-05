import { describe, it, expect } from 'vitest';
import { nuclearState, nuclearStyle, seismicMagnitude, formatCapacity } from './nuclear';

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

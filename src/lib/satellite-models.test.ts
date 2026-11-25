import { describe, it, expect } from 'vitest';
import { satelliteModelKind } from './satellite-models';

const kind = (name: string, mission?: string, altKm = 550, category?: string) =>
  satelliteModelKind({ name, mission, altKm, category }).kind;

describe('satelliteModelKind', () => {
  it('knows the stations and Hubble by their catalogue names', () => {
    expect(kind('ISS (ZARYA)', 'Space Station', 420)).toBe('iss');
    expect(kind('ISS (NAUKA)', 'Space Station', 420)).toBe('iss');
    expect(kind('CSS (TIANHE)', 'Unknown', 380)).toBe('tiangong');
    expect(kind('CSS (WENTIAN)', 'Unknown', 380)).toBe('tiangong');
    expect(kind('HST', 'Unknown', 520)).toBe('hubble');
  });

  it('tells Starlink V2 Mini from the earlier satellites by number', () => {
    expect(kind('STARLINK-32411', 'Commercial Comms')).toBe('starlink-v2');
    expect(kind('STARLINK-30000', 'Commercial Comms')).toBe('starlink-v2');
    expect(kind('STARLINK-1008', 'Commercial Comms')).toBe('starlink-v1');
  });

  it('puts debris and rocket bodies before anything their names also match', () => {
    expect(kind('FENGYUN 1C DEB', 'Weather', 800)).toBe('debris');
    expect(kind('COSMOS 2251 DEB', 'Russian Military', 790)).toBe('debris');
    expect(kind('SL-3 R/B', 'Unknown', 600)).toBe('rocket-body');
  });

  it('does not take a CubeSat named after Hubble for the telescope', () => {
    expect(kind('LEMUR-2-HUBBLE-4', 'Unknown', 500)).toBe('cubesat');
    expect(kind('FLOCK 4Q-16', 'Unknown', 480)).toBe('cubesat');
  });

  it('draws navigation satellites as navigation satellites', () => {
    expect(kind('GPS BIIR-5  (PRN 22)', 'Navigation', 20_200)).toBe('gnss');
    expect(kind('GALILEO 26 (2C2)', 'Navigation', 23_200)).toBe('gnss');
  });

  it('chooses by mission, then by height, then by category', () => {
    expect(kind('GOES 18', 'Weather', 35_786)).toBe('imaging');
    expect(kind('YAOGAN-30 01', 'Chinese Recon', 600)).toBe('imaging');
    expect(kind('INTELSAT 30 (IS-30)', 'Unknown', 35_786)).toBe('geo');
    expect(kind('ONEWEB-0012', 'Commercial Comms', 1_200)).toBe('comms');
    expect(kind('IRIDIUM 106', 'Unknown', 780, 'comms')).toBe('comms');
    expect(kind('SWISSCUBE', 'Unknown', 700)).toBe('generic');
  });

  it('always gives a label to show', () => {
    expect(satelliteModelKind({ name: 'X', altKm: 500 }).label).toBe('Satellite');
  });
});

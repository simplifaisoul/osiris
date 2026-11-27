import { describe, it, expect } from 'vitest';
import { aircraftModelSpec } from './aircraft-models';

describe('aircraftModelSpec', () => {
  it('draws a listed type at its own size', () => {
    expect(aircraftModelSpec('B788')).toMatchObject({ family: 'widebody', label: 'Boeing 787-8', lengthM: 56.7, spanM: 60.1, trueSize: true });
    expect(aircraftModelSpec('a20n')).toMatchObject({ family: 'narrowbody', label: 'Airbus A320neo', trueSize: true });
    expect(aircraftModelSpec('A388')).toMatchObject({ family: 'quad', spanM: 79.8 });
  });

  it('knows the families apart', () => {
    expect(aircraftModelSpec('CRJ9').family).toBe('rearjet');
    expect(aircraftModelSpec('AT76').family).toBe('turboprop');
    expect(aircraftModelSpec('C172').family).toBe('light-high');
    expect(aircraftModelSpec('SR22').family).toBe('light-low');
    expect(aircraftModelSpec('H60').family).toBe('helicopter');
    expect(aircraftModelSpec('F35')).toMatchObject({ family: 'fighter', twinFin: true });
    expect(aircraftModelSpec('C30J')).toMatchObject({ family: 'airlifter', props: true });
    expect(aircraftModelSpec('C17').props).toBeFalsy();
  });

  it('paints military types grey even when their family is civil', () => {
    expect(aircraftModelSpec('K35R').military).toBe(true);
    expect(aircraftModelSpec('H60').military).toBe(true);
  });

  it('falls back to a family by code pattern, without claiming a size', () => {
    expect(aircraftModelSpec('A332')).toMatchObject({ trueSize: true });
    expect(aircraftModelSpec('A30B')).toMatchObject({ family: 'widebody', trueSize: false });
    expect(aircraftModelSpec('B712')).toMatchObject({ family: 'narrowbody', trueSize: false });
    expect(aircraftModelSpec('E145')).toMatchObject({ family: 'rearjet', trueSize: true });
    expect(aircraftModelSpec('E140')).toMatchObject({ family: 'rearjet', trueSize: false });
    expect(aircraftModelSpec('E17A')).toMatchObject({ family: 'regional', trueSize: false });
    expect(aircraftModelSpec('C25B')).toMatchObject({ family: 'rearjet', trueSize: false });
    expect(aircraftModelSpec('EC55')).toMatchObject({ family: 'helicopter', trueSize: false });
  });

  it('takes the feed category for a helicopter it cannot name', () => {
    expect(aircraftModelSpec(null, { helicopter: true }).family).toBe('helicopter');
  });

  it('draws an unknown aircraft as a generic airliner with no size', () => {
    expect(aircraftModelSpec(null)).toMatchObject({ family: 'narrowbody', label: 'Narrow-body airliner', trueSize: false });
    expect(aircraftModelSpec('')).toMatchObject({ trueSize: false });
  });
});

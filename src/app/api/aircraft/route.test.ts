import { describe, it, expect } from 'vitest';
import { shardFor, downsample, parseTrace, currentLeg } from './route';

describe('shardFor', () => {
  it('uses the last two hex characters, as readsb shards them', () => {
    expect(shardFor('ae291a')).toBe('1a');
    expect(shardFor('ab6fdd')).toBe('dd');
    expect(shardFor('a0e250')).toBe('50');
  });

  it('normalises case and whitespace', () => {
    expect(shardFor(' AE291A ')).toBe('1a');
  });
});

describe('downsample', () => {
  it('leaves a short track untouched', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('thins to the cap', () => {
    expect(downsample(Array.from({ length: 5000 }, (_, i) => i), 700)).toHaveLength(700);
  });

  // The path has to still start and end where the aircraft did.
  it('keeps the first and last point', () => {
    const src = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsample(src, 50);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(999);
  });

  it('stays in order', () => {
    const out = downsample(Array.from({ length: 500 }, (_, i) => i), 40);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });
});

describe('parseTrace', () => {
  // Shape of a readsb trace row: [Δt, lat, lon, alt, gs, track, flags]
  const trace = {
    icao: 'AE291A',
    r: '6043 ',
    t: 'H60',
    desc: 'Sikorsky MH-60T Jayhawk',
    trace: [
      [0, 57.737091, -152.509017, -150, 28.3, 227.9, 5],
      [10, 57.74, -152.5, 500, 90, 220, 5],
      [20, 57.75, -152.4, 'ground', 0, 0, 5],
    ],
  };

  it('extracts identity, trimming the source whitespace', () => {
    const p = parseTrace(trace);
    expect(p.icao24).toBe('ae291a');
    expect(p.registration).toBe('6043');
    expect(p.typeCode).toBe('H60');
    expect(p.model).toBe('Sikorsky MH-60T Jayhawk');
  });

  it('emits the flown path as [lng, lat], oldest first', () => {
    const p = parseTrace(trace, 700, false);
    expect(p.track[0]).toEqual([-152.509017, 57.737091]);
    expect(p.points).toBe(3);
  });

  it('keeps altitudes aligned with the track, nulling non-numeric ones', () => {
    const p = parseTrace(trace, 700, false);
    expect(p.altitudes).toEqual([-150, 500, null]);
    expect(p.altitudes).toHaveLength(p.track.length);
  });

  it('drops rows with no usable position', () => {
    const p = parseTrace({
      ...trace,
      trace: [[0, null, null, 100], [1, 57.7, -152.5, 200], [2, 'x', 'y', 300]] as never,
    });
    expect(p.points).toBe(1);
  });

  it('thins a long trace but preserves its endpoints', () => {
    const long = Array.from({ length: 3000 }, (_, i) => [i, 50 + i / 10000, 10 + i / 10000, 1000]);
    const p = parseTrace({ ...trace, trace: long as never }, 700);
    expect(p.points).toBe(700);
    expect(p.track[0]).toEqual([10, 50]);
    expect(p.track.at(-1)![1]).toBeCloseTo(50 + 2999 / 10000, 6);
  });

  it('survives an empty or missing trace', () => {
    expect(parseTrace({}).points).toBe(0);
    expect(parseTrace({ trace: [] }).track).toEqual([]);
  });
});

describe('currentLeg', () => {
  const air = (t: number, lat: number, alt: number) => [t, lat, 10, alt, 400, 90];
  const gnd = (t: number, lat: number) => [t, lat, 10, 'ground', 0, 90];

  // A 24h trace is five or six flights; drawn whole it reads as random lines.
  it('keeps only the flight after the last real stop', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => air(i, 40 + i, 30000)),   // earlier flight
      ...Array.from({ length: 6 }, (_, i) => gnd(10 + i, 45)),          // parked
      ...Array.from({ length: 4 }, (_, i) => air(20 + i, 50 + i, 32000)), // current flight
    ];
    const leg = currentLeg(rows);
    expect(leg).toHaveLength(4);
    expect(leg[0][1]).toBe(50);
  });

  it('ignores a brief ground blip rather than splitting on it', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => air(i, 40 + i, 30000)),
      gnd(10, 44),                                                     // single spurious sample
      ...Array.from({ length: 4 }, (_, i) => air(20 + i, 45 + i, 31000)),
    ];
    expect(currentLeg(rows).length).toBeGreaterThan(4);
  });

  it('returns the last completed flight when the aircraft is parked now', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => gnd(i, 30)),
      ...Array.from({ length: 5 }, (_, i) => air(10 + i, 40 + i, 30000)),
      ...Array.from({ length: 6 }, (_, i) => gnd(20 + i, 45)),          // landed, parked
    ];
    const leg = currentLeg(rows);
    expect(leg.every((r) => r[3] !== 'ground')).toBe(true);
    expect(leg).toHaveLength(5);
  });

  it('treats a trace with no ground reports as a single leg', () => {
    const rows = Array.from({ length: 10 }, (_, i) => air(i, 40 + i, 35000));
    expect(currentLeg(rows)).toHaveLength(10);
  });

  it('copes with an empty trace', () => {
    expect(currentLeg([])).toEqual([]);
  });
});

describe('parseTrace leg trimming', () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => [i, 40 + i, 10, 30000]),
    ...Array.from({ length: 6 }, (_, i) => [10 + i, 45, 10, 'ground']),
    ...Array.from({ length: 3 }, (_, i) => [20 + i, 50 + i, 10, 32000]),
  ];

  it('draws only the current flight by default', () => {
    expect(parseTrace({ trace: rows as never }).points).toBe(3);
  });

  it('can still return the whole history on request', () => {
    expect(parseTrace({ trace: rows as never }, 700, false).points).toBe(13);
  });
});

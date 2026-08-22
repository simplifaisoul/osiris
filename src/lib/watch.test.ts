import { describe, it, expect } from 'vitest';
import { diffSweep, appendEvents, formatAgo, MAX_EVENTS, type WatchBaseline } from './watch';
import type { AoiReport } from './aoi';

/** Build a sweep result holding the given callsigns in one layer. */
const report = (labels: string[], layer = 'military_flights'): AoiReport => ({
  total: labels.length,
  groups: labels.length
    ? [{
        key: layer,
        label: layer === 'military_flights' ? 'Military aircraft' : layer,
        color: '#FF3D3D',
        count: labels.length,
        items: labels.slice(0, 50).map(l => ({ id: l, label: l, lat: 0, lng: 0 })),
        memberIds: labels,
      }]
    : [],
});

describe('diffSweep', () => {
  it('produces no events on the first pass, only a baseline', () => {
    const { baseline, events } = diffSweep('aoi1', report(['RCH01', 'RCH02']), null);
    expect(events).toHaveLength(0);
    expect(baseline.military_flights.size).toBe(2);
  });

  it('reports an arrival', () => {
    const first = diffSweep('aoi1', report(['A']), null);
    const second = diffSweep('aoi1', report(['A', 'B']), first.baseline);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ kind: 'enter', label: 'B', aoiId: 'aoi1' });
  });

  it('reports a departure', () => {
    const first = diffSweep('aoi1', report(['A', 'B']), null);
    const second = diffSweep('aoi1', report(['A']), first.baseline);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ kind: 'exit', label: 'B' });
  });

  it('stays silent when nothing changes, even though positions do', () => {
    const first = diffSweep('aoi1', report(['A', 'B']), null);
    const second = diffSweep('aoi1', report(['A', 'B']), first.baseline);
    expect(second.events).toHaveLength(0);
  });

  it('reports arrivals and departures in the same tick', () => {
    const first = diffSweep('aoi1', report(['A', 'B']), null);
    const second = diffSweep('aoi1', report(['B', 'C']), first.baseline);
    const kinds = second.events.map(e => `${e.kind}:${e.label}`).sort();
    expect(kinds).toEqual(['enter:C', 'exit:A']);
  });

  it('reports departures for a layer that emptied completely', () => {
    // The layer disappears from the sweep entirely — walking only the new
    // groups would silently lose these.
    const first = diffSweep('aoi1', report(['A', 'B']), null);
    const second = diffSweep('aoi1', report([]), first.baseline);
    expect(second.events).toHaveLength(2);
    expect(second.events.every(e => e.kind === 'exit')).toBe(true);
  });

  it('keys identity per layer, so the same id in two layers is two objects', () => {
    const mixed: AoiReport = {
      total: 2,
      groups: [
        { key: 'military_flights', label: 'Military', color: '#f00', count: 1, items: [{ id: 'X1', label: 'X1', lat: 0, lng: 0 }], memberIds: ['X1'] },
        { key: 'maritime_ships', label: 'Vessels', color: '#00f', count: 1, items: [{ id: 'X1', label: 'X1', lat: 0, lng: 0 }], memberIds: ['X1'] },
      ],
    };
    const { baseline } = diffSweep('aoi1', mixed, null);
    expect(baseline.military_flights.has('military_flights:X1')).toBe(true);
    expect(baseline.maritime_ships.has('maritime_ships:X1')).toBe(true);

    // Removing only the aircraft must not report the vessel as gone.
    const onlyShip: AoiReport = { total: 1, groups: [mixed.groups[1]] };
    const next = diffSweep('aoi1', onlyShip, baseline);
    expect(next.events).toHaveLength(1);
    expect(next.events[0]).toMatchObject({ kind: 'exit', layer: 'military_flights' });
  });

  it('carries the layer label and colour onto the event', () => {
    const first = diffSweep('aoi1', report(['A']), null);
    const second = diffSweep('aoi1', report(['A', 'B']), first.baseline);
    expect(second.events[0].layerLabel).toBe('Military aircraft');
    expect(second.events[0].color).toBe('#FF3D3D');
  });

  it('stamps events with the supplied time', () => {
    const first = diffSweep('aoi1', report(['A']), null);
    const second = diffSweep('aoi1', report(['A', 'B']), first.baseline, 12345);
    expect(second.events[0].at).toBe(12345);
  });
});

describe('appendEvents', () => {
  const ev = (n: number) => ({
    id: `e${n}`, kind: 'enter' as const, aoiId: 'a', layer: 'l',
    layerLabel: 'L', color: '#fff', label: `E${n}`, at: n,
  });

  it('puts the newest first', () => {
    const log = appendEvents([], [ev(1), ev(2)]);
    expect(log[0].label).toBe('E2');
  });

  it('is a no-op for an empty batch', () => {
    const log = [ev(1)];
    expect(appendEvents(log, [])).toBe(log);
  });

  it('caps the rolling window', () => {
    let log = appendEvents([], Array.from({ length: MAX_EVENTS }, (_, i) => ev(i)));
    log = appendEvents(log, [ev(999)]);
    expect(log).toHaveLength(MAX_EVENTS);
    expect(log[0].label).toBe('E999');
  });
});

describe('formatAgo', () => {
  it('reads naturally across scales', () => {
    const now = 1_000_000_000;
    expect(formatAgo(now, now)).toBe('now');
    expect(formatAgo(now - 30_000, now)).toBe('30s');
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3h');
    expect(formatAgo(now - 2 * 86_400_000, now)).toBe('2d');
  });

  it('never reports a negative age from clock skew', () => {
    const now = 1_000_000;
    expect(formatAgo(now + 5000, now)).toBe('now');
  });
});

describe('diffSweep beyond the display cap', () => {
  // The bug this covers: group.items is capped at 50 for display. Diffing that
  // sample instead of full membership made the truncation window shifting look
  // like objects arriving and departing, on any AOI holding more than 50.
  const many = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => `OBJ${from + i}`);

  it('stays silent when a large membership is unchanged', () => {
    const first = diffSweep('a', report(many(200)), null);
    const second = diffSweep('a', report(many(200)), first.baseline);
    expect(second.events).toHaveLength(0);
  });

  it('reports one arrival among hundreds, not a shifted window', () => {
    const first = diffSweep('a', report(many(200)), null);
    const second = diffSweep('a', report([...many(200), 'NEWCOMER']), first.baseline);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ kind: 'enter', label: 'NEWCOMER' });
  });

  it('reports a departure from outside the display sample', () => {
    // OBJ150 is well past the 50-item cap, so it never appears in items.
    const all = many(200);
    const first = diffSweep('a', report(all), null);
    const second = diffSweep('a', report(all.filter(x => x !== 'OBJ150')), first.baseline);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ kind: 'exit', label: 'OBJ150' });
  });
});

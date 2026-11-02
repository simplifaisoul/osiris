import { describe, it, expect } from 'vitest';
import { decodeVehicleFeed } from './gtfs-rt';
import { entity, f32, feed, msg, str, uint, vehicle } from './gtfs-rt.fixtures';

describe('decodeVehicleFeed', () => {
  it('reads the header time and every field of a vehicle position', () => {
    const out = decodeVehicleFeed(feed(entity('e1', msg(4, vehicle({ lat: 42.3601, lng: -71.0589, bearing: 90 })))));
    expect(out.timestamp).toBe(1792200007);
    expect(out.vehicles).toHaveLength(1);
    const v = out.vehicles[0];
    expect(v).toMatchObject({ id: 'y1234', label: '1234', routeId: '39', tripId: 'trip-9', directionId: 1, status: 2, timestamp: 1792200000 });
    expect(v.lat).toBeCloseTo(42.3601, 4);
    expect(v.lng).toBeCloseTo(-71.0589, 4);
    expect(v.bearing).toBe(90);
    expect(v.speed).toBe(8.5);
  });

  it('skips entities that are not usable vehicle positions', () => {
    const out = decodeVehicleFeed(feed(
      entity('deleted', [...uint(2, 1), ...msg(4, vehicle({ lat: 1, lng: 1 }))]),
      entity('trip-update', msg(3, str(1, 'x'))),
      entity('null-island', msg(4, vehicle({ lat: 0, lng: 0 }))),
      entity('off-globe', msg(4, vehicle({ lat: 95, lng: 10 }))),
      entity('no-position', msg(4, msg(8, str(1, 'v')))),
      entity('good', msg(4, vehicle({ lat: 60.17, lng: 24.94, id: 'hsl-1' }))),
    ));
    expect(out.vehicles.map(v => v.id)).toEqual(['hsl-1']);
  });

  it('drops a heading of -1, which some operators send for "none"', () => {
    const out = decodeVehicleFeed(feed(entity('e', msg(4, vehicle({ lat: 53.8, lng: -1.55, bearing: -1 })))));
    expect(out.vehicles[0].bearing).toBeUndefined();
  });

  it('falls back to the entity id when the vehicle has none', () => {
    const body = msg(4, msg(2, [...f32(1, 52.37), ...f32(2, 4.89)]));
    expect(decodeVehicleFeed(feed(entity('ent-7', body))).vehicles[0].id).toBe('ent-7');
  });

  it('ignores fields it does not know, including extensions', () => {
    const extended = [...vehicle({ lat: -27.47, lng: 153.03 }), ...str(1000, 'operator extension'), ...uint(999, 5)];
    expect(decodeVehicleFeed(feed(entity('e', msg(4, extended)))).vehicles).toHaveLength(1);
  });

  it('throws on bytes that are not a FeedMessage', () => {
    expect(() => decodeVehicleFeed(new TextEncoder().encode('<html>503 Service Unavailable</html>'))).toThrow();
  });

  it('reads an empty feed as no vehicles', () => {
    expect(decodeVehicleFeed(new Uint8Array()).vehicles).toEqual([]);
  });
});

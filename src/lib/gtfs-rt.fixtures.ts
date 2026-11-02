/* A tiny protobuf writer for tests, enough to build GTFS-Realtime FeedMessages
   the way operators publish them. */

export const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n >= 0x80) { out.push((n % 128) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return out;
};
export const key = (field: number, wireType: number) => varint(field * 8 + wireType);
export const str = (field: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [...key(field, 2), ...varint(b.length), ...b]; };
export const msg = (field: number, body: number[]) => [...key(field, 2), ...varint(body.length), ...body];
export const uint = (field: number, n: number) => [...key(field, 0), ...varint(n)];
export const f32 = (field: number, v: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return [...key(field, 5), ...b]; };
export const f64 = (field: number, v: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return [...key(field, 1), ...b]; };

export interface FixtureVehicle { lat: number; lng: number; id?: string; label?: string; route?: string; ts?: number; bearing?: number }

/** A VehiclePosition message body with every common field set. */
export const vehicle = (o: FixtureVehicle) => [
  ...msg(1, [...str(1, 'trip-9'), ...str(5, o.route ?? '39'), ...uint(6, 1)]),
  ...msg(2, [...f32(1, o.lat), ...f32(2, o.lng), ...(o.bearing !== undefined ? f32(3, o.bearing) : []), ...f64(4, 12345.6), ...f32(5, 8.5)]),
  ...uint(4, 2),
  ...uint(5, o.ts ?? 1792200000),
  ...msg(8, [...str(1, o.id ?? 'y1234'), ...str(2, o.label ?? '1234'), ...str(3, 'ABC123')]),
];
export const entity = (id: string, body: number[]) => msg(2, [...str(1, id), ...body]);
export const feed = (...entities: number[][]) => new Uint8Array([
  ...msg(1, [...str(1, '2.0'), ...uint(2, 0), ...uint(3, 1792200007)]),
  ...entities.flat(),
]);

/** A whole feed of the given vehicles. */
export const encodeFeed = (vehicles: FixtureVehicle[]) =>
  feed(...vehicles.map((v, i) => entity(`e${i}`, msg(4, vehicle(v)))));

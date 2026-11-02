/**
 * OSIRIS — GTFS-Realtime vehicle positions, decoded without a protobuf library.
 *
 * Transit operators publish where their vehicles are as a GTFS-Realtime
 * FeedMessage: protocol buffers, in a schema that has not changed shape since
 * 2015 (https://gtfs.org/realtime/reference/). Only the vehicle-position part
 * is read here. The reader is a few dozen lines of the protobuf wire format,
 * which spares the app a code-generated dependency, and it skips every field
 * it does not know, so extensions and future fields cannot break it.
 */

export interface VehiclePosition {
  /** Feed-unique: the vehicle's own id where the feed gives one, else the entity id. */
  id: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from true north. */
  bearing?: number;
  /** Metres per second. */
  speed?: number;
  routeId?: string;
  tripId?: string;
  directionId?: number;
  /** What the rider sees: a fleet number, or the route and destination on some feeds. */
  label?: string;
  /** When the position was measured, seconds since the epoch. */
  timestamp?: number;
  stopId?: string;
  /** VehicleStopStatus: 0 incoming at, 1 stopped at, 2 in transit to. */
  status?: number;
  /** OccupancyStatus, 0 (empty) to 8 (not boarding). */
  occupancy?: number;
}

export interface VehicleFeed {
  /** When the feed was produced, seconds since the epoch. */
  timestamp?: number;
  vehicles: VehiclePosition[];
}

const utf8 = new TextDecoder();

/** A cursor over one protobuf message (or a slice of one). */
class Reader {
  pos: number;
  readonly buf: Uint8Array;
  readonly end: number;
  readonly view: DataView;

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  more(): boolean {
    return this.pos < this.end;
  }

  /** An unsigned varint. Arithmetic rather than bit shifts, so 64-bit timestamps survive. */
  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error('Truncated varint');
      const byte = this.buf[this.pos++];
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
    throw new Error('Varint too long');
  }

  /** The bounds of a length-delimited field. */
  span(): [number, number] {
    const length = this.varint();
    const start = this.pos;
    if (start + length > this.end) throw new Error('Truncated field');
    this.pos += length;
    return [start, this.pos];
  }

  string(): string {
    const [start, end] = this.span();
    return utf8.decode(this.buf.subarray(start, end));
  }

  sub(): Reader {
    const [start, end] = this.span();
    return new Reader(this.buf, start, end);
  }

  float(): number {
    if (this.pos + 4 > this.end) throw new Error('Truncated float');
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0: this.varint(); return;
      case 1: this.pos += 8; break;
      case 2: this.span(); return;
      case 5: this.pos += 4; break;
      default: throw new Error(`Unsupported wire type ${wireType}`);
    }
    if (this.pos > this.end) throw new Error('Truncated field');
  }
}

/** Calls `onField(field, wireType)` for each field; the callback reads it or returns false to skip it. */
function fields(r: Reader, onField: (field: number, wireType: number) => boolean | void): void {
  while (r.more()) {
    const key = r.varint();
    const field = Math.floor(key / 8);
    const wireType = key & 7;
    if (onField(field, wireType) === false) r.skip(wireType);
  }
}

interface RawVehicle {
  lat?: number; lng?: number; bearing?: number; speed?: number;
  routeId?: string; tripId?: string; directionId?: number;
  vehicleId?: string; label?: string; timestamp?: number; stopId?: string; status?: number; occupancy?: number;
}

function readPosition(r: Reader, v: RawVehicle): void {
  fields(r, (field, wt) => {
    if (wt !== 5) return false;
    if (field === 1) v.lat = r.float();
    else if (field === 2) v.lng = r.float();
    else if (field === 3) v.bearing = r.float();
    else if (field === 5) v.speed = r.float();
    else return false;
  });
}

function readTrip(r: Reader, v: RawVehicle): void {
  fields(r, (field, wt) => {
    if (field === 1 && wt === 2) v.tripId = r.string();
    else if (field === 5 && wt === 2) v.routeId = r.string();
    else if (field === 6 && wt === 0) v.directionId = r.varint();
    else return false;
  });
}

function readVehicleDescriptor(r: Reader, v: RawVehicle): void {
  fields(r, (field, wt) => {
    if (wt !== 2) return false;
    if (field === 1) v.vehicleId = r.string();
    else if (field === 2) v.label = r.string();
    else return false;
  });
}

function readVehicle(r: Reader): RawVehicle {
  const v: RawVehicle = {};
  fields(r, (field, wt) => {
    if (field === 1 && wt === 2) readTrip(r.sub(), v);
    else if (field === 2 && wt === 2) readPosition(r.sub(), v);
    else if (field === 4 && wt === 0) v.status = r.varint();
    else if (field === 5 && wt === 0) v.timestamp = r.varint();
    else if (field === 7 && wt === 2) v.stopId = r.string();
    else if (field === 8 && wt === 2) readVehicleDescriptor(r.sub(), v);
    else if (field === 9 && wt === 0) v.occupancy = r.varint();
    else return false;
  });
  return v;
}

const clean = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
const finite = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n : undefined);

/**
 * The vehicles in a GTFS-Realtime FeedMessage. Entities without a usable
 * position are left out: deleted ones, trip updates and alerts, and positions
 * off the globe or at 0,0, which is a GPS fix that never happened.
 * Throws when the bytes are not a FeedMessage at all.
 */
export function decodeVehicleFeed(buf: Uint8Array): VehicleFeed {
  const out: VehicleFeed = { vehicles: [] };
  const root = new Reader(buf);
  fields(root, (field, wt) => {
    if (field === 1 && wt === 2) {
      const header = root.sub();
      fields(header, (f, w) => {
        if (f === 3 && w === 0) out.timestamp = header.varint();
        else return false;
      });
    } else if (field === 2 && wt === 2) {
      const entity = root.sub();
      let entityId = '';
      let deleted = false;
      let v: RawVehicle | null = null;
      fields(entity, (f, w) => {
        if (f === 1 && w === 2) entityId = entity.string();
        else if (f === 2 && w === 0) deleted = entity.varint() !== 0;
        else if (f === 4 && w === 2) v = readVehicle(entity.sub());
        else return false;
      });
      const p = v as RawVehicle | null;
      if (deleted || !p) return;
      const lat = finite(p.lat), lng = finite(p.lng);
      if (lat === undefined || lng === undefined) return;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return;
      // Some operators send -1 for "no heading"; only a real compass bearing is kept.
      const bearing = finite(p.bearing);
      out.vehicles.push({
        id: clean(p.vehicleId) ?? entityId,
        lat, lng,
        bearing: bearing !== undefined && bearing >= 0 && bearing <= 360 ? bearing : undefined,
        speed: finite(p.speed),
        routeId: clean(p.routeId),
        tripId: clean(p.tripId),
        directionId: p.directionId,
        label: clean(p.label),
        timestamp: p.timestamp || undefined,
        stopId: clean(p.stopId),
        status: p.status,
        occupancy: p.occupancy,
      });
    } else return false;
  });
  return out;
}

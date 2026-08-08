import { NextResponse } from 'next/server';
import { httpJson, optional } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { nearestAirport, type Airport } from '@/lib/airports';

export const maxDuration = 20;

/**
 * OSIRIS — Aircraft identity and flown track.
 *
 * The live feed only carries what the transponder broadcasts, so `model` came
 * through as "Unknown" for most airliners and as a bare ICAO type code ("H60")
 * for the rest. And the route line was drawn straight between two airports,
 * which is not the path the aircraft actually flew — an orbit or a hold showed
 * as a straight line to the destination.
 *
 * adsb.lol publishes readsb trace files that answer both at once: the real
 * flown track, plus the aircraft's registration, type code and full model name.
 * adsbdb fills in the registered operator, which the traces do not carry.
 */

const TRACE_BASE = 'https://adsb.lol/data/traces';
const ADSBDB = 'https://api.adsbdb.com/v0/aircraft';

export interface AircraftDetail {
  icao24: string;
  registration: string | null;
  typeCode: string | null;
  /** Full human model, e.g. "BOEING 737-800" or "Sikorsky MH-60T Jayhawk". */
  model: string | null;
  operator: string | null;
  /** Actual flown path as [lng, lat], oldest first. */
  track: [number, number][];
  /** Altitude in feet at each track point, aligned by index. */
  altitudes: (number | null)[];
  points: number;
  /** Airport this leg was seen to leave, read off the track. Null if unknown. */
  departure: Airport | null;
  /** Airport this leg was seen to land at. Null while still airborne. */
  arrival: Airport | null;
  source: string;
}

/** readsb shards traces by the last two characters of the hex address. */
export function shardFor(icao24: string): string {
  return icao24.trim().toLowerCase().slice(-2);
}

interface TraceFile {
  icao?: string;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  timestamp?: number;
  /** [Δseconds, lat, lon, altitude, groundSpeed, track, flags, …] */
  trace?: Array<Array<number | string | null>>;
}

/**
 * Keep only the leg the aircraft is currently flying.
 *
 * A full trace covers 24 hours, which for an airliner is five or six separate
 * flights strung end to end — drawn as one polyline it reads as random lines
 * criss-crossing the country. Ground reports delimit the legs, so walk back
 * from the newest point: skip time parked, take the airborne run, and stop at
 * the previous stint on the ground.
 */
export function currentLeg(
  rows: Array<Array<number | string | null>>,
  /** Ground samples in a row before it counts as a real stop, not a blip. */
  minGroundRun = 4,
): Array<Array<number | string | null>> {
  if (rows.length === 0) return rows;
  const isGround = (r: Array<number | string | null>) => r?.[3] === 'ground';

  let i = rows.length - 1;
  while (i >= 0 && isGround(rows[i])) i--;   // currently parked? rewind to the flight
  if (i < 0) return rows.slice(-2);          // never left the ground in this window
  const end = i;

  // Scanning backwards, remember where each ground run *ends* (its newest
  // sample) — the leg resumes there, not at the point the run was confirmed.
  let run = 0;
  let runNewest = -1;
  let start = 0;
  while (i >= 0) {
    if (isGround(rows[i])) {
      if (run === 0) runNewest = i;
      if (++run >= minGroundRun) { start = runNewest + 1; break; }
    } else {
      run = 0;
    }
    i--;
  }
  const leg = rows.slice(start, end + 1);
  // A trace with no ground reports at all is one continuous leg.
  return leg.length > 1 ? leg : rows;
}

/** Above this, the leg was picked up in the cruise, not seen to depart. */
const DEPARTURE_CEILING_FT = 10_000;

/**
 * Name the airports a leg was *observed* to use.
 *
 * Schedule lookups are keyed by callsign and hand back whichever leg of the
 * aircraft's day the database happens to hold — measured against the flown
 * track, the origin they claim is typically over a thousand kilometres out,
 * which is what turned the drawn route into lines to nowhere. The track knows
 * better: a leg that begins low over an airport began *at* that airport, and
 * one whose trace ends in ground reports has landed at the airport under it.
 *
 * Anything else stays null. An aircraft first seen at cruise has no knowable
 * origin, and one still airborne has no knowable destination.
 */
export function legEndpoints(
  track: [number, number][],
  altitudes: (number | null)[],
  landed: boolean,
): { departure: Airport | null; arrival: Airport | null } {
  if (track.length < 2) return { departure: null, arrival: null };

  const firstAlt = altitudes[0];
  const lowStart = firstAlt === null || (typeof firstAlt === 'number' && firstAlt <= DEPARTURE_CEILING_FT);
  const departure = lowStart ? nearestAirport(track[0][1], track[0][0]) : null;

  const last = track[track.length - 1];
  const arrival = landed ? nearestAirport(last[1], last[0]) : null;

  return { departure, arrival };
}

/**
 * Thin a track to at most `max` points, always keeping the first and last so
 * the path still starts and ends where the aircraft did. A 5,000-point trace
 * is ~120 KB and renders no better than a few hundred at map scale.
 */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Pull identity and the flown path out of a readsb trace file. */
export function parseTrace(
  json: TraceFile,
  maxPoints = 700,
  /** Draw only the flight in progress; the full history is rarely meaningful. */
  legOnly = true,
): Omit<AircraftDetail, 'operator' | 'source'> {
  const track: [number, number][] = [];
  const altitudes: (number | null)[] = [];

  const rows = legOnly ? currentLeg(json?.trace || []) : (json?.trace || []);
  for (const row of rows) {
    const lat = row?.[1];
    const lng = row?.[2];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    track.push([lng, lat]);
    // Altitude is feet, or the string "ground".
    const alt = row?.[3];
    altitudes.push(typeof alt === 'number' ? alt : null);
  }

  const idx = track.map((_, i) => i);
  const keep = downsample(idx, maxPoints);

  // Trailing ground reports are trimmed off the leg, so the landing has to be
  // read from the untrimmed trace.
  const raw = json?.trace || [];
  const landed = raw.length > 0 && raw[raw.length - 1]?.[3] === 'ground';

  return {
    icao24: (json?.icao || '').toLowerCase(),
    registration: json?.r?.trim() || null,
    typeCode: json?.t?.trim() || null,
    model: json?.desc?.trim() || null,
    track: keep.map((i) => track[i]),
    altitudes: keep.map((i) => altitudes[i]),
    points: keep.length,
    ...legEndpoints(track, altitudes, landed),
  };
}

interface AdsbdbResponse {
  response?: {
    aircraft?: {
      manufacturer?: string;
      type?: string;
      registered_owner?: string;
      registration?: string;
      icao_type?: string;
    };
  };
}

async function fetchTrace(icao24: string, full: boolean): Promise<TraceFile> {
  const kind = full ? 'full' : 'recent';
  const url = `${TRACE_BASE}/${shardFor(icao24)}/trace_${kind}_${icao24.toLowerCase()}.json`;
  return httpJson<TraceFile>(url, { timeoutMs: 12000 });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icao24 = (searchParams.get('icao24') || '').trim().toLowerCase();
    const full = searchParams.get('detail') !== 'recent';
    // ?legs=all draws the whole 24h history instead of just this flight.
    const legOnly = searchParams.get('legs') !== 'all';

    if (!/^[0-9a-f]{6}$/.test(icao24)) {
      return NextResponse.json({ error: 'icao24 must be a 6-character hex address' }, { status: 400 });
    }

    const detail = await cachedSource<AircraftDetail>(
      `aircraft:${icao24}:${full ? 'full' : 'recent'}:${legOnly ? 'leg' : 'all'}`,
      async () => {
        const [trace, db] = await Promise.all([
          optional(fetchTrace(icao24, full)),
          optional(httpJson<AdsbdbResponse>(`${ADSBDB}/${icao24}`, { timeoutMs: 8000 })),
        ]);

        const ac = db?.response?.aircraft;
        const parsed = trace ? parseTrace(trace, 700, legOnly) : null;

        // Neither source knew this airframe.
        if (!parsed && !ac) return [];

        const model = parsed?.model
          || (ac?.manufacturer && ac?.type ? `${ac.manufacturer} ${ac.type}` : null)
          || ac?.type
          || null;

        return [{
          icao24,
          registration: parsed?.registration || ac?.registration || null,
          typeCode: parsed?.typeCode || ac?.icao_type || null,
          model,
          operator: ac?.registered_owner || null,
          track: parsed?.track || [],
          altitudes: parsed?.altitudes || [],
          points: parsed?.points || 0,
          departure: parsed?.departure || null,
          arrival: parsed?.arrival || null,
          source: parsed ? 'adsb.lol' : 'adsbdb',
        }];
      },
      // Identity is effectively static; the track only matters for the current
      // leg, so a couple of minutes keeps the line fresh without hammering.
      2 * 60 * 1000,
    )();

    if (!detail.length) {
      return NextResponse.json({ error: 'Aircraft not found', icao24 }, { status: 404 });
    }

    return NextResponse.json(detail[0], {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] Aircraft lookup error:', error);
    return NextResponse.json({ error: 'Aircraft lookup failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { httpJson, optional } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';
import { nearestAirport, type Airport } from '@/lib/airports';
import { openskyToken } from '@/lib/opensky';

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
 * OpenSky's tracks endpoint supplies the real flown path, and adsbdb fills in
 * the registered operator and any identity the track source did not carry.
 */

const ADSBDB = 'https://api.adsbdb.com/v0/aircraft';
const OPENSKY_TRACK = 'https://opensky-network.org/api/tracks/all';
/** A hole in coverage longer than this is a missing leg, not a flown line. */
const OPENSKY_MAX_GAP_S = 45 * 60;

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
  /**
   * Unix time of each track point, aligned by index. Used to stop the drawn
   * path where the feed's own position fix was taken; stripped from the reply.
   */
  times: number[];
  points: number;
  /** Airport this leg was seen to leave, read off the track. Null if unknown. */
  departure: Airport | null;
  /** Airport this leg was seen to land at. Null while still airborne. */
  arrival: Airport | null;
  source: string;
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
  const times: number[] = [];

  const raw = json?.trace || [];
  const rows = legOnly ? currentLeg(raw) : raw;
  /* currentLeg returns a slice of the same row objects, so the leg's first row
     can be found in the untouched trace. The row offsets are deltas against
     the previous row, so the clock has to be walked from the real start even
     when earlier flights are not drawn. */
  const legStart = rows.length ? Math.max(0, raw.indexOf(rows[0])) : 0;
  // readsb stamps the start of the trace in Unix seconds; OpenSky's adapter
  // carries the first absolute time in the first row's delta instead. Both walk
  // to absolute time. A millisecond stamp (some mirrors emit one) is normalised.
  const stamped = typeof json?.timestamp === 'number' ? json.timestamp : 0;
  let clock = stamped > 1e12 ? stamped / 1000 : stamped;
  for (let r = 0; r < raw.length; r++) {
    const row = raw[r];
    if (typeof row?.[0] === 'number') clock += row[0];
    if (r < legStart) continue;
    const lat = row?.[1];
    const lng = row?.[2];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    track.push([lng, lat]);
    // Altitude is feet, or the string "ground".
    const alt = row?.[3];
    altitudes.push(typeof alt === 'number' ? alt : null);
    times.push(clock);
  }

  const idx = track.map((_, i) => i);
  const keep = downsample(idx, maxPoints);

  // Trailing ground reports are trimmed off the leg, so the landing has to be
  // read from the untrimmed trace.
  const landed = raw.length > 0 && raw[raw.length - 1]?.[3] === 'ground';

  return {
    icao24: (json?.icao || '').toLowerCase(),
    registration: json?.r?.trim() || null,
    typeCode: json?.t?.trim() || null,
    model: json?.desc?.trim() || null,
    track: keep.map((i) => track[i]),
    altitudes: keep.map((i) => altitudes[i]),
    times: keep.map((i) => times[i]),
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

/** OpenSky hands back [time, lat, lon, altitude m, heading, onGround]. */
interface OpenSkyTrackFile {
  path?: Array<Array<number | boolean | null>>;
}

/** Rewrite an OpenSky track as readsb trace rows so the leg logic applies. */
function openskyTrace(icao24: string, path: Array<Array<number | boolean | null>>): TraceFile {
  const trace: Array<Array<number | string | null>> = [];
  let prev = 0;
  for (const row of path) {
    if (!Array.isArray(row)) continue;
    const [time, lat, lon, altitude, , ground] = row;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = typeof time === 'number' ? time : prev;
    trace.push([
      t - prev,
      lat,
      lon,
      ground === true ? 'ground' : typeof altitude === 'number' ? Math.round(altitude * 3.28084) : null,
      null,
      null,
      null,
    ]);
    prev = t;
  }
  return { icao: icao24, trace };
}

/**
 * The flown path from OpenSky. Same shape as a trace, so the reader does not
 * care which source answered.
 */
async function fetchOpenSkyTrack(icao24: string, legOnly: boolean) {
  // OpenSky's anonymous pool is shared and easily spent on a server address,
  // after which every track answers 429 and the path silently disappears.
  // Sign in when credentials are configured; a single token also serves the
  // live state feed in the flights route.
  const token = await openskyToken();
  let json: OpenSkyTrackFile;
  try {
    json = await httpJson<OpenSkyTrackFile>(
      `${OPENSKY_TRACK}?icao24=${encodeURIComponent(icao24)}&time=0`,
      {
        timeoutMs: 8000,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      },
    );
  } catch (e) {
    console.warn('[OSIRIS] OpenSky track failed:', e instanceof Error ? e.message : e);
    throw e;
  }
  const path = json.path || [];
  if (!path.length) return null;

  // A day's history is several flights strung together, and the position is
  // simply absent while the aircraft is out of range. Keep the run since the
  // last such hole so the map does not draw a straight line across it.
  let start = 0;
  if (legOnly) {
    for (let i = 1; i < path.length; i++) {
      const t = path[i]?.[0];
      const prev = path[i - 1]?.[0];
      if (typeof t === 'number' && typeof prev === 'number' && t - prev > OPENSKY_MAX_GAP_S) start = i;
    }
  }

  return parseTrace(openskyTrace(icao24, path.slice(start)), 700, legOnly);
}

/**
 * Stop the drawn path where the map is already showing the aircraft.
 *
 * OpenSky's track endpoint is live while the flight feed can be a snapshot some
 * minutes old, so the polyline ran ahead of the icon and the plane appeared to
 * jump forward when selected. The feed hands its position-fix time in as
 * `until` (Unix seconds); points after it are dropped, and a path that already
 * ends at or before it is left alone. Both endpoints can cross a zero timestamp
 * (no clock in the source), so only positive times are compared.
 */
export function stopAt(detail: AircraftDetail, until: number): Omit<AircraftDetail, 'times'> {
  const last = detail.track.length - 1;
  let end = last;
  if (until > 0 && detail.times.length === detail.track.length) {
    while (end > 1 && detail.times[end] > until) end--;
  }

  const trimmed = end < last;
  const track = trimmed ? detail.track.slice(0, end + 1) : detail.track;
  const altitudes = trimmed ? detail.altitudes.slice(0, end + 1) : detail.altitudes;
  const departure = trimmed
    ? legEndpoints(track, altitudes, false).departure
    : detail.departure;

  return {
    icao24: detail.icao24,
    registration: detail.registration,
    typeCode: detail.typeCode,
    model: detail.model,
    operator: detail.operator,
    track,
    altitudes,
    points: track.length,
    departure,
    // A trimmed path no longer reaches the point where a landing was seen.
    arrival: trimmed ? null : detail.arrival,
    source: detail.source,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icao24 = (searchParams.get('icao24') || '').trim().toLowerCase();
    // ?legs=all draws the whole 24h history instead of just this flight.
    const legOnly = searchParams.get('legs') !== 'all';
    // ?until=<unix s> is the aircraft's last position fix, so the path can stop
    // at the aircraft instead of running past it.
    const untilRaw = Number(searchParams.get('until'));
    const until = Number.isFinite(untilRaw) && untilRaw > 0 ? untilRaw : 0;

    if (!/^[0-9a-f]{6}$/.test(icao24)) {
      return NextResponse.json({ error: 'icao24 must be a 6-character hex address' }, { status: 400 });
    }

    const detail = await cachedSource<AircraftDetail>(
      `aircraft:${icao24}:${legOnly ? 'leg' : 'all'}`,
      async () => {
        const [flown, db] = await Promise.all([
          optional(fetchOpenSkyTrack(icao24, legOnly)),
          optional(httpJson<AdsbdbResponse>(`${ADSBDB}/${icao24}`, { timeoutMs: 8000 })),
        ]);

        const ac = db?.response?.aircraft;

        // No identity from either source, and no path to draw either.
        if (!ac && !flown?.track.length) return [];

        const model = ac?.manufacturer && ac?.type
          ? `${ac.manufacturer} ${ac.type}`
          : ac?.type || null;

        return [{
          icao24,
          registration: flown?.registration || ac?.registration || null,
          typeCode: flown?.typeCode || ac?.icao_type || null,
          model: model || flown?.model || null,
          operator: ac?.registered_owner || null,
          track: flown?.track || [],
          altitudes: flown?.altitudes || [],
          times: flown?.times || [],
          points: flown?.points || 0,
          departure: flown?.departure || null,
          arrival: flown?.arrival || null,
          source: flown?.track.length ? 'opensky' : 'adsbdb',
        }];
      },
      // Identity is effectively static; the track only matters for the current
      // leg, so a couple of minutes keeps the line fresh without hammering.
      2 * 60 * 1000,
    )();

    if (!detail.length) {
      return NextResponse.json({ error: 'Aircraft not found', icao24 }, { status: 404 });
    }

    return NextResponse.json(stopAt(detail[0], until), {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] Aircraft lookup error:', error);
    return NextResponse.json({ error: 'Aircraft lookup failed' }, { status: 500 });
  }
}

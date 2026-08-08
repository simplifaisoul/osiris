import { NextResponse } from 'next/server';
import { httpJson, optional } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';

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
export function parseTrace(json: TraceFile, maxPoints = 700): Omit<AircraftDetail, 'operator' | 'source'> {
  const track: [number, number][] = [];
  const altitudes: (number | null)[] = [];

  for (const row of json?.trace || []) {
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

  return {
    icao24: (json?.icao || '').toLowerCase(),
    registration: json?.r?.trim() || null,
    typeCode: json?.t?.trim() || null,
    model: json?.desc?.trim() || null,
    track: keep.map((i) => track[i]),
    altitudes: keep.map((i) => altitudes[i]),
    points: keep.length,
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

    if (!/^[0-9a-f]{6}$/.test(icao24)) {
      return NextResponse.json({ error: 'icao24 must be a 6-character hex address' }, { status: 400 });
    }

    const detail = await cachedSource<AircraftDetail>(
      `aircraft:${icao24}:${full ? 'full' : 'recent'}`,
      async () => {
        const [trace, db] = await Promise.all([
          optional(fetchTrace(icao24, full)),
          optional(httpJson<AdsbdbResponse>(`${ADSBDB}/${icao24}`, { timeoutMs: 8000 })),
        ]);

        const ac = db?.response?.aircraft;
        const parsed = trace ? parseTrace(trace) : null;

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

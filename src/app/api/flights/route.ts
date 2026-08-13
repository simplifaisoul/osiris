
import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const maxDuration = 60;

// 30 regions covering every major aviation corridor at 250 nm radius.
// Focused on high-density airspace: US domestic, North Atlantic, Europe,
// Middle East hub, India, East Asia, SE Asia, Australia, South America.
const REGIONS = [
  // North America
  { lat: 39.8,  lon: -98.5 }, // Central US
  { lat: 41.0,  lon: -74.0 }, // Northeast (NYC/Boston/DC)
  { lat: 33.0,  lon: -84.0 }, // Southeast (Atlanta)
  { lat: 42.0,  lon: -88.0 }, // Midwest (Chicago)
  { lat: 30.0,  lon: -97.0 }, // Texas (Dallas/Houston)
  { lat: 47.0,  lon:-122.0 }, // Pacific Northwest (Seattle)
  { lat: 34.0,  lon:-118.0 }, // SoCal (LA)
  { lat: 45.0,  lon: -73.0 }, // Canada East (Montreal/Toronto)
  { lat: 49.0,  lon: -97.0 }, // Canada Prairies
  // Europe
  { lat: 50.0,  lon:  15.0 }, // Central Europe
  { lat: 51.5,  lon:  -1.0 }, // UK / Ireland
  { lat: 47.0,  lon:   2.0 }, // France / Alps
  { lat: 40.0,  lon:  -4.0 }, // Iberia
  { lat: 42.0,  lon:  13.0 }, // Italy / Adriatic
  { lat: 60.0,  lon:  15.0 }, // Scandinavia
  { lat: 52.0,  lon:  22.0 }, // Eastern Europe / Baltics
  { lat: 39.0,  lon:  35.0 }, // Turkey / Aegean
  // Middle East & South Asia
  { lat: 25.0,  lon:  45.0 }, // Arabian Gulf (Dubai/Riyadh)
  { lat: 22.0,  lon:  78.0 }, // India
  // East Asia & Pacific
  { lat: 35.0,  lon: 105.0 }, // China
  { lat: 35.0,  lon: 136.0 }, // Japan
  { lat: 37.0,  lon: 127.0 }, // Korea
  { lat: 13.0,  lon: 100.0 }, // SE Asia (Bangkok)
  { lat:  1.0,  lon: 104.0 }, // Singapore / Malacca Strait
  // Australia
  { lat:-25.0,  lon: 133.0 }, // Central Australia
  { lat:-33.0,  lon: 151.0 }, // Eastern Australia (Sydney)
  // Africa
  { lat:  0.0,  lon:  20.0 }, // Central Africa
  { lat:-26.0,  lon:  28.0 }, // South Africa
  // South America
  { lat:-15.0,  lon: -60.0 }, // Brazil Central
  { lat:-23.0,  lon: -46.0 }, // São Paulo / Rio
];

const HELI_TYPES = new Set([
  'R22','R44','R66','B06','B06T','B204','B205','B206','B212','B222','B230',
  'B407','B412','B427','B429','B430','B505','B525',
  'AS32','AS35','AS50','AS55','AS65',
  'EC20','EC25','EC30','EC35','EC45','EC55','EC75',
  'H125','H130','H135','H145','H155','H160','H175','H215','H225',
  'S55','S58','S61','S64','S70','S76','S92',
  'A109','A119','A139','A169','A189','AW09',
  'MD52','MD60','MDHI','MD90','NOTR',
  'B47G','HUEY','GAMA','CABR','EXE',
]);

const PRIVATE_JET_TYPES = new Set([
  'G150','G200','G280','GLEX','G500','G550','G600','G650','G700',
  'GLF2','GLF3','GLF4','GLF5','GLF6','GL5T','GL7T','GV','GIV',
  'CL30','CL35','CL60','BD70','BD10',
  'C25A','C25B','C25C','C500','C510','C525','C550','C560','C56X','C680','C700','C750',
  'E35L','E50P','E55P','E545','E550',
  'FA50','FA7X','FA8X','F900','F2TH',
  'LJ35','LJ40','LJ45','LJ60','LJ70','LJ75',
  'PC12','PC24','TBM7','TBM8','TBM9',
  'PRM1','SF50','EA50','VLJ',
]);

const MILITARY_INDICATORS = new Set([
  'C17','C5M','C130','C30J','KC10','KC46','KC35','E3CF','E3TF','E8A',
  'B1B','B2','B52','F16','F15','F18','F22','F35','A10','F117',
  'RC135','E6B','P8A','P3','MQ9','RQ4','U2','EP3','RC12',
  'V22','CH47','UH60','AH64','AH1Z','MV22',
  'EUFI','RFAL','TORD','TYP','GR4',
]);

// Airliner and regional types, hoisted out of the classifier condition it used
// to sit inside. A typed airliner stays commercial whatever its callsign says.
const AIRLINER_TYPES = new Set([
  'A319','A320','A321','A332','A333','A339','A343','A359','A388',
  'B737','B738','B739','B38M','B39M','B752','B753','B763','B764',
  'B772','B77L','B77W','B788','B789','B78X',
  'E170','E175','E190','E195','CRJ7','CRJ9','AT43','AT72','DH8D',
]);

// Fractional-ownership and charter operators file under a 3-letter ICAO
// designator exactly like an airline, so AIRLINE_CODE_RE matches them and they
// would otherwise be counted as commercial traffic.
const BIZJET_OPERATORS = new Set([
  'EJA','EJM','NJE','LXJ','FJO','VJT','XOJ','JTL','WUP','GAJ','DPJ','CLY','TWY',
]);

const AIRLINE_CODE_RE = /^([A-Z]{3})\d/;

// A callsign that is not an airline designator + flight number is a
// registration: what general-aviation aircraft broadcast once the hyphen is
// stripped — DMMKG (D-MMKG), HBYKO (HB-YKO), OEDLH (OE-DLH), N425RS, CGABC.
const CALLSIGN_RE = /^[A-Z0-9]{3,8}$/;

// Business jets cruise in the mid-thirties at transonic speed; nothing flying
// under a civil registration reaches FL280 at 300 kt without turbofans. This is
// the only bizjet/piston discriminator available for OpenSky aircraft, which
// carry no aircraft type at all.
const JET_CRUISE_ALT_M = 8500;
const JET_CRUISE_KTS = 300;

// adsb.fi is the last free tar1090/ADSBexchange-v2 shaped feed still serving
// data without an API key, so classifyFlight() works on it unchanged. The two
// providers this route used to fan out to have both stopped returning aircraft:
//   api.airplanes.live  → 403 on every endpoint (now key-gated)
//   api.adsb.lol/v2     → 200 but always {"ac":[],"total":0}
//   api.adsb.one/v2     → 403 (checked as a replacement, also unusable)
// Because both failure modes are silent (403 bodies are discarded, an empty
// ac[] is indistinguishable from quiet airspace), the fallback path degraded to
// zero aircraft without ever throwing. Provider counts are reported in the
// response now so the next feed to die is visible instead of silent.
const ADSB_MAX_DIST = 250; // nm — hard cap the provider enforces
const ADSBFI_BASE = 'https://opendata.adsb.fi/api/v2';

// adsb.fi allows roughly one request per second and soft-throttles over that by
// returning 200 with an empty ac[] rather than 429, so a parallel fanout looks
// like it succeeded while returning nothing. The regional sweep is paced.
const ADSBFI_GAP_MS = 1100;

// adsb.fi serves /mil but returns 400 for /ladd, /pia and /squawk/{code},
// so the global type feeds collapse to the military one.
async function fetchAdsbFiRegion(lat: number, lon: number): Promise<any[]> {
  try {
    const res = await stealthFetch(`${ADSBFI_BASE}/lat/${lat}/lon/${lon}/dist/${ADSB_MAX_DIST}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.ac || [];
    }
    await res.body?.cancel();
  } catch {}
  return [];
}

function classifyFlight(f: any) {
  const modelUpper = (f.t || '').toUpperCase();
  const flightStr = (f.flight || '').trim().toUpperCase();
  const dbFlags = (f.dbFlags || 0);

  if (modelUpper === 'TWR') return null;

  const lat = f.lat;
  const lon = f.lon;
  if (lat == null || lon == null) return null;

  const callsign = flightStr || f.hex || 'UNKNOWN';
  const altRaw = f.alt_baro;
  const altMeters = typeof altRaw === 'number' ? altRaw * 0.3048 : 0;
  const speedKnots = typeof f.gs === 'number' ? Math.round(f.gs * 10) / 10 : null;
  const heading = f.track || 0;
  const isHeli = HELI_TYPES.has(modelUpper) || f.category_os === 8;
  const isGrounded = typeof altRaw === 'number' && altRaw < 100;

  const isOsMilitary = f.category_os === 14;
  const isOsHighPerf = f.category_os === 7;
  const isOsLight = f.category_os === 2;
  // Large / high-vortex large / heavy — airline or cargo metal by weight alone.
  const isOsHeavy = f.category_os === 4 || f.category_os === 5 || f.category_os === 6;

  const airlineMatch = AIRLINE_CODE_RE.exec(callsign);
  const airlineCode = airlineMatch ? airlineMatch[1] : '';

  // OpenSky supplies no aircraft type, and its ADS-B emitter category is
  // "no information" for ~96% of aircraft even with extended=1 (measured live:
  // 597 of 620 over central Europe). Every type-based test below therefore only
  // fires on the adsb.fi feeds, which is what left all OpenSky traffic in the
  // commercial bucket. The callsign is the field OpenSky always fills, so the
  // airline-designator test is what carries the split for the bulk of the map.
  const isGaCallsign = !airlineCode && CALLSIGN_RE.test(flightStr);
  const cruisesLikeAJet =
    altMeters > JET_CRUISE_ALT_M && (speedKnots ?? 0) > JET_CRUISE_KTS;

  let category: 'commercial' | 'private' | 'jet' | 'military' = 'commercial';
  if (isOsMilitary || dbFlags & 1 || MILITARY_INDICATORS.has(modelUpper) || (f.flight || '').match(/^(RCH|KING|DUKE|EVAC|JAKE|REACH|CONVOY)\d/i)) {
    category = 'military';
  } else if (AIRLINER_TYPES.has(modelUpper) || isOsHeavy) {
    category = 'commercial';
  } else if (
    BIZJET_OPERATORS.has(airlineCode) ||
    PRIVATE_JET_TYPES.has(modelUpper) ||
    isOsHighPerf ||
    (isGaCallsign && cruisesLikeAJet)
  ) {
    category = 'jet';
  } else if (isGaCallsign || isOsLight) {
    category = 'private';
  }

  return {
    callsign,
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lon * 100000) / 100000,
    alt: Math.round(altMeters),
    heading: Math.round(heading),
    speed_knots: speedKnots,
    model: f.t || 'Unknown',
    icao24: f.hex || '',
    registration: f.r || 'N/A',
    squawk: f.squawk || '',
    airline_code: airlineCode,
    aircraft_category: isHeli ? 'heli' : 'plane',
    category,
    grounded: isGrounded,
    nac_p: f.nac_p,
    type: 'flight',
  };
}

let cachedData: any = null;
let lastFetchTime = 0;
// 90s TTL keeps us well within the authenticated OpenSky budget (4000 credits/day,
// 4 credits/call = 1000 calls/day ≈ one per 86s). The old 45s TTL at ~1920 calls/day
// was what got the VPS IP rate-limited on the anonymous pool.
const CACHE_TTL = 90000;

// OpenSky's budget is per day, not per request, so it needs its own interval
// separate from the response cache above. Authenticated it is 4000 credits/day
// and an unbounded /states/all costs 4, which is the 90s the TTL was built for.
// Anonymous it is only 400 credits/day — 100 calls, one per ~864s — so polling
// it on the same 90s TTL burns the whole day's budget in about half an hour,
// after which every call 429s and the route sits permanently in the cooldown
// branch below. That is what emptied the map: no credentials were configured,
// so the budget was gone and the feeds it fell back to were the dead ones above.
const hasOpenSkyCreds = () =>
  Boolean(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
const openSkyInterval = () => (hasOpenSkyCreds() ? 90000 : 900000);

// The last good OpenSky snapshot is kept and reused between those calls. On the
// anonymous interval a refetch is only due every 15 minutes, and rebuilding the
// payload from adsb.fi alone in between would swing the map between ~10K
// aircraft and a few hundred every 90s. Reusing the snapshot keeps the aircraft
// on screen stable; only their age varies, which providers.opensky_age_s reports.
let osSnapshot: any[] = [];
let osSnapshotTime = 0;
let fetchPromise: Promise<any> | null = null;

// Back off from OpenSky after a 429 so the daily quota can reset.
// Re-poking a limited endpoint on every cache miss keeps the IP throttled.
let openSkyCooldownUntil = 0;
const OPENSKY_COOLDOWN = 15 * 60 * 1000; // 15 min

// OpenSky OAuth2 — optional but recommended for VPS deployments.
// Without keys: anonymous, works fine on residential IPs. VPS IPs can
// be throttled by OpenSky's anonymous per-IP pool. Setting these env
// vars bypasses the per-IP pool (account pool: 4000 credits/day).
let osToken: string | null = null;
let osTokenExpiry = 0;

async function getOpenSkyToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (osToken && Date.now() < osTokenExpiry) return osToken;
  try {
    const res = await fetch(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) { console.warn('[OSIRIS] OpenSky token failed:', res.status); return null; }
    const data = await res.json();
    if (!data.access_token) {
      console.warn('[OSIRIS] OpenSky token response missing access_token');
      return null;
    }
    osToken = data.access_token;
    osTokenExpiry = Date.now() + ((data.expires_in || 1800) - 60) * 1000;
    return osToken;
  } catch (e) {
    console.warn('[OSIRIS] OpenSky token error:', e);
    return null;
  }
}

function ingestAc(raw: any[], into: any[], seen: Set<string>) {
  for (const ac of raw) {
    const hex = (ac.hex || '').toLowerCase().trim();
    if (hex && !seen.has(hex)) { seen.add(hex); into.push(ac); }
  }
}

export async function GET() {
  const now = Date.now();

  if (cachedData && now - lastFetchTime < CACHE_TTL) {
    return NextResponse.json(cachedData, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  }

  if (fetchPromise) {
    try {
      const data = await fetchPromise;
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    } catch {
      return NextResponse.json({ error: 'Failed to fetch flight data' }, { status: 500 });
    }
  }

  const JAMMING_NACAP_THRESHOLD = 4;

  fetchPromise = (async () => {
    const allRaw: any[] = [];
    const seenHex = new Set<string>();
    let source: string;

    // ── Phase 1 + 2 in parallel: global military feed AND OpenSky simultaneously ──
    // Running them together keeps total wall-clock time to max(mil_feed, opensky)
    // instead of sum. The military feed runs every cycle regardless of OpenSky
    // status and is always current, so military traffic stays live even while an
    // anonymous OpenSky snapshot is waiting out its interval.
    const skipOpenSky =
      Date.now() < openSkyCooldownUntil ||
      Date.now() - osSnapshotTime < openSkyInterval();
    const token = skipOpenSky ? null : await getOpenSkyToken();
    const osInit: RequestInit = token
      ? { signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` } }
      : { signal: AbortSignal.timeout(30000) };

    const [milRes, osRes] = await Promise.allSettled([
      stealthFetch(`${ADSBFI_BASE}/mil`, { signal: AbortSignal.timeout(15000) }),
      skipOpenSky
        ? Promise.reject(new Error('OpenSky in cooldown'))
        // extended=1 appends the ADS-B emitter category as an 18th field. Without
        // it the state vector is 17 long and s[17] below is silently undefined,
        // which is what made every category_os test in classifyFlight() dead.
        // It does not change the credit cost — that is set by the area queried.
        : stealthFetch('https://opensky-network.org/api/states/all?extended=1', osInit),
    ]);

    // Drain the military feed — parse on ok, discard the body otherwise to free the connection.
    if (milRes.status === 'fulfilled') {
      if (milRes.value.ok) {
        try {
          const data = await milRes.value.json();
          ingestAc(data.ac || [], allRaw, seenHex);
        } catch (e) {
          console.warn('[OSIRIS] adsb.fi mil parse error:', e);
        }
      } else {
        console.warn('[OSIRIS] adsb.fi mil feed returned', milRes.value.status);
        await milRes.value.body?.cancel();
      }
    }
    const milCount = allRaw.length;

    // Refresh the OpenSky snapshot when one was due; otherwise the existing one
    // carries over untouched.
    if (osRes.status === 'fulfilled') {
      if (osRes.value.status === 429) {
        openSkyCooldownUntil = Date.now() + OPENSKY_COOLDOWN;
        console.warn('[OSIRIS] OpenSky 429 — cooling down 15 min');
        await osRes.value.body?.cancel();
      } else if (osRes.value.ok) {
        try {
          const data = await osRes.value.json();
          const states = data.states || [];
          if (states.length > 100) {
            osSnapshot = states.map((s: any[]) => ({
              hex: s[0],
              flight: s[1]?.trim(),
              lon: s[5],
              lat: s[6],
              alt_baro: typeof s[7] === 'number' ? s[7] * 3.28084 : null,
              gs: typeof s[9] === 'number' ? s[9] * 1.94384 : null,
              track: s[10],
              squawk: s[14],
              category_os: s[17],
            }));
            osSnapshotTime = Date.now();
          }
        } catch (e) {
          console.warn('[OSIRIS] OpenSky parse error:', e);
        }
      } else {
        // A rejected token surfaces here as a 401 — previously discarded silently.
        console.warn('[OSIRIS] OpenSky returned', osRes.value.status);
        await osRes.value.body?.cancel();
      }
    }

    ingestAc(osSnapshot, allRaw, seenHex);
    const openSkyWorked = osSnapshot.length > 0;

    // ── Phase 3: Regional sweep — last resort only ────────────────────────────
    // Runs only when there is no OpenSky snapshot at all, never as the steady
    // state. adsb.fi's geographic endpoint is metered far more tightly than its
    // /mil feed and answers 200 with an empty ac[] once that budget is spent
    // rather than 429, so sweeping it every cycle would quietly exhaust it and
    // look like empty airspace. Paced at ~1 req/s; 30 regions ≈ 33s, inside the
    // 60s maxDuration above.
    if (!openSkyWorked) {
      source = 'regional';
      console.warn('[OSIRIS] no OpenSky snapshot — falling back to adsb.fi regional sweep');

      for (const r of REGIONS) {
        ingestAc(await fetchAdsbFiRegion(r.lat, r.lon), allRaw, seenHex);
        await new Promise(resolve => setTimeout(resolve, ADSBFI_GAP_MS));
      }

      if (allRaw.length === 0) {
        console.error(
          '[OSIRIS] every flight provider returned zero aircraft — ' +
          'set OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET (free at opensky-network.org); ' +
          'the anonymous 400 credits/day pool cannot sustain a live map'
        );
      }
    } else {
      source = hasOpenSkyCreds() ? 'opensky-auth' : 'opensky-anon';
    }

    // ── Classify ──────────────────────────────────────────────────────────────
    const commercial: any[] = [];
    const privateFl: any[] = [];
    const jets: any[] = [];
    const military: any[] = [];
    const gpsJamming: any[] = [];

    for (const raw of allRaw) {
      const flight = classifyFlight(raw);
      if (!flight) continue;

      if (typeof flight.nac_p === 'number' && flight.nac_p <= JAMMING_NACAP_THRESHOLD && !flight.grounded) {
        gpsJamming.push({ lat: flight.lat, lng: flight.lng, nac_p: flight.nac_p, callsign: flight.callsign });
      }

      switch (flight.category) {
        case 'military': military.push(flight); break;
        case 'jet':      jets.push(flight);     break;
        case 'private':  privateFl.push(flight); break;
        default:         commercial.push(flight);
      }
    }

    return {
      commercial_flights: commercial,
      private_flights:    privateFl,
      private_jets:       jets,
      military_flights:   military,
      gps_jamming:        aggregateJamming(gpsJamming, JAMMING_NACAP_THRESHOLD),
      total:              allRaw.length,
      source,
      // Per-feed counts so a provider that starts answering 200 with no aircraft
      // is visible in the payload rather than silently emptying the map.
      providers: {
        adsbfi_mil:      milCount,
        adsbfi_regional: openSkyWorked ? 0 : allRaw.length - milCount,
        opensky:         osSnapshot.length,
        opensky_auth:    hasOpenSkyCreds(),
        opensky_age_s:   osSnapshotTime ? Math.round((Date.now() - osSnapshotTime) / 1000) : null,
      },
      timestamp:          new Date().toISOString(),
    };
  })();

  try {
    const data = await fetchPromise;
    cachedData = data;
    lastFetchTime = Date.now();
    fetchPromise = null;
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': data.total < 100 ? 'no-store, max-age=0' : 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[OSIRIS] Flight fetch error:', error);
    fetchPromise = null;
    // Stale-cache fallback: return last known good data instead of blank map
    if (cachedData) {
      console.warn('[OSIRIS] Returning stale flight cache as fallback');
      return NextResponse.json({ ...cachedData, source: (cachedData.source || 'unknown') + '+stale' }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch flight data' }, { status: 500 });
  }
}

function aggregateJamming(points: any[], threshold: number) {
  if (points.length === 0) return [];
  const grid = new Map<string, { lat: number; lng: number; count: number; total_nac_p: number }>();
  const GRID_SIZE = 2;

  for (const p of points) {
    const gLat = Math.floor(p.lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(p.lng / GRID_SIZE) * GRID_SIZE;
    const key = `${gLat},${gLng}`;
    if (!grid.has(key)) grid.set(key, { lat: gLat + GRID_SIZE / 2, lng: gLng + GRID_SIZE / 2, count: 0, total_nac_p: 0 });
    const cell = grid.get(key)!;
    cell.count++;
    cell.total_nac_p += p.nac_p;
  }

  return Array.from(grid.values())
    .filter(z => z.count >= 3)
    .map(z => ({
      lat: z.lat,
      lng: z.lng,
      severity: Math.round((1 - (z.total_nac_p / z.count) / threshold) * 100),
      count: z.count,
    }));
}

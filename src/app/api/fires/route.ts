import { NextResponse } from 'next/server';
import { httpText } from '@/lib/httpJson';
import { cachedSource } from '@/lib/sourceCache';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Active Fire & Wildfire Tracking
 *
 * NASA FIRMS satellite hotspots (VIIRS, falling back to MODIS) plus NASA EONET
 * volcanoes. These are thermal *detections* — a satellite pixel that read hot —
 * so they have no name, no acreage and no containment. Named incidents with
 * those figures live in /api/fire-incidents, which is a different kind of data
 * entirely and does not replace this.
 *
 * ── On the payload shape ──
 * This route used to sample the CSV, keeping every Nth row to cap the result at
 * 2,000 points. The global 24h feed carries around 61,000 detections, so that
 * discarded ~97% of them — and discarded them by position in the file, which is
 * arbitrary, so any individual fire had roughly a three-in-a-hundred chance of
 * surviving. Fires that plainly existed were simply absent from the map.
 *
 * Nothing is dropped now. The rows are sent as a column-oriented array instead
 * of one object per detection, which is what makes that affordable: the same
 * 61,000 detections are 7.7MB as objects and 2.1MB like this, about 0.6MB on
 * the wire once gzipped. The client expands it back into objects.
 */

const FIRMS_SOURCES = [
  {
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
    label: 'NASA-FIRMS (VIIRS)',
  },
  {
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
    label: 'NASA-FIRMS (MODIS)',
  },
];

/** Column order of every row. Mirrored by the client when it expands them. */
export const FIRE_COLS = ['lat', 'lng', 'frp', 'brightness', 'conf', 'dateIdx', 'time', 'kind'] as const;

type FireRow = [number, number, number, number, number, number, string, number];

/** 0 low · 1 nominal · 2 high. VIIRS reports words, MODIS a 0-100 percentage. */
function confidenceCode(raw: string): number {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'h' || v === 'high') return 2;
  if (v === 'l' || v === 'low') return 0;
  if (v === 'n' || v === 'nominal') return 1;
  const n = Number(v);
  if (Number.isFinite(n)) return n >= 80 ? 2 : n >= 30 ? 1 : 0;
  return 1;
}

interface ParsedFires {
  rows: FireRow[];
  dates: string[];
}

/**
 * Dates are dictionary-encoded because a 24-hour product spans at most two of
 * them; storing the string on every row costs more than the coordinates do.
 */
function parseCSV(csv: string): ParsedFires {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return { rows: [], dates: [] };

  const header = lines[0].split(',');
  const idx = (name: string) => header.indexOf(name);
  const iLat = idx('latitude');
  const iLng = idx('longitude');
  const iBright = idx('bright_ti4') !== -1 ? idx('bright_ti4') : idx('brightness');
  const iConf = idx('confidence');
  const iDate = idx('acq_date');
  const iTime = idx('acq_time');
  const iFrp = idx('frp');
  if (iLat === -1 || iLng === -1) return { rows: [], dates: [] };

  const dates: string[] = [];
  const dateIndex = new Map<string, number>();
  const rows: FireRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const lat = parseFloat(c[iLat]);
    const lng = parseFloat(c[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const d = c[iDate] || '';
    let di = dateIndex.get(d);
    if (di === undefined) { di = dates.length; dates.push(d); dateIndex.set(d, di); }

    rows.push([
      // Four decimals is ~11m, well inside the 375m footprint of a VIIRS pixel,
      // and trims roughly a fifth off the payload.
      Math.round(lat * 1e4) / 1e4,
      Math.round(lng * 1e4) / 1e4,
      Math.round((parseFloat(c[iFrp]) || 0) * 10) / 10,
      Math.round(parseFloat(c[iBright]) || 0),
      confidenceCode(c[iConf]),
      di,
      c[iTime] || '',
      0,
    ]);
  }

  return { rows, dates };
}

interface FirePayload {
  dates: string[];
  rows: FireRow[];
  source: string;
}

async function buildPayload(): Promise<FirePayload> {
  let rows: FireRow[] = [];
  let dates: string[] = [];
  let source = '';

  for (const s of FIRMS_SOURCES) {
    try {
      const text = await httpText(s.url, { timeoutMs: 30000, headers: { 'Accept-Encoding': 'gzip' } });
      if (!text || !text.includes('latitude') || text.length < 200) continue;
      const parsed = parseCSV(text);
      if (parsed.rows.length > 0) {
        rows = parsed.rows;
        dates = parsed.dates;
        source = s.label;
        break;
      }
    } catch (e) {
      console.warn(`[OSIRIS] FIRMS ${s.label} failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Volcanoes ride in the same array under kind=1 so the client has one list.
  try {
    const raw = await httpText('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes&limit=50', { timeoutMs: 12000 });
    const events = (JSON.parse(raw)?.events ?? []) as Array<{ geometry?: Array<{ coordinates?: number[]; date?: string }> }>;
    for (const e of events) {
      const geo = e.geometry?.[e.geometry.length - 1];
      const co = geo?.coordinates;
      if (!co || co.length < 2) continue;
      const d = (geo?.date || '').split('T')[0];
      let di = dates.indexOf(d);
      if (di === -1) { di = dates.length; dates.push(d); }
      rows.push([co[1], co[0], 100, 500, 2, di, '', 1]);
    }
    if (!source) source = 'NASA-EONET';
  } catch (e) {
    console.warn('[OSIRIS] EONET volcanoes failed:', e instanceof Error ? e.message : e);
  }

  return { dates, rows, source: source || 'Unknown' };
}

/* cachedSource is built around arrays, so the payload travels as a single-
   element one. That is worth the small awkwardness: the fetch pulls a 4.8MB
   CSV and parses 61,000 rows, which took ~19s on a cold request and repeated
   that work on every miss. Cached, only the first caller pays, refreshes
   dedupe, and a failed refresh keeps serving the last good index rather than
   emptying the map. */
const loadFires = cachedSource<FirePayload>(
  'fires:index',
  async () => [await buildPayload()],
  10 * 60 * 1000,
);

export async function GET() {
  const [payload] = await loadFires();
  if (!payload) {
    return NextResponse.json(
      { cols: FIRE_COLS, dates: [], rows: [], total: 0, source: 'Unavailable', error: 'Fire index unavailable' },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      cols: FIRE_COLS,
      dates: payload.dates,
      rows: payload.rows,
      total: payload.rows.length,
      source: payload.source,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } },
  );
}

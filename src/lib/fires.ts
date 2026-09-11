/**
 * OSIRIS — expansion of the compact /api/fires payload.
 *
 * The route sends one array per detection rather than one object, because the
 * global FIRMS feed is around 61,000 of them and the object form costs 7.7MB
 * against 2.1MB like this. The map wants objects, so they are rebuilt here.
 *
 * The column order is a contract shared with the route. It is asserted in the
 * tests beside this file: getting it wrong would not throw, it would silently
 * swap latitude for longitude and scatter every fire into the sea.
 */

export interface FireDetection {
  lat: number;
  lng: number;
  frp: number;
  brightness: number;
  confidence: string;
  date: string;
  time: string;
  type: 'fire' | 'volcano';
}

interface CompactFires {
  rows?: unknown;
  dates?: unknown;
}

/** Index order matches the `conf` code written by the route. */
const CONFIDENCE = ['low', 'nominal', 'high'] as const;

export function expandFires(payload: CompactFires | null | undefined): FireDetection[] {
  const rows = payload?.rows;
  if (!Array.isArray(rows)) return [];
  const dates: string[] = Array.isArray(payload?.dates) ? (payload.dates as string[]) : [];

  const out: FireDetection[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const lat = Number(r[0]);
    const lng = Number(r[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({
      lat,
      lng,
      frp: Number(r[2]) || 0,
      brightness: Number(r[3]) || 0,
      confidence: CONFIDENCE[Number(r[4])] ?? 'nominal',
      date: dates[Number(r[5])] ?? '',
      time: typeof r[6] === 'string' ? r[6] : '',
      type: r[7] === 1 ? 'volcano' : 'fire',
    });
  }
  return out;
}

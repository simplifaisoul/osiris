import type { SourceAdapter } from '../types';

export interface BuoyObservation {
  stationId: string;
  lat: number;
  lng: number;
  windDir: number | null;
  windSpeed: number | null;
  gust: number | null;
  waveHeight: number | null;
  pressure: number | null;
  airTemp: number | null;
  waterTemp: number | null;
}

const URL = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

// NOAA marks missing readings as the literal string "MM".
function parseNum(field: string | undefined): number | null {
  if (!field || field === 'MM') return null;
  const n = parseFloat(field);
  return isNaN(n) ? null : n;
}

export function parseNdbcText(text: string): BuoyObservation[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith('#'));
  const observations: BuoyObservation[] = [];

  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    // STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES PTDY ATMP WTMP DEWP VIS TIDE
    if (cols.length < 19) continue;
    const lat = parseNum(cols[1]);
    const lng = parseNum(cols[2]);
    if (lat === null || lng === null) continue;

    observations.push({
      stationId: cols[0],
      lat,
      lng,
      windDir: parseNum(cols[8]),
      windSpeed: parseNum(cols[9]),
      gust: parseNum(cols[10]),
      waveHeight: parseNum(cols[11]),
      pressure: parseNum(cols[15]),
      airTemp: parseNum(cols[17]),
      waterTemp: parseNum(cols[18]),
    });
  }

  return observations;
}

export const ndbcBuoys: SourceAdapter<BuoyObservation[]> = {
  meta: {
    id: 'ndbc-buoys',
    name: 'NOAA NDBC Marine Buoys',
    category: 'maritime',
    homepage: 'https://www.ndbc.noaa.gov/',
    license: 'Public domain (US Government work)',
    requiresKey: false,
    ttlSeconds: 600,
    minIntervalMs: 60_000,
    attribution: 'NOAA NDBC',
  },
  isEnabled: () => true,
  async fetch({ signal }) {
    const res = await fetch(URL, { signal });
    if (!res.ok) throw new Error(`NDBC responded ${res.status}`);
    const text = await res.text();
    return parseNdbcText(text);
  },
};

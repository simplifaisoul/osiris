import { NextResponse } from 'next/server';

/**
 * OSIRIS — Ocean Buoy Data API
 * Fetches the latest observation from every active NOAA NDBC station in one
 * request (~880 stations worldwide, not just US waters). Wave height (WVHT)
 * is the field this layer exists for: a real-time precursor signal for
 * tsunami/swell hazards, not decoration.
 * No API key required.
 */

const SOURCE_URL = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

// NDBC's own placeholder for "not measured on this station" -- not an error,
// just a field this particular buoy does not carry (a wind buoy with no wave
// sensor, e.g.).
const num = (s: string | undefined): number | null =>
  s === undefined || s === 'MM' ? null : (Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);

export type Buoy = {
  id: string; lat: number; lng: number; time: string;
  windDir: number | null; windSpeed: number | null; gust: number | null;
  waveHeight: number | null; domPeriod: number | null; avgPeriod: number | null;
  waveDir: number | null; pressure: number | null; pressureTrend: number | null;
  airTemp: number | null; waterTemp: number | null; dewpoint: number | null;
  visibility: number | null; tide: number | null;
};

/** Pure so it can be tested against real NDBC sample lines without a network
 *  call -- the fixed-column format is the actual risk here (a source column
 *  reorder silently shifts every field one over), not the HTTP fetch. */
export function parseBuoys(text: string): Buoy[] {
  return text.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map((line): Buoy | null => {
      // Whitespace-delimited fixed-column text, not CSV -- NDBC pads every
      // field, so a plain split on runs of whitespace is exact.
      const f = line.trim().split(/\s+/);
      if (f.length < 22) return null;
      const [stn, lat, lon, yyyy, mm, dd, hh, mn, wdir, wspd, gst, wvht,
        dpd, apd, mwd, pres, ptdy, atmp, wtmp, dewp, vis, tide] = f;
      const latN = parseFloat(lat), lonN = parseFloat(lon);
      if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return null;
      return {
        id: stn,
        lat: latN,
        lng: lonN,
        time: `${yyyy}-${mm}-${dd}T${hh}:${mn}:00Z`,
        windDir: num(wdir),
        windSpeed: num(wspd),
        gust: num(gst),
        waveHeight: num(wvht),
        domPeriod: num(dpd),
        avgPeriod: num(apd),
        waveDir: num(mwd),
        pressure: num(pres),
        pressureTrend: num(ptdy),
        airTemp: num(atmp),
        waterTemp: num(wtmp),
        dewpoint: num(dewp),
        visibility: num(vis),
        tide: num(tide),
      };
    })
    .filter((b): b is Buoy => b !== null);
}

export async function GET() {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return NextResponse.json({ buoys: [], error: 'NDBC unavailable' });
    }
    const buoys = parseBuoys(await res.text());

    return NextResponse.json({
      buoys,
      total: buoys.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        // NDBC stations report roughly hourly; polling faster than the
        // source updates would just hammer them for the same bytes.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Buoy fetch error:', error);
    return NextResponse.json({ buoys: [], error: 'Failed to fetch buoy data' }, { status: 500 });
  }
}

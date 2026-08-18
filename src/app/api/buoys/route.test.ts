import { describe, it, expect } from 'vitest';
import { parseBuoys } from './route';

// Real sample rows, fetched by hand from
// https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt on 2026-08-17 --
// not synthesised, so this test fails first if NDBC ever reorders or drops a
// column rather than the app finding out in production.
const HEADER =
  '#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE\n' +
  '#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft\n';

describe('parseBuoys', () => {
  it('parses a station with real wave data', () => {
    const line = '41001    34.738  -72.503 2026 08 17 05 40 200   5.0   6.0   MM  MM  5.5  68 1016.5    MM  27.1  28.5  22.7   MM     MM';
    const [b] = parseBuoys(HEADER + line);
    expect(b.id).toBe('41001');
    expect(b.lat).toBeCloseTo(34.738);
    expect(b.lng).toBeCloseTo(-72.503);
    expect(b.time).toBe('2026-08-17T05:40:00Z');
    expect(b.windSpeed).toBeCloseTo(5.0);
    expect(b.avgPeriod).toBeCloseTo(5.5);
    expect(b.waveDir).toBe(68);
    expect(b.pressure).toBeCloseTo(1016.5);
    expect(b.airTemp).toBeCloseTo(27.1);
    expect(b.waterTemp).toBeCloseTo(28.5);
    expect(b.gust).toBeCloseTo(6.0);
    // WVHT and DPD are genuinely absent on this reading -- MM, not zero.
    expect(b.waveHeight).toBeNull();
    expect(b.domPeriod).toBeNull();
  });

  it('parses a station with a real wave height, including zero', () => {
    const line = '22101    37.24   126.02  2026 08 17 05 00 320   0.0    MM  0.0   0   MM  MM     MM    MM  25.8  25.8    MM   MM     MM';
    const [b] = parseBuoys(HEADER + line);
    expect(b.waveHeight).toBe(0);
    expect(b.domPeriod).toBe(0);
    expect(b.gust).toBeNull();
  });

  it('skips both header/comment lines and blank lines', () => {
    const result = parseBuoys(HEADER + '\n   \n');
    expect(result).toEqual([]);
  });

  it('drops a malformed row instead of crashing or emitting NaN coordinates', () => {
    const good = '41001    34.738  -72.503 2026 08 17 05 40 200   5.0   6.0   MM  MM  5.5  68 1016.5    MM  27.1  28.5  22.7   MM     MM';
    const short = 'BADSTN too few columns here';
    const result = parseBuoys(HEADER + good + '\n' + short);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('41001');
  });

  it('handles a southern-hemisphere negative longitude station', () => {
    const line = '32ST0   -22.000  -85.000 2026 08 17 05 30 160  11.0    MM   MM  MM   MM  MM 1019.9    MM  18.5  19.6  14.2   MM     MM';
    const [b] = parseBuoys(HEADER + line);
    expect(b.lat).toBeCloseTo(-22.0);
    expect(b.lng).toBeCloseTo(-85.0);
    expect(b.waveHeight).toBeNull();
  });
});

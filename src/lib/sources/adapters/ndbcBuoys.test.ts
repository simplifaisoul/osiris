import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseNdbcText, ndbcBuoys } from './ndbcBuoys';

afterEach(() => vi.unstubAllGlobals());

const SAMPLE = [
  '#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE',
  '#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft',
  '14049   -12.000   65.000 2026 07 05 19 00 127   8.0  10.5   MM  MM   MM  MM 1015.9    MM  20.0  26.4    MM   MM     MM',
  '99999    21.000  -23.000 2026 07 05 19 00  MM    MM    MM   MM  MM   MM  MM     MM    MM    MM    MM    MM   MM     MM',
].join('\n');

describe('parseNdbcText', () => {
  it('parses a data row into a buoy observation', () => {
    const result = parseNdbcText(SAMPLE);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stationId: '14049', lat: -12.0, lng: 65.0, windSpeed: 8.0, waterTemp: 26.4, airTemp: 20.0 });
  });

  it('converts "MM" (missing) fields to null rather than NaN', () => {
    const result = parseNdbcText(SAMPLE);
    const secondStation = result.find((b) => b.stationId === '99999');
    expect(secondStation?.windSpeed).toBeNull();
    expect(secondStation?.waterTemp).toBeNull();
  });

  it('skips comment/header lines', () => {
    const result = parseNdbcText('#STN header\n#text header\n');
    expect(result).toEqual([]);
  });
});

describe('ndbcBuoys adapter', () => {
  it('fetches and parses the latest_obs feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE }));
    const result = await ndbcBuoys.fetch({ signal: new AbortController().signal });
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(ndbcBuoys.fetch({ signal: new AbortController().signal })).rejects.toThrow('500');
  });
});

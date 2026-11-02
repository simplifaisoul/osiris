import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipTime, fetchItalyCameras, parseAutostradeCameras } from './italy';

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.UTC(2026, 9, 9, 6, 0);
const CLIP = 'dt4/fdb2dcf0-d228-491f-948b-032d4a12a14e-23.mp4';

/** One camera as viabilita.autostrade.it/json/webcams.json lists it, trimmed to what is read. */
const aspi = (overrides: Record<string, unknown> = {}) => ({
  c_tel: 7304,
  t_day: '09-10-2026',
  t_time: '05:39',
  t_des_str: 'A1 MILANO-NAPOLI',
  t_des: 'km. 285 Arno a Firenze itinere nord',
  n_crd_lat: 43.79475,
  n_crd_lon: 11.15661,
  frames: { V: { c_tip_frm: 'V', n_prg_frm: -1, t_url: CLIP } },
  ...overrides,
});

const parse = (...cams: unknown[]) => parseAutostradeCameras({ webcams: cams }, NOW);

describe('clipTime', () => {
  it('reads the list’s day and time', () => {
    expect(clipTime('09-10-2026', '05:39')).toBe(Date.UTC(2026, 9, 9, 5, 39));
    expect(clipTime('2026-10-09', '05:39')).toBeNaN();
    expect(clipTime(undefined, '05:39')).toBeNaN();
  });
});

describe('parseAutostradeCameras', () => {
  it('plays the camera’s clip from Autostrade’s own video host', () => {
    expect(parse(aspi())).toEqual([{
      id: 'it-aspi-7304',
      lat: 43.79475,
      lng: 11.15661,
      name: 'A1 km. 285 Arno a Firenze itinere nord',
      city: 'A1 MILANO-NAPOLI',
      country: 'Italy',
      stream_url: `https://video.autostrade.it/video-mp4_hq/${CLIP}`,
      stream_type: 'mp4',
      source: "Autostrade per l'Italia",
    }]);
  });

  it('strips the emoji variation selectors some road names carry', () => {
    expect(parse(aspi({ t_des_str: 'A4 MILANO-BRESCIA️' }))[0].city).toBe('A4 MILANO-BRESCIA');
  });

  it('drops clip paths that are not the shape Autostrade publishes', () => {
    for (const t_url of ['../../etc/passwd', 'https://evil.example/x.mp4', CLIP.replace('.mp4', '.jpg'), `/${CLIP}`, 42]) {
      expect(parse(aspi({ frames: { V: { t_url } } }))).toEqual([]);
    }
    expect(parse(aspi({ frames: { T: { t_url: 'dt4/x-thumb.jpg' } } }))).toEqual([]);
  });

  it('drops cameras that stopped recording, or carry no usable stamp', () => {
    expect(parse(aspi({ t_day: '20-11-2025' }))).toEqual([]);
    expect(parse(aspi({ t_day: '07-10-2026' }))).toEqual([]);
    expect(parse(aspi({ t_time: undefined }))).toEqual([]);
    expect(parse(aspi({ t_day: '08-10-2026', t_time: '12:00' }))).toHaveLength(1);
  });

  it('drops records outside Italy or without usable coordinates or id', () => {
    expect(parse(aspi({ n_crd_lat: 48.85, n_crd_lon: 2.35 }))).toEqual([]);
    expect(parse(aspi({ n_crd_lat: null }))).toEqual([]);
    expect(parse(aspi({ c_tel: 'x' }))).toEqual([]);
  });

  it('returns nothing for a body that is not the list', () => {
    expect(parseAutostradeCameras(null)).toEqual([]);
    expect(parseAutostradeCameras({ webcams: 'x' })).toEqual([]);
  });
});

describe('fetchItalyCameras', () => {
  it('adds the motorway cameras to the city webcams', async () => {
    const today = new Date();
    const day = `${String(today.getUTCDate()).padStart(2, '0')}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${today.getUTCFullYear()}`;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ webcams: [aspi({ t_day: day, t_time: '00:00' })] })));
    const cams = await fetchItalyCameras();
    expect(cams.filter(c => c.source === 'SkylineWebcams').length).toBeGreaterThan(0);
    expect(cams.filter(c => c.source === "Autostrade per l'Italia").map(c => c.id)).toEqual(['it-aspi-7304']);
  });

  it('still returns the city webcams when Autostrade is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const cams = await fetchItalyCameras();
    expect(cams.length).toBeGreaterThan(0);
    expect(cams.every(c => c.source === 'SkylineWebcams')).toBe(true);
  });
});

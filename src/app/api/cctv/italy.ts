import type { CctvCamera } from './types';

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
const SKYLINE_ITALY: CctvCamera[] = [
  // Rome
  { id: 'sky-it-trevi', lat: 41.9009, lng: 12.4833, name: 'Rome - Trevi Fountain', city: 'Rome', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive341.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/fontana-di-trevi.html', source: 'SkylineWebcams' },
  { id: 'sky-it-pantheon', lat: 41.8986, lng: 12.4769, name: 'Rome - Pantheon', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/pantheon.html', source: 'SkylineWebcams' },
  { id: 'sky-it-colosseum', lat: 41.8902, lng: 12.4922, name: 'Rome - Colosseum', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html', source: 'SkylineWebcams' },
  { id: 'sky-it-navona', lat: 41.8992, lng: 12.4731, name: 'Rome - Piazza Navona', city: 'Rome', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive343.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/piazza-navona.html', source: 'SkylineWebcams' },
  { id: 'sky-it-spagna', lat: 41.9059, lng: 12.4827, name: 'Rome - Spanish Steps', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/piazza-di-spagna.html', source: 'SkylineWebcams' },
  
  // Venice
  { id: 'sky-it-rialto', lat: 45.4381, lng: 12.3358, name: 'Venice - Rialto Bridge', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/ponte-di-rialto.html', source: 'SkylineWebcams' },
  { id: 'sky-it-sanmarco', lat: 45.4341, lng: 12.3384, name: 'Venice - St. Mark\'s Square', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/piazza-san-marco.html', source: 'SkylineWebcams' },
  { id: 'sky-it-grandcanal', lat: 45.4311, lng: 12.3283, name: 'Venice - Grand Canal', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/canal-grande.html', source: 'SkylineWebcams' },

  // Milan
  { id: 'sky-it-duomo', lat: 45.4642, lng: 9.1900, name: 'Milan - Milan Cathedral', city: 'Milan', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lombardia/milano/duomo-milano.html', source: 'SkylineWebcams' },
  { id: 'sky-it-sanbabila', lat: 45.4665, lng: 9.1969, name: 'Milan - Piazza San Babila', city: 'Milan', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive435.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lombardia/milano/piazza-san-babila.html', source: 'SkylineWebcams' },

  // Florence
  { id: 'sky-it-signoria', lat: 43.7695, lng: 11.2558, name: 'Florence - Piazza della Signoria', city: 'Florence', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive245.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/toscana/firenze/piazza-della-signoria.html', source: 'SkylineWebcams' },
  { id: 'sky-it-pontevecchio', lat: 43.7687, lng: 11.2530, name: 'Florence - Ponte Vecchio', city: 'Florence', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/toscana/firenze/ponte-vecchio.html', source: 'SkylineWebcams' },

  // Naples
  { id: 'sky-it-vesuvio', lat: 40.8174, lng: 14.4261, name: 'Naples - Mount Vesuvius', city: 'Naples', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive66.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/napoli/vesuvio.html', source: 'SkylineWebcams' },
  { id: 'sky-it-plebiscito', lat: 40.8359, lng: 14.2487, name: 'Naples - Piazza del Plebiscito', city: 'Naples', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive260.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/napoli/piazza-del-plebiscito.html', source: 'SkylineWebcams' },

  // Amalfi Coast
  { id: 'sky-it-amalfi', lat: 40.6333, lng: 14.6027, name: 'Amalfi Coast - Positano', city: 'Positano', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive259.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/salerno/positano.html', source: 'SkylineWebcams' },
  
  // Sicily
  { id: 'sky-it-etna', lat: 37.7510, lng: 14.9934, name: 'Mount Etna - Volcano', city: 'Catania', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/sicilia/catania/vulcano-etna.html', source: 'SkylineWebcams' },
];

/* ── Autostrade per l'Italia — motorway cameras ──────────────── */

/*
 * The ~970 cameras on Autostrade per l'Italia's motorways, from the list its
 * own traffic map loads (https://www.autostrade.it/it/webcam). Each camera is
 * a short MP4 clip, re-recorded every few minutes and overwritten at the same
 * address, so a cached catalogue keeps pointing at the newest clip. The clip
 * path comes from the list, so it is checked against the one shape it takes
 * before it is joined onto Autostrade's own video host.
 */
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const ASPI_LIST = 'https://viabilita.autostrade.it/json/webcams.json';
const ASPI_VIDEO = 'https://video.autostrade.it/video-mp4_hq/';
/** "dt4/fdb2dcf0-d228-491f-948b-032d4a12a14e-23.mp4" */
const CLIP_PATH = /^[a-z0-9]{2,8}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d{1,4}\.mp4$/;
/** A camera whose last clip is older than this has stopped recording — a few still list one from 2025. */
const STALE_MS = 24 * 60 * 60 * 1000;

const inItaly = (lat: number, lng: number) => lat > 36 && lat < 47.5 && lng > 6.5 && lng < 18.5;

/**
 * "09-10-2026" + "05:40" as epoch ms, or NaN. The stamp is Italian time but is
 * read as UTC: an hour or two either way does not matter against a day.
 */
export function clipTime(day: unknown, time: unknown): number {
  const d = typeof day === 'string' ? day.match(/^(\d{2})-(\d{2})-(\d{4})$/) : null;
  const t = typeof time === 'string' ? time.match(/^(\d{2}):(\d{2})$/) : null;
  if (!d || !t) return NaN;
  return Date.UTC(+d[3], +d[2] - 1, +d[1], +t[1], +t[2]);
}

/** Some road names carry stray emoji variation selectors: "A4 MILANO-BRESCIA️". */
const clean = (s: unknown) =>
  typeof s === 'string' ? s.replace(/[︀-️]/g, '').replace(/\s+/g, ' ').trim() : '';

interface AspiCamera {
  c_tel?: unknown;
  t_day?: unknown;
  t_time?: unknown;
  t_des_str?: unknown;
  t_des?: unknown;
  n_crd_lat?: unknown;
  n_crd_lon?: unknown;
  frames?: { V?: { t_url?: unknown } };
}

export function parseAutostradeCameras(raw: unknown, now = Date.now()): CctvCamera[] {
  const list = (raw as { webcams?: unknown })?.webcams;
  if (!Array.isArray(list)) return [];
  const cams: CctvCamera[] = [];
  for (const c of list as AspiCamera[]) {
    const id = Number(c?.c_tel);
    const lat = Number(c?.n_crd_lat);
    const lng = Number(c?.n_crd_lon);
    const clip = c?.frames?.V?.t_url;
    if (!Number.isInteger(id) || id <= 0 || typeof clip !== 'string' || !CLIP_PATH.test(clip)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inItaly(lat, lng)) continue;
    // NaN (no usable stamp) fails this too.
    if (!(now - clipTime(c.t_day, c.t_time) < STALE_MS)) continue;
    const road = clean(c.t_des_str) || 'Autostrade';
    const where = clean(c.t_des);
    cams.push({
      id: `it-aspi-${id}`,
      lat,
      lng,
      // "A1 km. 285 Arno a Firenze itinere nord"
      name: where ? `${road.split(' ')[0]} ${where}` : road,
      city: road,
      country: 'Italy',
      stream_url: `${ASPI_VIDEO}${clip}`,
      stream_type: 'mp4',
      source: "Autostrade per l'Italia",
    });
  }
  return cams;
}

export async function fetchAutostradeCameras(): Promise<CctvCamera[]> {
  const res = await fetch(ASPI_LIST, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`autostrade webcams HTTP ${res.status}`);
  return parseAutostradeCameras(await res.json());
}

export async function fetchItalyCameras(): Promise<CctvCamera[]> {
  // The motorway list failing must not take the city webcams down with it.
  const motorways = await fetchAutostradeCameras().catch(e => {
    console.warn('[OSIRIS] Autostrade per l\'Italia failed — absent from this refresh:', e instanceof Error ? e.message : e);
    return [] as CctvCamera[];
  });
  return [...SKYLINE_ITALY, ...motorways];
}

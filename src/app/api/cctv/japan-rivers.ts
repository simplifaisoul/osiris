import type { CctvCamera } from './types';

/**
 * OSIRIS — Japan's river cameras (川の防災情報, MLIT)
 *
 * The national river-disaster site, river.go.jp, maps every river camera run by
 * MLIT's regional bureaus and by the prefectures: about 11,300, from Hokkaido
 * to Okinawa. Its map reads one keyless JSON list per prefecture area, each
 * camera with a point, a name and a picture link on cam.river.go.jp:
 *
 *   map/pref/prefarea.json                 the prefecture areas (51; Hokkaido is split)
 *   map/twn/twnarea.json                   the municipalities, for each camera's city
 *   obslist/twninfo/obs/scam/<pref>.json   that area's cameras, by municipality
 *
 * A picture keeps its link and is replaced in place every few minutes (on one
 * check all 287 sampled pictures that carried a date were under half an hour
 * old), and cam.river.go.jp serves it to any page, so the browser loads it
 * directly.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const BASE = 'https://www.river.go.jp/kawabou/file/files';
const AT_ONCE = 8;
/** Japan, Okinawa and the outlying islands included; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 20, maxLat: 46, minLng: 122, maxLng: 154 };
/* Two name styles: 102561088.jpg for most cameras, cctv_240001_51C04286.jpg for MLIT's own CCTV. */
const PICTURE = /^https:\/\/cam\.river\.go\.jp\/cam\/now\/[\w-]+\.jpg$/;

/** One camera as river.go.jp lists it (only the fields we read). */
export interface RiverCameraRow {
  scamId?: number;
  name?: string | null;
  lat?: number;
  lon?: number;
  rvrNm?: string | null;
  currProvUrl?: string | null;
  currentUrl?: string | null;
}

interface AreaFile {
  prefTwn?: { twnCd?: number; cctv?: RiverCameraRow[]; scam?: RiverCameraRow[] }[];
}

/** Full-width letters and digits (７．７ｋ) as ordinary ones, spaces collapsed. */
const tidy = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Map one row to a camera, or null when it has no place or picture. */
export function mapRiverCamera(row: RiverCameraRow, city: string | undefined): CctvCamera | null {
  const id = row?.scamId;
  const { lat, lon } = row ?? {};
  const picture = row?.currProvUrl || row?.currentUrl || '';
  if (!Number.isInteger(id) || typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLng || lon > BOUNDS.maxLng) return null;
  if (!PICTURE.test(picture)) return null;
  const place = tidy(row.name);
  const river = tidy(row.rvrNm);
  return {
    id: `jp-river-${id}`,
    lat,
    lng: lon,
    name: (river && !place.includes(river) ? `${river} ${place}` : place) || river || 'River camera',
    city: city || 'Japan',
    country: 'Japan',
    feed_url: picture,
    source: 'MLIT river.go.jp',
  };
}

/** The cameras in one prefecture area's file, each with its municipality as the city. */
export function camerasInArea(file: AreaFile, towns: Map<number, string>): CctvCamera[] {
  const cams: CctvCamera[] = [];
  for (const town of file?.prefTwn ?? []) {
    const city = town?.twnCd != null ? towns.get(town.twnCd) : undefined;
    for (const row of [...(town?.cctv ?? []), ...(town?.scam ?? [])]) {
      const cam = mapRiverCamera(row, city);
      if (cam) cams.push(cam);
    }
  }
  return cams;
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  /* An area with no cameras has no file: the site answers 404 with its error page. */
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`river.go.jp ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchJapanRiverCameras(): Promise<CctvCamera[]> {
  const [prefs, towns] = await Promise.all([
    getJson<{ prefs?: { prefCd?: number }[] }>('map/pref/prefarea.json'),
    getJson<{ towns?: { twnCd?: number; twnNm?: string }[] }>('map/twn/twnarea.json'),
  ]);
  const areas = (prefs?.prefs ?? []).map(p => p.prefCd).filter((c): c is number => Number.isInteger(c));
  if (!areas.length) throw new Error('river.go.jp listed no prefecture areas');
  const townNames = new Map<number, string>();
  for (const t of towns?.towns ?? []) if (t.twnCd != null && t.twnNm) townNames.set(t.twnCd, t.twnNm);

  const byId = new Map<string, CctvCamera>();
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < areas.length) {
      const area = areas[next++];
      try {
        const file = await getJson<AreaFile>(`obslist/twninfo/obs/scam/${area}.json`);
        if (file) for (const cam of camerasInArea(file, townNames)) byId.set(cam.id, cam);
      } catch (e) {
        failed++;
        console.warn('[OSIRIS] Japan river cameras:', e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  if (!byId.size) throw new Error('river.go.jp returned no cameras');
  console.log(`[OSIRIS] Japan river cameras — river.go.jp: ${byId.size} from ${areas.length} areas${failed ? `, ${failed} failed` : ''}`);
  return [...byId.values()];
}

import { cachedSource } from '@/lib/sourceCache';
import { decodeWindows1252, type CctvCamera } from './types';

/**
 * OSIRIS — Luxembourg's motorway cameras (CITA, the Ponts et Chaussées traffic
 * control centre).
 *
 * Positions come from the KML CITA publishes on data.public.lu ("Cita :
 * Caméras autoroute", CC0): www.cita.lu/kml/cameras.kml, about 96 cameras.
 * Each picture is a 704×576 still at
 * www.cita.lu/info_trafic/cameras/images/cccam_<n>.jpg, renewed every minute,
 * served with Access-Control-Allow-Origin: *.
 *
 * The KML only calls them "A6 - Camera 3". CITA's webcam pages, one per
 * motorway, give the views their names ("Kirchberg - direction Tunnel
 * Cents"); those are read too when they answer, and a camera they do not name
 * keeps the KML's label. The pages are Windows-1252.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
export const CAMERAS_KML = 'https://www.cita.lu/kml/cameras.kml';
const IMAGE = (n: string) => `https://www.cita.lu/info_trafic/cameras/images/cccam_${n}.jpg`;
/** CITA's webcam pages, one per motorway. */
const NAME_PAGES = ['a1', 'a3', 'a4', 'a6', 'a7', 'a13'].map(r => `https://www.cita.lu/fr/webcam/${r}.html`);

/** Luxembourg, padded for the cameras at its border crossings. */
const BOUNDS = { minLat: 49.4, maxLat: 50.2, minLng: 5.7, maxLng: 6.6 };

/** Camera number → the name CITA's webcam pages give its view. Exported for tests. */
export function parseNames(html: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const [, n, title] of html.matchAll(/data-cam="cam-(\d+)"\s+data-title="([^"]+)"/g)) {
    const name = title.replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
    if (name) names.set(n, name);
  }
  return names;
}

/** Map every placemark of CITA's KML to a camera. Exported for tests. */
export function parseCitaKml(kml: string, names: Map<string, string> = new Map()): CctvCamera[] {
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();
  for (const [, n, body] of kml.matchAll(/<Placemark id="camera_(\d+)">([\s\S]*?)<\/Placemark>/g)) {
    if (seen.has(n)) continue;
    const coords = body.match(/<coordinates>\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!coords) continue;
    const lng = parseFloat(coords[1]);
    const lat = parseFloat(coords[2]);
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    seen.add(n);
    const label = body.match(/<name>([^<]*)<\/name>/)?.[1]?.trim();
    // "A6 - Camera 3" → "A6"; a named view reads "A6 · Kirchberg - direction …".
    const road = label?.match(/^([AB]\d+)\b/)?.[1];
    const named = names.get(n);
    cams.push({
      id: `lu-cita-${n}`,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      name: named ? (road ? `${road} · ${named}` : named) : label || `CITA camera ${n}`,
      city: 'Luxembourg',
      country: 'Luxembourg',
      feed_url: IMAGE(n),
      source: 'CITA',
    });
  }
  return cams;
}

async function namesFrom(url: string): Promise<Map<string, string>> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CITA ${url} HTTP ${res.status}`);
  return parseNames(decodeWindows1252(await res.arrayBuffer()));
}

export const fetchLuxembourgCameras = cachedSource('luxembourg', async (): Promise<CctvCamera[]> => {
  const [kml, ...pages] = await Promise.allSettled([
    fetch(CAMERAS_KML, { headers: { 'User-Agent': UA, Accept: 'application/vnd.google-earth.kml+xml, application/xml' }, signal: AbortSignal.timeout(12000) })
      .then(async res => {
        if (!res.ok) throw new Error(`CITA cameras HTTP ${res.status}`);
        return res.text();
      }),
    ...NAME_PAGES.map(namesFrom),
  ]);
  if (kml.status === 'rejected') throw kml.reason;
  // A page that fails costs its cameras their names, not their place.
  const names = new Map<string, string>();
  for (const page of pages) if (page.status === 'fulfilled') for (const [n, name] of page.value as Map<string, string>) names.set(n, name);
  const cams = parseCitaKml(kml.value as string, names);
  console.log(`[OSIRIS] Luxembourg cameras — CITA: ${cams.length} (${names.size} named)`);
  return cams;
});

import { cachedSource } from '@/lib/sourceCache';
import { currentOnly } from './queensland';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Madrid's city traffic cameras. The DGT feed behind ./spain covers
 * the national roads; these are the city's own network.
 *
 * The Ayuntamiento's traffic-management centre (Informo) publishes its cameras
 * as one KML, informo.madrid.es/informo/tmadrid/CCTV.kml: about 360, keyless.
 * Each picture is a 1280×720 still at informo.madrid.es/cameras/Camara<Numero>.jpg,
 * renewed every minute and served with Access-Control-Allow-Origin: *. A few
 * stop updating for days at a time, so, as with Queensland's, each picture's
 * date is checked at refresh and a stopped camera is left off (`currentOnly`).
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';

export const MADRID_KML = 'https://informo.madrid.es/informo/tmadrid/CCTV.kml';
const MADRID_IMAGE = (n: string) => `https://informo.madrid.es/cameras/Camara${n}.jpg`;
/** ~360 picture dates, 24 at a time, take about 5s; cameras not reached in time keep their place. */
const CHECK_BUDGET_MS = 15_000;
/** The city and its ring roads; a row outside it is mis-geocoded. */
const BOUNDS = { minLat: 40.25, maxLat: 40.65, minLng: -3.95, maxLng: -3.5 };

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => XML_ENTITIES[e]);

/** One placemark's value for `name`, read from Informo's KML. */
function dataValue(placemark: string, name: string): string | undefined {
  const m = placemark.match(new RegExp(`<Data name="${name}">\\s*<Value>([^<]*)</Value>`));
  return m ? decodeXml(m[1]).trim() : undefined;
}

/** Map every placemark of Informo's KML to a camera. Exported for tests. */
export function parseMadridKml(kml: string): CctvCamera[] {
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();
  for (const [, placemark] of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const number = dataValue(placemark, 'Numero');
    // Digits only: it becomes part of a URL.
    if (!number || !/^\d{1,6}$/.test(number) || seen.has(number)) continue;
    const coords = placemark.match(/<coordinates>\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!coords) continue;
    const lng = parseFloat(coords[1]);
    const lat = parseFloat(coords[2]);
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
    seen.add(number);
    const name = dataValue(placemark, 'Nombre')?.replace(/\s+/g, ' ');
    cams.push({
      id: `madrid-${number}`,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      name: name || `Madrid camera ${number}`,
      city: 'Madrid',
      country: 'Spain',
      feed_url: MADRID_IMAGE(number),
      source: 'Ayuntamiento de Madrid',
    });
  }
  return cams;
}

export const fetchMadridCameras = cachedSource('madrid', async (): Promise<CctvCamera[]> => {
  const res = await fetch(MADRID_KML, { headers: { 'User-Agent': UA, Accept: 'application/vnd.google-earth.kml+xml, application/xml' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Madrid cameras HTTP ${res.status}`);
  const listed = parseMadridKml((await res.text()).replace(/^﻿/, ''));
  const cams = await currentOnly(listed, Date.now(), CHECK_BUDGET_MS);
  console.log(`[OSIRIS] Madrid cameras — Informo: ${cams.length} current of ${listed.length}`);
  return cams;
});

import type { CctvCamera } from './types';

/**
 * OSIRIS — Denmark public webcams.
 *
 * Two deliberately public sources are combined here:
 *
 *  • Operator-published webcam pages/embeds. These are the authoritative
 *    entries we can verify directly on the harbour/marina's own site.
 *  • ARGOS ATLAS' public webcam catalogue. ARGOS publishes a keyless GeoJSON
 *    index and a public still-image endpoint for image cameras. We only accept
 *    catalogue points that fall inside conservative Denmark-only geographic
 *    masks; neighbouring Germany and Sweden are deliberately outside them.
 *
 * Vejdirektoratet road cameras are intentionally NOT reconstructed here. The
 * public webcam display on trafikinfo.dk was withdrawn on 30 September 2026.
 * Nothing in this module scans devices, guesses credentials or accesses a
 * private camera interface.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const ARGOS = 'https://argosatlas.com';
const ARGOS_GEOJSON = `${ARGOS}/api/cameras.geojson`;
const SAFE_ID = /^[a-zA-Z0-9_-]{4,80}$/;

/** Cameras/pages verified as intentionally public by their operators. */
export const DENMARK_OPERATOR_WEBCAMS: CctvCamera[] = [
  {
    id: 'dk-hirtshals-port-north',
    lat: 57.5926,
    lng: 9.9696,
    name: 'Hirtshals Havn – Kamera 1 (nord)',
    city: 'Hirtshals',
    country: 'Denmark',
    external_url: 'https://portofhirtshals.dk/da/aktuelt/webcams/',
    source: 'Port of Hirtshals',
  },
  {
    id: 'dk-hirtshals-port-east',
    lat: 57.5919,
    lng: 9.9710,
    name: 'Hirtshals Havn – Kamera 2 (øst)',
    city: 'Hirtshals',
    country: 'Denmark',
    external_url: 'https://portofhirtshals.dk/da/aktuelt/webcams/',
    source: 'Port of Hirtshals',
  },
  {
    id: 'dk-skagen-port',
    lat: 57.7178,
    lng: 10.5875,
    name: 'Skagen Havn – Webcam',
    city: 'Skagen',
    country: 'Denmark',
    external_url: 'https://www.skagenhavn.dk/dk/havneudvidelsen/webcam',
    source: 'Skagen Havn',
  },
  {
    id: 'dk-augustenborg-yachthavn',
    lat: 54.94195,
    lng: 9.87102,
    name: 'Augustenborg Yachthavn – Webcam',
    city: 'Augustenborg',
    country: 'Denmark',
    stream_url: 'https://rtsp.me/embed/3YAiG96E/',
    stream_type: 'iframe',
    external_url: 'https://ayh.dk/webcam/',
    source: 'Augustenborg Yachthavn',
  },
  {
    id: 'dk-anholt-port',
    lat: 56.71494,
    lng: 11.51226,
    name: 'Anholt Havn – Live Webcam',
    city: 'Anholt',
    country: 'Denmark',
    external_url: 'https://anholthavn.dk/faciliteter/',
    source: 'Anholt Havn',
  },
  {
    id: 'dk-udbyhoj-marina',
    lat: 56.61153,
    lng: 10.30619,
    name: 'Udbyhøj Lystbådehavn – Webcam',
    city: 'Udbyhøj',
    country: 'Denmark',
    external_url: 'https://udbyhojlystbaadehavn.randers.dk/',
    source: 'Udbyhøj Lystbådehavn',
  },
];

interface ArgosFeature {
  geometry?: { type?: unknown; coordinates?: unknown };
  properties?: {
    id?: unknown;
    name?: unknown;
    province?: unknown;
    media_type?: unknown;
    category?: unknown;
  };
}

interface ArgosGeoJson {
  features?: unknown;
}

/**
 * Conservative masks around Danish land/islands rather than one broad country
 * rectangle. This matters around Flensburg and Øresund, where a plain bounding
 * box would import German or Swedish cameras.
 */
export function inDenmarkMask(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  // Jutland, including the Danish side of the German border.
  const jutland = lat >= 54.80 && lat <= 57.82 && lng >= 8.00 && lng <= 10.95;
  // Funen, Ærø, Langeland, Samsø and nearby islands.
  const central = lat >= 54.68 && lat <= 56.05 && lng >= 9.55 && lng <= 11.15;
  // Zealand, Lolland, Falster and Møn. 12.68 stays west of the Swedish coast.
  const east = lat >= 54.48 && lat <= 56.18 && lng >= 10.75 && lng <= 12.68;
  // Læsø and Anholt sit north/east of the main masks.
  const kattegat = lat >= 56.45 && lat <= 57.45 && lng >= 10.45 && lng <= 12.10;
  // Bornholm.
  const bornholm = lat >= 54.95 && lat <= 55.35 && lng >= 14.65 && lng <= 15.20;

  return jutland || central || east || kattegat || bornholm;
}

function label(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function parseArgos(raw: unknown): CctvCamera[] {
  const features = (raw as ArgosGeoJson)?.features;
  if (!Array.isArray(features)) return [];

  const out: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const feature of features as ArgosFeature[]) {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const id = String(feature?.properties?.id ?? '');
    if (!SAFE_ID.test(id) || !inDenmarkMask(lat, lng) || seen.has(id)) continue;
    seen.add(id);

    const name = label(feature?.properties?.name, 'Public webcam');
    const city = label(feature?.properties?.province, 'Denmark');
    const media = String(feature?.properties?.media_type ?? '').toLowerCase();
    const external = `${ARGOS}/map/#c=${encodeURIComponent(id)}`;

    const camera: CctvCamera = {
      id: `dk-argos-${id}`,
      lat,
      lng,
      name,
      city,
      country: 'Denmark',
      external_url: external,
      source: 'ARGOS ATLAS public webcam catalogue',
    };

    // ARGOS explicitly publishes this endpoint for still-image catalogue items.
    // Streams/YouTube entries stay as public catalogue links until their
    // operator-published embed can be verified independently.
    if (media === 'image') {
      camera.feed_url = `${ARGOS}/api/cam/${encodeURIComponent(id)}/image`;
      camera.stream_type = 'jpg';
    }

    out.push(camera);
  }

  return out;
}

/** Rough distance in km, only used to remove exact operator/catalogue doubles. */
function kmBetween(a: CctvCamera, b: CctvCamera): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function withoutOperatorDuplicates(catalogue: CctvCamera[]): CctvCamera[] {
  return catalogue.filter(candidate => !DENMARK_OPERATOR_WEBCAMS.some(operator => {
    if (kmBetween(candidate, operator) > 0.35) return false;
    const a = candidate.name.toLocaleLowerCase('da');
    const b = `${operator.name} ${operator.city}`.toLocaleLowerCase('da');
    return a.includes(operator.city.toLocaleLowerCase('da')) || b.includes(candidate.city.toLocaleLowerCase('da'));
  }));
}

export async function fetchArgosDenmarkCameras(): Promise<CctvCamera[]> {
  const res = await fetch(ARGOS_GEOJSON, {
    headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(7000),
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`ARGOS cameras HTTP ${res.status}`);
  return withoutOperatorDuplicates(parseArgos(await res.json()));
}

export async function fetchDenmarkCameras(): Promise<CctvCamera[]> {
  // The six operator entries remain available even if the public catalogue is
  // temporarily unavailable.
  const catalogue = await fetchArgosDenmarkCameras().catch(() => [] as CctvCamera[]);
  return [...DENMARK_OPERATOR_WEBCAMS, ...catalogue];
}

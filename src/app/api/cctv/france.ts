import type { CctvCamera } from './types';
import { createPool } from '@/lib/fetch-pool';
import { APRR_CAMERAS } from './aprr.generated';
import { fetchInforouteCameras } from './inforoute';

// ── Existing YouTube Live Streams ──
const YOUTUBE_LIVE: CctvCamera[] = [
  {
    id: 'fr-paris-1', lat: 48.8584, lng: 2.2945,
    name: 'Paris - Eiffel Tower Area', city: 'Paris', country: 'France',
    stream_url: 'https://www.youtube.com/embed/UMuEooW0iAQ?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-paris-2', lat: 48.8600, lng: 2.3300,
    name: 'Paris - Louvre Area', city: 'Paris', country: 'France',
    stream_url: 'https://www.youtube.com/embed/OzYp4NRZlwQ?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-nice-1', lat: 43.6961, lng: 7.2717,
    name: 'Nice - Promenade des Anglais', city: 'Nice', country: 'France',
    stream_url: 'https://www.youtube.com/embed/YAdNYoRY0Cw?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-nice-2', lat: 43.7000, lng: 7.2600,
    name: 'Nice - City View', city: 'Nice', country: 'France',
    stream_url: 'https://www.youtube.com/embed/asO_10T0k2k?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  }
];

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
// Source: https://www.skylinewebcams.com/fr/webcam/france.html
const SKYLINE_FRANCE: CctvCamera[] = [
  { id: 'sky-fr-calanques', lat: 43.2100, lng: 5.4300, name: 'Marseille - Les Calanques', city: 'Marseille', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1234.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/marseille/les-calanques-de-marseille.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-frejus', lat: 43.4330, lng: 6.7370, name: 'Plage de Fréjus', city: 'Fréjus', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1235.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/frejus/plage-de-frejus.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-la-rochelle', lat: 46.1591, lng: -1.1520, name: 'La Rochelle - Vieux Port', city: 'La Rochelle', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1236.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/nouvelle-aquitaine/la-rochelle/vieux-port.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-royan', lat: 45.6284, lng: -1.0286, name: 'Royan - Plage de Pontaillac', city: 'Royan', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1237.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/nouvelle-aquitaine/royan/plage-de-pontaillac.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-mont-dore', lat: 45.5740, lng: 2.8080, name: 'Le Mont-Dore - Sommet de Sancy', city: 'Le Mont-Dore', country: 'France', external_url: 'https://www.skylinewebcams.com/en/webcam/france/auvergne-rhone-alpes/mont-dore/le-mont-dore.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-sete', lat: 43.4035, lng: 3.6970, name: 'Sète - Port de Plaisance', city: 'Sète', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1239.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/occitanie/sete/port-de-plaisance.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-bourget', lat: 45.6910, lng: 5.8810, name: 'Lac du Bourget - Aix les Bains', city: 'Aix-les-Bains', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1240.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/auvergne-rhone-alpes/aix-les-bains/lac-du-bourget.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-porto-vecchio', lat: 41.5910, lng: 9.2790, name: 'Porto-Vecchio - Plage de Folaca', city: 'Porto-Vecchio', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1241.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/corsica/porto-vecchio/porto-vecchio-folacca-beach.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-menton', lat: 43.7750, lng: 7.4990, name: 'Menton - Vue Panoramique', city: 'Menton', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1242.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/menton/vue-panoramique.html', source: 'SkylineWebcams' },
];

// ── APRR / AREA — motorway webcams ──
// Where the cameras are is read ahead of time (./aprr.generated, written by
// tools/generate-aprr-catalogue.mjs). Whether each one is up is not: Viewsurf
// answers a camera that is down with a redirect to its "indisponibilite.mp4"
// placeholder, or with a 500, and about a quarter are down at any one time.
// So every refresh asks — one redirect per camera, about two seconds for all
// of them — and leaves those out. A camera that cannot be asked is kept.
const aprrPool = createPool(12);

async function isDown(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return res.status >= 500 || /indisponibilite/i.test(res.headers.get('location') ?? '');
  } catch {
    return false;
  }
}

async function fetchAprrCameras(): Promise<CctvCamera[]> {
  const down = await Promise.all(APRR_CAMERAS.map(c => aprrPool.run(() => isDown(c.stream_url!))));
  return APRR_CAMERAS.filter((_, i) => !down[i]);
}

// ── DIR Centre-Est — national roads around Lyon, Saint-Étienne, Grenoble ──
// Source: https://www.webcams-dir.centre-est.developpement-durable.gouv.fr
// The map page declares every camera inline (`var donneesCamera = [...]`). Each
// camera uploads a 25-second clip every 5 minutes to /streams/last/nce.<id>.mp4.
// The same array also holds the map's sector framings ({id, latitude,
// longitude, zoom}); the pattern only matches entries with a description.
const DIRCE_BASE = 'https://www.webcams-dir.centre-est.developpement-durable.gouv.fr';

async function fetchDirCentreEstCameras(): Promise<CctvCamera[]> {
  const res = await fetch(`${DIRCE_BASE}/`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`returned ${res.status}`);
  const html = await res.text();
  const re = /\{id:\s*(\d+),\s*latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+),[^{}]*?description:"([^"]*)",\s*direction:"([^"]*)"\}/g;
  return [...html.matchAll(re)].map(([, id, lat, lng, description, direction]) => ({
    id: `dirce-${id}`,
    lat: Number(lat),
    lng: Number(lng),
    name: direction ? `${description} (${direction})` : description,
    city: 'Auvergne-Rhône-Alpes',
    country: 'France',
    stream_url: `${DIRCE_BASE}/streams/last/nce.${id}.mp4`,
    stream_type: 'mp4' as const,
    external_url: `${DIRCE_BASE}/`,
    source: 'DIR Centre-Est',
  }));
}

// ── DIR Est — national roads in Lorraine, Alsace, Franche-Comté ──
// Source: https://webcam.dir-est.fr
// The map page declares its cameras inline (`var liens= [...]`), and
// /lastimg/<id> always answers the newest frame. etat:0 marks a camera the
// DIR has switched off.
const DIREST_BASE = 'https://webcam.dir-est.fr';

async function fetchDirEstCameras(): Promise<CctvCamera[]> {
  const res = await fetch(`${DIREST_BASE}/`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`returned ${res.status}`);
  const html = await res.text();
  const re = /\{nom:"([^"]*)",\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*,\s*add:"chargerFenetreModale\((\d+)\)",\s*etat:(\d)\}/g;
  return [...html.matchAll(re)]
    .filter(m => m[5] === '1')
    .map(([, nom, x, y, id]) => ({
      id: `direst-${id}`,
      lat: Number(y),
      lng: Number(x),
      name: nom,
      city: 'Grand Est',
      country: 'France',
      feed_url: `${DIREST_BASE}/lastimg/${id}`,
      stream_type: 'jpg' as const,
      external_url: `${DIREST_BASE}/`,
      source: 'DIR Est',
    }));
}

// ── Métropole de Lyon — Criter traffic cameras ──
// Source: https://data.grandlyon.com (dataset pvo_patrimoine_voirie.pvocameracriter)
// Frames are re-extracted from the video every minute and feed Onlymoov.
const LYON_WFS = 'https://data.grandlyon.com/geoserver/metropole-de-lyon/ows?SERVICE=WFS&VERSION=2.0.0&request=GetFeature&typename=metropole-de-lyon:pvo_patrimoine_voirie.pvocameracriter&outputFormat=application/json&SRSNAME=EPSG:4326';

interface LyonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { identifiant?: number; nom?: string; libellelong?: string; url?: string };
}

async function fetchLyonCameras(): Promise<CctvCamera[]> {
  const res = await fetch(LYON_WFS, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`returned ${res.status}`);
  const data = await res.json() as { features?: LyonFeature[] };
  const cams: CctvCamera[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    if (!p?.url || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    cams.push({
      id: `lyon-${p.identifiant}`,
      lat, lng,
      name: p.nom ? `${p.libellelong} (vers ${p.nom})` : p.libellelong || 'Lyon traffic camera',
      city: 'Lyon',
      country: 'France',
      feed_url: p.url,
      stream_type: 'jpg',
      external_url: 'https://www.onlymoov.com/',
      source: 'Métropole de Lyon',
    });
  }
  return cams;
}

const LIVE_SOURCES: [string, () => Promise<CctvCamera[]>][] = [
  ['APRR', fetchAprrCameras],
  ['DIR Centre-Est', fetchDirCentreEstCameras],
  ['DIR Est', fetchDirEstCameras],
  ['Métropole de Lyon', fetchLyonCameras],
  ['Inforoute', fetchInforouteCameras],
];

/** The fixed lists plus every live source; one that fails is logged and left out. */
export async function fetchFranceCameras(): Promise<CctvCamera[]> {
  const results = await Promise.allSettled(LIVE_SOURCES.map(([, fetcher]) => fetcher()));
  const cams: CctvCamera[] = [...YOUTUBE_LIVE, ...SKYLINE_FRANCE];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') cams.push(...r.value);
    else console.warn(`[OSIRIS] France ${LIVE_SOURCES[i][0]} failed — absent from this refresh:`, r.reason instanceof Error ? r.reason.message : r.reason);
  });
  return cams;
}

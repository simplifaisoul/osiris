import type { CctvCamera } from './types';
import { createPool } from '@/lib/fetch-pool';

/**
 * OSIRIS — French departmental road cameras on the Inforoute platform.
 *
 * Around twenty départements run their road-conditions site on the same
 * Logipro "Inforoute" software (inforoute21.fr, inforoutes06.fr,
 * inforoute.alsace.eu, …). Each publishes its cameras as GeoJSON from one
 * public POST, the map's own "webcam" layer (action 383) — NO API KEY NEEDED.
 *
 * The list carries a folder per camera, not a picture. Where the newest frame
 * sits inside that folder depends on the site:
 *   • some keep it under one fixed name (lastimage.jpeg, snap5.jpg, …), so the
 *     browser can load it directly;
 *   • others stamp every frame with its time, and only the site's own session-
 *     bound lookup can say which file is newest. Those sites are left out.
 * Only sites whose fixed name was checked against live frames are listed in
 * SITES, and only the media kinds named for that site are kept.
 *
 * Moselle also lists live MJPEG encoders (config "animation", a .cgi stream on
 * if57cam.logipro.com). Those play straight from the browser.
 */

type MediaKind = 'IMAGE' | 'VIDEO' | 'DEFILEMENT_IMAGE';

interface InforouteSite {
  host: string;
  department: string;
  idPrefix: string;
  /** File each kind of local camera keeps its newest frame in, on this site. */
  files: Partial<Record<MediaKind, string>>;
}

const SITES: InforouteSite[] = [
  // DEFILEMENT_IMAGE cameras keep their last five frames, oldest snap1.jpg to
  // newest snap5.jpg, uploaded together every few minutes.
  { host: 'www.inforoutes06.fr', department: 'Alpes-Maritimes', idPrefix: 'fr06', files: { DEFILEMENT_IMAGE: 'snap5.jpg' } },
  { host: 'inforoute.alsace.eu', department: 'Alsace', idPrefix: 'fr67', files: { IMAGE: 'lastimage.jpeg' } },
  { host: 'www.inforoute21.fr', department: "Côte-d'Or", idPrefix: 'fr21', files: { VIDEO: 'lastimage.mp4' } },
  { host: 'www.inforoute11.fr', department: 'Aude', idPrefix: 'fr11', files: { IMAGE: 'last_image.jpeg' } },
  // Its local stills are time-stamped; only the MJPEG encoders are usable.
  { host: 'www.inforoute57.fr', department: 'Moselle', idPrefix: 'fr57', files: {} },
];

const WEBCAM_LAYER_ACTION = '383';

interface InforouteProps {
  id_webcam?: string;
  titre?: string;
  actif?: string;
  type_media?: string;
  config?: string;
  url_dossier?: string;
  url_distant?: string;
}

interface InforouteFeature {
  properties?: InforouteProps;
  geometry?: { type?: string; coordinates?: [number, number] };
}

/** The camera's stream for the media kinds this site is known to serve. */
function media(site: InforouteSite, p: InforouteProps): Pick<CctvCamera, 'feed_url' | 'stream_url' | 'stream_type'> | null {
  if (p.config === 'animation') {
    const url = p.url_distant ?? '';
    return /^https:\/\/[^/]+\/stream\d+\.cgi$/.test(url) ? { stream_url: url, stream_type: 'mjpeg' } : null;
  }
  if (p.config !== 'local' || !p.url_dossier?.startsWith(`https://${site.host}/`)) return null;
  const file = site.files[p.type_media as MediaKind];
  if (!file) return null;
  const url = p.url_dossier.replace(/\/?$/, '/') + file;
  return p.type_media === 'VIDEO' ? { stream_url: url, stream_type: 'mp4' } : { feed_url: url, stream_type: 'jpg' };
}

/** A frame older than this means the camera has stopped publishing. */
const MAX_FRAME_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Whether a camera is publishing right now. Moselle's MJPEG encoders refuse
 * the connection when they are off (about a dozen of 38 at any one time), and
 * a still that stops updating stays on the server under the same name (Alsace
 * had five frames two to four days old). Either would show on the map as a
 * live camera. Only headers are read: an MJPEG stream never ends, and an
 * Alpes-Maritimes still is a megabyte.
 */
async function isLive(cam: CctvCamera): Promise<boolean> {
  const url = cam.stream_type === 'mjpeg' ? cam.stream_url! : (cam.feed_url ?? cam.stream_url!);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(4000) });
    await res.body?.cancel();
    if (!res.ok) return false;
    const modified = Date.parse(res.headers.get('last-modified') ?? '');
    return !(Date.now() - modified > MAX_FRAME_AGE_MS);
  } catch {
    return false;
  }
}

async function fetchSite(site: InforouteSite): Promise<CctvCamera[]> {
  const res = await fetch(`https://${site.host}/mod_turbolead/mod/inforoute/index.php`, {
    method: 'POST',
    body: new URLSearchParams({ action: WEBCAM_LAYER_ACTION }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${site.host} returned ${res.status}`);
  const data = await res.json() as { features?: InforouteFeature[] };

  const cams: CctvCamera[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    if (!p?.id_webcam || p.actif === '0' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const m = media(site, p);
    if (!m) continue;
    cams.push({
      id: `${site.idPrefix}-${p.id_webcam}`,
      lat, lng,
      name: (p.titre ?? '').trim() || `${site.department} camera`,
      city: site.department,
      country: 'France',
      ...m,
      external_url: `https://${site.host}/`,
      source: `Inforoute ${site.department}`,
    });
  }
  const pool = createPool(16);
  const live = await Promise.all(cams.map(c => pool.run(() => isLive(c))));
  return cams.filter((_, i) => live[i]);
}

/** Every listed département; one that fails is logged and left out. */
export async function fetchInforouteCameras(): Promise<CctvCamera[]> {
  const results = await Promise.allSettled(SITES.map(fetchSite));
  const cams: CctvCamera[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') cams.push(...r.value);
    else console.warn(`[OSIRIS] Inforoute ${SITES[i].department} failed — absent from this refresh:`, r.reason instanceof Error ? r.reason.message : r.reason);
  });
  return cams;
}

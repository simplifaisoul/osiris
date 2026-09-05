import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — Netherlands CCTV Cameras (Rijkswaterstaat)
 * Source: https://api.rwsverkeersinfo.nl/api/cameras
 * 26 operator-controlled HD motorway cameras — NO API KEY NEEDED.
 *
 * Replaces opendata.ndw.nu/cameras.json. NDW retired that dataset and it has
 * been answering 404 into a silent catch ever since, so the layer carried no
 * Dutch cameras at all rather than reporting a dead source.
 */

const CAMERAS_JSON = 'https://api.rwsverkeersinfo.nl/api/cameras';

/** Netherlands bounding box — RWS publishes mainland motorways only. */
const NL_BOUNDS = { minLat: 50.7, maxLat: 53.7, minLng: 3.3, maxLng: 7.3 };

/**
 * The frames are hotlink-protected: asked without a Referer, stream.inmoves.nl
 * answers 401 with a zero-length PNG, so the browser cannot load `static_url`
 * itself. The proxy sends `Referer: https://<host>/`, which the origin accepts,
 * and returns the real JPEG.
 */
function proxied(url: string): string {
  return `/api/cctv/proxy?url=${encodeURIComponent(url)}`;
}

/** One record of the RWS feed. Coordinates arrive as strings. */
interface RwsCamera {
  id?: number | string;
  latitude?: string;
  longitude?: string;
  road?: string;
  near?: string;
  location_description?: string;
  /** Embeddable player page — a document, not a frame. */
  stream_url?: string;
  /** Single JPEG frame, behind the Referer check. */
  static_url?: string;
}

/** Parse the RWS camera feed. Exported for tests. */
export function parseRwsCameras(payload: unknown): CctvCamera[] {
  if (!Array.isArray(payload)) return [];

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const cam of payload as RwsCamera[]) {
    const id = String(cam?.id ?? '');
    const lat = parseFloat(cam?.latitude ?? '');
    const lng = parseFloat(cam?.longitude ?? '');

    if (!id || seen.has(id)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < NL_BOUNDS.minLat || lat > NL_BOUNDS.maxLat) continue;
    if (lng < NL_BOUNDS.minLng || lng > NL_BOUNDS.maxLng) continue;
    // Without a frame or a page to open, a pin has nothing to show.
    if (!cam.static_url && !cam.stream_url) continue;
    seen.add(id);

    const near = cam.near?.trim() || '';
    const road = cam.road?.trim() || '';

    cams.push({
      id: `nl-rws-${id}`,
      lat,
      lng,
      name: [road, near].filter(Boolean).join(' — ') || cam.location_description?.trim() || `RWS Camera ${id}`,
      city: near || 'Netherlands',
      country: 'Netherlands',
      ...(cam.static_url ? { feed_url: proxied(cam.static_url) } : {}),
      ...(cam.stream_url ? { external_url: cam.stream_url } : {}),
      source: 'Rijkswaterstaat',
    });
  }

  return cams;
}

export async function fetchNetherlandsCameras(): Promise<CctvCamera[]> {
  const res = await stealthFetch(CAMERAS_JSON, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RWS HTTP ${res.status}`);

  const cams = parseRwsCameras(await res.json());
  console.log(`[OSIRIS] Netherlands cameras — Rijkswaterstaat: ${cams.length}`);
  return cams;
}

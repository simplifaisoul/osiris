import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Lithuania CCTV Cameras (Via Lietuva / eismoinfo.lt)
 * Sources: https://eismoinfo.lt/eismoinfo-backend/layer-static-features/VKR?lks=false
 *          https://eismoinfo.lt/eismoinfo-backend/camera-info-table
 * ~300 national-road cameras — NO API KEY NEEDED.
 *
 * Neither endpoint is sufficient alone, so the two are joined on camera id:
 *   • VKR layer      — coordinates, but no road metadata and no frame timestamp.
 *   • camera-info-table — road/km metadata and a `date` for the newest frame,
 *                      but coordinates only in LKS-94 grid (EPSG:3346).
 *
 * `?lks=false` is what makes this cheap: it flips the VKR layer from LKS-94 to
 * WGS84, so no reprojection is needed. Dropping it silently yields grid metres.
 *
 * The table is the driver, not the layer: the layer carries ~13 ids that are no
 * longer served (their image endpoint 500s), and the table is exactly the live
 * subset. Frames older than MAX_FRAME_AGE_MS are dropped on top of that, so a
 * camera that has quietly frozen doesn't get presented as a live feed.
 *
 * Attribution: eismoinfo.lt's terms permit reuse provided "Via Lietuva" or
 * eismoinfo.lt is named as the source — hence `source: 'Via Lietuva'`.
 */

const FEATURES_URL = 'https://eismoinfo.lt/eismoinfo-backend/layer-static-features/VKR?lks=false';
const TABLE_URL = 'https://eismoinfo.lt/eismoinfo-backend/camera-info-table';
const IMAGE_BASE = 'https://eismoinfo.lt/eismoinfo-backend/image-provider/camera/last';
const VIEW_BASE = 'https://eismoinfo.lt/#!/vkr';

/** Lithuania bounding box, padded slightly past the border. */
const LT_BOUNDS = { minLat: 53.8, maxLat: 56.5, minLng: 20.9, maxLng: 26.9 };

/** Cameras refresh every ~10 min; anything this stale has stopped publishing. */
const MAX_FRAME_AGE_MS = 6 * 60 * 60 * 1000;

interface VkrPoint {
  point?: [number, number];
}
interface VkrFeature {
  id?: string | number;
  name?: string;
  points?: VkrPoint[];
}
interface VkrLayer {
  layer?: string;
  features?: VkrFeature[];
}
interface TableEntry {
  id?: string | number;
  name?: string;
  roadName?: string;
  roadNr?: string;
  date?: number;
  km?: number;
}

/**
 * Camera names read "<place> <roadNr> <km>" ("Šilagalys į Panevėžį A8 7,57").
 * Trim from the road number back to recover the place on its own.
 */
function placeFrom(name: string, roadNr: string): string {
  const cut = roadNr ? name.lastIndexOf(roadNr) : -1;
  const head = cut >= 0 ? name.slice(0, cut) : name.replace(/\s+[A-Za-z]*\d[\d,.]*\s*$/, '');
  return head.trim().replace(/[\s,–-]+$/, '') || 'Lithuania';
}

/** Index the VKR layer by camera id → [lat, lng]. Exported for tests. */
export function indexVkrCoords(features: unknown): Map<string, [number, number]> {
  const coords = new Map<string, [number, number]>();
  if (!Array.isArray(features)) return coords;

  for (const layer of features as VkrLayer[]) {
    for (const feature of layer?.features ?? []) {
      const id = feature?.id != null ? String(feature.id) : '';
      const point = feature?.points?.[0]?.point;
      if (!id || !Array.isArray(point)) continue;

      const [lat, lng] = point;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coords.set(id, [lat, lng]);
    }
  }

  return coords;
}

/** Join the VKR layer and the camera table into cameras. Exported for tests. */
export function parseLithuania(
  features: unknown,
  table: unknown,
  now: number = Date.now(),
): CctvCamera[] {
  if (!Array.isArray(table)) return [];

  const coords = indexVkrCoords(features);
  const cams: CctvCamera[] = [];
  const seen = new Set<string>();

  for (const entry of table as TableEntry[]) {
    const id = entry?.id != null ? String(entry.id) : '';
    if (!id || seen.has(id)) continue;

    const point = coords.get(id);
    if (!point) continue; // no coordinates in the VKR layer — unplottable

    const [lat, lng] = point;
    if (lat < LT_BOUNDS.minLat || lat > LT_BOUNDS.maxLat) continue;
    if (lng < LT_BOUNDS.minLng || lng > LT_BOUNDS.maxLng) continue;

    // A missing timestamp is treated as stale — better absent than frozen.
    const date = typeof entry.date === 'number' ? entry.date : 0;
    if (now - date > MAX_FRAME_AGE_MS) continue;

    seen.add(id);

    const name = (entry.name ?? '').trim() || `Via Lietuva Camera ${id}`;
    const roadNr = (entry.roadNr ?? '').trim();
    const roadName = (entry.roadName ?? '').trim();

    cams.push({
      id: `lt-${id}`,
      lat,
      lng,
      name: roadName && roadNr ? `${name} (${roadNr} ${roadName})` : name,
      city: placeFrom(name, roadNr),
      country: 'Lithuania',
      // Proxied: eismoinfo 403s any request carrying a foreign Referer, which
      // every browser <img> sends. The proxy re-issues it with an on-site
      // Referer. Built from the id rather than echoed from upstream, since the
      // URL reaches the client and the `?id=` must survive intact
      // (normalizeFeedUrl would strip it, breaking every frame).
      feed_url: `/api/cctv/proxy?url=${encodeURIComponent(`${IMAGE_BASE}?id=${id}`)}`,
      stream_type: 'jpg',
      external_url: `${VIEW_BASE}/${encodeURIComponent(id)}`,
      source: 'Via Lietuva',
    });
  }

  return cams;
}

async function getJson(url: string, label: string): Promise<unknown> {
  const res = await stealthFetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

async function loadLithuaniaCameras(): Promise<CctvCamera[]> {
  const [features, table] = await Promise.all([
    getJson(FEATURES_URL, 'eismoinfo VKR'),
    getJson(TABLE_URL, 'eismoinfo camera-info-table'),
  ]);

  const cams = parseLithuania(features, table);
  console.log(`[OSIRIS] Lithuania cameras — Via Lietuva: ${cams.length}`);
  return cams;
}

export const fetchLithuaniaCameras = cachedSource('lithuania', loadLithuaniaCameras);

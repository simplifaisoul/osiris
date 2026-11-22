import { cachedSource } from '@/lib/sourceCache';
import { SANRAL_CAMERA_LABELS } from './south-africa.generated';
import type { CctvCamera } from './types';

/**
 * OSIRIS — SANRAL cameras: about 1,240 on South Africa's national roads around
 * Johannesburg and Pretoria, Durban, Cape Town and Gqeberha, from i-traffic.co.za,
 * the South African National Roads Agency's traffic site.
 *
 * The site's map reads every camera from one keyless file, map/mapIcons/Cameras
 * (an id and a position each). A camera's picture, 310 pixels wide and renewed
 * every ten seconds, is at map/Cctv/<id>. Its name appears only in its map
 * tooltip, so the names are read ahead of time by
 * tools/generate-south-africa-catalogue.mjs (./south-africa.generated); a
 * camera added since shows as "SANRAL camera <n>".
 *
 * About one camera in four shows one of SANRAL's two stand-in cards ("No live
 * camera feed at this time", "STREAM UNAVAILABLE") instead of a picture, and
 * some stopped cameras keep serving their last frame, days old. Both are
 * hidden. A check reads each picture's size, two at a time because i-traffic
 * answers 429 to a faster pace: a card has a fixed size, and a frozen frame
 * has the same size as at the last check, where a working camera's picture
 * (with its clock in the corner) never does. The second check runs fifteen
 * minutes after the first, then every six hours. Checks run in the background,
 * so the cameras appear at once and the dead ones drop out at the camera
 * list's next half-hourly refresh after a check ends. A camera whose size
 * cannot be read is kept.
 */

const BASE = 'https://www.i-traffic.co.za';
const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const LIST_TTL_MS = 6 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_RECHECK_MS = 15 * 60 * 1000;
const CHECKS_AT_ONCE = 2;
/** Byte sizes of SANRAL's two stand-in cards: "No live camera feed at this time" and "STREAM UNAVAILABLE". */
const CARD_BYTES = new Set([5939, 5542]);
/** South Africa, padded; a camera outside it is mis-geocoded. */
const BOUNDS = { minLat: -35.0, maxLat: -22.0, minLng: 16.3, maxLng: 33.0 };
/** A lone compass letter in a label: a direction after the pole, a stray road-class letter before it. */
const COMPASS: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' };
/** The part of a camera's id after "--" says which of SANRAL's traffic centres runs it. */
const REGIONS: Record<string, string> = {
  '2': 'Gauteng',
  '3': 'Durban, KwaZulu-Natal',
  '4': 'Cape Town, Western Cape',
  '14': 'Gqeberha, Eastern Cape',
};

/** One entry of map/mapIcons/Cameras (only the fields we read). */
export interface SanralIcon {
  itemId?: string | null;
  location?: number[] | null;
}

/**
 * A tooltip label → a readable name. SANRAL labels its cameras by centre, road
 * and pole: "GP CCTV N12 711" → "N12 camera 711", "EC N2 CCTV 1101A(P) N2
 * Eastbound" → "N2 camera 1101A, Eastbound". Exported for tests.
 */
export function sanralName(label: string | undefined, n: string): string {
  // "(P)"/"(S)" mark a pole's primary or secondary camera; "-" and "_" separate parts of a code.
  const tokens = (label ?? '').replace(/\([A-Z]\)/g, '').replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
  let road = '';
  let pole = '';
  let afterPole = false;
  const rest: string[] = [];
  for (const t of tokens) {
    if (/^(GP|WC|EC|KZN|CCTV)$/i.test(t)) continue;
    if (!road && /^[NRM]\d{1,3}$/i.test(t)) { road = t.toUpperCase(); continue; }
    if (road && t.toUpperCase() === road) continue;
    if (/^[NSEW]$/i.test(t)) { if (pole) rest.push(COMPASS[t.toUpperCase()]); afterPole = false; continue; }
    // A pole is the first code with a digit in it: 711, 201B, C190A, 10B5, PS1.
    if (!pole && /^[A-Z]{0,3}\d[A-Z0-9]{0,6}$/i.test(t)) { pole = t.toUpperCase(); afterPole = true; continue; }
    // A lone letter after it is one of the pole's cameras: "147NB_A" → 147NB-A.
    if (afterPole && /^[A-Z]$/i.test(t)) { pole += `-${t.toUpperCase()}`; continue; }
    afterPole = false;
    rest.push(t);
  }
  if (!pole) return road && rest.length ? `${road} ${rest.join(' ')}` : `SANRAL camera ${n}`;
  const name = road ? `${road} camera ${pole}` : `Camera ${pole}`;
  return rest.length ? `${name}, ${rest.join(' ')}` : name;
}

/** Map one map icon, or null when it has no usable id or position. Exported for tests. */
export function mapSanralIcon(icon: SanralIcon, labels: Record<string, string> = SANRAL_CAMERA_LABELS): CctvCamera | null {
  const itemId = String(icon?.itemId ?? '');
  const m = itemId.match(/^(\d{1,5})--(\d{1,3})$/);
  if (!m) return null;
  const [lat, lng] = icon.location ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return null;
  return {
    id: `sanral-${m[1]}-${m[2]}`,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: sanralName(labels[itemId], m[1]),
    city: REGIONS[m[2]] ?? 'South Africa',
    country: 'South Africa',
    feed_url: `${BASE}/map/Cctv/${itemId}`,
    source: 'SANRAL',
  };
}

const fetchSanralList = cachedSource('south-africa', async (): Promise<CctvCamera[]> => {
  const res = await fetch(`${BASE}/map/mapIcons/Cameras`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SANRAL cameras HTTP ${res.status}`);
  const icons = await res.json();
  if (!Array.isArray(icons)) throw new Error('SANRAL cameras: not a list');
  const seen = new Set<string>();
  return (icons as SanralIcon[])
    .map(icon => mapSanralIcon(icon))
    .filter((c): c is CctvCamera => !!c && !seen.has(c.id) && !!seen.add(c.id));
}, LIST_TTL_MS);

/** Cameras showing a stand-in card or a frozen frame at the last check. */
let hidden = new Set<string>();
/** Each camera's picture size at the last check. */
let lastSizes = new Map<string, number>();
let nextCheckAt = 0;
let checking: Promise<void> | null = null;

/** The size of a camera's picture, or null when it cannot be read. */
async function pictureBytes(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    const bytes = Number(res.headers.get('content-length'));
    return res.ok && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

async function checkPictures(cams: CctvCamera[]): Promise<void> {
  const sizes = new Map<string, number>();
  const cards = new Set<string>();
  const frozen = new Set<string>();
  const queue = [...cams];
  await Promise.all(Array.from({ length: CHECKS_AT_ONCE }, async () => {
    for (let cam = queue.shift(); cam; cam = queue.shift()) {
      const bytes = await pictureBytes(cam.feed_url!);
      if (bytes === null) continue;
      sizes.set(cam.id, bytes);
      if (CARD_BYTES.has(bytes)) cards.add(cam.id);
      else if (lastSizes.get(cam.id) === bytes) frozen.add(cam.id);
    }
  }));
  const first = lastSizes.size === 0;
  lastSizes = sizes;
  hidden = new Set([...cards, ...frozen]);
  nextCheckAt = Date.now() + (first ? FIRST_RECHECK_MS : CHECK_EVERY_MS);
  console.log(`[OSIRIS] SANRAL cameras: ${cams.length - hidden.size} showing a picture, ${cards.size} a stand-in card, ${frozen.size} a frozen frame`);
}

/** Resolves when the running picture check (if any) ends. For tests. */
export const sanralPictureCheck = () => checking ?? Promise.resolve();

/** For tests. */
export function resetSanralPictureCheck() {
  hidden = new Set();
  lastSizes = new Map();
  nextCheckAt = 0;
  checking = null;
}

export async function fetchSouthAfricaCameras(): Promise<CctvCamera[]> {
  const cams = await fetchSanralList();
  if (!checking && Date.now() >= nextCheckAt) {
    checking = checkPictures(cams).finally(() => { checking = null; });
  }
  return cams.filter(c => !hidden.has(c.id));
}

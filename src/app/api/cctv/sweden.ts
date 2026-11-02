import type { CctvCamera } from './types';
import { createPool } from '@/lib/fetch-pool';
import { extractYouTubeId, youtubeEmbedUrl } from '@/lib/youtube';

/**
 * OSIRIS — Sweden CCTV. Two keyless sources:
 *
 *  • Trafikverket road cameras (~840), listed county by county by Kolla
 *    Trafiken (https://www.kollatrafiken.se/vagkameror). The list is theirs;
 *    every picture is Trafikverket's own, served straight from
 *    api.trafikinfo.trafikverket.se, so the browser loads each frame from the
 *    Swedish Transport Administration. Coverage follows its traffic-flow
 *    cameras: dense around Gothenburg, Stockholm and Skåne, sparse up north.
 *
 *  • Live streams from resorts, golf clubs, ski slopes and harbours (~50),
 *    from CamStreamer's public map (https://camstreamer.com/live/map). Each
 *    CamStreamer player is a redirect to a YouTube live embed; the video is
 *    resolved here so the viewer plays YouTube directly.
 *
 * Both lists are third parties' data, so every URL they hand over is checked
 * against the one host it must belong to before it can reach a browser.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';
const KOLLA = 'https://www.kollatrafiken.se';
const TRAFIKVERKET_IMAGE_HOST = 'api.trafikinfo.trafikverket.se';
const CAMSTREAMER = 'https://camstreamer.com';
const CAMSTREAMER_MAP = `${CAMSTREAMER}/live/update-search-map?country%5B0%5D=Sweden`;

/** Sweden, padded slightly past the border. */
const SE_BOUNDS = { minLat: 55.0, maxLat: 69.2, minLng: 10.5, maxLng: 24.3 };

const inSweden = (lat: number, lng: number) =>
  lat >= SE_BOUNDS.minLat && lat <= SE_BOUNDS.maxLat && lng >= SE_BOUNDS.minLng && lng <= SE_BOUNDS.maxLng;

/** An https URL on exactly `host`, normalised — or null. */
function httpsOn(value: unknown, host: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host ? url.toString() : null;
  } catch {
    return null;
  }
}

const SAFE_ID = /^[\w-]{1,40}$/;

/** "Stockholms län" → "Stockholm", "Västra Götalands län" → "Västra Götaland". */
export function countyLabel(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) return 'Sweden';
  return name.trim().replace(/\s+län$/i, '').replace(/s$/, '');
}

/* ── Trafikverket, via Kolla Trafiken ─────────────────────────── */

interface KollaCamera {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  lat?: unknown;
  lng?: unknown;
  detail?: unknown;
}

export function parseKollaCameras(raw: unknown, county: string): CctvCamera[] {
  if (!Array.isArray(raw)) return [];
  const cams: CctvCamera[] = [];
  for (const c of raw as KollaCamera[]) {
    const id = String(c?.id ?? '');
    const lat = Number(c?.lat);
    const lng = Number(c?.lng);
    const image = httpsOn(c?.url, TRAFIKVERKET_IMAGE_HOST);
    if (!SAFE_ID.test(id) || !image || !Number.isFinite(lat) || !Number.isFinite(lng) || !inSweden(lat, lng)) continue;
    const detail = typeof c.detail === 'string' && /^\/vagkamera\/[\w+%.-]+$/.test(c.detail) ? `${KOLLA}${c.detail}` : undefined;
    cams.push({
      id: `se-tv-${id}`,
      lat,
      lng,
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Trafikverket camera',
      city: county,
      country: 'Sweden',
      feed_url: image,
      ...(detail ? { external_url: detail } : {}),
      source: 'Trafikverket',
    });
  }
  return cams;
}

async function kollaPost(path: string, body: string): Promise<unknown> {
  const res = await fetch(`${KOLLA}${path}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      // The endpoints answer the page's own XHRs; this is what they expect.
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`kollatrafiken ${path} HTTP ${res.status}`);
  return res.json();
}

const COUNTY_ID = /^[a-z-]{2,40}$/;

export async function fetchTrafikverketCameras(): Promise<CctvCamera[]> {
  const counties = (await kollaPost('/api/v1/counties', '')) as { result?: { id?: unknown; name?: unknown }[] };
  const list = (counties?.result ?? []).filter(c => typeof c?.id === 'string' && COUNTY_ID.test(c.id));
  // 21 counties; four at a time is polite to a small site and still ~3s.
  const pool = createPool(4);
  const county = (c: { id?: unknown; name?: unknown }) =>
    kollaPost('/api/v1/cameras', `county=${encodeURIComponent(c.id as string)}`)
      .then(raw => parseKollaCameras(raw, countyLabel(c.name)));
  /* One retry: a single slow county otherwise drops its cameras from the
     catalogue until the next refresh, half an hour later. */
  const perCounty = await Promise.all(list.map(c => pool.run(() =>
    county(c).catch(() => county(c)).catch(() => [] as CctvCamera[]),
  )));
  const byId = new Map<string, CctvCamera>();
  for (const cam of perCounty.flat()) byId.set(cam.id, cam);
  return [...byId.values()];
}

/* ── CamStreamer live streams ────────────────────────────────── */

interface CamStreamerVideo {
  name?: unknown;
  iframe_url?: unknown;
  lat?: unknown;
  lng?: unknown;
  detail_link?: unknown;
}

/** A camera whose stream is, for now, CamStreamer's own player. */
export interface CamStreamerEntry {
  camera: CctvCamera;
  embed: string;
}

/**
 * The place a stream's name ends with, or "Sweden":
 *   "MEDview: Kåsa Strand, Varberg"          → "Varberg"
 *   "Stormhuset, Apelviken, Varberg Sweden"  → "Varberg"
 *   "Rengsfallet, Valsjöbyn – Live"          → "Valsjöbyn"
 *   "…live 24/7 from Löddeköpinge, Sweden"   → "Sweden" (left to placeStreams)
 */
export function placeFrom(name: string): string {
  if (!name.includes(',')) return 'Sweden';
  const tail = (name.split(',').pop() ?? '')
    .trim()
    .replace(/\s*[–-]\s*live$/i, '')
    .replace(/\s*\bsweden$/i, '')
    .trim();
  return tail.length > 1 && tail.length <= 30 ? tail : 'Sweden';
}

export function parseCamStreamer(raw: unknown): CamStreamerEntry[] {
  const videos = (raw as { videos?: unknown })?.videos;
  if (!Array.isArray(videos)) return [];
  const out: CamStreamerEntry[] = [];
  for (const v of videos as CamStreamerVideo[]) {
    const lat = Number(v?.lat);
    const lng = Number(v?.lng);
    const embed = httpsOn(v?.iframe_url, 'camstreamer.com');
    const link = typeof v?.detail_link === 'string' ? v.detail_link.match(/^\/live\/stream\/(\d{1,12})-[\w-]*$/) : null;
    if (!embed || !link || !Number.isFinite(lat) || !Number.isFinite(lng) || !inSweden(lat, lng)) continue;
    const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : 'CamStreamer live camera';
    out.push({
      embed,
      camera: {
        id: `se-cs-${link[1]}`,
        lat,
        lng,
        name,
        city: placeFrom(name),
        country: 'Sweden',
        stream_url: embed,
        stream_type: 'iframe',
        external_url: `${CAMSTREAMER}${link[0]}`,
        source: 'CamStreamer',
      },
    });
  }
  return out;
}

/** The YouTube embed a CamStreamer player redirects to, or null. */
export async function resolveCamStreamerEmbed(embed: string): Promise<string | null> {
  const res = await fetch(embed, {
    redirect: 'manual',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(5000),
  });
  void res.body?.cancel();
  const id = extractYouTubeId(res.headers.get('location') ?? '');
  return id ? youtubeEmbedUrl(id) : null;
}

export async function fetchCamStreamerSweden(): Promise<CctvCamera[]> {
  const res = await fetch(CAMSTREAMER_MAP, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`camstreamer map HTTP ${res.status}`);
  const entries = parseCamStreamer(await res.json());
  const pool = createPool(6);
  return Promise.all(entries.map(({ camera, embed }) => pool.run(async () => {
    /* Play YouTube directly when the redirect resolves. If it doesn't, keep
       CamStreamer's player: it performs the same redirect in the browser. */
    const youtube = await resolveCamStreamerEmbed(embed).catch(() => null);
    return youtube ? { ...camera, stream_url: youtube } : camera;
  })));
}

/* ── Region ──────────────────────────────────────────────────── */

/** Rough distance in km — plenty to find which county a stream sits in. */
function kmBetween(a: CctvCamera, b: CctvCamera): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * A stream whose name carries no place ("Hertingforsen Falkenberg") would
 * read "Sweden, Sweden" in the viewer. It takes the county of the nearest
 * road camera instead, when one is close enough to vouch for it — 60 km,
 * because the north has so few road cameras that further than that the
 * nearest one can sit in the wrong county.
 */
export function placeStreams(streams: CctvCamera[], roads: CctvCamera[], maxKm = 60): CctvCamera[] {
  return streams.map(stream => {
    if (stream.city !== 'Sweden' || !roads.length) return stream;
    let nearest = roads[0];
    for (const road of roads) if (kmBetween(stream, road) < kmBetween(stream, nearest)) nearest = road;
    return kmBetween(stream, nearest) <= maxKm ? { ...stream, city: nearest.city } : stream;
  });
}

export async function fetchSwedenCameras(): Promise<CctvCamera[]> {
  // Either source failing must not take the other down with it.
  const [roads, streams] = await Promise.all([
    fetchTrafikverketCameras().catch(() => [] as CctvCamera[]),
    fetchCamStreamerSweden().catch(() => [] as CctvCamera[]),
  ]);
  return [...roads, ...placeStreams(streams, roads)];
}

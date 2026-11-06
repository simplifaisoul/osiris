import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';
import { cachedSource } from '@/lib/sourceCache';

/**
 * OSIRIS — Iowa CCTV Cameras (Iowa DOT / 511ia.org)
 * Source: https://511ia.org/api/graphql — the CARS 511 platform Indiana runs on
 * ~860 statewide cameras — NO API KEY NEEDED.
 *
 * About 700 are live video. Unlike Indiana's, Iowa's API hands out the HLS
 * playlist itself, and its video servers answer Access-Control-Allow-Origin: *,
 * so the stream plays straight from the source. Most run at 480x270; a few of
 * the newer metro cameras stream 1080p. The rest are road-weather and work-zone
 * cameras that publish HD stills only.
 *
 * Every camera with a still keeps it as its feed, so a stream that is down
 * still leaves a picture to show.
 */

const GRAPHQL = 'https://511ia.org/api/graphql';

/** Iowa bounding box — drops any stray or placeholder coordinates. */
const IA_BOUNDS = { minLat: 40.3, maxLat: 43.6, minLng: -96.7, maxLng: -90.1 };

/**
 * `url` and `sources` live on CameraView, not on the interface `views`
 * returns, so they come through an inline fragment (see ./indiana).
 */
const QUERY = `query MapFeatures($input: MapFeaturesArgs!) {
  mapFeaturesQuery(input: $input) {
    mapFeatures {
      title
      uri
      features { geometry }
      __typename
      ... on Camera { active views(limit: 1) { category ... on CameraView { url sources { type src } } } }
    }
    error { message }
  }
}`;

export interface IowaFeature {
  title?: string | null;
  uri?: string | null;
  features?: Array<{ geometry?: { coordinates?: [number, number] } | null }> | null;
  __typename?: string | null;
  active?: boolean | null;
  views?: Array<{
    category?: string | null;
    url?: string | null;
    sources?: Array<{ type?: string | null; src?: string | null }> | null;
  }> | null;
}

/**
 * Iowa titles read `I-235: WWD - I-235 @ MM 8.7`: the route, an area code
 * (WWD, DM, CB, RWIS, …), then the place. The place already names the road,
 * so it is the label. Titles without an area code that just repeat the route
 * (`I-80: I-80 @ MM 73.7`) lose the repeat; anything else is kept whole.
 */
export function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  const coded = /^[^:]+:\s*[A-Z0-9]{1,5} - (.+)$/.exec(t);
  if (coded) return coded[1];
  const repeat = /^([^:]+):\s*(.+)$/.exec(t);
  if (repeat && repeat[2].startsWith(repeat[1].trim())) return repeat[2];
  return t;
}

/** A still, when the view has a real one rather than the "camera closed" icon. */
function stillUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  // The query is a cache-buster frozen at the time of the API call.
  return trimmed && /^https:\/\//i.test(trimmed) ? trimmed.split('?')[0] : undefined;
}

/** The HLS playlist, when the view publishes one over https. */
function hlsUrl(sources: NonNullable<IowaFeature['views']>[number]['sources']): string | undefined {
  for (const s of sources ?? []) {
    const src = s?.src?.trim();
    if (src && /^https:\/\//i.test(src) && /\.m3u8(\?|$)/i.test(src)) return src;
  }
  return undefined;
}

/** Map one map feature to a camera, or null if unusable. Exported for tests. */
export function mapFeature(f: IowaFeature): CctvCamera | null {
  if (f?.__typename !== 'Camera' || f.active === false) return null;

  const view = f.views?.[0];
  const still = stillUrl(view?.url);
  const video = hlsUrl(view?.sources);
  if (!still && !video) return null;

  const coords = f.features?.[0]?.geometry?.coordinates;
  if (!coords) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < IA_BOUNDS.minLat || lat > IA_BOUNDS.maxLat) return null;
  if (lng < IA_BOUNDS.minLng || lng > IA_BOUNDS.maxLng) return null;

  const id = f.uri?.match(/camera\/(\d+)/)?.[1];
  if (!id) return null;

  return {
    id: `iadot-${id}`,
    lat,
    lng,
    name: cleanTitle(f.title || '') || `Iowa DOT Camera ${id}`,
    city: 'Iowa',
    country: 'US',
    ...(still ? { feed_url: still } : {}),
    ...(video ? { stream_url: video, stream_type: 'hls' as const } : {}),
    external_url: `https://511ia.org/@${lat},${lng},14?show=${encodeURIComponent(f.uri || '')}`,
    source: 'Iowa DOT',
  };
}

async function loadIowaCameras(): Promise<CctvCamera[]> {
  const res = await stealthFetch(GRAPHQL, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://511ia.org/' },
    body: JSON.stringify({
      query: QUERY,
      /* One query for the whole state; `zoom` 16 makes the server return
         cameras rather than clusters. */
      variables: {
        input: {
          north: IA_BOUNDS.maxLat,
          south: IA_BOUNDS.minLat,
          east: IA_BOUNDS.maxLng,
          west: IA_BOUNDS.minLng,
          zoom: 16,
          layerSlugs: ['normalCameras'],
          nonClusterableUris: null,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`511ia HTTP ${res.status}`);

  const json = await res.json();
  const feats = json?.data?.mapFeaturesQuery?.mapFeatures;
  if (!Array.isArray(feats)) throw new Error('511ia returned no mapFeatures');

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    const cam = mapFeature(f);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }

  console.log(`[OSIRIS] Iowa cameras — Iowa DOT: ${cams.length} (${cams.filter(c => c.stream_url).length} live)`);
  return cams;
}

export const fetchIowaCameras = cachedSource('iowa', loadIowaCameras);

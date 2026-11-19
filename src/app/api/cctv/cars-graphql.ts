import { cachedSource } from '@/lib/sourceCache';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Nebraska and Kansas cameras, from the CARS 511 GraphQL API that
 * Iowa's and Indiana's sites also run on (see ./iowa). No key; one query per
 * state returns every camera at once.
 *
 *   Nebraska  new.511.nebraska.gov, ~340 NDOT cameras. HD stills (1280×720
 *             and 1920×1080) from dot511.nebraska.gov and the CARS image host.
 *   Kansas    kandrive.gov, ~520 cameras: KDOT's own (640×480) and KC Scout's
 *             around Kansas City (320×240), which straddle the state line.
 *             KanDrive's live streams carry a five-minute token, so Kansas
 *             shows the stills only.
 */

const UA = 'OSIRIS/5.0 (+https://osirisai.live)';

/** As in ./iowa: `url` and `sources` live on CameraView, so they come through a fragment. */
const QUERY = `query MapFeatures($input: MapFeaturesArgs!) {
  mapFeaturesQuery(input: $input) {
    mapFeatures {
      title
      uri
      features { geometry }
      __typename
      ... on Camera { active views(limit: 1) { category ... on CameraView { url } } }
    }
    error { message }
  }
}`;

export interface CarsGraphqlState {
  /** The 511 site's origin, e.g. `https://new.511.nebraska.gov`. */
  base: string;
  idPrefix: string;
  source: string;
  state: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Image hosts run by another agency, captioned as theirs. */
  partners?: Record<string, { source: string; city: string }>;
}

export const NEBRASKA: CarsGraphqlState = {
  base: 'https://new.511.nebraska.gov',
  idPrefix: 'nedot',
  source: 'Nebraska DOT',
  state: 'Nebraska',
  bounds: { minLat: 39.9, maxLat: 43.1, minLng: -104.1, maxLng: -95.3 },
};

export const KANSAS: CarsGraphqlState = {
  base: 'https://www.kandrive.gov',
  idPrefix: 'ksdot',
  source: 'KDOT',
  state: 'Kansas',
  bounds: { minLat: 36.9, maxLat: 40.1, minLng: -102.1, maxLng: -94.5 },
  partners: { 'www.kcscout.net': { source: 'KC Scout', city: 'Kansas City' } },
};

export interface CarsGraphqlFeature {
  title?: string | null;
  uri?: string | null;
  features?: Array<{ geometry?: { coordinates?: number[] | null } | null }> | null;
  __typename?: string | null;
  active?: boolean | null;
  views?: Array<{ category?: string | null; url?: string | null }> | null;
}

/** Map one feature to a camera, or null when it is not a working camera with a still. Exported for tests. */
export function mapCarsGraphqlFeature(f: CarsGraphqlFeature, cfg: CarsGraphqlState): CctvCamera | null {
  if (f?.__typename !== 'Camera' || f.active === false) return null;

  const raw = f.views?.[0]?.url?.trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  // The query string is a cache-buster frozen at the time of the API call.
  const still = raw.split('?')[0];

  const id = f.uri?.match(/^camera\/(\d+)$/)?.[1];
  if (!id) return null;

  const [lng, lat] = f.features?.[0]?.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const b = cfg.bounds;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) return null;

  const partner = cfg.partners?.[new URL(still).hostname];
  return {
    id: `${cfg.idPrefix}-${id}`,
    lat,
    lng,
    name: f.title?.replace(/\s+/g, ' ').trim() || `${cfg.source} camera ${id}`,
    city: partner?.city ?? cfg.state,
    country: 'US',
    feed_url: still,
    source: partner?.source ?? cfg.source,
  };
}

/** Every camera one state publishes. Throws when the API cannot be read, so the region keeps its last good list. */
export async function loadCarsGraphqlCameras(cfg: CarsGraphqlState): Promise<CctvCamera[]> {
  const b = cfg.bounds;
  const res = await fetch(`${cfg.base}/api/graphql`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Referer: `${cfg.base}/` },
    body: JSON.stringify({
      query: QUERY,
      // `zoom` 16 makes the server return cameras rather than clusters.
      variables: {
        input: {
          north: b.maxLat, south: b.minLat, east: b.maxLng, west: b.minLng,
          zoom: 16, layerSlugs: ['normalCameras'], nonClusterableUris: null,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`${cfg.source} cameras HTTP ${res.status}`);
  const json = await res.json();
  const feats = json?.data?.mapFeaturesQuery?.mapFeatures;
  if (!Array.isArray(feats)) throw new Error(`${cfg.source} cameras: no mapFeatures`);

  const cams: CctvCamera[] = [];
  const seen = new Set<string>();
  for (const f of feats as CarsGraphqlFeature[]) {
    const cam = mapCarsGraphqlFeature(f, cfg);
    if (!cam || seen.has(cam.id)) continue;
    seen.add(cam.id);
    cams.push(cam);
  }
  console.log(`[OSIRIS] ${cfg.state} cameras — ${cfg.source}: ${cams.length}`);
  return cams;
}

export const fetchNebraskaCameras = cachedSource('nebraska', () => loadCarsGraphqlCameras(NEBRASKA));
export const fetchKansasCameras = cachedSource('kansas', () => loadCarsGraphqlCameras(KANSAS));

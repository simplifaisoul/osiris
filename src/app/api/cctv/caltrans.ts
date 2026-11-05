import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — California CCTV Cameras (Caltrans)
 * Source: Caltrans' CCTV feature layer on caltrans-gis.dot.ca.gov
 * ~2,900 cameras statewide — NO API KEY NEEDED.
 *
 * Every camera publishes a still, and about two in three also publish live
 * HLS from wzmedia.dot.ca.gov, which answers Access-Control-Allow-Origin: *.
 * Many of those streams are 720p or 1080p. Roughly a third of them are down at
 * any one time (404), which is why each camera keeps its still as well: the
 * viewer falls back to it when the stream will not open.
 *
 * The layer returns at most 2,000 rows per request, so it is paged. Reading
 * only the first page left about 900 cameras off the map.
 */

const LAYER = 'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query';
const FIELDS = 'OBJECTID,latitude,longitude,locationName,nearbyPlace,county,inService,currentImageURL,streamingVideoURL';
/** The layer's maxRecordCount. */
const PAGE_SIZE = 2000;
/** Safety bound, so a server that always says "more" cannot page forever. */
const MAX_PAGES = 5;

export interface CaltransAttributes {
  OBJECTID?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  nearbyPlace?: string | null;
  county?: string | null;
  inService?: string | null;
  currentImageURL?: string | null;
  streamingVideoURL?: string | null;
}

/**
 * The stream, but only when it is an https HLS playlist. A few rows carry
 * trailing spaces, and a few carry an rtsp:// address on Caltrans' private
 * network, which no browser can open.
 */
function hlsUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /^https:\/\//i.test(trimmed) && /\.m3u8(\?|$)/i.test(trimmed) ? trimmed : undefined;
}

/** Map one feature's attributes to a camera, or null if unusable. Exported for tests. */
export function mapCaltransFeature(p: CaltransAttributes): CctvCamera | null {
  const lat = p?.latitude;
  const lng = p?.longitude;
  const url = p?.currentImageURL;
  if (!lat || !lng || !url) return null;

  // A camera marked out of service keeps its still but gets no stream to fail on.
  const video = p.inService === 'True' ? hlsUrl(p.streamingVideoURL) : undefined;

  return {
    id: `cal-${p.OBJECTID}`,
    lat,
    lng,
    name: p.locationName || 'Caltrans',
    city: p.nearbyPlace || p.county || 'California',
    country: 'US',
    feed_url: url,
    ...(video ? { stream_url: video, stream_type: 'hls' as const } : {}),
    source: 'Caltrans',
  };
}

async function fetchPage(offset: number): Promise<{ rows: CaltransAttributes[]; more: boolean }> {
  const url = `${LAYER}?where=1%3D1&outFields=${FIELDS}&orderByFields=OBJECTID`
    + `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=json`;
  const res = await stealthFetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Caltrans HTTP ${res.status}`);
  const data = await res.json();
  const features: Array<{ attributes?: CaltransAttributes }> = Array.isArray(data?.features) ? data.features : [];
  return { rows: features.map(f => f.attributes ?? {}), more: data?.exceededTransferLimit === true };
}

export async function fetchCaltransCameras(): Promise<CctvCamera[]> {
  const cams: CctvCamera[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let result: Awaited<ReturnType<typeof fetchPage>>;
    try {
      result = await fetchPage(page * PAGE_SIZE);
    } catch (e) {
      // A later page failing still leaves the pages already read.
      console.warn(`[OSIRIS] Caltrans page ${page + 1} failed — serving ${cams.length} cameras:`, e instanceof Error ? e.message : e);
      break;
    }
    for (const row of result.rows) {
      const cam = mapCaltransFeature(row);
      if (cam) cams.push(cam);
    }
    if (!result.more) break;
  }
  return cams;
}

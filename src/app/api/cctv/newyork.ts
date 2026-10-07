import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — New York CCTV Cameras (NYSDOT / 511ny.org)
 * Source: https://511ny.org — the same IBI 511 stack Arizona and Louisiana run
 * ~1,880 cameras statewide — NO API KEY NEEDED.
 *
 * The largest of these deployments, and one of the few that is genuinely
 * *video*: every row sampled carried an `.m3u8` on `*.nysdot.skyvdn.com` with
 * `isVideoAuthRequired` false, so these come up as playable HLS tiles rather
 * than refreshing stills. Snapshots are kept alongside as the fallback.
 *
 * NYSDOT publishes a county but never a city, so captions read "Saratoga
 * County". A handful of rows are parked at POINT (0 0) — the bounding box
 * drops them.
 */
const NYSDOT: Ibi511Source = {
  base: 'https://511ny.org',
  idPrefix: 'nysdot',
  source: 'NYSDOT',
  state: 'New York',
  bounds: { minLat: 40.4, maxLat: 45.1, minLng: -79.9, maxLng: -71.8 },
};

export const fetchNewYorkCameras = cachedSource('newyork', () => loadIbi511Cameras(NYSDOT));

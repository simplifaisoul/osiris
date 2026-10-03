import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Wisconsin CCTV Cameras (WisDOT / 511wi.gov)
 * Source: https://511wi.gov — the same IBI 511 stack Nevada runs
 * ~490 cameras statewide — NO API KEY NEEDED.
 *
 * Ungated video, like New York: every sampled row carries an `.m3u8` on
 * `cctv1.dot.wi.gov` with no auth flag, so Milwaukee, Madison and the I-39/90
 * run come up as live HLS tiles. Rows name a county and no city.
 */
const WISDOT: Ibi511Source = {
  base: 'https://511wi.gov',
  idPrefix: 'wisdot',
  source: 'WisDOT',
  state: 'Wisconsin',
  bounds: { minLat: 42.4, maxLat: 47.4, minLng: -93.0, maxLng: -86.2 },
};

export const fetchWisconsinCameras = cachedSource('wisconsin', () => loadIbi511Cameras(WISDOT));

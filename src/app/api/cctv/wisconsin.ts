import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Wisconsin DOT cameras (511wi.gov)
 * Source: https://511wi.gov — the same IBI 511 stack Arizona and Idaho run
 * ~495 cameras statewide — NO API KEY NEEDED.
 *
 * Milwaukee, Madison and Green Bay freeways and the interstates between them.
 * Every camera plays WisDOT's live HLS stream (cctv1.dot.wi.gov, keyless,
 * Access-Control-Allow-Origin: *), with a still that refreshes every few
 * seconds as its picture. The Madison Beltline's flex-lane cameras, about 34,
 * are published at 0,0 with no real position, so the bounding box leaves them
 * out.
 */
const WISDOT: Ibi511Source = {
  base: 'https://511wi.gov',
  idPrefix: 'wisdot',
  source: 'WisDOT',
  state: 'Wisconsin',
  bounds: { minLat: 42.49, maxLat: 47.31, minLng: -92.89, maxLng: -86.25 },
};

export const fetchWisconsinCameras = cachedSource('wisconsin', () => loadIbi511Cameras(WISDOT));

import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Arizona CCTV Cameras (ADOT / az511.gov)
 * Source: https://az511.gov — the same IBI 511 stack Louisiana and Nevada run
 * ~640 cameras statewide — NO API KEY NEEDED.
 *
 * Phoenix and Tucson metro freeways, plus the I-10, I-17 and I-40 runs across
 * the desert. ADOT publishes no video for these, only refreshing stills, so
 * they come up as snapshot cameras rather than video tiles.
 *
 * The one deployment of the four that fills in `city`, which is what the
 * caption uses in preference to the county.
 */
const ADOT: Ibi511Source = {
  base: 'https://az511.gov',
  idPrefix: 'adot',
  source: 'ADOT',
  state: 'Arizona',
  bounds: { minLat: 31.3, maxLat: 37.1, minLng: -115.0, maxLng: -109.0 },
};

export const fetchArizonaCameras = cachedSource('arizona', () => loadIbi511Cameras(ADOT));

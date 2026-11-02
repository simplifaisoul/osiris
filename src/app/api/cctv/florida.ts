import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Florida CCTV Cameras (FDOT / fl511.com)
 * Source: https://fl511.com — the same IBI 511 stack Louisiana and Nevada run
 * ~4,950 cameras statewide — NO API KEY NEEDED.
 *
 * The largest single camera network on the map. It covers the whole peninsula:
 * I-95 and I-75 end to end, the Turnpike, and the Miami, Tampa, Orlando and
 * Jacksonville metros. Their public JPEG snapshots are available in the map; advertised HLS
 * playlists require authorization and cannot play here.
 *
 * Most rows name a milepost — `I-95 MP 134.0 Northbound`. The Alligator Alley
 * stretch instead uses internal asset codes, and those fall back to the road
 * and direction; see cameraLabel in ./ibi511.
 */
const FDOT: Ibi511Source = {
  base: 'https://fl511.com',
  idPrefix: 'fdot',
  source: 'FDOT',
  snapshotOnly: true,
  state: 'Florida',
  bounds: { minLat: 24.4, maxLat: 31.1, minLng: -87.7, maxLng: -79.9 },
};

export const fetchFloridaCameras = cachedSource('florida', () => loadIbi511Cameras(FDOT));

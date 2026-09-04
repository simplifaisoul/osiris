import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Georgia CCTV Cameras (GDOT NaviGAtor / 511ga.org)
 * Source: https://511ga.org — the same IBI 511 stack Louisiana and Nevada run
 * ~4,040 cameras statewide — NO API KEY NEEDED.
 *
 * Dense across metro Atlanta — the I-285 perimeter, the I-75/I-85 connector —
 * and out along I-16, I-20 and I-95 to Savannah. Every row carries an HLS
 * playlist off GDOT's own edge as well as a snapshot.
 *
 * Labels arrive behind an agency asset code (`GDOT-1130: I-20 E at SR5 MM
 * 34.2 (Douglas)`); ./ibi511 strips the prefix and keeps the cross-street.
 */
const GDOT: Ibi511Source = {
  base: 'https://511ga.org',
  idPrefix: 'gdot',
  source: 'GDOT',
  state: 'Georgia',
  bounds: { minLat: 30.3, maxLat: 35.1, minLng: -85.7, maxLng: -80.8 },
};

export const fetchGeorgiaCameras = cachedSource('georgia', () => loadIbi511Cameras(GDOT));

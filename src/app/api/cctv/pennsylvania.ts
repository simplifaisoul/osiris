import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';
import type { CctvCamera } from './types';

/**
 * OSIRIS — PennDOT's 511PA, on the IBI stack Florida and Georgia use (see
 * ./ibi511). About 1,570 highway cameras, no key. Every stream is gated behind
 * the site's own player session, so the cameras show their public stills
 * (320×240); the few the site marks blocked are left out.
 */
export const PENNSYLVANIA_511: Ibi511Source = {
  base: 'https://www.511pa.com',
  idPrefix: 'pa511',
  source: 'PennDOT',
  state: 'Pennsylvania',
  bounds: { minLat: 39.7, maxLat: 42.3, minLng: -80.6, maxLng: -74.6 },
};

export const fetchPennsylvaniaCameras = cachedSource('pennsylvania', (): Promise<CctvCamera[]> => loadIbi511Cameras(PENNSYLVANIA_511));

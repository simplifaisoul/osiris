import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';
import type { CctvCamera } from './types';

/**
 * OSIRIS — CTDOT's CTroads, on the IBI stack Florida and Georgia use (see
 * ./ibi511). About 350 highway cameras, no key, stills refreshed every ten
 * seconds (320×240). The site lists them under TrafficLand, the contractor
 * that runs the cameras for CTDOT.
 */
export const CONNECTICUT_511: Ibi511Source = {
  base: 'https://ctroads.org',
  idPrefix: 'ct511',
  source: 'CTDOT',
  state: 'Connecticut',
  bounds: { minLat: 40.9, maxLat: 42.1, minLng: -73.8, maxLng: -71.7 },
};

export const fetchConnecticutCameras = cachedSource('connecticut', (): Promise<CctvCamera[]> => loadIbi511Cameras(CONNECTICUT_511));

import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';
import type { CctvCamera } from './types';

/**
 * OSIRIS — New England 511: the Vermont, New Hampshire and Maine DOTs' shared
 * traveler site, on the IBI stack Florida and Georgia use (see ./ibi511).
 * About 360 highway cameras, no key, stills only (1280×777 and similar).
 */
export const NEW_ENGLAND_511: Ibi511Source = {
  base: 'https://newengland511.org',
  idPrefix: 'ne511',
  source: 'New England 511',
  state: 'New England',
  bounds: { minLat: 42.6, maxLat: 47.5, minLng: -73.5, maxLng: -66.8 },
};

export const fetchNewEnglandCameras = cachedSource('new-england', (): Promise<CctvCamera[]> => loadIbi511Cameras(NEW_ENGLAND_511));

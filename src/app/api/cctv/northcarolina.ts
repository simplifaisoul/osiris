import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — North Carolina CCTV Cameras (NCDOT DriveNC / drivenc.gov)
 * Source: https://drivenc.gov — the same IBI 511 stack Louisiana and Nevada run
 * ~1,140 cameras statewide — NO API KEY NEEDED.
 *
 * Charlotte and the Triangle, plus the I-40 and I-95 corridors and the Outer
 * Banks run of NC-12. Roughly nine in ten carry an HLS stream.
 *
 * NCDOT is the one deployment that puts a pure asset code in its location
 * column (`CCTV01-NC12-28S_CANALZONE`), so these are named for the road and
 * direction they watch, with the county as the caption.
 */
const NCDOT: Ibi511Source = {
  base: 'https://drivenc.gov',
  idPrefix: 'ncdot',
  source: 'NCDOT',
  state: 'North Carolina',
  bounds: { minLat: 33.8, maxLat: 36.6, minLng: -84.4, maxLng: -75.4 },
};

export const fetchNorthCarolinaCameras = cachedSource('northcarolina', () => loadIbi511Cameras(NCDOT));

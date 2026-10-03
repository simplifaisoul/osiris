import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Alaska CCTV Cameras (Alaska DOT&PF / 511.alaska.gov)
 * Source: https://511.alaska.gov — the same IBI 511 stack Idaho runs
 * ~130 cameras statewide — NO API KEY NEEDED.
 *
 * The smallest of these and the most remote: the Seward, Glenn, Parks and
 * Dalton highways, where a still from a mountain pass is the only road report
 * there is. Snapshot-only — no `videoUrl` is published.
 *
 * Rows name neither city nor county, so captions fall back to "Alaska". The
 * image description is "N/A" throughout; the location string carries the
 * milepost and is what the label ends up using.
 *
 * The bounding box stops at -170 rather than the antimeridian: the road system
 * this agency watches is mainland, and reaching into the eastern hemisphere
 * for the Aleutians would only let a bad coordinate through.
 */
const AKDOT: Ibi511Source = {
  base: 'https://511.alaska.gov',
  idPrefix: 'akdot',
  source: 'Alaska DOT&PF',
  state: 'Alaska',
  bounds: { minLat: 51.0, maxLat: 71.5, minLng: -170.0, maxLng: -129.5 },
};

export const fetchAlaskaCameras = cachedSource('alaska', () => loadIbi511Cameras(AKDOT));

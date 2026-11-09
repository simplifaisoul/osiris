import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Alaska cameras (DOT&PF / 511.alaska.gov)
 *
 * The IBI 511 stack Idaho runs, with no API key. About 130 camera sites along
 * the state's highways — the Seward, Glenn, Parks, Richardson and Dalton —
 * many of them road-weather stations on passes with nothing else watching
 * them. Stills only, 720×480, served with Access-Control-Allow-Origin: *.
 * Most sites carry several views; the map shows each site's first.
 */
const AKDOT: Ibi511Source = {
  base: 'https://511.alaska.gov',
  idPrefix: 'ak',
  source: 'Alaska 511',
  state: 'Alaska',
  // The Aleutians reach past 180°; DOT&PF's cameras stop well short of them.
  bounds: { minLat: 51.0, maxLat: 71.6, minLng: -170.0, maxLng: -129.9 },
};

export const fetchAlaskaCameras = cachedSource('alaska', () => loadIbi511Cameras(AKDOT));

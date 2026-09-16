import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Pennsylvania CCTV Cameras (PennDOT / 511pa.com)
 * Source: https://511pa.com — the same IBI 511 stack Florida and Georgia run
 * ~1,540 cameras statewide — NO API KEY NEEDED.
 *
 * Video is advertised on most rows and usable on none: every sampled record
 * sets `isVideoAuthRequired`, the same gate Florida, Georgia and NCDOT set,
 * whose edges answer 401 to anyone outside their own player. The shared mapper
 * already drops a gated playlist, so these serve their public snapshots — the
 * honest thing to show rather than a wall of streams that cannot open.
 *
 * Around one row in eight is flagged blocked or disabled by the operator and
 * is skipped. County is always present, city never.
 */
const PENNDOT: Ibi511Source = {
  base: 'https://511pa.com',
  idPrefix: 'penndot',
  source: 'PennDOT',
  state: 'Pennsylvania',
  bounds: { minLat: 39.6, maxLat: 42.4, minLng: -80.6, maxLng: -74.6 },
};

export const fetchPennsylvaniaCameras = cachedSource('pennsylvania', () => loadIbi511Cameras(PENNDOT));

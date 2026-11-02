import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Ontario CCTV Cameras (MTO / 511on.ca)
 * Source: https://511on.ca — the same IBI 511 stack Florida and Arizona run
 * ~925 cameras province-wide — NO API KEY NEEDED.
 *
 * The 400-series highways around Toronto, the QEW, Ottawa, and the long
 * northern runs of Highways 11 and 17. Refreshing stills only.
 *
 * These used to come from `/api/v2/get/cameras`, which now answers
 * `Invalid Key` to anyone without a developer key. The list behind the site's
 * own camera page carries the same cameras and asks for nothing.
 */
const MTO: Ibi511Source = {
  base: 'https://511on.ca',
  idPrefix: 'on',
  source: '511 Ontario',
  state: 'Ontario',
  country: 'Canada',
  countySuffix: '',
  bounds: { minLat: 41.6, maxLat: 57.0, minLng: -95.3, maxLng: -74.2 },
};

export const fetchOntarioCameras = cachedSource('ontario', () => loadIbi511Cameras(MTO));

import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Alberta CCTV Cameras (511 Alberta)
 * Source: https://511.alberta.ca — the same IBI 511 stack Florida and Arizona run
 * ~340 cameras province-wide — NO API KEY NEEDED.
 *
 * Calgary's ring road and Deerfoot Trail, Highway 2 to Edmonton, the
 * Trans-Canada through Banff, and Highway 63 to Fort McMurray. Refreshing
 * stills only. The City of Edmonton's own cameras are in ./edmonton.
 *
 * These used to come from `/api/v2/get/cameras`, which now answers
 * `Invalid Key` to anyone without a developer key. The list behind the site's
 * own camera page carries the same cameras and asks for nothing — fifty rows
 * at a time; it answers 500 to a larger page.
 */
const AB511: Ibi511Source = {
  base: 'https://511.alberta.ca',
  idPrefix: 'ab',
  source: 'Alberta 511',
  state: 'Alberta',
  country: 'Canada',
  pageSize: 50,
  bounds: { minLat: 48.9, maxLat: 60.1, minLng: -120.1, maxLng: -109.9 },
};

export const fetchAlbertaCameras = cachedSource('alberta', () => loadIbi511Cameras(AB511));

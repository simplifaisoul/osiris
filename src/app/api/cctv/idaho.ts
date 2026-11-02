import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Idaho CCTV Cameras (ITD / 511.idaho.gov)
 * Source: https://511.idaho.gov — the same IBI 511 stack Arizona and Florida run
 * ~415 cameras statewide — NO API KEY NEEDED.
 *
 * ITD's freeway cameras and road-weather stations, plus the Ada County Highway
 * District's intersections across Boise and Meridian. Idaho publishes no video,
 * only stills that refresh every 15 seconds to 5 minutes, so these come up as
 * snapshot cameras. The snapshots answer Access-Control-Allow-Origin: *.
 *
 * The feed also carries its neighbours' cameras near the border, and a few of
 * its own in Nevada and British Columbia. Most of those neighbours already have
 * their own layer here, and the rest are not Idaho, so the agencies are dropped
 * by name and anything left outside the state by the bounding box.
 */
const ITD: Ibi511Source = {
  base: 'https://511.idaho.gov',
  idPrefix: 'itd',
  source: 'ITD',
  state: 'Idaho',
  ignoreCounty: true,
  excludeAgencies: ['UDOT', 'ODOT', 'WSDOT', 'MTD', 'WYDOT', 'DriveBC', 'NDot'],
  bounds: { minLat: 41.98, maxLat: 49.01, minLng: -117.25, maxLng: -111.0 },
};

export const fetchIdahoCameras = cachedSource('idaho', () => loadIbi511Cameras(ITD));

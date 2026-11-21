import { WEST_VIRGINIA_CAMERAS } from './west-virginia.generated';
import type { CctvCamera } from './types';

/**
 * OSIRIS — West Virginia DOT cameras (WV511): about 110 on the interstates and
 * US routes, each playing its live HLS stream. WV511 has no still pictures.
 *
 * wv511.org names a camera's stream server only on that camera's own player
 * page, one request per camera, so the list is read ahead of time by
 * tools/generate-west-virginia-catalogue.mjs (./west-virginia.generated), and
 * the server is looked up when a camera is opened, by ./stream/route.ts. A
 * camera that is down then shows as unavailable.
 */
export async function fetchWestVirginiaCameras(): Promise<CctvCamera[]> {
  return WEST_VIRGINIA_CAMERAS;
}

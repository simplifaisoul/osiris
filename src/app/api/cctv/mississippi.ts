import { MISSISSIPPI_CAMERAS } from './mississippi.generated';
import type { CctvCamera } from './types';

/**
 * OSIRIS — Mississippi DOT cameras (MDOTtraffic): about 440 sites across the
 * state, each playing its live 1280×720 HLS stream.
 *
 * mdottraffic.com names a site's streams only in that site's own map bubble,
 * one request per site, so the list of sites is read ahead of time by
 * tools/generate-mississippi-catalogue.mjs (./mississippi.generated). Which
 * server has a stream changes, so that is looked up when a camera is opened,
 * by ./stream/route.ts. A camera that is down then shows as unavailable
 * rather than an old picture.
 */
export async function fetchMississippiCameras(): Promise<CctvCamera[]> {
  return MISSISSIPPI_CAMERAS;
}

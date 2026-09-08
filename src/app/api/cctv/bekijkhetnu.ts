import type { CctvCamera } from './types';
import {
  NETHERLANDS_BEKIJKHET_CAMERAS,
  EUROPE_BEKIJKHET_CAMERAS,
  AMERICAS_BEKIJKHET_CAMERAS,
  REST_BEKIJKHET_CAMERAS,
} from './bekijkhetnu.generated';

/**
 * OSIRIS — public webcams from the bekijkhet.nu index.
 *
 * Until now the Netherlands was 26 pins: the Rijkswaterstaat motorway cameras
 * in netherlands.ts, and nothing else. No harbours, no coast, no city centres.
 * bekijkhet.nu has catalogued the cameras their operators publish themselves
 * since 2012, and this reads the part of that index OSIRIS can actually show.
 *
 * The list is generated — see the header of bekijkhetnu.generated.ts for what
 * each shape means and why a third of these carry a link instead of a stream,
 * and scratch/scrape_bekijkhetnu.js for how to rebuild it.
 *
 * Split by continent for the same reason world-live.ts is: getRegionsForBounds
 * maps a viewport onto region keys, and one worldwide key would make every
 * bounds query fetch every camera.
 *
 * Registered once, in RAW_REGION_FETCHERS. Deliberately not called from
 * fetchEuropeCameras as well — the GET handler concatenates regions without
 * deduplicating on id, so a source registered twice puts every one of its
 * cameras on the map twice.
 */

export async function fetchBekijkhetNlCameras(): Promise<CctvCamera[]> {
  return NETHERLANDS_BEKIJKHET_CAMERAS;
}

export async function fetchBekijkhetEuropeCameras(): Promise<CctvCamera[]> {
  return EUROPE_BEKIJKHET_CAMERAS;
}

export async function fetchBekijkhetAmericasCameras(): Promise<CctvCamera[]> {
  return AMERICAS_BEKIJKHET_CAMERAS;
}

export async function fetchBekijkhetRestCameras(): Promise<CctvCamera[]> {
  return REST_BEKIJKHET_CAMERAS;
}

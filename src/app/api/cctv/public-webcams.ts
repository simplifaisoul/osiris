import type { CctvCamera } from './types';
import {
  NETHERLANDS_PUBLIC_WEBCAMS,
  EUROPE_PUBLIC_WEBCAMS,
  AMERICAS_PUBLIC_WEBCAMS,
  REST_PUBLIC_WEBCAMS,
} from './public-webcams.generated';

/**
 * OSIRIS — webcams their operators broadcast publicly.
 *
 * Until now the Netherlands was 26 pins: the Rijkswaterstaat motorway cameras
 * in netherlands.ts, and nothing else. No harbours, no coast, no city centres.
 * Meanwhile a harbourmaster, a golf club and a municipality each put a camera
 * on the open web and left it there. This is that layer — open data that had
 * no catalogue, which is the only reason it was missing.
 *
 * The list is generated — see the header of public-webcams.generated.ts for
 * what each shape means and why a third of these carry a link instead of a
 * stream, and scratch/scrape_public_webcams.js for how to rebuild it.
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

export async function fetchNlPublicWebcams(): Promise<CctvCamera[]> {
  return NETHERLANDS_PUBLIC_WEBCAMS;
}

export async function fetchEuropePublicWebcams(): Promise<CctvCamera[]> {
  return EUROPE_PUBLIC_WEBCAMS;
}

export async function fetchAmericasPublicWebcams(): Promise<CctvCamera[]> {
  return AMERICAS_PUBLIC_WEBCAMS;
}

export async function fetchRestPublicWebcams(): Promise<CctvCamera[]> {
  return REST_PUBLIC_WEBCAMS;
}

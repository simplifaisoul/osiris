import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';

/**
 * OSIRIS — Alberta CCTV Cameras (Alberta Transportation / 511.alberta.ca)
 * Source: https://511.alberta.ca — the same IBI 511 stack Ontario runs
 * ~340 cameras province-wide — NO API KEY NEEDED.
 *
 * Snapshot-only. Calgary's Stoney Trail and Edmonton's Anthony Henday ring
 * roads, the QEII between them, and the mountain highways west to Banff and
 * Jasper where these are the winter road report.
 *
 * Rows name neither city nor county, so captions fall back to "Alberta", and
 * the image description is an internal camera code ("C134") — the location
 * string is what the label uses.
 */
const ALBERTA: Ibi511Source = {
  base: 'https://511.alberta.ca',
  idPrefix: 'abtr',
  source: 'Alberta Transportation',
  state: 'Alberta',
  country: 'Canada',
  bounds: { minLat: 48.9, maxLat: 60.1, minLng: -120.1, maxLng: -109.9 },
};

export const fetchAlbertaCameras = cachedSource('alberta', () => loadIbi511Cameras(ALBERTA));

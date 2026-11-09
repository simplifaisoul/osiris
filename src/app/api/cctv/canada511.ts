import { cachedSource } from '@/lib/sourceCache';
import { loadIbi511Cameras, type Ibi511Source } from './ibi511';
import type { CctvCamera } from './types';

/**
 * OSIRIS — the provinces and territories whose 511 sites run the IBI stack
 * Ontario and Alberta already use: Manitoba, New Brunswick, Nova Scotia,
 * Newfoundland and Labrador, and Yukon. No API key; stills only, and every
 * one of them answers Access-Control-Allow-Origin: *.
 *
 * About 225 highway cameras between them, mostly at 640×480 or better
 * (Manitoba's are 1280×720), Newfoundland's at 352×240. Each site lists a
 * handful of rows from the platform's `USER` and `IBI` accounts beside the
 * ministry's own; those are cameras the ministry added by hand, not
 * neighbours', so no agency is left out.
 */
export const CANADA_511: Ibi511Source[] = [
  {
    base: 'https://www.manitoba511.ca',
    idPrefix: 'mb',
    source: 'Manitoba 511',
    state: 'Manitoba',
    country: 'Canada',
    countySuffix: '',
    bounds: { minLat: 48.9, maxLat: 60.1, minLng: -102.1, maxLng: -88.9 },
  },
  {
    base: 'https://511.gnb.ca',
    idPrefix: 'nb',
    source: 'New Brunswick 511',
    state: 'New Brunswick',
    country: 'Canada',
    countySuffix: '',
    bounds: { minLat: 44.5, maxLat: 48.1, minLng: -69.1, maxLng: -63.7 },
  },
  {
    base: 'https://511.novascotia.ca',
    idPrefix: 'ns',
    source: '511 Nova Scotia',
    state: 'Nova Scotia',
    country: 'Canada',
    countySuffix: '',
    bounds: { minLat: 43.3, maxLat: 47.1, minLng: -66.5, maxLng: -59.6 },
  },
  {
    base: 'https://511nl.ca',
    idPrefix: 'nl',
    source: 'Newfoundland and Labrador 511',
    state: 'Newfoundland and Labrador',
    country: 'Canada',
    countySuffix: '',
    bounds: { minLat: 46.5, maxLat: 60.5, minLng: -67.9, maxLng: -52.5 },
  },
  {
    base: 'https://511yukon.ca',
    idPrefix: 'yt',
    source: '511 Yukon',
    state: 'Yukon',
    country: 'Canada',
    countySuffix: '',
    bounds: { minLat: 59.9, maxLat: 69.7, minLng: -141.1, maxLng: -123.7 },
  },
];

/** All five at once; a province that fails drops out of this refresh alone. */
export const fetchCanada511Cameras = cachedSource('canada-511', async (): Promise<CctvCamera[]> => {
  const results = await Promise.allSettled(CANADA_511.map(loadIbi511Cameras));
  const cams: CctvCamera[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') cams.push(...r.value);
    else console.warn(`[OSIRIS] ${CANADA_511[i].source} cameras failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
  });
  if (!cams.length && results.every(r => r.status === 'rejected')) throw new Error('No Canadian 511 site answered');
  return cams;
});

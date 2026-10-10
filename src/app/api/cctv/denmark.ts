import type { CctvCamera } from './types';

/**
 * Public Denmark webcams published by their operators.
 *
 * These are intentionally external-page cameras: the operators embed the
 * public webcam on their own site and do not expose a stable direct stream URL.
 * OSIRIS can still place them on the CCTV layer and open the provider page.
 */
export const DENMARK_PUBLIC_WEBCAMS: CctvCamera[] = [
  {
    id: 'dk-skagen-port',
    lat: 57.7178,
    lng: 10.5875,
    name: 'Skagen Havn – Webcam',
    city: 'Skagen',
    country: 'Denmark',
    external_url: 'https://www.skagenhavn.dk/dk/havneudvidelsen/webcam',
    source: 'Skagen Havn',
  },
  {
    id: 'dk-augustenborg-yachthavn',
    lat: 54.94195,
    lng: 9.87102,
    name: 'Augustenborg Yachthavn – Webcam',
    city: 'Augustenborg',
    country: 'Denmark',
    external_url: 'https://ayh.dk/webcam/',
    source: 'Augustenborg Yachthavn',
  },
  {
    id: 'dk-anholt-port',
    lat: 56.71494,
    lng: 11.51226,
    name: 'Anholt Havn – Live Webcam',
    city: 'Anholt',
    country: 'Denmark',
    external_url: 'https://anholthavn.dk/faciliteter/',
    source: 'Anholt Havn',
  },
];

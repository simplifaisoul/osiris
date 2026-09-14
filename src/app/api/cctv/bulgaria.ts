import type { CctvCamera } from './types';
import { BULGARIA_FWCBG_CAMERAS } from './bulgaria-fwcbg.generated';

const BULGARIA_MANUAL: CctvCamera[] = [
  {
    id: 'bg-sofia-tsarigradsko-uab',
    lat: 42.662, lng: 23.376,
    name: 'Tsarigradsko Shose (UAB)', city: 'Sofia', country: 'Bulgaria',
    feed_url: 'https://cdn.uab.org/images/cctv/images/cctv/cctv_103/cctv.jpg',
    source: 'UAB / KAMEPA',
  },
  {
    id: 'bg-sofia-banishora',
    lat: 42.704, lng: 23.327,
    name: 'Banishora / Opalchenska', city: 'Sofia', country: 'Bulgaria',
    feed_url: 'https://meteo.chavo.biz/Camera_streem/live_snap.jpg',
    source: 'meteo.chavo.biz',
  },
  
  {
    id: 'bg-gkpp-makaza-1',
    lat: 41.297, lng: 24.133,
    name: 'GKPP Makaza – Nymfea (cam 1)', city: 'Makaza', country: 'Bulgaria',
    stream_url: 'https://www.youtube.com/embed/pnr0lhrqRAc?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://weather-webcam.eu/ueb-kameri-ot-gkpp-makaza-nimfeya/',
    source: 'YouTube / GKPP',
  },
  {
    id: 'bg-burgas-center',
    lat: 42.497, lng: 27.47,
    name: 'Burgas Center (Smart Burgas HLS)', city: 'Burgas', country: 'Bulgaria',
    stream_url: 'https://pics.smartburgas.eu/m3u8/burgas_town_Center.m3u8',
    stream_type: 'hls',
    external_url: 'https://www.weather-webcam.eu/cams/burgas-centar.html',
    source: 'Smart Burgas',
  },
];

function cameraKey(cam: CctvCamera): string {
  return (cam.stream_url || cam.feed_url || cam.external_url || cam.id).split('?')[0];
}

export async function fetchBulgariaCameras(): Promise<CctvCamera[]> {
  const seen = new Set<string>();
  const merged: CctvCamera[] = [];

  for (const cam of [...BULGARIA_MANUAL, ...BULGARIA_FWCBG_CAMERAS]) {
    if (!cam.feed_url && !cam.stream_url && !cam.external_url) continue;
    const key = cameraKey(cam);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cam);
  }

  return merged;
}

import type { CctvCamera } from './types';

const IPCAMLIVE_API_SECRET = '65586c9ba88ef';

const ATTiki_ODOS_CAMERAS = [
  { alias: 'cam128', name: 'I/C D. Plakentias', city: 'Athens', lat: 38.0208, lng: 23.8578 },
  { alias: 'cam231', name: 'I/C Papagou', city: 'Athens', lat: 37.9906, lng: 23.7947 },
];

const GREECE_REGIONAL_CAMERAS: CctvCamera[] = [
  {
    id: 'gr-thessaloniki-center-live',
    lat: 40.6401, lng: 22.9444,
    name: 'Thessaloniki – Center (live)', city: 'Thessaloniki', country: 'Greece',
    stream_url: 'https://www.youtube.com/embed/7V0IRFbzRFI?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.webcameras.gr/loc_wc/webcameras.asp?ID=510&lang=en',
    source: 'meteothes.gr',
  },
  {
    id: 'gr-kavala-live',
    lat: 40.939, lng: 24.408,
    name: 'Kavala – City View (live)', city: 'Kavala', country: 'Greece',
    stream_url: 'https://city-view-of-kavala.click2stream.com/',
    stream_type: 'iframe',
    external_url: 'https://www.webcameras.gr/loc_wc/webcameras.asp?ID=286&lang=en',
    source: 'click2stream',
  },
];

async function fetchIpcamLiveHls(alias: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipcamlive.com/api/v2/getstreamhlsurl?apisecret=${IPCAMLIVE_API_SECRET}&alias=${alias}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.result === 'ok' ? String(data.data.url).replace(/^http:\/\//i, 'https://') : null;
  } catch { return null; }
}

async function fetchIpcamLiveSnapshot(alias: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipcamlive.com/api/v2/getsnapshoturl?apisecret=${IPCAMLIVE_API_SECRET}&alias=${alias}`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.result === 'ok' ? String(data.data.url).replace(/^http:\/\//i, 'https://') : null;
  } catch { return null; }
}

export async function fetchGreeceCameras(): Promise<CctvCamera[]> {
  const attikiSettled = await Promise.allSettled(
    ATTiki_ODOS_CAMERAS.map(async (cam) => {
      const hls = await fetchIpcamLiveHls(cam.alias);
      const snapshot = await fetchIpcamLiveSnapshot(cam.alias);
      return {
        id: `gr-aodos-${cam.alias}`,
        lat: cam.lat, lng: cam.lng,
        name: cam.name, city: cam.city, country: 'Greece',
        stream_url: hls || undefined,
        stream_type: hls ? 'hls' : undefined,
        feed_url: snapshot || `https://www.aodos.gr/wp-content/themes/aodos/assets/img/cameras/${cam.alias}-snapshot.jpg`,
        source: 'Attiki Odos',
      } as CctvCamera;
    })
  );

  const attiki = attikiSettled.filter((r): r is PromiseFulfilledResult<CctvCamera> => r.status === 'fulfilled').map((r) => r.value);
  return [...attiki, ...GREECE_REGIONAL_CAMERAS];
}

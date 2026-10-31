import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchInforouteCameras } from './inforoute';

afterEach(() => vi.unstubAllGlobals());

const feature = (props: Record<string, string>, coordinates: [number, number] = [7.0, 43.6]) => ({
  type: 'Feature',
  properties: { actif: '1', ...props },
  geometry: { type: 'Point', coordinates },
});

const LAYERS: Record<string, unknown[]> = {
  'www.inforoutes06.fr': [
    feature({ id_webcam: '160', titre: 'CAM220 - PCG - Tournamy Nord', type_media: 'DEFILEMENT_IMAGE', config: 'local', url_dossier: 'https://www.inforoutes06.fr/webcam/CAM220/' }),
    feature({ id_webcam: '161', titre: 'Switched off', type_media: 'DEFILEMENT_IMAGE', config: 'local', url_dossier: 'https://www.inforoutes06.fr/webcam/CAM221/', actif: '0' }),
  ],
  'inforoute.alsace.eu': [
    feature({ id_webcam: '41', titre: 'Seltz Rive F ( RF2)', type_media: 'IMAGE', config: 'local', url_dossier: 'https://inforoute.alsace.eu/webcam67/SELTZ-RF2/' }),
    // Its last frame is days old: the camera has stopped, the file has not gone.
    feature({ id_webcam: '44', titre: 'D504 vers Roppenheim', type_media: 'IMAGE', config: 'local', url_dossier: 'https://inforoute.alsace.eu/webcam67/RD504-ROPPENHEIM/' }),
    // Massif Central's cameras are republished on several sites; their source is not a fixed file.
    feature({ id_webcam: '7', titre: 'Tunnel Lioran', type_media: 'VIDEO', config: 'dirmc', url_dossier: 'https://www.inforoute-massif-central.fr/webcam/LIORAN/' }),
  ],
  'www.inforoute21.fr': [
    feature({ id_webcam: '9', titre: 'RD996 NOIRON SOUS GEVREY', type_media: 'VIDEO', config: 'local', url_dossier: 'https://www.inforoute21.fr/webcam/RD996-saulon-la-rue/' }),
  ],
  'www.inforoute57.fr': [
    feature({ id_webcam: '22', titre: 'D955 Heming vers Sarrebourg', type_media: 'IMAGE', config: 'animation', url_distant: 'https://if57cam.logipro.com:8146/stream46.cgi' }),
    // An encoder that refuses the connection stays off the map.
    feature({ id_webcam: '23', titre: 'D112F vers Amneville', type_media: 'IMAGE', config: 'animation', url_distant: 'https://if57cam.logipro.com:9084/stream25.cgi' }),
    // Moselle's local stills are time-stamped, so there is no fixed file to point at.
    feature({ id_webcam: '3', titre: 'D955 Silly en saulnois', type_media: 'IMAGE', config: 'local', url_dossier: 'https://www.inforoute57.fr/webcams/RD955-Sillyensaulnois/' }),
  ],
};

describe('fetchInforouteCameras', () => {
  it('points each camera at the file its site keeps the newest frame in', async () => {
    const fresh = new Date().toUTCString();
    const stale = new Date(Date.now() - 4 * 24 * 3600e3).toUTCString();
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.host === 'if57cam.logipro.com:8146') return new Response('--frame');
      if (url.host === 'if57cam.logipro.com:9084') throw new TypeError('fetch failed');
      if (!url.pathname.startsWith('/mod_turbolead/')) {
        const modified = url.pathname.includes('ROPPENHEIM') ? stale : fresh;
        return new Response('x', { status: 206, headers: { 'Last-Modified': modified } });
      }
      expect(String(init?.body)).toBe('action=383');
      if (url.host === 'www.inforoute11.fr') return new Response('down', { status: 503 });
      return Response.json({ type: 'FeatureCollection', features: LAYERS[url.host] ?? [] });
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cams = await fetchInforouteCameras();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Aude'), expect.anything());
    warn.mockRestore();

    expect(cams.map(c => [c.id, c.stream_type, c.feed_url ?? c.stream_url])).toEqual([
      ['fr06-160', 'jpg', 'https://www.inforoutes06.fr/webcam/CAM220/snap5.jpg'],
      ['fr67-41', 'jpg', 'https://inforoute.alsace.eu/webcam67/SELTZ-RF2/lastimage.jpeg'],
      ['fr21-9', 'mp4', 'https://www.inforoute21.fr/webcam/RD996-saulon-la-rue/lastimage.mp4'],
      ['fr57-22', 'mjpeg', 'https://if57cam.logipro.com:8146/stream46.cgi'],
    ]);
    expect(cams[0]).toMatchObject({ lat: 43.6, lng: 7.0, city: 'Alpes-Maritimes', country: 'France', source: 'Inforoute Alpes-Maritimes' });
  });
});

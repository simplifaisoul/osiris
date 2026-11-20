import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchLuxembourgCameras, parseCitaKml, parseNames } from './luxembourg';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const placemark = (n: number, lng: number, lat: number) => `
            <Placemark id="camera_${n}">
                <name>A1 - Camera ${n}</name>
                <description><![CDATA[<iframe class="cam-frame" src="https://www.cita.lu/webcam/map/${n}"></iframe>]]></description>
                <Point>
                    <coordinates>${lng},${lat},0</coordinates>
                </Point>
            </Placemark>`;

const PAGE = '<a href="/webcam/map/91/full" class="fancy cam-91" data-fancytype="iframe" data-cam="cam-91" data-title="Kirchberg - direction Tunnel Cents">&nbsp;</a>';

describe('Luxembourg CITA cameras', () => {
  it("names a camera from CITA's webcam pages, and keeps the KML's label otherwise", () => {
    const kml = placemark(91, 6.1573, 49.6302) + placemark(3, 5.921276, 49.636941);
    expect(parseCitaKml(kml, parseNames(PAGE))).toEqual([
      {
        id: 'lu-cita-91',
        lat: 49.6302,
        lng: 6.1573,
        name: 'A1 · Kirchberg - direction Tunnel Cents',
        city: 'Luxembourg',
        country: 'Luxembourg',
        feed_url: 'https://www.cita.lu/info_trafic/cameras/images/cccam_91.jpg',
        source: 'CITA',
      },
      expect.objectContaining({ id: 'lu-cita-3', name: 'A1 - Camera 3' }),
    ]);
  });

  it('leaves out repeated and misplaced placemarks', () => {
    expect(parseCitaKml(placemark(1, 6.1, 49.6) + placemark(1, 6.1, 49.6) + placemark(2, 2.35, 48.85)).map(c => c.id)).toEqual(['lu-cita-1']);
  });

  it('reads the pages as Windows-1252, and still lists the cameras when a page fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const page = Uint8Array.from('<a data-cam="cam-1" data-title="Jonction Gr\xfcnewald">', ch => ch.charCodeAt(0));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('cameras.kml')) return new Response(placemark(1, 6.1, 49.6) + placemark(2, 6.2, 49.7));
      if (url.endsWith('/a1.html')) return new Response(page);
      return new Response('gone', { status: 404 });
    }));
    const cams = await fetchLuxembourgCameras();
    expect(cams.map(c => c.name)).toEqual(['A1 · Jonction Grünewald', 'A1 - Camera 2']);
  });
});

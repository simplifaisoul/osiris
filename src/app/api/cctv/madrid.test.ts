import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchMadridCameras, parseMadridKml } from './madrid';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const placemark = (numero: string, nombre: string, lng: number, lat: number) => `
    <Placemark>
      <description>&lt;div align=center&gt;&lt;img src=https://informo.madrid.es/cameras/Camara${numero}.jpg?v=67242 /&gt;&lt;/div&gt;</description>
      <ExtendedData>
        <Data name="Numero">
          <Value>${numero}</Value>
        </Data>
        <Data name="Nombre">
          <Value>${nombre}</Value>
        </Data>
      </ExtendedData>
      <Point>
        <coordinates>${lng},${lat},10 </coordinates>
      </Point>
    </Placemark>`;

describe('Madrid city cameras', () => {
  it("reads each placemark's number, name and place from Informo's KML", () => {
    const kml = `<kml><Document>${placemark('06303', 'PLAZA DE CASTILLA (NORTE)', -3.68894207537291, 40.466063829633)}${placemark('05325', 'M-30 &amp; PUENTE', -3.7, 40.4)}</Document></kml>`;
    expect(parseMadridKml(kml)).toEqual([
      {
        id: 'madrid-06303',
        lat: 40.466064,
        lng: -3.688942,
        name: 'PLAZA DE CASTILLA (NORTE)',
        city: 'Madrid',
        country: 'Spain',
        feed_url: 'https://informo.madrid.es/cameras/Camara06303.jpg',
        source: 'Ayuntamiento de Madrid',
      },
      expect.objectContaining({ id: 'madrid-05325', name: 'M-30 & PUENTE' }),
    ]);
  });

  it('leaves out repeated, misplaced and malformed placemarks', () => {
    const kml = placemark('1', 'A', -3.7, 40.4) + placemark('1', 'A again', -3.7, 40.4)
      + placemark('2', 'Barcelona?', 2.17, 41.38) + placemark('../x', 'Bad', -3.7, 40.4);
    expect(parseMadridKml(kml).map(c => c.id)).toEqual(['madrid-1']);
  });
});

describe('Madrid fetch', () => {
  it('leaves off a camera whose picture has stopped updating', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const kml = '﻿<kml>' + placemark('1', 'FRESH', -3.7, 40.4) + placemark('2', 'STOPPED', -3.71, 40.41) + '</kml>';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        const age = url.endsWith('Camara2.jpg') ? 2 * 24 * 3600_000 : 60_000;
        return new Response(null, { headers: { 'Last-Modified': new Date(Date.now() - age).toUTCString() } });
      }
      return new Response(kml);
    }));
    expect((await fetchMadridCameras()).map(c => c.name)).toEqual(['FRESH']);
  });
});

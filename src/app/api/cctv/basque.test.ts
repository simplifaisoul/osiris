import { describe, it, expect } from 'vitest';
import { parseBasque, utm30nToLatLng, type EuskadiCameraRecord } from './basque';

/** A representative Bizkaia row from api.euskadi.eus/traffic/v1.0/cameras. */
const sample: EuskadiCameraRecord = {
  cameraId: '77',
  sourceId: '2',
  cameraName: 'CCTV 300 - Cámara DOMO nudo Kukularra',
  urlImage: 'http://www.bizkaimove.com/camaras/cam1.jpg',
  latitude: '4794665.86',
  longitude: '503178.8',
  road: 'BI-637',
  kilometer: '008+500',
  address: 'Kurtzes',
};

describe('utm30nToLatLng', () => {
  it('matches proj4 (EPSG:25830 to EPSG:4326) to well under a metre', () => {
    // proj4 gives 43.304817035248796, -2.9608060141830563 for this point.
    const [lat, lng] = utm30nToLatLng(503178.8, 4794665.86);
    expect(lat).toBeCloseTo(43.304817, 6);
    expect(lng).toBeCloseTo(-2.960806, 6);
  });
});

describe('parseBasque', () => {
  it('maps a Bizkaia camera to its https frame, in degrees', () => {
    const [cam] = parseBasque([sample]);
    expect(cam).toMatchObject({
      id: 'bizkaia-77',
      name: 'BI-637 — Cámara DOMO nudo Kukularra',
      city: 'Kurtzes, Bizkaia',
      country: 'Spain',
      feed_url: 'https://www.bizkaimove.eus/camaras/cam1.jpg',
      stream_type: 'jpg',
      external_url: 'https://www.bizkaimove.eus/bm/camaras.html',
      source: 'Bizkaimove',
    });
    expect(cam.lat).toBeCloseTo(43.3048, 4);
    expect(cam.lng).toBeCloseTo(-2.9608, 4);
  });

  it('takes rows already in degrees as they are', () => {
    const [cam] = parseBasque([{ ...sample, latitude: '43.2575', longitude: '-2.9413' }]);
    expect([cam.lat, cam.lng]).toEqual([43.2575, -2.9413]);
  });

  it('tidies the road name and does not repeat it', () => {
    expect(parseBasque([{ ...sample, road: 'N - 637' }])[0].name).toBe('N-637 — Cámara DOMO nudo Kukularra');
    expect(parseBasque([{ ...sample, cameraName: 'BI-637 Kukularra' }])[0].name).toBe('BI-637 Kukularra');
  });

  it('leaves out the other operators, whose frames load only from inside Spain', () => {
    expect(parseBasque([
      { ...sample, sourceId: '1', urlImage: 'https://www.trafikoa.eus/static/files/tr/camaras/819.jpg' },
      { ...sample, sourceId: '5', urlImage: 'https://www.bilbao.eus/camarastrafico/codec0004/snap_c1.jpg' },
    ])).toEqual([]);
  });

  it('leaves out cameras with no frame or one on another host', () => {
    expect(parseBasque([{ ...sample, urlImage: undefined }])).toEqual([]);
    expect(parseBasque([{ ...sample, urlImage: 'https://www.bizkaimove.eus.example.com/camaras/cam1.jpg' }])).toEqual([]);
    expect(parseBasque([{ ...sample, urlImage: 'https://www.bizkaimove.eus/other/page.html' }])).toEqual([]);
  });

  it('drops positions outside the Basque Country', () => {
    expect(parseBasque([{ ...sample, latitude: '0', longitude: '0' }])).toEqual([]);
    expect(parseBasque([{ ...sample, latitude: 'x', longitude: '503178.8' }])).toEqual([]);
  });

  it('copes with a payload that is not a list', () => {
    expect(parseBasque(null)).toEqual([]);
    expect(parseBasque({ cameras: [] })).toEqual([]);
  });
});

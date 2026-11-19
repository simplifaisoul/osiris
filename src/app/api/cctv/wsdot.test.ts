import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWsdotCameras, fromWebMercator, mapWsdotCamera, type WsdotCameraFeature } from './wsdot';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// I-5 at the Interstate Bridge, as WSDOT's file places it.
const BRIDGE = { x: -13656007.102254549, y: 5719738.545086239 };

const row = (id: number, image: string, geometry = BRIDGE): WsdotCameraFeature => ({
  attributes: { CameraID: id, CameraTitle: 'I-5 at Interstate Bridge SB, north end', CompassDirection: 'S', ImageURL: image },
  geometry,
});

describe('WSDOT cameras', () => {
  it('turns Web Mercator into degrees', () => {
    const { lat, lng } = fromWebMercator(BRIDGE.x, BRIDGE.y);
    expect(lat).toBeCloseTo(45.6205, 3);
    expect(lng).toBeCloseTo(-122.6741, 3);
  });

  it("maps a WSDOT picture under the camera's old id", () => {
    expect(mapWsdotCamera(row(9001, 'https://images.wsdot.wa.gov/sw/005vc00008.jpg'))).toMatchObject({
      id: 'wsdot-9001',
      name: 'I-5 at Interstate Bridge SB, north end',
      feed_url: 'https://images.wsdot.wa.gov/sw/005vc00008.jpg',
      source: 'WSDOT',
    });
  });

  it("leaves out Oregon's TripCheck pictures, private webcams and misplaced rows", () => {
    expect(mapWsdotCamera(row(1001, 'https://www.tripcheck.com/RoadCams/cams/I-5.jpg'))).toBeNull();
    expect(mapWsdotCamera(row(1002, 'https://sunmountainlodge.com/webcam.jpg'))).toBeNull();
    expect(mapWsdotCamera(row(1003, 'https://images.wsdot.wa.gov/a.jpg', { x: 0, y: 0 }))).toBeNull();
  });

  it('reads the file as Windows-1252 and lists each camera once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const features = [row(1, 'https://images.wsdot.wa.gov/1.jpg'), row(1, 'https://images.wsdot.wa.gov/1.jpg'), row(2, 'https://images.wsdot.wa.gov/2.jpg')];
    features[2].attributes!.CameraTitle = 'SR 14 at MP 1 – Camas';
    const json = JSON.stringify({ features }).replace('–', '\x96');
    // 0x96 is a lone byte here, as in WSDOT's file — not valid UTF-8.
    const bytes = Uint8Array.from(json, ch => ch.charCodeAt(0));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    const cams = await fetchWsdotCameras();
    expect(cams.map(c => c.id)).toEqual(['wsdot-1', 'wsdot-2']);
    expect(cams[1].name).toBe('SR 14 at MP 1 – Camas');
  });
});

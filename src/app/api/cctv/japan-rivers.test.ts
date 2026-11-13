import { afterEach, describe, expect, it, vi } from 'vitest';
import { camerasInArea, fetchJapanRiverCameras, mapRiverCamera, type RiverCameraRow } from './japan-rivers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (over: Partial<RiverCameraRow> = {}): RiverCameraRow => ({
  scamId: 102561088,
  name: '利根川７．７ｋ下川町排水施設横',
  lat: 36.325302,
  lon: 139.093289,
  rvrNm: '利根川',
  currProvUrl: 'https://cam.river.go.jp/cam/now/102561088.jpg',
  ...over,
});

describe('Japan river cameras', () => {
  it('maps a river.go.jp row to a camera named for its river and place', () => {
    expect(mapRiverCamera(row(), '前橋市')).toEqual({
      id: 'jp-river-102561088',
      lat: 36.325302,
      lng: 139.093289,
      name: '利根川7.7k下川町排水施設横',
      city: '前橋市',
      country: 'Japan',
      feed_url: 'https://cam.river.go.jp/cam/now/102561088.jpg',
      source: 'MLIT river.go.jp',
    });
    expect(mapRiverCamera(row({ scamId: 303329013, name: '四ノ橋', rvrNm: '古川' }), undefined)?.name).toBe('古川 四ノ橋');
    expect(mapRiverCamera(row(), undefined)?.city).toBe('Japan');
  });

  it('drops rows without an id, a place in Japan or a river.go.jp picture', () => {
    expect(mapRiverCamera(row({ scamId: undefined }), 'x')).toBeNull();
    expect(mapRiverCamera(row({ lat: 51.5, lon: -0.1 }), 'x')).toBeNull();
    expect(mapRiverCamera(row({ currProvUrl: 'https://example.com/cam/now/1.jpg' }), 'x')).toBeNull();
    expect(mapRiverCamera(row({ currProvUrl: 'https://cam.river.go.jp/cam/now/../x.jpg' }), 'x')).toBeNull();
    expect(mapRiverCamera(row({ currProvUrl: 'https://cam.river.go.jp/cam/now/cctv_240001_51C04286.jpg' }), 'x')?.feed_url)
      .toBe('https://cam.river.go.jp/cam/now/cctv_240001_51C04286.jpg');
    expect(mapRiverCamera(row({ currProvUrl: null, currentUrl: 'https://cam.river.go.jp/cam/now/7.jpg' }), 'x')?.feed_url)
      .toBe('https://cam.river.go.jp/cam/now/7.jpg');
  });

  it('reads both camera kinds in an area file and names each town', () => {
    const cams = camerasInArea(
      { prefTwn: [{ twnCd: 1301103, cctv: [row({ scamId: 1 })], scam: [row({ scamId: 2 })] }, { twnCd: 9, cctv: [], scam: [] }] },
      new Map([[1301103, '港区']]),
    );
    expect(cams.map(c => [c.id, c.city])).toEqual([['jp-river-1', '港区'], ['jp-river-2', '港区']]);
  });

  it('reads every prefecture area, skips one with no file, and dedupes', async () => {
    const files: Record<string, unknown> = {
      'map/pref/prefarea.json': { prefs: [{ prefCd: 1301 }, { prefCd: 1401 }, { prefCd: 101 }] },
      'map/twn/twnarea.json': { towns: [{ twnCd: 1301103, twnNm: '港区' }] },
      'obslist/twninfo/obs/scam/1301.json': { prefTwn: [{ twnCd: 1301103, cctv: [row({ scamId: 1 })], scam: [] }] },
      'obslist/twninfo/obs/scam/1401.json': { prefTwn: [{ twnCd: 1401, cctv: [row({ scamId: 1 }), row({ scamId: 3 })], scam: [] }] },
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = files[url.replace('https://www.river.go.jp/kawabou/file/files/', '')];
      return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('<!DOCTYPE html>', { status: 404 });
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const cams = await fetchJapanRiverCameras();
    expect(cams.map(c => c.id).sort()).toEqual(['jp-river-1', 'jp-river-3']);
  });

  it('fails when river.go.jp gives nothing, so the last good list is kept', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await expect(fetchJapanRiverCameras()).rejects.toThrow();
  });
});

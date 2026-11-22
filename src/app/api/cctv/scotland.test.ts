import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { fetchScotlandCameras, mapScotlandSite, readScotlandPicture } from './scotland';
import { clearScotlandPictureCache, GET } from './scotland/picture/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
  clearScotlandPictureCache();
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const popup = (jpeg: Buffer | null) =>
  `<div class="iw-holder"><img src="/themes/ud/img/tsis-cameras.png">${jpeg ? `<img class="camera-image" tid="16" src="data:image/jpeg;base64,${jpeg.toString('base64')}">` : ''}</div>`;

/** Traffic Scotland: the camera list, then each camera's popup (with a picture for the sids in `showing`). */
function trafficScotland(showing: string[]) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/tsis/cameras')) {
      return Response.json({ status: 'ok', results: [
        { sid: '1', title: 'M8  Kingston Br', lat: '55.852826000000', lng: '-4.270806100000', roadname: 'M8', images: '16', region: 'Strathclyde' },
        { sid: '2', title: 'M8 Port Dundas', lat: '55.870515', lng: '-4.2531207', region: 'Strathclyde' },
      ] });
    }
    const sid = new URL(url).searchParams.get('sid')!;
    return new Response(popup(showing.includes(sid) ? JPEG : null), { headers: { 'Content-Type': 'text/html' } });
  });
}

describe('Traffic Scotland cameras', () => {
  it('maps a site to a camera whose picture comes from the picture route', () => {
    expect(mapScotlandSite({ sid: '1', title: 'M8  Kingston Br', lat: '55.852826000000', lng: '-4.270806100000', region: 'Strathclyde' })).toEqual({
      id: 'scot-1', lat: 55.852826, lng: -4.270806, name: 'M8 Kingston Br', city: 'Strathclyde, Scotland', country: 'United Kingdom',
      feed_url: '/api/cctv/scotland/picture?sid=1', source: 'Traffic Scotland',
    });
    expect(mapScotlandSite({ sid: 'x', lat: '55.8', lng: '-4.2' })).toBeNull();
    expect(mapScotlandSite({ sid: '3', lat: '51.5', lng: '-0.1' })).toBeNull();
  });

  it("reads a popup's picture, and none from the unavailable card", () => {
    expect(readScotlandPicture(popup(JPEG))).toEqual(JPEG);
    expect(readScotlandPicture(popup(null))).toBeNull();
    const card = createHash('sha1').update(JPEG).digest('hex');
    expect(readScotlandPicture(popup(JPEG), card)).toBeNull();
  });

  it('keeps only the cameras showing a picture', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', trafficScotland(['1']));
    expect((await fetchScotlandCameras()).map(c => c.id)).toEqual(['scot-1']);
  });

  it("answers with a camera's picture, keeps it a minute, and 404s while it is down", async () => {
    const fetchMock = trafficScotland(['1']);
    vi.stubGlobal('fetch', fetchMock);
    const get = (query: string) => GET(new Request(`http://localhost/api/cctv/scotland/picture?${query}`));

    const res = await get('sid=1&_t=123');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    await get('sid=1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.traffic.gov.scot/tsis/camerahtml?sid=1');

    expect((await get('sid=2')).status).toBe(404);
    expect((await get('sid=1;drop')).status).toBe(400);
  });
});

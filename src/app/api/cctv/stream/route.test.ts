import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, clearStreamCache, locateMississippi, locateWestVirginia } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  clearStreamCache();
});

/** The part of mapbubbles/camerasite.aspx?site=1 that names the site's cameras. */
const MS_SITE = `
  <img id="camimg" alt='I-55 N at Lakeland Dr PTZ' src='https://streamingjxn4.mdottraffic.com/thumbnail?application=rtplive&streamname=010406.stream&size=352x240&format=jpg&fitmode=stretch' />
  switchImage('https://streamingjxn4.mdottraffic.com/thumbnail?application=rtplive&streamname=010406.stream&size=352x240&format=jpg&fitmode=stretch', '010406', 'I-55 N at Lakeland Dr PTZ','', this)
  switchImage('https://streamingjxn5.mdottraffic.com/thumbnail?application=rtplive&streamname=010501.stream&size=352x240&format=jpg&fitmode=stretch', '010501', 'I-55 S at Lakeland Dr PTZ','', this)`;

const get = (query: string) => GET(new Request(`http://localhost/api/cctv/stream?${query}`));

describe('locating a stream on its agency page', () => {
  it("finds the Mississippi camera asked for, on whichever server has it now", () => {
    expect(locateMississippi(MS_SITE, '010501')).toEqual({
      stream: 'https://streamingjxn5.mdottraffic.com/rtplive/010501.stream/playlist.m3u8',
      still: 'https://streamingjxn5.mdottraffic.com/thumbnail?application=rtplive&streamname=010501.stream&size=1280x720&fitmode=letterbox&format=jpg',
    });
    // Renamed since the catalogue was written: the site's first camera.
    expect(locateMississippi(MS_SITE, '999999')?.stream).toBe('https://streamingjxn4.mdottraffic.com/rtplive/010406.stream/playlist.m3u8');
    expect(locateMississippi('<p>no cameras</p>', '010406')).toBeNull();
    expect(locateMississippi("src='https://evil.example/thumbnail?application=rtplive&streamname=010406.stream'", '010406')).toBeNull();
  });

  it("finds a West Virginia camera's own stream and nobody else's", () => {
    const page = 'file: "https://vtc2.roadsummary.com/rtplive/CAM002/playlist.m3u8", other: "https://vtc1.roadsummary.com/rtplive/CAM001/playlist.m3u8"';
    expect(locateWestVirginia(page, 'CAM001')).toEqual({ stream: 'https://vtc1.roadsummary.com/rtplive/CAM001/playlist.m3u8' });
    expect(locateWestVirginia(page, 'CAM003')).toBeNull();
  });
});

describe('GET /api/cctv/stream', () => {
  it('redirects to the live playlist, or to a frame of it, asking the agency once', async () => {
    const fetch = vi.fn(async () => new Response(MS_SITE));
    vi.stubGlobal('fetch', fetch);

    const live = await get('src=ms&site=1&cam=010406');
    expect(live.status).toBe(302);
    expect(live.headers.get('location')).toBe('https://streamingjxn4.mdottraffic.com/rtplive/010406.stream/playlist.m3u8');

    const still = await get('src=ms&site=1&cam=010406&still=1&_t=123');
    expect(still.headers.get('location')).toBe('https://streamingjxn4.mdottraffic.com/thumbnail?application=rtplive&streamname=010406.stream&size=1280x720&fitmode=letterbox&format=jpg');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://www.mdottraffic.com/mapbubbles/camerasite.aspx?site=1', expect.anything());
  });

  it('refuses anything that is not a camera, without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const q of ['src=xx&cam=1', 'src=ms&site=1/../2&cam=010406', 'src=ms&site=1&cam=a%2Fb', 'src=wv&cam=', 'src=__proto__&cam=1']) {
      expect((await get(q)).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 404 when the page has no such stream or cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>Camera offline</p>')));
    expect((await get('src=wv&cam=CAM001')).status).toBe(404);
    clearStreamCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect((await get('src=ms&site=1&cam=010406')).status).toBe(404);
  });
});

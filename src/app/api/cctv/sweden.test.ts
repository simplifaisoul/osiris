import { afterEach, describe, expect, it, vi } from 'vitest';
import { countyLabel, parseKollaCameras, parseCamStreamer, placeFrom, placeStreams, fetchSwedenCameras } from './sweden';

afterEach(() => vi.unstubAllGlobals());

const TV_IMAGE = 'https://api.trafikinfo.trafikverket.se/v2/Images/data/road.infrastructure.camera/TrafficFlowCamera_39638213.jpg';

/** One camera as kollatrafiken.se's /api/v1/cameras returns it. */
const kolla = (overrides: Record<string, unknown> = {}) => ({
  id: 1731,
  name: 'Tpl Kista Västra',
  url: TV_IMAGE,
  lat: 59.401178,
  lng: 17.966601,
  detail: '/vagkamera/Tpl+Kista+Vastra-1731',
  ...overrides,
});

/** One stream as CamStreamer's map endpoint returns it. */
const video = (overrides: Record<string, unknown> = {}) => ({
  name: 'MEDview: Kåsa Strand, Varberg',
  iframe_url: 'https://camstreamer.com/embed/jDdxPrkdNJg6ua3lPTI85LqHPO1dRtzn0CtKNpY7',
  lat: 57.07,
  lng: 12.22,
  detail_link: '/live/stream/11928-medview-kasa-strand-varberg',
  ...overrides,
});

describe('countyLabel', () => {
  it('reads like a place, not a county', () => {
    expect(countyLabel('Stockholms län')).toBe('Stockholm');
    expect(countyLabel('Västra Götalands län')).toBe('Västra Götaland');
    expect(countyLabel('Skåne län')).toBe('Skåne');
    expect(countyLabel(undefined)).toBe('Sweden');
  });
});

describe('parseKollaCameras', () => {
  it('keeps the Trafikverket image and links the camera page', () => {
    expect(parseKollaCameras([kolla()], 'Stockholm')).toEqual([{
      id: 'se-tv-1731',
      lat: 59.401178,
      lng: 17.966601,
      name: 'Tpl Kista Västra',
      city: 'Stockholm',
      country: 'Sweden',
      feed_url: TV_IMAGE,
      external_url: 'https://www.kollatrafiken.se/vagkamera/Tpl+Kista+Vastra-1731',
      source: 'Trafikverket',
    }]);
  });

  it('drops images that are not Trafikverket’s own, over https', () => {
    for (const url of ['https://evil.example/cam.jpg', TV_IMAGE.replace('https:', 'http:'), 'javascript:alert(1)', 42]) {
      expect(parseKollaCameras([kolla({ url })], 'X')).toEqual([]);
    }
  });

  it('drops records outside Sweden or without usable coordinates or id', () => {
    expect(parseKollaCameras([kolla({ lat: 48.85, lng: 2.35 })], 'X')).toEqual([]);
    expect(parseKollaCameras([kolla({ lat: 'n/a' })], 'X')).toEqual([]);
    expect(parseKollaCameras([kolla({ id: '../../x' })], 'X')).toEqual([]);
    expect(parseKollaCameras({ error: true }, 'X')).toEqual([]);
  });

  it('omits a camera page link it cannot vouch for', () => {
    expect(parseKollaCameras([kolla({ detail: 'https://evil.example' })], 'X')[0]).not.toHaveProperty('external_url');
  });
});

describe('parseCamStreamer', () => {
  it('turns a map entry into an embed camera named after its place', () => {
    const [entry] = parseCamStreamer({ videos: [video()] });
    expect(entry.camera).toMatchObject({
      id: 'se-cs-11928',
      city: 'Varberg',
      stream_type: 'iframe',
      external_url: 'https://camstreamer.com/live/stream/11928-medview-kasa-strand-varberg',
      source: 'CamStreamer',
    });
  });

  it('drops players on other hosts, bad links and entries outside Sweden', () => {
    expect(parseCamStreamer({ videos: [video({ iframe_url: 'https://evil.example/embed/x' })] })).toEqual([]);
    expect(parseCamStreamer({ videos: [video({ detail_link: '/elsewhere' })] })).toEqual([]);
    expect(parseCamStreamer({ videos: [video({ lat: 40.4, lng: -3.7 })] })).toEqual([]);
    expect(parseCamStreamer(null)).toEqual([]);
  });
});

describe('placeFrom', () => {
  it('takes the place a stream name ends with, minus the noise', () => {
    expect(placeFrom('MEDview: Kåsa Strand, Varberg')).toBe('Varberg');
    expect(placeFrom('Stormhuset, Apelviken, Varberg Sweden')).toBe('Varberg');
    expect(placeFrom('Rengsfallet, Valsjöbyn – Live')).toBe('Valsjöbyn');
  });

  it('gives up rather than guess', () => {
    expect(placeFrom('AXIS Q1952-E Thermal Camera streaming live 24/7 from Löddeköpinge, Sweden')).toBe('Sweden');
    expect(placeFrom('Hertingforsen Falkenberg')).toBe('Sweden');
  });
});

describe('placeStreams', () => {
  const road = parseKollaCameras([kolla({ id: 1, lat: 56.9, lng: 12.5 })], 'Halland')[0];
  const stream = (lat: number, lng: number, city = 'Sweden') =>
    ({ ...parseCamStreamer({ videos: [video({ lat, lng })] })[0].camera, city });

  it('names a placeless stream after the nearest road camera’s county', () => {
    expect(placeStreams([stream(56.9, 12.49)], [road])[0].city).toBe('Halland');
  });

  it('keeps a place the stream already names, and anything too far to vouch for', () => {
    expect(placeStreams([stream(56.9, 12.49, 'Varberg')], [road])[0].city).toBe('Varberg');
    expect(placeStreams([stream(68.4, 18.8)], [road])[0].city).toBe('Sweden');
    expect(placeStreams([stream(56.9, 12.49)], [])[0].city).toBe('Sweden');
  });
});

describe('fetchSwedenCameras', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

  function upstreams(opts: { kollaDown?: boolean; redirectTo?: string } = {}) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('kollatrafiken.se')) {
        if (opts.kollaDown) return new Response('', { status: 503 });
        return url.endsWith('/counties')
          ? json({ error: false, result: [{ id: 'stockholm', name: 'Stockholms län' }] })
          : json([kolla()]);
      }
      if (url.includes('/live/update-search-map')) return json({ videos: [video()] });
      if (url.includes('camstreamer.com/embed/')) {
        return new Response(null, { status: 302, headers: { Location: opts.redirectTo ?? 'https://www.youtube.com/embed/0Lp0Nzc4eAc?autoplay=1&mute=1' } });
      }
      return new Response('', { status: 404 });
    });
  }

  it('joins the road cameras and the live streams, playing YouTube directly', async () => {
    vi.stubGlobal('fetch', upstreams());
    const cams = await fetchSwedenCameras();
    expect(cams.map(c => c.id)).toEqual(['se-tv-1731', 'se-cs-11928']);
    expect(cams[1].stream_url).toContain('youtube-nocookie.com/embed/0Lp0Nzc4eAc');
  });

  it('keeps CamStreamer’s own player when the redirect is not a YouTube video', async () => {
    vi.stubGlobal('fetch', upstreams({ redirectTo: 'https://camstreamer.com/offline' }));
    const stream = (await fetchSwedenCameras()).find(c => c.source === 'CamStreamer');
    expect(stream?.stream_url).toBe('https://camstreamer.com/embed/jDdxPrkdNJg6ua3lPTI85LqHPO1dRtzn0CtKNpY7');
  });

  it('retries a county once before giving its cameras up', async () => {
    let cameraCalls = 0;
    const base = upstreams();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/v1/cameras') && cameraCalls++ === 0) return new Response('', { status: 504 });
      return base(input);
    }));
    expect((await fetchSwedenCameras()).filter(c => c.source === 'Trafikverket')).toHaveLength(1);
    expect(cameraCalls).toBe(2);
  });

  it('still returns the live streams when the road-camera list is down', async () => {
    vi.stubGlobal('fetch', upstreams({ kollaDown: true }));
    expect((await fetchSwedenCameras()).map(c => c.source)).toEqual(['CamStreamer']);
  });
});

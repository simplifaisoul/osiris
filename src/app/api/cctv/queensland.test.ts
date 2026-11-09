import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSourceCache } from '@/lib/sourceCache';
import { currentOnly, fetchQueenslandCameras, mapQldCamera, STALE_MS, type QldCameraFeature } from './queensland';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSourceCache();
});

const feature = (id: number, lng: number, lat: number, image: string | null, description = 'Archerfield - Ipswich Motorway & Granard Rd - North'): QldCameraFeature => ({
  geometry: { coordinates: [lng, lat] },
  properties: { id, description, locality: 'Archerfield', district: 'Metropolitan', image_url: image },
});

describe('Queensland cameras', () => {
  it('maps a traffic camera and a flood camera to their own ids and sources', () => {
    expect(mapQldCamera(feature(1, 153.0087, -27.5552, 'https://cameras.qldtraffic.qld.gov.au/Metropolitan/Archerfield_Ipswich_Mwy_sth.jpg'), 'traffic')).toEqual({
      id: 'qld-traffic-1',
      lat: -27.5552,
      lng: 153.0087,
      name: 'Archerfield - Ipswich Motorway & Granard Rd - North',
      city: 'Archerfield',
      country: 'Australia',
      feed_url: 'https://cameras.qldtraffic.qld.gov.au/Metropolitan/Archerfield_Ipswich_Mwy_sth.jpg',
      source: 'QLDTraffic',
    });
    const flood = mapQldCamera(feature(193, 151.2694, -27.3915, 'https://cameras.qldtraffic.qld.gov.au/Flood_Cameras/Darling_Downs/cecil-plains-ashall-creek.jpg', 'St Ruth - Dalby - Cecil Plains Road at Ashall Creek'), 'flood');
    expect(flood?.id).toBe('qld-flood-193');
    expect(flood?.source).toBe('QLDTraffic flood camera');
  });

  it('skips rows with no picture, a plain-http picture, or a place outside Queensland', () => {
    expect(mapQldCamera(feature(2, 153, -27.5, null), 'traffic')).toBeNull();
    expect(mapQldCamera(feature(3, 153, -27.5, 'http://cameras.qldtraffic.qld.gov.au/a.jpg'), 'traffic')).toBeNull();
    expect(mapQldCamera(feature(4, 151.2, -33.9, 'https://cameras.qldtraffic.qld.gov.au/a.jpg'), 'traffic')).toBeNull();
    expect(mapQldCamera({ properties: { id: 5, image_url: 'https://cameras.qldtraffic.qld.gov.au/a.jpg' } }, 'traffic')).toBeNull();
  });

  it('keeps the traffic cameras when the flood file fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'last-modified': new Date().toUTCString() } });
      return url.includes('floodcameras')
        ? new Response('down', { status: 503 })
        : Response.json({ type: 'FeatureCollection', features: [feature(1, 153.0087, -27.5552, 'https://cameras.qldtraffic.qld.gov.au/a.jpg')] });
    }));
    const cams = await fetchQueenslandCameras();
    expect(cams.map(c => c.id)).toEqual(['qld-traffic-1']);
  });

  it('leaves off cameras whose picture is old or gone, and keeps those it could not check', async () => {
    const now = Date.parse('2026-11-09T05:00:00Z');
    const cam = (id: string) => ({ ...mapQldCamera(feature(1, 153, -27.5, `https://cameras.qldtraffic.qld.gov.au/${id}.jpg`), 'flood')!, id });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('fresh.jpg')) return new Response(null, { headers: { 'last-modified': new Date(now - 20 * 60_000).toUTCString() } });
      if (url.endsWith('stale.jpg')) return new Response(null, { headers: { 'last-modified': new Date(now - STALE_MS - 60_000).toUTCString() } });
      if (url.endsWith('gone.jpg')) return new Response(null, { status: 404 });
      throw new TypeError('fetch failed');
    }));
    const kept = await currentOnly([cam('fresh'), cam('stale'), cam('gone'), cam('unreachable')], now);
    expect(kept.map(c => c.id)).toEqual(['fresh', 'unreachable']);
  });
});

import { describe, it, expect } from 'vitest';
import type { CctvCamera } from './types';
import { isYouTubeUrl, parseYouTubeUrl } from '@/lib/youtube';
import {
  NETHERLANDS_PUBLIC_WEBCAMS,
  EUROPE_PUBLIC_WEBCAMS,
  AMERICAS_PUBLIC_WEBCAMS,
  REST_PUBLIC_WEBCAMS,
} from './public-webcams.generated';

const ALL: CctvCamera[] = [
  ...NETHERLANDS_PUBLIC_WEBCAMS,
  ...EUROPE_PUBLIC_WEBCAMS,
  ...AMERICAS_PUBLIC_WEBCAMS,
  ...REST_PUBLIC_WEBCAMS,
];

/** The same box netherlands.ts filters the Rijkswaterstaat feed on. */
const NL_BOUNDS = { minLat: 50.7, maxLat: 53.7, minLng: 3.3, maxLng: 7.3 };

/**
 * These assertions guard the generator, not the upstream site. Every one of
 * them has caught something: an id collision from two cameras sharing a
 * caption, a Wowza URL baked with a token that expires in twenty minutes, and
 * a "/streams" link left unrewritten — which looks fine until you notice the
 * camera never plays, because only "/live" is a shape the resolver recognises.
 */
describe('public webcam set', () => {
  it('is not empty, and is split across the four regions', () => {
    expect(NETHERLANDS_PUBLIC_WEBCAMS.length).toBeGreaterThan(150);
    expect(EUROPE_PUBLIC_WEBCAMS.length).toBeGreaterThan(0);
    expect(AMERICAS_PUBLIC_WEBCAMS.length).toBeGreaterThan(0);
    expect(REST_PUBLIC_WEBCAMS.length).toBeGreaterThan(0);
  });

  it('has a unique id for every camera, across all four arrays', () => {
    const ids = ALL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('pubcam-'))).toBe(true);
  });

  it('gives every camera a real position', () => {
    for (const cam of ALL) {
      expect(Number.isFinite(cam.lat), cam.id).toBe(true);
      expect(Number.isFinite(cam.lng), cam.id).toBe(true);
      expect(Math.abs(cam.lat), cam.id).toBeLessThanOrEqual(90);
      expect(Math.abs(cam.lng), cam.id).toBeLessThanOrEqual(180);
      // Null Island is what a failed geocode looks like when nobody checks.
      expect(cam.lat === 0 && cam.lng === 0, cam.id).toBe(false);
    }
  });

  it('keeps the Dutch cameras inside the Netherlands', () => {
    for (const cam of NETHERLANDS_PUBLIC_WEBCAMS) {
      expect(cam.country).toBe('Netherlands');
      expect(cam.lat, cam.id).toBeGreaterThan(NL_BOUNDS.minLat);
      expect(cam.lat, cam.id).toBeLessThan(NL_BOUNDS.maxLat);
      expect(cam.lng, cam.id).toBeGreaterThan(NL_BOUNDS.minLng);
      expect(cam.lng, cam.id).toBeLessThan(NL_BOUNDS.maxLng);
    }
  });

  it('gives every camera something to show', () => {
    for (const cam of ALL) {
      expect(Boolean(cam.feed_url || cam.stream_url || cam.external_url), cam.id).toBe(true);
      expect(cam.name.length, cam.id).toBeGreaterThan(0);
      expect(cam.city.length, cam.id).toBeGreaterThan(0);
      expect(cam.source).toBe('Public Webcam');
    }
  });

  it('points YouTube cameras at a shape the viewer can read', () => {
    const youtube = ALL.filter((c) => isYouTubeUrl(c.external_url ?? ''));
    expect(youtube.length).toBeGreaterThan(100);

    /* The index links to a channel's "/streams" tab — a list of past
       broadcasts. parseYouTubeUrl returns null for that, and a camera it
       returns null for is one that quietly never plays: the viewer neither
       builds an embed itself nor sends it to /api/cctv/resolve. Rewriting
       those to "/live" is what this whole source rests on, so assert against
       the parser the viewer actually uses rather than against a copy of its
       rules. */
    for (const cam of youtube) {
      const url = cam.external_url!;
      expect(url, cam.id).not.toContain('/streams');
      expect(parseYouTubeUrl(url)?.kind, `${cam.id}: ${url}`).toMatch(/^(video|live-channel)$/);
      // Nothing is baked either way — a live id changes on every restart.
      expect(cam.stream_url, cam.id).toBeUndefined();
    }

    // The bulk are channel links; resolving those per request is the point.
    const channels = youtube.filter((c) => parseYouTubeUrl(c.external_url!)?.kind === 'live-channel');
    expect(channels.length).toBeGreaterThan(100);
  });

  /**
   * Most of the Wowza family answer an ad-blocker by replacing the camera with
   * a notice saying the advertising is what keeps them online. Replaying their
   * playlist here does what that notice objects to, so they link out instead —
   * and only these three, which ask nothing of their visitors, are played in
   * place. Kept as an allow-list rather than a block-list: a regeneration that
   * quietly starts replaying somebody else has to fail here first.
   */
  const HLS_HOSTS = new Set(['webcam-friesemeren.nl', 'webcam-kampen.nl', 'webcam-maastricht.nl']);

  it('backs every hls camera with an m3u8, and bakes no expiring token', () => {
    const hls = ALL.filter((c) => c.stream_type === 'hls');
    expect(hls.length).toBeGreaterThan(5);
    for (const cam of hls) {
      expect(cam.stream_url, cam.id).toMatch(/\.m3u8$/);
      const host = new URL(cam.external_url!).hostname.replace(/^www\./, '');
      expect(HLS_HOSTS, cam.id).toContain(host);
    }

    for (const cam of ALL) {
      const urls = [cam.feed_url, cam.stream_url, cam.external_url].filter(Boolean).join(' ');
      expect(urls.includes('wowzatoken'), cam.id).toBe(false);
    }
  });

  it('uses only stream types the viewer can render', () => {
    for (const cam of ALL) {
      if (cam.stream_type === undefined) continue;
      expect(['jpg', 'hls', 'iframe', 'mjpeg'], cam.id).toContain(cam.stream_type);
      // Anything with a type needs a URL of that type to go with it.
      expect(Boolean(cam.stream_url || cam.feed_url), cam.id).toBe(true);
    }
  });

  it('sends viewers to the camera, over https, on an absolute URL', () => {
    for (const cam of ALL) {
      if (!cam.external_url) continue;
      // A link out is only worth having if it reaches the operator's own page.
      // A relative path or a proxy URL here means the generator wrote a local
      // route where it meant to write somebody's site.
      expect(cam.external_url, cam.id).toMatch(/^https:\/\/[^/]+\.[a-z]{2,}/i);
      expect(cam.external_url, cam.id).not.toContain('/api/cctv/');
    }
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real streams).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('public webcam streams, live', () => {
  liveIt('serves a playlist for most of the baked HLS cameras', async () => {
    const hls = ALL.filter((c) => c.stream_type === 'hls').slice(0, 12);
    const codes = await Promise.all(hls.map(async (cam) => {
      try {
        const res = await fetch(cam.stream_url!, { signal: AbortSignal.timeout(15000) });
        return res.status;
      } catch { return 0; }
    }));
    // A Wowza 404 means the camera is not publishing right now — plenty of
    // these are daylight-only — so this asserts the host answers, not that
    // every camera happens to be awake.
    expect(codes.filter((c) => c === 200 || c === 404).length).toBeGreaterThan(hls.length / 2);
  }, 60000);
});

import { describe, it, expect } from 'vitest';
import { isSkylineUrl, extractYouTubeId, youtubeEmbedUrl, parseSkylinePage, isHostedOffPlatform, needsResolution, offPlatformView } from './skyline';

/** Trimmed from the real Yubatake page, which is what this parses in production. */
const YUBATAKE = `<script>function onYouTubeIframeAPIReady(){player=new YT.Player('live',{playerVars:{autoplay:1,controls:1,hl:'en'},height:'100%',width:'100%',videoId:'GrEEoEmmrKs',host:'https://www.youtube-nocookie.com',events:{'onReady':onPlayerReady}});}</script>`;

describe('isSkylineUrl', () => {
  it('accepts the site and its subdomains', () => {
    expect(isSkylineUrl('https://www.skylinewebcams.com/en/webcam/japan/gunma/yubatake/yubatake.html')).toBe(true);
    expect(isSkylineUrl('https://skylinewebcams.com/x.html')).toBe(true);
  });

  it('compares the host, not the string', () => {
    // Every one of these contains the allowed host as a substring.
    expect(isSkylineUrl('https://evil.com/?x=skylinewebcams.com')).toBe(false);
    expect(isSkylineUrl('https://skylinewebcams.com.evil.com/x')).toBe(false);
    expect(isSkylineUrl('https://notskylinewebcams.com/x')).toBe(false);
  });

  it('rejects anything that is not a URL', () => {
    expect(isSkylineUrl('')).toBe(false);
    expect(isSkylineUrl('yubatake.html')).toBe(false);
  });
});

describe('extractYouTubeId', () => {
  it('reads the id out of the IFrame API bootstrap', () => {
    expect(extractYouTubeId(YUBATAKE)).toBe('GrEEoEmmrKs');
  });

  it('falls back to a direct embed URL', () => {
    expect(extractYouTubeId('<iframe src="https://www.youtube-nocookie.com/embed/eU8A7QQOcso?rel=0">')).toBe('eU8A7QQOcso');
    expect(extractYouTubeId('<iframe src="https://www.youtube.com/embed/YQ4wbAl_7zo">')).toBe('YQ4wbAl_7zo');
  });

  it('accepts double-quoted ids', () => {
    expect(extractYouTubeId('videoId: "GrEEoEmmrKs"')).toBe('GrEEoEmmrKs');
  });

  it('rejects a capture that is not an id, rather than passing it through', () => {
    // This value ends up interpolated into a URL the browser loads.
    expect(extractYouTubeId(`videoId:'../../evil'`)).toBeNull();
    expect(extractYouTubeId(`videoId:'short'`)).toBeNull();
    expect(extractYouTubeId(`videoId:'waytoolongtobeanid'`)).toBeNull();
    expect(extractYouTubeId(`videoId:'has space!!'`)).toBeNull();
  });

  it('returns null when there is no player at all', () => {
    expect(extractYouTubeId('<html><body>no camera here</body></html>')).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('builds a muted autoplaying nocookie embed', () => {
    const url = new URL(youtubeEmbedUrl('GrEEoEmmrKs'));
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/GrEEoEmmrKs');
    // Autoplay only survives muted, and a wall of cameras must not make noise.
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('autoplay')).toBe('1');
    // Inline on iOS rather than hijacking the screen with the native player.
    expect(url.searchParams.get('playsinline')).toBe('1');
  });
});

describe('parseSkylinePage', () => {
  it('resolves a YouTube-backed page', () => {
    const feed = parseSkylinePage(YUBATAKE);
    expect(feed).toMatchObject({ kind: 'youtube', videoId: 'GrEEoEmmrKs' });
  });

  it('reports SkylineWebcams-hosted HLS without trying to serve it', () => {
    const feed = parseSkylinePage(`<script>src:"https://cdn.skylinewebcams.com/live/xyz/livee.m3u8"</script>`);
    expect(feed).toEqual({ kind: 'hls' });
  });

  it('prefers YouTube when a page carries both', () => {
    expect(parseSkylinePage(YUBATAKE + '<script>"live.m3u8"</script>').kind).toBe('youtube');
  });

  it('reports unknown for a page with neither', () => {
    expect(parseSkylinePage('<html>offline</html>')).toEqual({ kind: 'unknown' });
  });
});

describe('needsResolution', () => {
  const SKY = 'https://www.skylinewebcams.com/en/webcam/japan/gunma/yubatake/yubatake.html';

  it('resolves a camera we hold nothing but a Skyline link for', () => {
    expect(needsResolution({ external_url: SKY })).toBe(true);
  });

  it('leaves a camera alone when it already has a playable feed', () => {
    // Resolving these would trade a working stream for a round-trip.
    expect(needsResolution({ external_url: SKY, stream_url: 'https://x/live.m3u8' })).toBe(false);
    expect(needsResolution({ external_url: SKY, feed_url: 'https://x/snap.jpg' })).toBe(false);
  });

  it('leaves other operators alone — this resolver only knows one site', () => {
    expect(needsResolution({ external_url: 'https://www.windy.com/webcams/12345' })).toBe(false);
  });

  it('is safe on a missing or empty camera', () => {
    expect(needsResolution(null)).toBe(false);
    expect(needsResolution(undefined)).toBe(false);
    expect(needsResolution({})).toBe(false);
  });

  it('separates hosted-off-platform from resolvable', () => {
    // Windy is off-platform, we just cannot open it. Both facts matter: the
    // viewer shows the external panel for it, but must not call the resolver.
    const windy = { external_url: 'https://www.windy.com/webcams/12345' };
    expect(isHostedOffPlatform(windy)).toBe(true);
    expect(needsResolution(windy)).toBe(false);
  });
});

// Live integration test — opt in with RUN_LIVE_TESTS=1 (hits the real site).
const liveIt = process.env.RUN_LIVE_TESTS === '1' ? it : it.skip;

describe('skyline resolution (live)', () => {
  liveIt('resolves the Yubatake page to a playable YouTube id', async () => {
    const res = await fetch('https://www.skylinewebcams.com/en/webcam/japan/gunma/yubatake/yubatake.html', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    expect(res.ok).toBe(true);
    const feed = parseSkylinePage(await res.text());
    expect(feed.kind).toBe('youtube');

    // The id must be one YouTube will actually serve — a stale or malformed id
    // is exactly the failure this resolver exists to avoid.
    if (feed.kind === 'youtube') {
      const oe = await fetch(`https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3D${feed.videoId}&format=json`);
      expect(oe.status).toBe(200);
    }
  });
});

describe('offPlatformView', () => {
  const v = (o: Partial<Parameters<typeof offPlatformView>[0]>) =>
    offPlatformView({ hostedOffPlatform: true, resolving: false, resolvedEmbed: null, ...o });

  it('plays a camera that has its own feed, without consulting anything', () => {
    expect(v({ hostedOffPlatform: false })).toBe('inline');
  });

  it('shows the resolving state while looking, not the external panel', () => {
    // Otherwise a camera that is about to play inline flashes up 'requires
    // external clearance' first, which reads as a failure.
    expect(v({ resolving: true })).toBe('resolving');
  });

  it('plays inline once a feed is found', () => {
    expect(v({ resolvedEmbed: 'https://www.youtube-nocookie.com/embed/GrEEoEmmrKs' })).toBe('inline');
  });

  it('falls back to the external link when nothing was found', () => {
    expect(v({ resolving: false, resolvedEmbed: null })).toBe('external');
  });

  it('prefers a found feed over a still-running lookup', () => {
    // Both true is reachable: resolvedEmbed lands before `resolving` clears.
    expect(v({ resolving: true, resolvedEmbed: 'https://x/embed/y' })).toBe('inline');
  });
});

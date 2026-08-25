import { describe, it, expect } from 'vitest';
import { isSkylineUrl, parseSkylinePage } from './skyline';

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

describe('parseSkylinePage', () => {
  it('resolves a YouTube-backed page', () => {
    expect(parseSkylinePage(YUBATAKE)).toMatchObject({ kind: 'youtube', videoId: 'GrEEoEmmrKs' });
  });

  it('reports SkylineWebcams-hosted HLS without trying to serve it', () => {
    expect(parseSkylinePage(`<script>src:"https://cdn.skylinewebcams.com/live/xyz/livee.m3u8"</script>`)).toEqual({ kind: 'hls' });
  });

  it('prefers YouTube when a page carries both', () => {
    expect(parseSkylinePage(YUBATAKE + '<script>"live.m3u8"</script>').kind).toBe('youtube');
  });

  it('reports a camera the source says is off air', () => {
    // Real markup from the Monte Hermoso page. All 8 off-air cameras found in
    // South America and Africa carried exactly this.
    const offAir = '<div><p style="font-size:4rem;opacity:0.6"><strong>OFFLINE</strong></p></div>';
    expect(parseSkylinePage(offAir)).toEqual({ kind: 'offline' });
  });

  it('does not call a working camera offline', () => {
    // The banner is absent on every working page checked; a false positive here
    // would hide a live feed behind an 'off air' message.
    expect(parseSkylinePage(YUBATAKE).kind).toBe('youtube');
  });

  it('prefers a playable stream over an offline banner', () => {
    expect(parseSkylinePage(YUBATAKE + '<strong>OFFLINE</strong>').kind).toBe('youtube');
  });

  it('reports unknown for a page with neither', () => {
    expect(parseSkylinePage('<html>offline</html>')).toEqual({ kind: 'unknown' });
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

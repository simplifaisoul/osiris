import { describe, it, expect } from 'vitest';
import { isYouTubeUrl, parseYouTubeUrl, extractYouTubeId, youtubeEmbedUrl } from './youtube';

describe('isYouTubeUrl', () => {
  it('accepts the hosts a stream can arrive on', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=GrEEoEmmrKs')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/GrEEoEmmrKs')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube-nocookie.com/embed/GrEEoEmmrKs')).toBe(true);
  });

  it('compares the host, not the string', () => {
    expect(isYouTubeUrl('https://evil.com/?x=youtube.com')).toBe(false);
    expect(isYouTubeUrl('https://youtube.com.evil.com/watch?v=GrEEoEmmrKs')).toBe(false);
    expect(isYouTubeUrl('https://notyoutube.com/watch?v=GrEEoEmmrKs')).toBe(false);
  });
});

describe('parseYouTubeUrl', () => {
  it('reads a specific video out of every link shape', () => {
    const shapes = [
      'https://www.youtube.com/watch?v=GrEEoEmmrKs',
      'https://www.youtube.com/watch?app=desktop&v=GrEEoEmmrKs&t=30s',
      'https://youtu.be/GrEEoEmmrKs',
      'https://www.youtube.com/embed/GrEEoEmmrKs?autoplay=1',
      'https://www.youtube.com/v/GrEEoEmmrKs',
      'https://www.youtube.com/live/GrEEoEmmrKs',
      'https://www.youtube.com/shorts/GrEEoEmmrKs',
    ];
    for (const url of shapes) {
      expect(parseYouTubeUrl(url), url).toEqual({ kind: 'video', videoId: 'GrEEoEmmrKs' });
    }
  });

  it('separates a live broadcast from a channel that happens to be live', () => {
    // One path segment apart, and they mean entirely different things:
    // /live/ID is one specific broadcast, /@handle/live is "whatever is on now".
    expect(parseYouTubeUrl('https://www.youtube.com/live/GrEEoEmmrKs')).toEqual({ kind: 'video', videoId: 'GrEEoEmmrKs' });
    expect(parseYouTubeUrl('https://www.youtube.com/@AaronPreslin/live')).toEqual({ kind: 'live-channel' });
    expect(parseYouTubeUrl('https://www.youtube.com/channel/UCabcdefghijk/live')).toEqual({ kind: 'live-channel' });
    expect(parseYouTubeUrl('https://www.youtube.com/user/somebody/live')).toEqual({ kind: 'live-channel' });
    expect(parseYouTubeUrl('https://www.youtube.com/c/somebody/live')).toEqual({ kind: 'live-channel' });
  });

  it('rejects ids that are not ids rather than passing them through', () => {
    // These end up interpolated into a URL the browser loads.
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=../../evil')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeUrl('https://youtu.be/way-too-long-to-be-an-id')).toBeNull();
  });

  it('returns null for a non-YouTube or malformed URL', () => {
    expect(parseYouTubeUrl('https://www.skylinewebcams.com/x.html')).toBeNull();
    expect(parseYouTubeUrl('not a url')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/')).toBeNull();
  });
});

describe('extractYouTubeId', () => {
  it('reads the id out of an IFrame API bootstrap', () => {
    expect(extractYouTubeId(`YT.Player('live',{videoId:'GrEEoEmmrKs',host:'x'})`)).toBe('GrEEoEmmrKs');
  });

  it('reads the id off a channel live page, which uses player JSON', () => {
    expect(extractYouTubeId('{"videoId":"Ql8lnRs0J0U","isLive":true}')).toBe('Ql8lnRs0J0U');
  });

  it('reads the id off a canonical link', () => {
    expect(extractYouTubeId('<link rel="canonical" href="https://www.youtube.com/watch?v=Ql8lnRs0J0U">')).toBe('Ql8lnRs0J0U');
  });

  it('falls back to a direct embed URL', () => {
    expect(extractYouTubeId('<iframe src="https://www.youtube-nocookie.com/embed/eU8A7QQOcso?rel=0">')).toBe('eU8A7QQOcso');
  });

  it('rejects a capture that is not an id', () => {
    expect(extractYouTubeId(`videoId:'../../evil'`)).toBeNull();
    expect(extractYouTubeId(`videoId:'short'`)).toBeNull();
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

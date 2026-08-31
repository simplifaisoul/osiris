import { describe, it, expect } from 'vitest';
import { embedUrl } from './LiveNewsPreviews';

/** Verbatim from /api/live-news. */
const SKY = 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1';
const NBC = 'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live';
const RT = 'https://rumble.com/c/RTNewsEN';

describe('embedUrl', () => {
  it('accepts a channel live_stream embed, which is what the playable feeds use', () => {
    const url = embedUrl(SKY, true);
    expect(url).toBeTruthy();
    expect(url!).toContain('/embed/live_stream');
    expect(url!).toContain('channel=UCoMdktPbSTixAyNGwb-UYkQ');
  });

  it('forces the parameters a muted background player needs', () => {
    // A tile that asks for sound is a tile the browser refuses to autoplay.
    const p = new URL(embedUrl(SKY, true)!).searchParams;
    expect(p.get('autoplay')).toBe('1');
    expect(p.get('mute')).toBe('1');
    expect(p.get('playsinline')).toBe('1');
  });

  it('overrides parameters already on the feed rather than trusting them', () => {
    const loud = 'https://www.youtube.com/embed/live_stream?channel=UC123&mute=0&autoplay=0';
    const p = new URL(embedUrl(loud, true)!).searchParams;
    expect(p.get('mute')).toBe('1');
    expect(p.get('autoplay')).toBe('1');
  });

  it('refuses a feed whose operator has disallowed embedding', () => {
    // Eight of the fifteen are flagged this way; they stay dots and open in
    // the full viewer instead.
    expect(embedUrl(SKY, false)).toBeNull();
  });

  it('refuses a channel /live link — it names a channel, not a broadcast', () => {
    expect(embedUrl(NBC, true)).toBeNull();
  });

  it('refuses a non-YouTube host', () => {
    expect(embedUrl(RT, true)).toBeNull();
    expect(embedUrl('https://evil.example/embed/live_stream?channel=UC1', true)).toBeNull();
  });

  it('is not fooled by a lookalike hostname', () => {
    // Substring matching on "youtube.com" would accept this.
    expect(embedUrl('https://www.youtube.com.evil.example/embed/live_stream?channel=UC1', true)).toBeNull();
  });

  it('accepts the privacy-preserving host', () => {
    expect(embedUrl('https://www.youtube-nocookie.com/embed/live_stream?channel=UC1', true)).toBeTruthy();
  });

  it('refuses junk without throwing', () => {
    expect(embedUrl('', true)).toBeNull();
    expect(embedUrl('not a url', true)).toBeNull();
    expect(embedUrl('https://www.youtube.com/watch?v=abc', true)).toBeNull();
  });
});

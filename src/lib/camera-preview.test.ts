import { describe, it, expect } from 'vitest';
import { previewMedia, refreshInterval, VIDEO_KINDS, type PreviewKind } from './camera-preview';

describe('previewMedia', () => {
  it('treats a missing stream_type as a snapshot, like the full viewer', () => {
    expect(previewMedia({ feed_url: 'https://x/cam.jpg' })).toEqual({ kind: 'jpg', url: 'https://x/cam.jpg' });
  });

  it('gives Quebec 511 cameras a tile', () => {
    // 675 of these, and every one of them was a bare dot at every zoom.
    const qc = { stream_type: 'mp4', stream_url: 'https://www.quebec511.info/Carte/Fenetres/camera.ashx?id=4057&format=mp4' };
    expect(previewMedia(qc)).toEqual({ kind: 'mp4', url: qc.stream_url });
  });

  it('gives HLS webcams a tile', () => {
    const hls = { stream_type: 'hls', stream_url: 'https://ls.example/live/x.m3u8' };
    expect(previewMedia(hls)).toEqual({ kind: 'hls', url: hls.stream_url });
  });

  it('reads MJPEG off stream_url', () => {
    expect(previewMedia({ stream_type: 'mjpeg', stream_url: 'https://x/stream' }))
      .toEqual({ kind: 'mjpeg', url: 'https://x/stream' });
  });

  it('leaves embeds as dots', () => {
    // Eight YouTube players over the map is a different feature.
    expect(previewMedia({ stream_type: 'iframe', stream_url: 'https://youtube.com/embed/x' })).toBeNull();
  });

  it('leaves a kind it does not know as a dot', () => {
    expect(previewMedia({ stream_type: 'rtsp', stream_url: 'rtsp://x/1' })).toBeNull();
  });

  it('refuses a camera whose URL for its own kind is missing or blank', () => {
    expect(previewMedia({ stream_type: 'mp4' })).toBeNull();
    expect(previewMedia({ stream_type: 'mp4', feed_url: 'https://x/cam.jpg' })).toBeNull();
    expect(previewMedia({ stream_type: 'hls', stream_url: '   ' })).toBeNull();
    expect(previewMedia({})).toBeNull();
  });

  it('falls back to stream_url for a snapshot that only carries one', () => {
    expect(previewMedia({ stream_type: 'jpg', stream_url: 'https://x/snap.jpg' }))
      .toEqual({ kind: 'jpg', url: 'https://x/snap.jpg' });
  });

  it('is not confused by the case a source writes its type in', () => {
    expect(previewMedia({ stream_type: 'MP4', stream_url: 'https://x/c.mp4' })?.kind).toBe('mp4');
    expect(previewMedia({ stream_type: 'HLS', stream_url: 'https://x/c.m3u8' })?.kind).toBe('hls');
  });
});

describe('refreshInterval', () => {
  it('re-requests snapshots often enough to look live', () => {
    expect(refreshInterval('jpg')).toBe(15000);
  });

  it('re-points MP4 clips far less often, because that restarts playback', () => {
    expect(refreshInterval('mp4')).toBeGreaterThan(refreshInterval('jpg'));
  });

  it('never re-points a continuous stream', () => {
    // Re-pointing an HLS or MJPEG source tears down a stream that is already live.
    expect(refreshInterval('hls')).toBe(0);
    expect(refreshInterval('mjpeg')).toBe(0);
  });
});

describe('VIDEO_KINDS', () => {
  it('is exactly the kinds that need a video element', () => {
    const kinds: PreviewKind[] = ['jpg', 'mjpeg', 'mp4', 'hls'];
    expect(kinds.filter(k => VIDEO_KINDS.has(k))).toEqual(['mp4', 'hls']);
  });
});

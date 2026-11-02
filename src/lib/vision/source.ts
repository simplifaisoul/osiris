/**
 * OSIRIS vision: whether a camera's picture can be read, and how.
 *
 * A still camera's frame is fetched through OSIRIS; a live HLS stream's is taken
 * from the video playing it. Web players (YouTube, an operator's own page) and
 * MJPEG or MP4 links cannot be read by the page at all. Pure, for the overlay
 * and for OI Assist alike.
 */

/** What vision needs to know about a camera. */
export interface VisionCamera {
  id: string;
  name?: string;
  stream_type?: string;
  feed_url?: string;
  stream_url?: string;
}

export type Source = 'still' | 'video';

export function sourceOf(camera: VisionCamera | null | undefined): Source | null {
  if (!camera?.id) return null;
  const type = camera.stream_type || 'jpg';
  if (type === 'jpg' && camera.feed_url) return 'still';
  if (type === 'hls' && camera.stream_url) return 'video';
  return null;
}

/**
 * OSIRIS — YouTube feed primitives
 *
 * A surprising number of public cameras are ultimately a YouTube livestream:
 * either directly, or wrapped in an operator's page (see skyline.ts). This
 * module knows about YouTube itself — ids, embed URLs, and the several shapes a
 * link to a stream can take.
 */

/** YouTube video ids are exactly 11 characters of [A-Za-z0-9_-]. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

/**
 * What a YouTube link points at.
 *
 *   'video'        — a specific stream. Known without asking anyone.
 *   'live-channel' — "whatever this channel is broadcasting now", which is a
 *                    different video every broadcast and can only be answered
 *                    by fetching the page.
 */
export type YouTubeTarget =
  | { kind: 'video'; videoId: string }
  | { kind: 'live-channel' };

/** Host comparison, not a substring test — this gates what gets fetched. */
export function isYouTubeUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return YOUTUBE_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

/**
 * Classifies a YouTube link.
 *
 * Note the two readings of "live": `/live/VIDEO_ID` is one specific broadcast,
 * while `/@handle/live` is whatever that channel happens to be showing. They
 * differ by one path segment and mean entirely different things.
 */
export function parseYouTubeUrl(url: string): YouTubeTarget | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!isYouTubeUrl(url)) return null;

  const host = u.hostname.toLowerCase();
  const segments = u.pathname.split('/').filter(Boolean);

  // youtu.be/VIDEO_ID
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    const id = segments[0];
    return id && YOUTUBE_ID.test(id) ? { kind: 'video', videoId: id } : null;
  }

  // youtube.com/watch?v=VIDEO_ID
  const v = u.searchParams.get('v');
  if (v && YOUTUBE_ID.test(v)) return { kind: 'video', videoId: v };

  // /embed/ID, /v/ID, /live/ID, /shorts/ID
  if (segments.length >= 2 && ['embed', 'v', 'live', 'shorts'].includes(segments[0])) {
    const id = segments[1];
    if (YOUTUBE_ID.test(id)) return { kind: 'video', videoId: id };
  }

  // /@handle/live, /channel/UC.../live, /user/name/live, /c/name/live
  if (segments.length >= 2 && segments[segments.length - 1] === 'live') {
    return { kind: 'live-channel' };
  }

  return null;
}

/**
 * Pulls a video id out of a page. Covers the YouTube IFrame API bootstrap that
 * operator pages use, a plain embed URL, and the canonical link / player JSON
 * that a channel's own live page carries.
 *
 * The id is shape-checked in every case — an unvalidated capture here ends up
 * interpolated into a URL the browser then loads.
 */
export function extractYouTubeId(html: string): string | null {
  const patterns = [
    /videoId\s*:\s*['"]([^'"]+)['"]/,           // YT.Player({ videoId:'...' })
    /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/,    // player response JSON
    /rel=["']canonical["']\s+href=["'][^"']*[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const id = html.match(re)?.[1];
    if (id && YOUTUBE_ID.test(id)) return id;
  }
  return null;
}

/** Privacy-preserving host, and the one operator pages themselves use. */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

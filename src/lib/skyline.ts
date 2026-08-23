/**
 * OSIRIS — SkylineWebcams feed resolution
 *
 * SkylineWebcams cameras arrive in our dataset carrying only an `external_url`,
 * so the viewer renders them as "this feed requires external clearance" plus a
 * link off-platform. For most of them that is unnecessary. The page is a thin
 * wrapper around a public YouTube livestream published by the camera's actual
 * operator — a town office, a regional broadcaster — and that stream embeds
 * anywhere.
 *
 * Measured across all 601 SkylineWebcams cameras in the dataset:
 *
 *   390 (65%)  wrap a YouTube livestream   embeddable
 *   181 (30%)  SkylineWebcams' own HLS     left external
 *    30 ( 5%)  neither                     left external
 *
 * Japan, which prompted this, is 154 of 157.
 *
 * Resolving to YouTube also sends the viewer to the original broadcaster rather
 * than to an aggregator that reposted them: the Yubatake camera is Kusatsu
 * town's own stream, the Kawaguchiko one is UTY Yamanashi's.
 *
 * The HLS group is deliberately left alone. Those streams are SkylineWebcams'
 * own product, served through their player behind hotlink protection. Lifting
 * the manifest out would be fragile and would be taking someone else's content.
 */

const SKYLINE_HOST = 'skylinewebcams.com';

/** YouTube video ids are exactly 11 characters of [A-Za-z0-9_-]. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export type SkylineFeed =
  | { kind: 'youtube'; videoId: string; embedUrl: string }
  | { kind: 'hls' }
  | { kind: 'unknown' };

/**
 * Host comparison, not a substring test. "https://evil.com/?skylinewebcams.com"
 * passes a substring check, and this value decides what the resolver is willing
 * to fetch.
 */
export function isSkylineUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === SKYLINE_HOST || host.endsWith('.' + SKYLINE_HOST);
}

/**
 * Pulls the video id out of the page's YouTube IFrame API bootstrap, which
 * looks like `YT.Player('live',{...,videoId:'GrEEoEmmrKs',...})`.
 *
 * Falls back to a direct embed URL, since not every page uses the JS player.
 * The id is shape-checked either way — an unvalidated capture here would end up
 * interpolated into a URL the browser then loads.
 */
export function extractYouTubeId(html: string): string | null {
  const patterns = [
    /videoId\s*:\s*['"]([^'"]+)['"]/,
    /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const id = html.match(re)?.[1];
    if (id && YOUTUBE_ID.test(id)) return id;
  }
  return null;
}

/** Privacy-preserving host, and the one the source page itself uses. */
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

export function parseSkylinePage(html: string): SkylineFeed {
  const videoId = extractYouTubeId(html);
  if (videoId) return { kind: 'youtube', videoId, embedUrl: youtubeEmbedUrl(videoId) };
  // Their own stream. Reachable, but not ours to re-serve.
  if (/\.m3u8/i.test(html)) return { kind: 'hls' };
  return { kind: 'unknown' };
}

/** The fields the viewer uses to decide how to play a camera. */
export interface ResolvableCamera {
  external_url?: string;
  feed_url?: string;
  stream_url?: string;
}

/**
 * True when the only thing we hold for a camera is a link to somebody else's
 * page — nothing that can be rendered in place.
 */
export function isHostedOffPlatform(camera: ResolvableCamera | null | undefined): boolean {
  return Boolean(camera?.external_url && !camera.feed_url && !camera.stream_url);
}

/**
 * True when that link is one we know how to open up. A camera that already has
 * a playable stream is left alone: resolving it would trade a working feed for
 * a network round-trip.
 */
export function needsResolution(camera: ResolvableCamera | null | undefined): boolean {
  return isHostedOffPlatform(camera) && isSkylineUrl(camera!.external_url!);
}

/**
 * Which state the viewer paints for a camera we hold no local feed for.
 *
 *   'resolving' — looking for a direct feed. Shown instead of the external
 *                 panel so a camera that is about to play inline does not
 *                 first flash up 'requires external clearance'.
 *   'external'  — no direct feed. The off-platform link, as before.
 *   'inline'    — play it here.
 */
export function offPlatformView(state: {
  hostedOffPlatform: boolean;
  resolving: boolean;
  resolvedEmbed: string | null;
}): 'resolving' | 'external' | 'inline' {
  if (!state.hostedOffPlatform) return 'inline';
  if (state.resolvedEmbed) return 'inline';
  return state.resolving ? 'resolving' : 'external';
}

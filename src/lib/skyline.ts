/**
 * OSIRIS — SkylineWebcams feed resolution
 *
 * SkylineWebcams cameras arrive in our dataset carrying only an `external_url`,
 * so the viewer would render them as "this feed requires external clearance"
 * plus a link off-platform. For most of them that is unnecessary. The page is a
 * thin wrapper around a public YouTube livestream published by the camera's
 * actual operator — a town office, a regional broadcaster — and that stream
 * embeds anywhere.
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

import { extractYouTubeId, youtubeEmbedUrl } from './youtube';

const SKYLINE_HOST = 'skylinewebcams.com';

export type SkylineFeed =
  | { kind: 'youtube'; videoId: string; embedUrl: string }
  | { kind: 'hls' }
  | { kind: 'offline' }
  | { kind: 'unknown' };

/**
 * SkylineWebcams paints this over the player when a camera is off air. Worth
 * detecting: without it a dead camera is indistinguishable from one we merely
 * cannot open, and the viewer tells the operator to go and get "external
 * clearance" for a feed that is not running at all.
 *
 * Measured on the 51 South American and African cameras: 8 were off air, and
 * every one of them carried this. Cameras that are working carry it zero times.
 */
const OFFLINE_BANNER = /<strong>\s*OFFLINE\s*<\/strong>/i;

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

export function parseSkylinePage(html: string): SkylineFeed {
  const videoId = extractYouTubeId(html);
  if (videoId) return { kind: 'youtube', videoId, embedUrl: youtubeEmbedUrl(videoId) };
  // Checked before HLS so a camera that is merely off air is reported as off
  // air, rather than as a stream we declined to serve.
  if (OFFLINE_BANNER.test(html)) return { kind: 'offline' };
  // Their own stream. Reachable, but not ours to re-serve.
  if (/\.m3u8/i.test(html)) return { kind: 'hls' };
  return { kind: 'unknown' };
}

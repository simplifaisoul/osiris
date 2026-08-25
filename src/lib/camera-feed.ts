/**
 * OSIRIS — how the camera viewer decides what to show
 *
 * Some cameras arrive with nothing but a link to somebody else's page. A few of
 * those pages we know how to open up, so the feed can play in place instead of
 * sending the operator off-platform. This module holds that decision, kept out
 * of the component so the logic that runs is the logic under test.
 *
 * Two providers are resolvable today: SkylineWebcams pages, which wrap an
 * operator's YouTube livestream, and YouTube links given directly.
 */

import { isSkylineUrl } from './skyline';
import { isYouTubeUrl, parseYouTubeUrl, youtubeEmbedUrl } from './youtube';

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
 * An embed URL we can produce without asking anyone.
 *
 * A link to a specific YouTube video already names the stream, so going to the
 * network to be told what we can read off the URL would add a round-trip and a
 * failure mode for nothing. Channel "/live" links are not this: they mean
 * whatever that channel is broadcasting now, which only the page can answer.
 */
export function localEmbed(camera: ResolvableCamera | null | undefined): string | null {
  if (!isHostedOffPlatform(camera)) return null;
  const target = parseYouTubeUrl(camera!.external_url!);
  return target?.kind === 'video' ? youtubeEmbedUrl(target.videoId) : null;
}

/**
 * The URL of a live stream that exists at the source but that we can only send
 * the operator to, never play here.
 *
 * SkylineWebcams cameras come in two shapes. Some are a wrapper around the
 * operator's own YouTube livestream, and those we resolve and play (see
 * skyline.ts). The rest — 250 of the 681 in the dataset — give us a periodic
 * JPEG snapshot instead, while the live video stays on their page behind a
 * per-request token, their watermark, and a pre-roll ad break. Reproducing
 * that stream here would strip all three, so the honest move is a way through
 * to it rather than a copy of it.
 *
 * The snapshot is still worth showing — measured refreshing about every 25
 * seconds — so this offers the live feed alongside it rather than instead of
 * it, and lets the viewer label the still as a snapshot rather than as live.
 */
export function liveFeedAtSource(camera: ResolvableCamera | null | undefined): string | null {
  if (!camera?.external_url || !camera.feed_url || camera.stream_url) return null;
  return isSkylineUrl(camera.external_url) ? camera.external_url : null;
}

/**
 * True when the link needs a lookup before it can be played: a SkylineWebcams
 * page, or a YouTube channel's live URL.
 *
 * A camera that already has a playable stream is left alone — resolving it
 * would trade a working feed for a network round-trip.
 */
export function needsResolution(camera: ResolvableCamera | null | undefined): boolean {
  if (!isHostedOffPlatform(camera)) return false;
  if (localEmbed(camera)) return false;
  const url = camera!.external_url!;
  if (isSkylineUrl(url)) return true;
  return isYouTubeUrl(url) && parseYouTubeUrl(url)?.kind === 'live-channel';
}

/**
 * Which state the viewer paints for a camera we hold no local feed for.
 *
 *   'resolving' — looking for a direct feed. Shown instead of the external
 *                 panel so a camera that is about to play inline does not
 *                 first flash up 'requires external clearance'.
 *   'offline'   — nothing to show, and nowhere to send the operator: the
 *                 source says the camera is off air, or its page is gone.
 *                 Distinct from 'external', which offers a link — here that
 *                 link would lead to an offline banner or a 404.
 *                 The viewer picks its wording from the resolved kind.
 *   'external'  — no direct feed, but the page is live. The link, as before.
 *   'inline'    — play it here.
 */
export function offPlatformView(state: {
  hostedOffPlatform: boolean;
  resolving: boolean;
  resolvedEmbed: string | null;
  offline?: boolean;
}): 'resolving' | 'offline' | 'external' | 'inline' {
  if (state.resolvedEmbed) return 'inline';

  if (state.hostedOffPlatform) {
    if (state.resolving) return 'resolving';
    return state.offline ? 'offline' : 'external';
  }

  // The camera has a feed of its own — a snapshot — so show it straight
  // away rather than waiting on a lookup. But drop it if the source says
  // the camera is gone: SkylineWebcams reuses its numeric snapshot ids, so
  // a withdrawn camera's still can quietly become a different place
  // entirely. live341.jpg is captioned 'Rome - Trevi Fountain' here and
  // currently shows a beach in the Canaries. A wrong picture under a
  // confident label is worse than no picture.
  return state.offline ? 'offline' : 'inline';
}

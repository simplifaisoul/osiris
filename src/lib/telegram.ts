/**
 * OSIRIS — parser for Telegram's public channel preview (t.me/s/<channel>).
 *
 * The page is server-rendered HTML with no API behind it, so this reads the
 * markup directly. Three things the previous regex got wrong, measured against
 * live pages on 2026-09-17, shape how it works:
 *
 *   • Posts are split on the wrapper boundary, not matched with a lazy regex.
 *     The regex ended at the first `</div></div></div>`, which every photo or
 *     video post contains, so the footer was cut off: 22 of 72 items shipped
 *     with the fetch time as their publish time and the channel root as their
 *     link. A post without a real timestamp is now dropped, never back-dated.
 *   • The post's own text is `js-message_text`. A reply carries the quoted
 *     parent as `js-message_reply_text` *before* it, and 12 of 145 posts showed
 *     the parent's words as their own.
 *   • Album posts wrap the text in a second `js-message_text` div, so the text
 *     is read with a balanced-div scan rather than up to the first `</div>`.
 */

export interface TelegramMedia {
  kind: 'photo' | 'video';
  /** Preview image on Telegram's CDN. */
  thumb: string | null;
  /** Video length as Telegram prints it, e.g. "0:29". */
  duration: string | null;
  /**
   * The lead video's file on Telegram's CDN, playable in place. Null for
   * photos, and for videos Telegram marks too big to preview — those only
   * play on Telegram. The URL is tokenised and served for about three hours,
   * well past the few minutes a channel page is cached for.
   */
  video: string | null;
  /** Items in the post — more than one for an album. */
  count: number;
}

export interface TelegramPost {
  /** "channel/123" — stable across refreshes. */
  id: string;
  channel: string;
  url: string;
  /** ISO timestamp from the post itself. */
  publishedAt: string;
  /** Full plain text, paragraph breaks kept. */
  text: string;
  headline: string;
  /** Set when the channel marked the post as breaking news. */
  flag: 'BREAKING' | null;
  /** The text after the headline. */
  summary: string;
  media: TelegramMedia | null;
  forwardedFrom: { name: string; url: string | null } | null;
  /** Permalink of the post this one replies to. */
  replyTo: string | null;
  views: number | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', deg: '°',
};

/** One pass, so `&amp;lt;` decodes to `&lt;` rather than `<`. */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  const text = decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:blockquote|p|div)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/ /g, ' ');

  return text
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Inner HTML of the div whose `<div` starts at `openAt`, nesting respected. */
function innerDiv(html: string, openAt: number): string | null {
  const start = html.indexOf('>', openAt);
  if (start < 0) return null;
  const tags = /<div\b|<\/div>/gi;
  tags.lastIndex = start + 1;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start + 1, m.index);
  }
  return null;
}

// Emoji, flags (regional indicators), skin tones, keycaps and the joiners between them.
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;
// Bullets, dashes, hashes and other decoration before the first word.
const LEADING_DECORATION = /^[^\p{L}\p{N}"'“‘«(]+/u;
// Urgency labels channels put ahead of a headline, in the languages seen.
const BREAKING_PREFIX = /^(?:breaking(?: news)?|just in|urgent|flash|срочно|молния|última hora|ultima hora)(?![\p{L}])\s*[:|—–-]?\s*/iu;
const OTHER_PREFIX = /^(?:new|update|developing)\s*[:|—–-]\s*/iu;
const HEADLINE_MAX = 140;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
}

function tidyLine(line: string): { text: string; breaking: boolean } {
  let s = line
    // Styled "𝗯𝗼𝗹𝗱" and full-width letters back to plain text.
    .normalize('NFKC')
    .replace(/^\W*Fwd from @\S*/iu, '')
    .replace(PICTOGRAPHS, ' ')
    .replace(/[([]\s*[)\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(LEADING_DECORATION, '');
  const breaking = BREAKING_PREFIX.test(s);
  s = s
    .replace(BREAKING_PREFIX, '')
    .replace(OTHER_PREFIX, '')
    .replace(LEADING_DECORATION, '')
    .replace(/[\s|:—–-]+$/u, '')
    .trim();
  // A guillemet whose partner was an emoji-wrapped title marker.
  if (s.startsWith('«') && !s.includes('»')) s = s.slice(1);
  if (s.endsWith('»') && !s.includes('«')) s = s.slice(0, -1);
  return { text: s.trim(), breaking };
}

const SIGN_OFF = [
  /^@\w+(?:\s*[|•·].*)?$/u, //                 "@BellumActaNews", "@DDGeopolitics | Socials | Donate"
  /^@\w+\s+[—–-]\s+.{0,80}$/u, //             "@rybar_africa — where politics is hotter…" (network promo)
  /^[\p{L} ]{1,20}(?:\s*\|\s*[\p{L} ]{1,20}){2,}$/u, // "VK | RuTube | OK | Zen"
  /^(?:support us|subscribe|donate|join us|follow us|original msg)\b.{0,30}$/iu,
  /^(?:#[\p{L}\p{N}_]+\s*)+$/u, //            "#NATO #Russia #USA #Ukraine"
];
// A rule of dashes or emoji ("➖➖➖➖", "———") that channels put above a footer.
const isRule = (line: string) => line.trim().length >= 3 && !/[\p{L}\p{N}]/u.test(line);

/**
 * Drops the sign-off channels append to every post — their handle, link
 * menus, separators — so it never surfaces as a summary. Only trailing lines
 * are touched; a handle mentioned inside the report stays.
 */
export function stripSignOff(text: string): string {
  let lines = text.split('\n');
  // Everything under a closing rule is footer — sign-off or advertising — when it
  // is short. Bellum Acta stacks two ("➖ ad ➖ @handle"), so look twice.
  for (let pass = 0; pass < 2; pass++) {
    const rule = lines.findLastIndex(isRule);
    if (rule <= 0) break;
    const footer = lines.slice(rule + 1).filter(l => l.trim());
    if (footer.length > 3 || footer.join(' ').length > 240) break;
    lines = lines.slice(0, rule);
  }
  while (lines.length > 1) {
    const last = lines[lines.length - 1].normalize('NFKC').replace(PICTOGRAPHS, ' ').replace(/\s+/g, ' ').trim();
    const bare = last.replace(/^[^\p{L}\p{N}@#]+/u, '');
    if (!/[\p{L}\p{N}]/u.test(last) || SIGN_OFF.some(rx => rx.test(bare))) lines.pop();
    else break;
  }
  return lines.join('\n').trim();
}

/**
 * The headline a newsroom would print: the first line that carries real
 * words, without the emoji, flags, urgency labels and forwarding debris
 * channels decorate it with. A first line that runs on as a paragraph is cut
 * at its first sentence, and the remainder moves to the summary.
 */
export function splitHeadline(text: string): { headline: string; summary: string; flag: TelegramPost['flag'] } {
  const lines = text.split('\n');
  let breaking = false;
  for (let i = 0; i < lines.length; i++) {
    const line = tidyLine(lines[i]);
    breaking ||= line.breaking;
    let headline = line.text;
    // A line that is only decoration, a lone word or an urgency label ("ÚLTIMA HORA").
    if ((headline.match(/\p{L}/gu) || []).length < 8 || !headline.includes(' ')) continue;

    let restAt = i + 1;
    // "Speaker Name:" on its own line with the quote beneath — keep them together.
    if (/:\s*$/.test(lines[i]) && headline.length <= 80) {
      while (restAt < lines.length && !lines[restAt].trim()) restAt++;
      const quote = restAt < lines.length ? tidyLine(lines[restAt]).text : '';
      if (quote) {
        headline = `${headline}: ${quote}`;
        restAt++;
      }
    }

    let rest = lines.slice(restAt).join('\n').trim();
    if (headline.length > HEADLINE_MAX) {
      const sentence = headline.match(/^(.{20,}?[.!?])\s+(?=\S)/u);
      if (sentence && sentence[1].length <= HEADLINE_MAX) {
        rest = `${headline.slice(sentence[0].length)}\n${rest}`.trim();
        headline = sentence[1];
      }
    }
    return { headline: clip(headline, HEADLINE_MAX), summary: rest, flag: breaking ? 'BREAKING' : null };
  }
  const whole = tidyLine(text.replace(/\n+/g, ' '));
  return {
    headline: clip(whole.text, HEADLINE_MAX),
    summary: '',
    flag: breaking || whole.breaking ? 'BREAKING' : null,
  };
}

/** "4.02K" → 4020. */
export function parseViews(raw: string): number | null {
  const m = raw.trim().match(/^([\d.,]+)\s*([KM])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toUpperCase();
  return Math.round(n * (unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1));
}

const bgUrl = (fragment: string | undefined) => fragment?.match(/background-image:url\('([^']+)'\)/)?.[1] ?? null;

/** Telegram serves post media from these hosts; a video URL anywhere else is not theirs. */
const TELEGRAM_CDN = /^https:\/\/(?:[\w-]+\.)*(?:telesco\.pe|cdn-telegram\.org)\//;

function videoSrc(post: string): string | null {
  const raw = post.match(/<video\b[^>]*\bsrc="([^"]+)"/)?.[1];
  if (!raw) return null;
  const url = decodeHtmlEntities(raw);
  return TELEGRAM_CDN.test(url) ? url : null;
}

function parseMedia(post: string): TelegramMedia | null {
  const photos = post.match(/<a class="tgme_widget_message_photo_wrap\b[^>]*>/g) || [];
  const videos = post.match(/<i class="tgme_widget_message_video_thumb\b[^>]*>/g) || [];
  if (!photos.length && !videos.length) return null;

  // An album leads with whichever item comes first in the markup.
  const photoAt = post.indexOf('tgme_widget_message_photo_wrap');
  const videoAt = post.indexOf('tgme_widget_message_video_thumb');
  const leadIsVideo = videos.length > 0 && (photoAt < 0 || videoAt < photoAt);
  const duration = post.match(/class="message_video_duration[^"]*"[^>]*>([^<]+)</)?.[1]?.trim() ?? null;

  return {
    kind: leadIsVideo ? 'video' : 'photo',
    thumb: bgUrl(leadIsVideo ? videos[0] : photos[0]),
    duration: leadIsVideo ? duration : null,
    video: leadIsVideo ? videoSrc(post) : null,
    count: photos.length + videos.length,
  };
}

function parseForward(post: string): TelegramPost['forwardedFrom'] {
  const at = post.search(/class="tgme_widget_message_forwarded_from(?:\s[^"]*)?"/);
  if (at < 0) return null;
  const block = post.slice(at, post.indexOf('</div>', at));
  const name = tidyLine(htmlToText(block.replace(/^[^>]*>/, '').replace(/Forwarded from/i, ''))).text;
  if (!name) return null;
  const url = block.match(/class="tgme_widget_message_forwarded_from_name"\s+href="([^"]+)"/)?.[1] ?? null;
  return { name, url };
}

/**
 * Every usable post on a channel page, oldest first as Telegram renders them.
 * Service notices, media-only posts and posts without a timestamp are skipped.
 */
export function parseChannelPage(html: string, channel: string): TelegramPost[] {
  const posts: TelegramPost[] = [];

  for (const post of html.split('class="tgme_widget_message_wrap').slice(1)) {
    // "X pinned a photo", "Channel name was changed to …" — chrome, not intel.
    if (/class="tgme_widget_message\b[^"]*\bservice_message\b/.test(post)) continue;

    const dataPost = post.match(/data-post="([^"]+\/\d+)"/)?.[1];
    const publishedAt = post.match(/class="tgme_widget_message_date"[^>]*>\s*<time datetime="([^"]+)"/)?.[1];
    if (!dataPost || !publishedAt || Number.isNaN(Date.parse(publishedAt))) continue;

    const textAt = post.indexOf('class="tgme_widget_message_text js-message_text"');
    if (textAt < 0) continue;
    const inner = innerDiv(post, post.lastIndexOf('<div', textAt));
    const text = inner ? stripSignOff(htmlToText(inner)) : '';
    if (text.length < 10) continue;

    const { headline, summary, flag } = splitHeadline(text);
    const views = post.match(/class="tgme_widget_message_views">([^<]+)</)?.[1];

    posts.push({
      id: dataPost,
      channel,
      url: `https://t.me/${dataPost}`,
      publishedAt: new Date(publishedAt).toISOString(),
      text,
      headline,
      flag,
      summary,
      media: parseMedia(post),
      forwardedFrom: parseForward(post),
      replyTo: post.match(/class="tgme_widget_message_reply\b[^"]*"\s+href="([^"]+)"/)?.[1] ?? null,
      views: views ? parseViews(views) : null,
    });
  }

  return posts;
}

/**
 * Word-level fingerprint for spotting the same report posted by several
 * channels. Links, handles and emoji are dropped; the opening words compared.
 */
export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+|@\w+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1)
    .slice(0, 24)
    .join(' ');
}

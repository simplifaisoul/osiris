/**
 * OSIRIS — FINGERPRINT search helpers.
 *
 * The pure pieces of RECON → FINGERPRINT, kept out of the component so they
 * can be tested without a browser: per-type query validation, the categories
 * results are filtered by, NDJSON framing for the streamed username scan,
 * CSV export and the search-history log.
 */

import { isValidUsername } from '@/lib/sherlock';

export type SearchType = 'username' | 'email' | 'phone';

/* ── query validation ────────────────────────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s().-]+$/;

/** Returns why a query cannot be searched as `type`, or null if it can. */
export function validateQuery(type: SearchType, raw: string): string | null {
  const q = raw.trim();
  if (!q) return 'Enter something to search for.';
  if (type === 'username') {
    return isValidUsername(q) ? null : 'Usernames may use letters, digits and . _ - @ (max 64).';
  }
  if (type === 'email') {
    return EMAIL.test(q) ? null : 'That does not look like an email address.';
  }
  const digits = q.replace(/\D/g, '');
  if (!PHONE_CHARS.test(q) || digits.length < 7 || digits.length > 15) {
    return 'Phone numbers need 7–15 digits, ideally with a +country code.';
  }
  return null;
}

/* ── platform categories ─────────────────────────────────────── */

export const CATEGORIES = [
  'Social', 'Developer', 'Gaming', 'Video', 'Music', 'Creative',
  'Writing', 'Lifestyle', 'Commerce', 'Forums', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Known Sherlock site names. First listing wins for a name in two lists. */
const KNOWN: [Category, string[]][] = [
  ['Developer', [
    'GitHub', 'GitLab', 'Bitbucket', 'Launchpad', 'Docker Hub', 'npm', 'PyPi', 'RubyGems',
    'Replit.com', 'CodePen', 'Codecademy', 'CodersRank', 'LeetCode', 'Codeforces', 'HackerEarth',
    'HackerNews', 'HackerOne', 'Keybase', 'Kaggle', 'Codewars', 'DEV Community', 'Hashnode',
    'SourceForge', 'Gitee', 'Codeberg', 'HuggingFace', 'TryHackMe', 'HackTheBox', 'Bugcrowd',
    'Exercism', 'Topcoder', 'Coderwall', 'Packagist', 'Crates.io', 'NuGet', 'Hackaday',
  ]],
  ['Video', ['YouTube', 'Twitch', 'Kick', 'Vimeo', 'Dailymotion', 'Rumble', 'Odysee', 'BitChute', 'TikTok']],
  ['Gaming', [
    'Steam', 'Roblox', 'Chess.com', 'Lichess', 'osu!', 'Speedrun.com', 'itch.io', 'Minecraft',
    'Xbox Gamertag', 'Fortnite Tracker', 'Trovo', 'Kongregate', 'Newgrounds', 'Faceit', 'Nitro Type',
  ]],
  ['Music', [
    'SoundCloud', 'Spotify', 'Last.fm', 'Bandcamp', 'MixCloud', 'Genius', 'Discogs', 'ReverbNation',
    'Audiojungle', 'Smule', 'Freesound',
  ]],
  ['Creative', [
    'Dribbble', 'Behance', 'DeviantART', 'ArtStation', '500px', 'Unsplash', 'VSCO', 'Pixiv', 'Flickr',
    'Figma', 'Sketchfab', 'Coroflot', 'Carbonmade', 'Pexels', 'Imgur',
  ]],
  ['Writing', [
    'Medium', 'Blogger', 'WordPress', 'Wattpad', 'Substack', 'Slideshare', 'Archive.org', 'Wikipedia',
    'Fandom', 'LiveJournal', 'Tumblr', 'Scribd', 'Academia.edu', 'ResearchGate', 'Issuu',
  ]],
  ['Lifestyle', [
    'Strava', 'Untappd', 'Duolingo', 'Trakt', 'Letterboxd', 'MyAnimeList', 'Anilist', 'Goodreads',
    'Kitsu', 'Couchsurfing', 'TripAdvisor', 'AllMyLinks',
  ]],
  ['Commerce', [
    'Patreon', 'BuyMeACoffee', 'Ko-fi', 'Fiverr', 'Freelancer', 'eBay', 'Etsy', 'Gumroad', 'Upwork',
    'Venmo', 'Cash App', 'Envato Forum', 'Kickstarter', 'Redbubble', 'Teespring',
  ]],
  ['Social', [
    'Instagram', 'Telegram', 'Pinterest', 'VK', 'Snapchat', 'Ask FM', 'Reddit', 'Mastodon',
    'Facebook', 'Twitter', 'Threads', 'Bluesky', 'Linktree', 'About.me', 'Gravatar', '9GAG',
    'Weibo', 'Discord', 'OK', 'Clubhouse', 'Gab', 'Minds', 'Periscope', 'Quora',
  ]],
];

const BY_NAME = new Map<string, Category>();
for (const [cat, names] of KNOWN) {
  for (const n of names) {
    const key = n.toLowerCase();
    if (!BY_NAME.has(key)) BY_NAME.set(key, cat);
  }
}

/** Name hints for the long tail of sites no list will ever keep up with. */
const HINTS: [Category, RegExp][] = [
  ['Forums', /forum|board|community|\bbbs\b|discuss/i],
  ['Developer', /\bgit|code|dev\b|hack|program|npm|\bpy/i],
  ['Gaming', /game|gaming|play|minecraft|chess|tracker/i],
  ['Music', /music|sound|audio|\bfm\b|radio/i],
  ['Video', /video|tube|stream/i],
  ['Creative', /art|photo|design|draw/i],
  ['Writing', /blog|wiki|write|book|news/i],
];

export function platformCategory(site: string): Category {
  const known = BY_NAME.get(site.toLowerCase());
  if (known) return known;
  for (const [cat, re] of HINTS) if (re.test(site)) return cat;
  return 'Other';
}

/* ── NDJSON framing ──────────────────────────────────────────── */

/**
 * Splits a growing stream buffer into complete lines. A network chunk can end
 * mid-line, so the unterminated tail is handed back to be prefixed to the
 * next chunk rather than parsed early.
 */
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.filter(l => l.trim()), rest };
}

/* ── CSV export ──────────────────────────────────────────────── */

/**
 * One CSV cell. Quoted when it carries a delimiter, and a leading = + - @ is
 * neutralised — an exported profile URL or site name must not execute as a
 * formula when the file is opened in a spreadsheet.
 */
export function csvCell(value: unknown): string {
  let s = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ── search history ──────────────────────────────────────────── */

export interface HistoryEntry {
  query: string;
  type: SearchType;
  /** Hits for a username, sources with findings for email / phone. */
  count: number;
  status: 'done' | 'stopped' | 'fail';
  at: number;
}

export const HISTORY_KEY = 'osiris.fingerprint.history';
export const HISTORY_CAP = 25;

export function pushHistory(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...list].slice(0, HISTORY_CAP);
}

/** Tolerates anything localStorage might hand back, including nothing. */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(e => e && typeof e.query === 'string' && ['username', 'email', 'phone'].includes(e.type) && typeof e.at === 'number')
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

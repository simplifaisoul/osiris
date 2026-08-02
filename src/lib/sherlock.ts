/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — Username enumeration across social platforms
 *
 *  A TypeScript reimplementation of the detection logic from the Sherlock
 *  Project (MIT), driven by its site database:
 *    https://github.com/sherlock-project/sherlock
 *
 *  Sherlock itself is Python; shelling out to it is not an option in this
 *  runtime, but its data.json is the valuable part — 481 sites, each with
 *  the rule for deciding whether a profile exists. That rule set is what
 *  this module implements.
 *
 *  Three detection strategies, mirroring upstream:
 *    status_code    a non-error response means the profile exists
 *    message        the body of a missing profile contains a known string
 *    response_url   a missing profile redirects to a known URL
 * ═══════════════════════════════════════════════════════════════
 */

const DATA_URL =
  'https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json';

/** Shape of one entry in Sherlock's data.json. */
interface SiteDef {
  url: string;
  urlMain: string;
  urlProbe?: string;
  errorType: 'status_code' | 'message' | 'response_url';
  errorMsg?: string | string[];
  errorUrl?: string;
  errorCode?: number | number[];
  regexCheck?: string;
  request_method?: string;
  request_payload?: unknown;
  headers?: Record<string, string>;
  isNSFW?: boolean;
  username_claimed?: string;
}

export type Status = 'found' | 'not_found' | 'error' | 'skipped' | 'inconclusive' | 'blocked';

/**
 * Codes that mean "we were refused", not "no such account". Measured against
 * Sherlock's own known-good handles, treating these as absence produced 8 of
 * 12 false negatives — the single largest source of wrong answers.
 */
const BLOCKED_CODES = new Set([401, 403, 407, 429, 451, 503]);

/** Interstitials that return 200 while showing no profile data. */
const CHALLENGE_MARKERS = [
  'just a moment',
  'attention required',
  'cf-browser-verification',
  'enable javascript and cookies',
  'checking your browser',
  'access denied',
  'unusual traffic',
  'are you a robot',
  'px-captcha',
  'captcha-delivery',
];

function looksLikeChallenge(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some(m => head.includes(m));
}

export interface SiteResult {
  site: string;
  url: string;
  status: Status;
  http_status?: number;
  /** Why a check errored or was skipped — never left implicit. */
  reason?: string;
  ms: number;
}

export interface UsernameScan {
  username: string;
  checked: number;
  total_available: number;
  /** Positives that survived calibration — a control username was rejected. */
  found: SiteResult[];
  /** Sites that also claim a random control username exists, so their
   *  positive proves nothing. Reported separately rather than as hits. */
  inconclusive: SiteResult[];
  /** Sites that refused the request. Absence was NOT established here. */
  blocked: SiteResult[];
  not_found_count: number;
  errors: SiteResult[];
  skipped: SiteResult[];
  elapsed_ms: number;
  include_nsfw: boolean;
  verified: boolean;
  source: string;
}

/* ── site database ───────────────────────────────────────────── */

/** The list changes rarely; refetching per scan would be wasteful. */
const DB_TTL = 6 * 60 * 60_000;
let dbCache: { at: number; sites: Record<string, SiteDef> } | null = null;
let dbInflight: Promise<Record<string, SiteDef>> | null = null;

export async function loadSites(): Promise<Record<string, SiteDef>> {
  if (dbCache && Date.now() - dbCache.at < DB_TTL) return dbCache.sites;
  if (dbInflight) return dbInflight;

  dbInflight = (async () => {
    try {
      // Outbound connects here intermittently hit UND_ERR_CONNECT_TIMEOUT on a
      // busy server even while the network is healthy. Losing the site list
      // fails the whole scan, so it is worth two extra attempts.
      let res: Response | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch(DATA_URL, {
            signal: AbortSignal.timeout(20000),
            headers: { Accept: 'application/json' },
          });
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 2) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      if (!res) throw lastError instanceof Error ? lastError : new Error('Sherlock data.json unreachable');
      if (!res.ok) throw new Error(`Sherlock data.json responded ${res.status}`);
      const raw = await res.json();
      const sites: Record<string, SiteDef> = {};
      for (const [name, def] of Object.entries<any>(raw)) {
        if (name === '$schema' || !def?.url || !def?.errorType) continue;
        sites[name] = def as SiteDef;
      }
      if (!Object.keys(sites).length) throw new Error('Sherlock data.json empty');
      dbCache = { at: Date.now(), sites };
      return sites;
    } catch (e) {
      if (dbCache) return dbCache.sites;   // stale beats nothing
      throw e;
    } finally {
      dbInflight = null;
    }
  })();

  return dbInflight;
}

/**
 * High-signal platforms checked by default. A full 481-site sweep does not
 * fit in a single request budget, so the default tier covers the sites an
 * investigator actually wants first; `?all=1` widens it.
 */
const PRIORITY = [
  'GitHub', 'GitLab', 'Reddit', 'Instagram', 'TikTok', 'YouTube', 'Twitch', 'Steam',
  'Telegram', 'Pinterest', 'Tumblr', 'Flickr', 'SoundCloud', 'Spotify', 'Medium',
  'Patreon', 'BuyMeACoffee', 'Kick', 'VK', 'Vimeo', 'Dribbble', 'Behance', 'DeviantART',
  'HackerNews', 'HackerOne', 'Keybase', 'Kaggle', 'Replit.com', 'CodePen', 'Codecademy',
  'Docker Hub', 'npm', 'PyPi', 'RubyGems', 'Bitbucket', 'Launchpad', 'CodersRank',
  'LeetCode', 'Codeforces', 'HackerEarth', 'Chess.com', 'Lichess', 'Duolingo',
  'Last.fm', 'Bandcamp', 'MixCloud', 'Genius', 'Discogs', 'Untappd', 'Strava',
  'Trakt', 'Letterboxd', 'MyAnimeList', 'Anilist', 'Goodreads', 'Wattpad',
  'Blogger', 'WordPress', 'Slideshare', 'About.me', 'Linktree', 'Gravatar',
  'Roblox', 'Fiverr', 'Freelancer', 'Wikipedia', 'Archive.org', 'Ask FM', 'Snapchat',
];

/* ── detection ───────────────────────────────────────────────── */

/** Guards against a username escaping the URL path it is substituted into. */
const SANE_USERNAME = /^[A-Za-z0-9._@-]{1,64}$/;

function fill(template: string, username: string): string {
  return template.replace('{}', encodeURIComponent(username));
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

async function checkSite(name: string, def: SiteDef, username: string, timeoutMs: number): Promise<SiteResult> {
  const started = Date.now();
  const profileUrl = fill(def.url, username);

  // Sites declare which usernames are even valid for them; a mismatch is a
  // skip, not a miss — reporting it as "not found" would be misleading.
  if (def.regexCheck) {
    try {
      if (!new RegExp(def.regexCheck).test(username)) {
        return { site: name, url: profileUrl, status: 'skipped', reason: 'username invalid for this site', ms: 0 };
      }
    } catch {
      /* an unusable pattern upstream shouldn't drop the site */
    }
  }

  const requestUrl = def.urlProbe ? fill(def.urlProbe, username) : profileUrl;
  const method = (def.request_method || 'GET').toUpperCase();

  try {
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: {
        // A browser User-Agent only. Sending an explicit Accept header made
        // things worse, not better — Discogs answers 403 with it and 200
        // without, and no site was measured to need it.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        ...(def.headers || {}),
      },
    };
    if (method === 'POST' && def.request_payload !== undefined) {
      init.body = JSON.stringify(def.request_payload).replace('{}', username);
      init.headers = { ...(init.headers as Record<string, string>), 'Content-Type': 'application/json' };
    }

    const res = await fetch(requestUrl, init);
    const ms = Date.now() - started;

    /* A refusal tells us nothing about the account. Checked before any
       per-strategy logic, because a challenge body contains neither the
       site's "missing profile" marker (which would read as a hit) nor real
       profile data. A site's own errorCode still wins — some legitimately
       answer 403 for an absent user. */
    const declaredErrorCodes = asArray(def.errorCode);
    if (BLOCKED_CODES.has(res.status) && !declaredErrorCodes.includes(res.status)) {
      return {
        site: name,
        url: profileUrl,
        status: 'blocked',
        http_status: res.status,
        reason: res.status === 429 ? 'rate limited by the site' : `refused with HTTP ${res.status}`,
        ms,
      };
    }

    if (def.errorType === 'status_code') {
      if (declaredErrorCodes.includes(res.status)) {
        return { site: name, url: profileUrl, status: 'not_found', http_status: res.status, ms };
      }
      const found = res.status >= 200 && res.status < 300;

      /* Some urlProbe endpoints upstream are simply broken — PyPi's points at
         an admin-only include that 404s for everyone, so a real account reads
         as absent. When a probe says "missing", give the canonical profile URL
         one chance to disagree. Calibration re-tests any positive against a
         control, so a soft-404 here cannot sneak through as a hit. */
      if (!found && def.urlProbe && requestUrl !== profileUrl) {
        try {
          const confirm = await fetch(profileUrl, { ...init, signal: AbortSignal.timeout(timeoutMs) });
          if (confirm.status >= 200 && confirm.status < 300) {
            return { site: name, url: profileUrl, status: 'found', http_status: confirm.status, ms: Date.now() - started };
          }
        } catch {
          /* fall through to the probe's verdict */
        }
      }

      return { site: name, url: profileUrl, status: found ? 'found' : 'not_found', http_status: res.status, ms };
    }

    if (def.errorType === 'message') {
      const body = await res.text();
      if (looksLikeChallenge(body)) {
        return { site: name, url: profileUrl, status: 'blocked', http_status: res.status, reason: 'bot challenge served instead of a profile', ms };
      }
      const markers = asArray(def.errorMsg);
      const missing = markers.some(m => body.includes(m));
      return { site: name, url: profileUrl, status: missing ? 'not_found' : 'found', http_status: res.status, ms };
    }

    // response_url: a missing profile lands on a known URL.
    const landed = res.url || requestUrl;
    const isError = !!def.errorUrl && landed.startsWith(fill(def.errorUrl, username));
    const found = !isError && res.status >= 200 && res.status < 300;
    return { site: name, url: profileUrl, status: found ? 'found' : 'not_found', http_status: res.status, ms };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'request failed';
    return {
      site: name,
      url: profileUrl,
      status: 'error',
      reason: /timeout|aborted|TimeoutError/i.test(msg) ? `timed out after ${timeoutMs}ms` : msg,
      ms: Date.now() - started,
    };
  }
}

/** Bounded-concurrency map — a 481-site fan-out would exhaust the pool. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ── entry point ─────────────────────────────────────────────── */

export interface ScanOptions {
  /** Check the whole database rather than the priority tier. */
  all?: boolean;
  includeNsfw?: boolean;
  limit?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Re-test positives against a random control username. On by default —
   *  without it roughly one in seven "hits" is a soft 404. */
  verify?: boolean;
}

/** A handle no one can plausibly hold, used to expose soft-404 sites. */
function controlUsername(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function isValidUsername(username: string): boolean {
  return SANE_USERNAME.test(username);
}

export async function scanUsername(username: string, opts: ScanOptions = {}): Promise<UsernameScan> {
  // Concurrency is deliberately modest: at 20 the scan was triggering the
  // sites' own rate limiters, and self-inflicted 429s look exactly like a
  // missing account unless treated as blocked.
  const { all = false, includeNsfw = false, limit, concurrency = 12, timeoutMs = 8000, verify = true } = opts;
  const started = Date.now();

  const db = await loadSites();
  let names = Object.keys(db);
  const totalAvailable = names.length;

  if (!includeNsfw) names = names.filter(n => !db[n].isNSFW);

  if (!all) {
    const priority = new Set(PRIORITY);
    const inTier = names.filter(n => priority.has(n));
    // Fall back to the head of the list if upstream renamed entries.
    names = inTier.length >= 20 ? inTier : names.slice(0, 60);
  }
  if (limit && limit > 0) names = names.slice(0, limit);

  const results = await mapLimit(names, concurrency, n => checkSite(n, db[n], username, timeoutMs));

  let found = results.filter(r => r.status === 'found').sort((a, b) => a.site.localeCompare(b.site));
  const inconclusive: SiteResult[] = [];

  /* Many sites answer 200 for a profile that does not exist, so a bare
     positive is not evidence. Re-run just the positives with a handle nobody
     can hold: any site that "finds" that one cannot be trusted for this scan.
     Only positives are re-tested, so the extra cost is small. */
  if (verify && found.length) {
    /* Two independent controls, not one. With a single sample a soft-404 site
       can slip through whenever that particular control happens to be
       rejected — Roblox and WordPress passed for one handle while being
       flagged for another. A site is unreliable if *either* control lands. */
    const controls = [controlUsername(), controlUsername()];
    const probes = controls.flatMap(c => found.map(r => ({ site: r.site, control: c })));
    const controlResults = await mapLimit(probes, Math.min(concurrency, probes.length), p =>
      checkSite(p.site, db[p.site], p.control, timeoutMs)
    );
    const unreliable = new Set(
      controlResults.filter(c => c.status === 'found').map(c => c.site)
    );
    if (unreliable.size) {
      for (const r of found) {
        if (unreliable.has(r.site)) {
          inconclusive.push({
            ...r,
            status: 'inconclusive',
            reason: 'site also reports a random control username as present (soft 404)',
          });
        }
      }
      found = found.filter(r => !unreliable.has(r.site));
    }
  }

  return {
    username,
    checked: results.length,
    total_available: totalAvailable,
    found,
    inconclusive,
    blocked: results.filter(r => r.status === 'blocked'),
    not_found_count: results.filter(r => r.status === 'not_found').length,
    errors: results.filter(r => r.status === 'error'),
    skipped: results.filter(r => r.status === 'skipped'),
    elapsed_ms: Date.now() - started,
    include_nsfw: includeNsfw,
    verified: verify,
    source: 'Sherlock Project site database (MIT)',
  };
}

/**
 * OSIRIS — FINGERPRINT name search.
 *
 * A full name is looked up in the public search APIs of sites where people
 * publish profiles under their own name (GitHub, Stack Overflow, Mastodon,
 * Bluesky) and in two open registers of people who are public by role:
 * Wikidata (notable people, with the accounts the register links to them) and
 * OpenAlex (researchers, with their institution). None needs a key. The
 * browser asks each one itself, so every visitor spends their own allowance
 * (GitHub's is 60 profile reads an hour) and no OSIRIS server sits between.
 *
 * What comes back is what each profile publishes about itself. There are no
 * addresses or phone numbers: a location is the town a profile names, a
 * researcher's institution, or a residence on record, placed at city level.
 * A profile whose owner opted out of being found (Mastodon's "discoverable"
 * off, Bluesky's logged-out visibility off) is left out. A shared name is not
 * a shared person, so every result is a candidate, never an identification.
 */

import { isValidUsername } from '@/lib/sherlock';

export type NameSource = 'github' | 'stackoverflow' | 'mastodon' | 'bluesky' | 'wikidata' | 'openalex';

export const NAME_SOURCES: { id: NameSource; label: string; via: string }[] = [
  { id: 'github', label: 'GitHub', via: 'api.github.com' },
  { id: 'stackoverflow', label: 'Stack Overflow', via: 'api.stackexchange.com' },
  { id: 'mastodon', label: 'Mastodon', via: 'mastodon.social' },
  { id: 'bluesky', label: 'Bluesky', via: 'public.api.bsky.app' },
  { id: 'wikidata', label: 'Wikidata', via: 'notable people' },
  { id: 'openalex', label: 'OpenAlex', via: 'researchers' },
];

export const sourceLabel = (id: NameSource) => NAME_SOURCES.find(s => s.id === id)?.label ?? id;

export interface ProfileLink {
  label: string;
  url: string;
}

/** How well a profile's name matches the one searched. */
export type NameMatch = 'exact' | 'words';

export interface NameProfile {
  source: NameSource;
  /** Unique within its source. */
  id: string;
  name: string;
  handle?: string;
  url: string;
  bio?: string;
  /** Company, employer or institution. */
  org?: string;
  /** Where the profile or record says the person is, as written. */
  location?: string;
  /** Where that is, when the record carries coordinates itself (an institution, a place on Wikidata). */
  coords?: { lat: number; lng: number };
  /** What the location is: a town the profile names, an institution's city, or a residence on record. */
  basis?: 'profile' | 'institution' | 'residence';
  /** Other accounts and sites the profile or record links to. */
  links: ProfileLink[];
  /** Short public numbers: followers, reputation, works. */
  facts: string[];
  match: NameMatch;
}

/** A place a profile puts the person, with every profile that agrees. */
export interface LocationSignal {
  place: string;
  lat: number;
  lng: number;
  sources: NameSource[];
  /** `source:id` of each profile placed here. */
  profiles: string[];
}

export interface PlacePoint {
  lat: number;
  lng: number;
  place: string;
}

/* ── the name itself ─────────────────────────────────────────── */

/** Returns why `raw` cannot be searched as a name, or null if it can. */
export function validateName(raw: string): string | null {
  const q = raw.trim();
  if (!q) return 'Enter something to search for.';
  if (q.length > 80) return 'Names are at most 80 characters.';
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(q)) return 'Names may use letters, spaces, dots, hyphens and apostrophes.';
  if ((q.match(/\p{L}/gu) ?? []).length < 2) return 'Enter at least two letters.';
  return null;
}

/** Lower case, accents and apostrophes dropped (O'Neill is oneill), everything else that is not a letter or digit a single space. */
export function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * How a profile's name matches the search: `exact` when it is the same name,
 * `words` when it holds every word of it (a middle name, a suffix), or a
 * handle that does. Null when it is someone else the site's fuzzy search
 * offered.
 */
export function matchOf(query: string, name?: string, handle?: string): NameMatch | null {
  const q = normalizeName(query);
  if (!q) return null;
  const words = q.split(' ');
  const n = normalizeName(name ?? '');
  if (n && n === q) return 'exact';
  const have = n.split(' ');
  if (n && words.every(w => have.includes(w))) {
    // A middle name or initials and a suffix, not a sentence that happens to hold the name.
    const extra = have.filter(w => !words.includes(w));
    if (extra.length <= 1 || (extra.length <= 3 && extra.every(w => w.length <= 3))) return 'words';
    return null;
  }
  const h = normalizeName(handle ?? '').replace(/ /g, '');
  if (h && words.every(w => h.includes(w))) return 'words';
  return null;
}

/** The handles people most often build from their name, to sweep with the username search. */
export function handleVariants(q: string): string[] {
  const words = normalizeName(q).split(' ').filter(w => /^[a-z0-9]+$/.test(w));
  if (!words.length) return [];
  if (words.length === 1) return isValidUsername(words[0]) ? [words[0]] : [];
  const first = words[0];
  const last = words[words.length - 1];
  const out = [
    first + last, `${first}.${last}`, `${first}_${last}`, `${first[0]}${last}`,
    last + first, `${first}${last[0]}`, `${last}.${first}`, `${first}-${last}`,
  ];
  return [...new Set(out)].filter(isValidUsername).slice(0, 8);
}

/**
 * Handles the profiles found already use, as the username search takes them
 * (no server part), when they are built from the name: someone else's
 * nickname is not worth a sweep.
 */
export function handlesInUse(profiles: NameProfile[], q: string): string[] {
  const words = normalizeName(q).split(' ').filter(w => w.length >= 3);
  const out = profiles.flatMap(p => {
    if (!p.handle) return [];
    if (p.source === 'github') return [p.handle];
    if (p.source === 'mastodon') return [p.handle.split('@')[0]];
    if (p.source === 'bluesky' && p.handle.endsWith('.bsky.social')) return [p.handle.slice(0, -'.bsky.social'.length)];
    return [];
  });
  return [...new Set(out.map(h => h.toLowerCase()))]
    .filter(h => isValidUsername(h) && words.some(w => normalizeName(h).replace(/ /g, '').includes(w)));
}

/**
 * Searches to open on the big networks, which allow no automated search: the
 * reader opens them in their own browser, signed in as themselves.
 */
export function pivotLinks(q: string): ProfileLink[] {
  const name = q.trim();
  const e = encodeURIComponent(name);
  const quoted = encodeURIComponent(`"${name}"`);
  return [
    { label: 'LinkedIn', url: `https://www.linkedin.com/search/results/people/?keywords=${e}` },
    { label: 'Facebook', url: `https://www.facebook.com/search/people/?q=${e}` },
    { label: 'Instagram', url: `https://www.google.com/search?q=site%3Ainstagram.com+${quoted}` },
    { label: 'X', url: `https://x.com/search?q=${e}&f=user` },
    { label: 'TikTok', url: `https://www.google.com/search?q=site%3Atiktok.com+${quoted}` },
  ];
}

/* ── text from the wire ──────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Plain text from the HTML some APIs send (Mastodon bios, Stack Exchange names), without a DOM. */
export function htmlToText(s: string): string {
  return s
    .replace(/<br\s*\/?>|<\/p>\s*<p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** An http(s) link, or undefined. A bare domain gets https; anything else (javascript:, mailto:) is dropped. */
export function safeHttpUrl(raw?: string | null): string | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s) ? `https://${s}` : '';
  if (!withScheme) return undefined;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** What people write instead of a place. */
const NOT_A_PLACE = /^(remote|remotely|earth|planet earth|the world|world ?wide|world|global|globe|internet|the internet|online|everywhere|anywhere|nowhere|somewhere|here|home|cyberspace|the cloud|cloud|metaverse|mars|moon|space|localhost|127\.0\.0\.1|\/dev\/null|n\/a|none|unknown|location|my location|your location|city|your city|country|address|hidden|private|secret|undisclosed|classified)$/i;

/** A location worth placing on a map, or undefined for "Remote", "Earth", a URL or an emoji. */
export function placeText(raw?: string | null): string | undefined {
  const s = htmlToText(raw ?? '');
  if (s.length < 2 || s.length > 80) return undefined;
  if (!/\p{L}{2}/u.test(s)) return undefined;
  if (/https?:\/\/|www\.|@/.test(s)) return undefined;
  const bare = s.replace(/[^\p{L}\p{N}\s/.-]/gu, '').trim();
  if (!bare || NOT_A_PLACE.test(bare)) return undefined;
  return s;
}

/** The key a location text is geocoded and cached under. */
export const placeKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Place-search kinds fine enough to name a town and no finer. */
export const CITY_LEVEL_KINDS = new Set(['city', 'region', 'country', 'place']);

const count = (n: number) => n.toLocaleString('en-US');

/* ── GitHub ──────────────────────────────────────────────────── */

/** Profiles read in full per search: each is one of the 60 an hour GitHub allows a connection. */
export const GITHUB_DETAILS = 5;

export const githubSearchUrl = (q: string) =>
  `https://api.github.com/search/users?q=${encodeURIComponent(`fullname:"${q.trim()}"`)}&per_page=${GITHUB_DETAILS}`;
export const githubUserUrl = (login: string) => `https://api.github.com/users/${encodeURIComponent(login)}`;

export interface GithubSearchItem { login: string; html_url: string; type?: string }
export interface GithubUser {
  login: string;
  name?: string | null;
  html_url: string;
  bio?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  twitter_username?: string | null;
  followers?: number;
  public_repos?: number;
  created_at?: string;
  type?: string;
}

export function fromGithubUser(u: GithubUser, q: string): NameProfile | null {
  // GitHub matched the name itself (fullname:), so a profile with no name of its own still counts;
  // one whose name is a sentence around it does not.
  const match = u.name ? matchOf(q, u.name, u.login) : 'words';
  if (!match) return null;
  const links: ProfileLink[] = [];
  const blog = safeHttpUrl(u.blog);
  if (blog) links.push({ label: 'Website', url: blog });
  if (u.twitter_username) links.push({ label: 'X', url: `https://x.com/${encodeURIComponent(u.twitter_username)}` });
  const facts = [
    u.followers !== undefined ? `${count(u.followers)} followers` : '',
    u.public_repos !== undefined ? `${count(u.public_repos)} public repos` : '',
    u.created_at ? `joined ${u.created_at.slice(0, 4)}` : '',
  ].filter(Boolean);
  const location = placeText(u.location);
  return {
    source: 'github', id: u.login, name: u.name || u.login, handle: u.login, url: u.html_url,
    ...(u.bio ? { bio: u.bio.trim() } : {}),
    ...(u.company ? { org: u.company.trim() } : {}),
    ...(location ? { location, basis: 'profile' as const } : {}),
    links, facts, match,
  };
}

/** A search hit whose full profile could not be read (the hourly allowance ran out): still a lead. */
export function fromGithubItem(it: GithubSearchItem): NameProfile {
  return { source: 'github', id: it.login, name: it.login, handle: it.login, url: it.html_url, links: [], facts: ['profile not read: GitHub’s hourly limit'], match: 'words' };
}

/* ── Stack Overflow ──────────────────────────────────────────── */

export const stackOverflowUrl = (q: string) =>
  `https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(q.trim())}&site=stackoverflow&pagesize=8&order=desc&sort=reputation`;

export interface StackUser {
  user_id: number;
  display_name: string;
  link: string;
  location?: string;
  website_url?: string;
  reputation?: number;
  creation_date?: number;
}

export function fromStackOverflow(body: { items?: StackUser[] }, q: string): NameProfile[] {
  const out: NameProfile[] = [];
  for (const u of body.items ?? []) {
    const name = htmlToText(u.display_name ?? '');
    const match = matchOf(q, name);
    if (!match || !u.link) continue;
    const location = placeText(u.location);
    const site = safeHttpUrl(u.website_url);
    out.push({
      source: 'stackoverflow', id: String(u.user_id), name, url: u.link,
      ...(location ? { location, basis: 'profile' as const } : {}),
      links: site ? [{ label: 'Website', url: site }] : [],
      facts: [
        u.reputation !== undefined ? `${count(u.reputation)} reputation` : '',
        u.creation_date ? `joined ${new Date(u.creation_date * 1000).getUTCFullYear()}` : '',
      ].filter(Boolean),
      match,
    });
  }
  return out;
}

/* ── Mastodon ────────────────────────────────────────────────── */

export const mastodonUrl = (q: string) =>
  `https://mastodon.social/api/v2/search?q=${encodeURIComponent(q.trim())}&type=accounts&limit=8&resolve=false`;

export interface MastodonAccount {
  id: string;
  acct: string;
  display_name: string;
  url: string;
  note?: string;
  fields?: { name: string; value: string; verified_at?: string | null }[];
  followers_count?: number;
  statuses_count?: number;
  discoverable?: boolean | null;
  noindex?: boolean;
  bot?: boolean;
}

/** Profile fields people put their town in. */
const LOCATION_FIELD = /^(📍\s*)?(location|based in|lives? in|where|city|home ?town|home|ort|wohnort|standort|lieu|ville|ubicaci[oó]n|ciudad|localit[àa]|città|plaats|woonplaats)\b/i;

export function fromMastodon(body: { accounts?: MastodonAccount[] }, q: string): NameProfile[] {
  const out: NameProfile[] = [];
  for (const a of body.accounts ?? []) {
    // Opted out of being found, or not a person.
    if (a.discoverable === false || a.noindex === true || a.bot) continue;
    const name = htmlToText(a.display_name || a.acct);
    const match = matchOf(q, name, a.acct.split('@')[0]);
    const url = safeHttpUrl(a.url);
    if (!match || !url) continue;
    let location: string | undefined;
    const links: ProfileLink[] = [];
    for (const f of a.fields ?? []) {
      const label = htmlToText(f.name);
      if (!location && LOCATION_FIELD.test(label)) location = placeText(f.value);
      const href = safeHttpUrl(f.value.match(/href="([^"]+)"/i)?.[1]);
      if (href) links.push({ label: `${label}${f.verified_at ? ' ✓' : ''}`, url: href });
    }
    out.push({
      source: 'mastodon', id: a.id, name, handle: a.acct.includes('@') ? a.acct : `${a.acct}@mastodon.social`, url,
      ...(a.note ? { bio: htmlToText(a.note) } : {}),
      ...(location ? { location, basis: 'profile' as const } : {}),
      links,
      facts: [
        a.followers_count !== undefined ? `${count(a.followers_count)} followers` : '',
        a.statuses_count !== undefined ? `${count(a.statuses_count)} posts` : '',
      ].filter(Boolean),
      match,
    });
  }
  return out;
}

/* ── Bluesky ─────────────────────────────────────────────────── */

export const blueskyUrl = (q: string) =>
  `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(q.trim())}&limit=8`;

export interface BlueskyActor {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  labels?: { val: string }[];
}

export function fromBluesky(body: { actors?: BlueskyActor[] }, q: string): NameProfile[] {
  const out: NameProfile[] = [];
  for (const a of body.actors ?? []) {
    // The owner asked not to be shown to people who are not signed in.
    if (a.handle === 'handle.invalid' || a.labels?.some(l => l.val === '!no-unauthenticated')) continue;
    const name = (a.displayName || '').trim() || a.handle;
    const match = matchOf(q, name, a.handle.split('.')[0]);
    if (!match) continue;
    out.push({
      source: 'bluesky', id: a.did, name, handle: a.handle, url: `https://bsky.app/profile/${encodeURIComponent(a.handle)}`,
      ...(a.description?.trim() ? { bio: a.description.trim() } : {}),
      links: [], facts: [], match,
    });
  }
  return out;
}

/* ── Wikidata ────────────────────────────────────────────────── */

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
export const wikidataSearchUrl = (q: string) =>
  `${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(q.trim())}&language=en&uselang=en&type=item&limit=10&format=json&origin=*`;
export const wikidataEntitiesUrl = (ids: string[], props: string) =>
  `${WIKIDATA}?action=wbgetentities&ids=${ids.join('|')}&props=${props}&languages=en|mul&sitefilter=enwiki&format=json&origin=*`;

interface WdSnak { datavalue?: { value: unknown } }
interface WdClaim { mainsnak: WdSnak; rank?: string; qualifiers?: Record<string, unknown> }
export interface WdEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WdClaim[]>;
  sitelinks?: Record<string, { title: string; url?: string }>;
  missing?: string;
}
export interface WdSearchHit { id: string; label?: string; match?: { text?: string } }

export const wdLabel = (e?: WdEntity) => e?.labels?.en?.value ?? e?.labels?.mul?.value ?? Object.values(e?.labels ?? {})[0]?.value;

/** A property's statements, best rank first: the preferred ones if any, else every one not deprecated. */
function statements(e: WdEntity, prop: string): WdClaim[] {
  const all = (e.claims?.[prop] ?? []).filter(c => c.rank !== 'deprecated' && c.mainsnak.datavalue);
  const preferred = all.filter(c => c.rank === 'preferred');
  return preferred.length ? preferred : all;
}
const itemIds = (claims: WdClaim[]) => claims
  .map(c => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)
  .filter((id): id is string => typeof id === 'string');
const strings = (claims: WdClaim[]) => claims
  .map(c => c.mainsnak.datavalue?.value)
  .filter((v): v is string => typeof v === 'string');
const startOf = (c: WdClaim) =>
  ((c.qualifiers?.P580 as WdSnak[] | undefined)?.[0]?.datavalue?.value as { time?: string } | undefined)?.time ?? '';
/**
 * Statements with no end date, latest start first: where someone lives now,
 * who employs them now. When every one has ended, there is no "now" on record.
 */
const current = (claims: WdClaim[]) => claims
  .map((c, i) => ({ c, i }))
  .filter(({ c }) => !c.qualifiers?.P582)
  .sort((a, b) => startOf(b.c).localeCompare(startOf(a.c)) || b.i - a.i)
  .map(({ c }) => c);

const isHuman = (e: WdEntity) => itemIds(e.claims?.P31 ?? []).includes('Q5');

/** "user@server.tld" (a fediverse address) as its profile URL. */
export function fediverseUrl(address: string): string | undefined {
  const m = address.trim().match(/^@?([\w.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
  return m ? `https://${m[2]}/@${m[1]}` : undefined;
}

/** The accounts Wikidata records for a person, as links. */
const WD_ACCOUNTS: [string, string, (v: string) => string | undefined][] = [
  ['P6634', 'LinkedIn', v => `https://www.linkedin.com/in/${encodeURIComponent(v)}`],
  ['P2003', 'Instagram', v => `https://www.instagram.com/${encodeURIComponent(v)}/`],
  ['P2013', 'Facebook', v => `https://www.facebook.com/${encodeURIComponent(v)}`],
  ['P2002', 'X', v => `https://x.com/${encodeURIComponent(v)}`],
  ['P7085', 'TikTok', v => `https://www.tiktok.com/@${encodeURIComponent(v)}`],
  ['P2397', 'YouTube', v => `https://www.youtube.com/channel/${encodeURIComponent(v)}`],
  ['P2037', 'GitHub', v => `https://github.com/${encodeURIComponent(v)}`],
  ['P12361', 'Bluesky', v => `https://bsky.app/profile/${encodeURIComponent(v)}`],
  ['P4033', 'Mastodon', fediverseUrl],
  ['P856', 'Website', safeHttpUrl],
];

/** The people among the hits, and the items their profiles name (jobs, employers, places) to label. */
export function wikidataPeople(entities: Record<string, WdEntity>, hits: WdSearchHit[], q: string) {
  const people: { entity: WdEntity; match: NameMatch }[] = [];
  const refs = new Set<string>();
  const residences = new Set<string>();
  for (const hit of hits) {
    const e = entities[hit.id];
    if (!e || e.missing !== undefined || !isHuman(e)) continue;
    const match = matchOf(q, wdLabel(e)) ?? matchOf(q, hit.match?.text);
    if (!match) continue;
    people.push({ entity: e, match });
    for (const p of ['P106', 'P108', 'P27', 'P19']) for (const id of itemIds(statements(e, p)).slice(0, 3)) refs.add(id);
    for (const id of itemIds(current(statements(e, 'P551')))) residences.add(id);
  }
  return { people, refs: [...refs].slice(0, 50), residences: [...residences].slice(0, 20) };
}

/** One notable person, with the labels of what their record names and their residence's coordinates. */
export function fromWikidata(e: WdEntity, match: NameMatch, labels: Record<string, WdEntity>, places: Record<string, WdEntity>): NameProfile {
  const label = (ids: string[], n: number) => ids.map(id => wdLabel(labels[id] ?? places[id])).filter(Boolean).slice(0, n).join(', ');
  const occupations = label(itemIds(statements(e, 'P106')), 3);
  const employer = label(itemIds(current(statements(e, 'P108'))), 2);
  const born = label(itemIds(statements(e, 'P19')), 1);
  const citizen = label(itemIds(statements(e, 'P27')), 2);

  const links: ProfileLink[] = [];
  const wiki = e.sitelinks?.enwiki?.url ?? (e.sitelinks?.enwiki ? `https://en.wikipedia.org/wiki/${encodeURIComponent(e.sitelinks.enwiki.title.replace(/ /g, '_'))}` : undefined);
  if (wiki) links.push({ label: 'Wikipedia', url: wiki });
  for (const [prop, name, toUrl] of WD_ACCOUNTS) {
    const value = strings(statements(e, prop))[0];
    const url = value ? toUrl(value) : undefined;
    if (url) links.push({ label: name, url });
  }

  // Where they live now, placed by the place's own coordinates.
  let location: string | undefined;
  let coords: { lat: number; lng: number } | undefined;
  for (const id of itemIds(current(statements(e, 'P551')))) {
    const place = places[id];
    const c = place ? statements(place, 'P625')[0]?.mainsnak.datavalue?.value as { latitude?: number; longitude?: number } | undefined : undefined;
    if (place && typeof c?.latitude === 'number' && typeof c.longitude === 'number') {
      location = wdLabel(place);
      coords = { lat: c.latitude, lng: c.longitude };
      break;
    }
  }

  return {
    source: 'wikidata', id: e.id, name: wdLabel(e) ?? e.id, url: `https://www.wikidata.org/wiki/${e.id}`,
    ...(e.descriptions?.en?.value || occupations ? { bio: e.descriptions?.en?.value || occupations } : {}),
    ...(employer ? { org: employer } : {}),
    ...(location && coords ? { location, coords, basis: 'residence' as const } : {}),
    links,
    facts: [occupations && e.descriptions?.en?.value ? occupations : '', born ? `born in ${born}` : '', citizen ? `citizen of ${citizen}` : ''].filter(Boolean),
    match,
  };
}

/* ── OpenAlex ────────────────────────────────────────────────── */

export const openAlexAuthorsUrl = (q: string) =>
  `https://api.openalex.org/authors?search=${encodeURIComponent(q.trim())}&per-page=8&select=id,display_name,orcid,works_count,cited_by_count,last_known_institutions,topics`;
export const openAlexInstitutionsUrl = (ids: string[]) =>
  `https://api.openalex.org/institutions?filter=openalex:${ids.join('|')}&select=id,display_name,geo&per-page=50`;

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
  works_count?: number;
  cited_by_count?: number;
  last_known_institutions?: { id: string; display_name: string; country_code?: string }[] | null;
  topics?: { display_name: string }[] | null;
}
export interface OpenAlexInstitution {
  id: string;
  display_name: string;
  geo?: { city?: string; region?: string; country?: string; latitude?: number; longitude?: number };
}

const shortId = (url: string) => url.split('/').pop() ?? url;

export function openAlexAuthors(body: { results?: OpenAlexAuthor[] }, q: string) {
  const authors = (body.results ?? []).flatMap(a => {
    const match = matchOf(q, a.display_name);
    return match ? [{ author: a, match }] : [];
  });
  const institutions = [...new Set(authors.map(({ author }) => author.last_known_institutions?.[0]?.id).filter((id): id is string => !!id).map(shortId))];
  return { authors, institutions };
}

export function fromOpenAlex(a: OpenAlexAuthor, match: NameMatch, institutions: Record<string, OpenAlexInstitution>): NameProfile {
  const first = a.last_known_institutions?.[0];
  const inst = first ? institutions[shortId(first.id)] : undefined;
  const g = inst?.geo;
  const located = g && typeof g.latitude === 'number' && typeof g.longitude === 'number' && g.city;
  const orcid = safeHttpUrl(a.orcid);
  return {
    source: 'openalex', id: shortId(a.id), name: a.display_name, url: a.id,
    ...(a.topics?.[0]?.display_name ? { bio: `Publishes on ${a.topics[0].display_name}` } : {}),
    ...(first ? { org: first.display_name } : {}),
    ...(located ? { location: [g.city, g.country].filter(Boolean).join(', '), coords: { lat: g.latitude!, lng: g.longitude! }, basis: 'institution' as const } : {}),
    links: orcid ? [{ label: 'ORCID', url: orcid }] : [],
    facts: [
      a.works_count !== undefined ? `${count(a.works_count)} works` : '',
      a.cited_by_count !== undefined ? `${count(a.cited_by_count)} citations` : '',
    ].filter(Boolean),
    match,
  };
}

/* ── asking each source ──────────────────────────────────────── */

/** How long one source may take before it is reported as not answering. */
export const SOURCE_TIMEOUT_MS = 12_000;
/** Wikimedia asks browser clients to say who they are. */
const WIKIMEDIA_HEADERS = { 'Api-User-Agent': 'OSIRIS name search (https://github.com/simplifaisoul/osiris)' };

type Fetch = typeof fetch;

async function getJson<T>(url: string, signal: AbortSignal, fetchImpl: Fetch, headers?: Record<string, string>): Promise<T> {
  const res = await fetchImpl(url, { signal, headers });
  if (res.status === 403 || res.status === 429) throw new Error('this connection has used up its allowance for now; try again in a few minutes');
  if (!res.ok) throw new Error(`answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Every profile one source holds under the name, best matches first. Throws when the source cannot answer. */
export async function searchSource(source: NameSource, q: string, signal: AbortSignal, fetchImpl: Fetch = fetch): Promise<NameProfile[]> {
  const sig = AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TIMEOUT_MS)]);
  const found = await (async (): Promise<NameProfile[]> => {
    switch (source) {
      case 'github': {
        const { items = [] } = await getJson<{ items?: GithubSearchItem[] }>(githubSearchUrl(q), sig, fetchImpl);
        const people = items.filter(it => it.type !== 'Organization').slice(0, GITHUB_DETAILS);
        return (await Promise.all(people.map(async it => {
          try {
            return fromGithubUser(await getJson<GithubUser>(githubUserUrl(it.login), sig, fetchImpl), q);
          } catch (e) {
            if (sig.aborted) throw e;
            return fromGithubItem(it);
          }
        }))).filter((p): p is NameProfile => !!p);
      }
      case 'stackoverflow':
        return fromStackOverflow(await getJson(stackOverflowUrl(q), sig, fetchImpl), q);
      case 'mastodon':
        return fromMastodon(await getJson(mastodonUrl(q), sig, fetchImpl), q);
      case 'bluesky':
        return fromBluesky(await getJson(blueskyUrl(q), sig, fetchImpl), q);
      case 'wikidata': {
        const { search = [] } = await getJson<{ search?: WdSearchHit[] }>(wikidataSearchUrl(q), sig, fetchImpl, WIKIMEDIA_HEADERS);
        if (!search.length) return [];
        const { entities = {} } = await getJson<{ entities?: Record<string, WdEntity> }>(
          wikidataEntitiesUrl(search.map(s => s.id), 'labels|descriptions|claims|sitelinks/urls'), sig, fetchImpl, WIKIMEDIA_HEADERS);
        const { people, refs, residences } = wikidataPeople(entities, search, q);
        if (!people.length) return [];
        const [labels, places] = await Promise.all([
          refs.length ? getJson<{ entities?: Record<string, WdEntity> }>(wikidataEntitiesUrl(refs, 'labels'), sig, fetchImpl, WIKIMEDIA_HEADERS) : { entities: {} },
          residences.length ? getJson<{ entities?: Record<string, WdEntity> }>(wikidataEntitiesUrl(residences, 'labels|claims'), sig, fetchImpl, WIKIMEDIA_HEADERS) : { entities: {} },
        ]);
        return people.map(p => fromWikidata(p.entity, p.match, labels.entities ?? {}, places.entities ?? {}));
      }
      case 'openalex': {
        const { authors, institutions } = openAlexAuthors(await getJson(openAlexAuthorsUrl(q), sig, fetchImpl), q);
        if (!authors.length) return [];
        let byId: Record<string, OpenAlexInstitution> = {};
        if (institutions.length) {
          try {
            const { results = [] } = await getJson<{ results?: OpenAlexInstitution[] }>(openAlexInstitutionsUrl(institutions), sig, fetchImpl);
            byId = Object.fromEntries(results.map(i => [shortId(i.id), i]));
          } catch (e) {
            if (sig.aborted) throw e; // without institutions the authors still stand, unplaced
          }
        }
        return authors.map(({ author, match }) => fromOpenAlex(author, match, byId));
      }
    }
  })();
  // Exact names first; otherwise the source's own order (its relevance or reputation) stands.
  return found.filter((p, i) => found.findIndex(o => o.id === p.id) === i).sort((a, b) => (a.match === b.match ? 0 : a.match === 'exact' ? -1 : 1));
}

/* ── where they might be ─────────────────────────────────────── */

const R_KM = 6371;
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Two places this close are one town (a city and its suburb, a university and downtown). */
export const SAME_PLACE_KM = 40;

/**
 * Where the profiles put the person, most agreed first: each profile's own
 * coordinates, else its location text as geocoded (null when it could not
 * be placed). Profiles placed within SAME_PLACE_KM of each other count as one
 * place.
 */
export function locationSignals(profiles: NameProfile[], geocoded: Map<string, PlacePoint | null>): LocationSignal[] {
  const signals: LocationSignal[] = [];
  for (const p of profiles) {
    const point: PlacePoint | null | undefined = p.coords && p.location
      ? { ...p.coords, place: p.location }
      : p.location ? geocoded.get(placeKey(p.location)) : undefined;
    if (!point) continue;
    const key = `${p.source}:${p.id}`;
    const near = signals.find(s => kmBetween(s, point) <= SAME_PLACE_KM);
    if (near) {
      if (!near.profiles.includes(key)) near.profiles.push(key);
      if (!near.sources.includes(p.source)) near.sources.push(p.source);
    } else {
      signals.push({ place: point.place, lat: point.lat, lng: point.lng, sources: [p.source], profiles: [key] });
    }
  }
  return signals.sort((a, b) => b.profiles.length - a.profiles.length || b.sources.length - a.sources.length);
}

/** The location texts worth geocoding: placed profiles carry coordinates already. */
export function placesToGeocode(profiles: NameProfile[], max = 8): string[] {
  const keys = new Map<string, string>();
  for (const p of profiles) {
    if (p.coords || !p.location) continue;
    const k = placeKey(p.location);
    if (!keys.has(k)) keys.set(k, p.location);
  }
  return [...keys.values()].slice(0, max);
}

/**
 * OSIRIS — alert digest.
 *
 * Turns the Live Alerts feed into threads (which theatre a report is about and
 * what kind of event it describes) and a brief built from those threads. This
 * is keyword clustering, and it is labelled as such wherever it is shown: it
 * groups reports, it does not verify them. What it adds over a raw list is
 * perspective — whether a story is being carried by channels on opposing
 * sides, or by one side only.
 *
 * Pure and dependency-free, so the panel can build threads instantly and the
 * overview route can build the same brief on the server.
 */

export type Bloc = 'western' | 'russian' | 'regional' | 'independent';

export const BLOCS: Record<Bloc, { label: string; short: string; color: string }> = {
  western: { label: 'Western / Ukrainian', short: 'WEST', color: '#4F9CFF' },
  russian: { label: 'Russian-aligned', short: 'RU-ALIGNED', color: '#A78BFA' },
  regional: { label: 'Regional (Turkey, Middle East)', short: 'REGIONAL', color: '#2DD4BF' },
  independent: { label: 'Independent aggregator', short: 'INDEPENDENT', color: '#C8C2B4' },
};

export const BLOC_ORDER: Bloc[] = ['western', 'russian', 'regional', 'independent'];

/** What a report describes — set by alertKind in alert-places. */
export type AlertKind = 'rocket' | 'event' | 'news';

/** How each kind is marked, on the map and in the feed. */
export const ALERT_KINDS: Record<AlertKind, { label: string; color: string }> = {
  rocket: { label: 'ROCKET', color: '#FF3D3D' },
  event: { label: 'EVENT', color: '#FF9500' },
  news: { label: 'NEWS', color: '#00E5FF' },
};

export interface DigestReport {
  id: string;
  title: string;
  text?: string | null;
  source: string;
  source_name?: string | null;
  bloc?: Bloc | null;
  published?: string | null;
  link?: string | null;
  flag?: string | null;
  views?: number | null;
  also_reported_by?: { source: string; source_name?: string | null; bloc?: Bloc | null }[] | null;
}

export interface DigestQuake {
  magnitude: number | null;
  place?: string | null;
  time?: number | string | null;
  tsunami?: number | null;
  url?: string | null;
}

export interface AlertThread {
  id: string;
  label: string;
  /** Distinct reports in the thread. */
  count: number;
  itemIds: string[];
  /** Channels carrying it, cross-posts included. */
  sources: string[];
  blocs: Partial<Record<Bloc, number>>;
  /**
   * 'cross'  — carried by both Western and Russian-aligned channels.
   * 'single' — two or more reports, all from one perspective.
   * 'mixed'  — anything else.
   */
  perspective: 'cross' | 'single' | 'mixed';
  topics: string[];
  breaking: number;
  latest: string | null;
  lead: { id: string; title: string; source: string; link: string | null; published: string | null } | null;
}

export interface AlertBrief {
  bottomLine: string;
  threads: AlertThread[];
  seismic: {
    count: number;
    significant: number;
    strongest: { magnitude: number; place: string; time: string | null; url: string | null; tsunami: boolean } | null;
  } | null;
  coverage: {
    reports: number;
    channels: number;
    blocs: Partial<Record<Bloc, number>>;
    newest: string | null;
    oldest: string | null;
    breaking: number;
    corroborated: number;
  };
  facts: string[];
  highlights: string[];
  method: string;
}

/* ─────────────────────────── Dictionaries ─────────────────────────── */

interface Term { id: string; label: string; terms: string[] }

/*
 * Terms match at the start of a word, so "ukrain" finds "Ukrainian". A term
 * ending in "$" must match a whole word ("mali$" is not "malicious"), and
 * terms of three letters or fewer are always whole words.
 */
export const THEATRES: Term[] = [
  { id: 'russia-ukraine', label: 'Russia–Ukraine war', terms: [
    'ukrain', 'kyiv', 'kiev', 'kharkiv', 'kharkov', 'donbas', 'donetsk', 'luhansk', 'lugansk', 'zaporizh',
    'zaporozh', 'kherson', 'crimea', 'kursk', 'belgorod', 'bryansk', 'odesa', 'odessa', 'dnipro', 'dnepr',
    'pokrovsk', 'volchansk', 'kupyansk', 'zelensk', 'kremlin', 'putin', 'moscow', 'russia', 'geran',
    'украин', 'киев', 'росси', 'кремл', 'путин', 'зеленск', 'донбас', 'харьков',
  ] },
  /* Palestinian and Lebanese newsrooms report at town level — "Jenin",
     "Khan Younis", "Nabatieh" — usually without naming the country. */
  { id: 'israel-gaza-lebanon', label: 'Israel · Gaza · Lebanon', terms: [
    'israel', 'gaza', 'idf', 'hamas', 'hezbollah', 'lebanon', 'lebanes', 'west bank', 'rafah', 'jerusalem',
    'tel aviv', 'netanyahu', 'kiryat', 'beirut', 'galilee', 'huckabee',
    'quds', 'al-aqsa', 'jenin', 'nablus', 'ramallah', 'hebron', 'tulkarem', 'bethlehem', 'khan younis',
    'deir al-balah', 'jabalia', 'beit lahia', 'beit hanoun', 'umm al-fahm', 'nuseirat',
    'unifil', 'nabatieh', 'bint jbeil', 'sidon', 'dahiyeh', 'litani', 'shebaa', 'naqoura',
    'израил', 'ливан', 'хамас', 'хезболл',
  ] },
  { id: 'iran-gulf', label: 'Iran & the Gulf', terms: [
    'iran', 'irgc', 'tehran', 'hormuz', 'persian gulf', 'saudi', 'riyadh', 'qatar', 'doha', 'uae', 'emirat',
    'bahrain', 'oman$', 'kuwait', 'jask', 'иран', 'тегеран', 'саудов',
  ] },
  { id: 'yemen-red-sea', label: 'Yemen & Red Sea', terms: [
    'yemen', 'houthi', 'ansarallah', 'ansar allah', 'red sea', 'bab al-mandab', 'bab el-mandeb', 'aden$',
    'sanaa', 'hodeidah', 'йемен', 'хусит',
  ] },
  { id: 'syria-iraq', label: 'Syria & Iraq', terms: [
    'syria', 'damascus', 'aleppo', 'idlib', 'latakia', 'iraq', 'baghdad', 'erbil', 'kurd', 'сири', 'ирак',
  ] },
  { id: 'china-pacific', label: 'China · Taiwan · Pacific', terms: [
    'china', 'chinese', 'beijing', 'taiwan', 'taipei', 'pla', 'south china sea', 'philippin', 'japan', 'tokyo',
    'xi jinping', 'китай', 'тайван', 'япони',
  ] },
  { id: 'korea', label: 'Korean Peninsula', terms: [
    'north korea', 'dprk', 'pyongyang', 'kim jong', 'south korea', 'seoul', 'кндр', 'корея$', 'кореи$', 'корее$', 'корею$',
  ] },
  { id: 'south-asia', label: 'South & Central Asia', terms: [
    'india', 'delhi', 'pakistan', 'islamabad', 'kashmir', 'afghan', 'taliban', 'kabul', 'bangladesh',
    'индия', 'индии', 'пакистан', 'афган',
  ] },
  { id: 'africa', label: 'Africa', terms: [
    'sudan', 'khartoum', 'somali', 'mogadishu', 'ethiopia', 'eritrea', 'sahel', 'mali$', 'niger$', 'burkina',
    'congo', 'libya', 'tripoli', 'nigeria', 'kenya', 'africa', 'судан', 'африк', 'сомали',
  ] },
  { id: 'americas', label: 'Latin America', terms: [
    'venezuela', 'caracas', 'maduro', 'colombia', 'farc', 'mexico', 'cartel', 'brazil', 'argentin', 'cuba',
    'haiti', 'panama', 'ecuador', 'peru$', 'венесуэл', 'аргентин', 'колумби',
  ] },
  { id: 'europe-nato', label: 'Europe & NATO', terms: [
    'nato', 'european union', 'brussels', 'germany', 'german', 'berlin', 'france', 'french', 'paris', 'poland',
    'polish', 'warsaw', 'baltic', 'finland', 'estonia', 'latvia', 'lithuania', 'romania', 'moldova', 'serbia',
    'kosovo', 'hungary', 'sweden', 'swedish', 'britain', 'british', 'london', 'нато', 'европ', 'финлянд',
    'польш', 'германи', 'балти', 'молдав',
  ] },
  { id: 'us-policy', label: 'U.S. policy', terms: [
    'trump', 'white house', 'washington', 'pentagon', 'congress', 'senate', 'vance', 'rubio', 'hegseth',
    'state department', 'joint chiefs', 'трамп', 'сша', 'вашингтон', 'конгресс',
  ] },
];

export const TOPICS: Term[] = [
  { id: 'drones', label: 'drones', terms: ['drone', 'uav', 'geran', 'shahed', 'fpv', 'lancet', 'дрон', 'бпла', 'беспилот'] },
  { id: 'strikes', label: 'strikes', terms: ['strike', 'struck', 'missile', 'shelling', 'bombard', 'airstrike', 'rocket', 'explosion', 'impact', 'удар', 'ракет', 'обстрел', 'взрыв'] },
  { id: 'air-defence', label: 'air defence', terms: ['air defense', 'air defence', 'patriot', 's-400', 'iron dome', 'intercept', 'пво', 'перехват'] },
  { id: 'ground', label: 'ground fighting', terms: ['frontline', 'front line', 'offensive', 'assault', 'captured', 'liberated', 'encircle', 'cauldron', 'troops', 'наступ', 'штурм', 'освобод'] },
  { id: 'maritime', label: 'maritime', terms: ['ship', 'tanker', 'vessel', 'navy', 'naval', 'strait', 'port$', 'ports$', 'fleet', 'shipowner', 'флот', 'танкер', 'судн'] },
  { id: 'diplomacy', label: 'diplomacy', terms: ['talks', 'negotiat', 'summit', 'ceasefire', 'truce', 'peace', 'agreement', 'diplomat', 'ambassador', 'переговор', 'перемири', 'саммит'] },
  { id: 'sanctions', label: 'sanctions', terms: ['sanction', 'embargo', 'tariff', 'санкц', 'пошлин'] },
  { id: 'nuclear', label: 'nuclear', terms: ['nuclear', 'uranium', 'enrichment', 'iaea', 'ядерн'] },
  { id: 'casualties', label: 'casualties', terms: ['killed', 'dead$', 'casualt', 'wounded', 'injured', 'fatalit', 'погиб', 'убит', 'ранен'] },
  { id: 'energy', label: 'energy', terms: ['oil$', 'gas$', 'refinery', 'pipeline', 'power plant', 'energy', 'нефт', 'энерг', 'нпз'] },
  { id: 'cyber', label: 'cyber', terms: ['cyber', 'hacker', 'hacked', 'ransomware', 'ddos', 'кибер', 'хакер'] },
  { id: 'politics', label: 'politics & unrest', terms: ['protest', 'riot', 'coup', 'election', 'parliament', 'протест', 'выбор', 'парламент'] },
];

function compile(terms: string[]): RegExp {
  const parts = terms.map(raw => {
    const whole = raw.endsWith('$') || raw.replace('$', '').length <= 3;
    const term = raw.replace(/\$$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return whole ? `${term}(?![\\p{L}\\p{N}])` : term;
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})`, 'iu');
}

const THEATRE_RX = THEATRES.map(t => ({ ...t, rx: compile(t.terms) }));
const TOPIC_RX = TOPICS.map(t => ({ ...t, rx: compile(t.terms) }));

const haystack = (r: Pick<DigestReport, 'title' | 'text'>) => `${r.title}\n${(r.text || '').slice(0, 800)}`;

export function classify(report: Pick<DigestReport, 'title' | 'text'>): { theatres: string[]; topics: string[] } {
  const text = haystack(report);
  return {
    theatres: THEATRE_RX.filter(t => t.rx.test(text)).map(t => t.id),
    topics: TOPIC_RX.filter(t => t.rx.test(text)).map(t => t.id),
  };
}

/* ─────────────────────────── Helpers ─────────────────────────── */

const toMs = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(v: string | number | null | undefined, now = Date.now()): string {
  const ms = toMs(v);
  if (ms == null) return '';
  const mins = Math.max(0, Math.floor((now - ms) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function channelsOf(r: DigestReport): { name: string; bloc: Bloc | null }[] {
  return [
    { name: r.source_name || r.source, bloc: r.bloc ?? null },
    ...(r.also_reported_by || []).map(a => ({ name: a.source_name || a.source, bloc: a.bloc ?? null })),
  ];
}

/* ─────────────────────────── Statements ─────────────────────────── */

// Abbreviations that may sit inside a speaker label without ending a sentence.
const LABEL_ABBREVIATIONS = /\b(?:U\.S|U\.K|U\.N|E\.U|Dr|Mr|Mrs|Ms|Gen|Lt|Col|Sgt|St|Jr|Sr)\./g;
const REPORTING_VERB = /\b(?:said|says|told|tells|announced|announces|reported|reports|warned|warns|added|claims|claimed|is|are|was|were|has|have|had|will|would)\b/i;

/**
 * The speaker in a "Speaker: quote" headline — "Iranian TV", "Houthi Leader
 * Abdul-Malik al-Houthi" — or null when the colon is part of a sentence.
 */
export function speakerOf(title: string): string | null {
  const at = title.indexOf(': ');
  if (at < 3 || at > 80) return null;
  const label = title.slice(0, at);
  if (/[.!?;:"“”]/.test(label.replace(LABEL_ABBREVIATIONS, ''))) return null;
  if (!/^[\p{Lu}\p{N}]/u.test(label)) return null;
  // "The ministry said this: …" is a sentence, not a label.
  if (REPORTING_VERB.test(label)) return null;
  return label;
}

/**
 * Channels such as Clash Report post a statement as a run of quotes, one post
 * each. This folds a run from one channel and one speaker into a single group,
 * so four quotes read as one statement rather than four alerts.
 *
 * Items must be sorted newest first; groups keep that order, placed at their
 * newest quote.
 */
export function groupStatements<T extends { source: string; title: string; ts: number }>(
  items: T[],
  windowMs = 2 * 3_600_000,
): { speaker: string | null; items: T[] }[] {
  const groups: { speaker: string | null; items: T[] }[] = [];
  const open = new Map<string, { speaker: string; items: T[] }>();

  for (const item of items) {
    const speaker = speakerOf(item.title);
    if (!speaker) {
      groups.push({ speaker: null, items: [item] });
      continue;
    }
    const key = `${item.source} ${speaker.toLowerCase()}`;
    const group = open.get(key);
    // Within the window of the quote before it, so a speaker quoted days apart stays separate.
    if (group && group.items[group.items.length - 1].ts - item.ts <= windowMs) {
      group.items.push(item);
      continue;
    }
    const fresh = { speaker, items: [item] };
    open.set(key, fresh);
    groups.push(fresh);
  }
  return groups;
}

/* ─────────────────────────── Threads ─────────────────────────── */

export function buildThreads(reports: DigestReport[], limit = 6): AlertThread[] {
  type Group = { reports: DigestReport[]; topics: Map<string, number> };
  const groups = new Map<string, Group>();

  for (const r of reports) {
    const { theatres, topics } = classify(r);
    for (const theatre of theatres.length ? theatres : ['other']) {
      const g: Group = groups.get(theatre) ?? { reports: [], topics: new Map() };
      g.reports.push(r);
      for (const t of topics) g.topics.set(t, (g.topics.get(t) || 0) + 1);
      groups.set(theatre, g);
    }
  }

  const threads: AlertThread[] = [];
  for (const [id, g] of groups) {
    if (id === 'other') continue;
    const def = THEATRES.find(t => t.id === id)!;
    const sources = new Set<string>();
    const blocs: Partial<Record<Bloc, number>> = {};
    for (const r of g.reports) {
      for (const c of channelsOf(r)) {
        sources.add(c.name);
        if (c.bloc) blocs[c.bloc] = (blocs[c.bloc] || 0) + 1;
      }
    }
    const blocCount = Object.keys(blocs).length;
    const perspective: AlertThread['perspective'] =
      blocs.western && blocs.russian ? 'cross' : g.reports.length >= 2 && blocCount === 1 ? 'single' : 'mixed';

    // Lead with the most widely carried report, then the newest.
    const lead = [...g.reports].sort((a, b) =>
      (b.also_reported_by?.length || 0) - (a.also_reported_by?.length || 0)
      || (toMs(b.published) ?? 0) - (toMs(a.published) ?? 0))[0];
    const latest = g.reports.reduce<number | null>((m, r) => {
      const t = toMs(r.published);
      return t != null && (m == null || t > m) ? t : m;
    }, null);

    threads.push({
      id,
      label: def.label,
      count: g.reports.length,
      itemIds: g.reports.map(r => r.id),
      sources: [...sources],
      blocs,
      perspective,
      topics: [...g.topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([t]) => TOPICS.find(x => x.id === t)!.label),
      breaking: g.reports.filter(r => r.flag).length,
      latest: latest != null ? new Date(latest).toISOString() : null,
      lead: lead ? {
        id: lead.id,
        title: lead.title,
        source: lead.source_name || lead.source,
        link: lead.link ?? null,
        published: lead.published ?? null,
      } : null,
    });
  }

  return threads
    .sort((a, b) => b.count - a.count || b.sources.length - a.sources.length || (toMs(b.latest) ?? 0) - (toMs(a.latest) ?? 0))
    .slice(0, limit);
}

/* ─────────────────────────── Brief ─────────────────────────── */

function perspectivePhrase(t: AlertThread): string {
  if (t.perspective === 'cross') return 'carried by both Western and Russian-aligned channels';
  if (t.perspective === 'single') {
    const only = Object.keys(t.blocs)[0] as Bloc | undefined;
    return only ? `only ${BLOCS[only].label} channels are carrying it` : 'a single perspective';
  }
  return 'mixed sourcing';
}

export interface BriefInput {
  news?: DigestReport[] | null;
  earthquakes?: DigestQuake[] | null;
}

export function buildAlertBrief({ news, earthquakes }: BriefInput, now = Date.now()): AlertBrief {
  const reports = (news || []).filter(r => r && r.title);
  const quakes = (earthquakes || []).filter(q => typeof q?.magnitude === 'number');
  const threads = buildThreads(reports);

  const blocs: Partial<Record<Bloc, number>> = {};
  const channels = new Set<string>();
  let newest: number | null = null;
  let oldest: number | null = null;
  for (const r of reports) {
    for (const c of channelsOf(r)) channels.add(c.name);
    if (r.bloc) blocs[r.bloc] = (blocs[r.bloc] || 0) + 1;
    const t = toMs(r.published);
    if (t != null) {
      if (newest == null || t > newest) newest = t;
      if (oldest == null || t < oldest) oldest = t;
    }
  }
  const breaking = reports.filter(r => r.flag).length;
  const corroborated = reports.filter(r => (r.also_reported_by?.length || 0) > 0).length;

  let seismic: AlertBrief['seismic'] = null;
  if (quakes.length) {
    const top = [...quakes].sort((a, b) => (b.magnitude as number) - (a.magnitude as number))[0];
    const at = toMs(top.time ?? null);
    seismic = {
      count: quakes.length,
      significant: quakes.filter(q => (q.magnitude as number) >= 5).length,
      strongest: {
        magnitude: top.magnitude as number,
        place: top.place || 'unknown location',
        time: at != null ? new Date(at).toISOString() : null,
        url: top.url ?? null,
        tsunami: Boolean(top.tsunami),
      },
    };
  }

  const facts: string[] = [];
  const highlights: string[] = [];

  if (reports.length) {
    const span = newest != null && oldest != null ? Math.max(1, Math.round((newest - oldest) / 3_600_000)) : null;
    facts.push(`${plural(reports.length, 'report')} from ${plural(channels.size, 'channel')}${span ? ` spanning ${span}h` : ''}; newest ${timeAgo(newest, now)}.`);
    if (breaking) facts.push(`${breaking} flagged as breaking by the channel that posted ${breaking === 1 ? 'it' : 'them'}.`);
    if (corroborated) facts.push(`${plural(corroborated, 'story', 'stories')} carried by more than one channel.`);
  }
  for (const t of threads) {
    const topics = t.topics.length ? ` — ${t.topics.join(', ')}` : '';
    const lead = t.lead ? ` Lead: "${t.lead.title}" (${t.lead.source}).` : '';
    facts.push(`${t.label}: ${plural(t.count, 'report')} from ${plural(t.sources.length, 'channel')}${topics}; ${perspectivePhrase(t)}.${lead}`);
  }
  for (const t of threads.slice(0, 3)) highlights.push(`${t.label} · ${t.count}`);
  if (seismic?.strongest) {
    const s = seismic.strongest;
    facts.push(`${plural(seismic.count, 'earthquake')} M2.5+ in the feed; strongest M${s.magnitude.toFixed(1)} ${s.place}${s.time ? ` (${timeAgo(s.time, now)})` : ''}${s.tsunami ? ', tsunami flag set' : ''}.`);
    if (s.magnitude >= 5) highlights.push(`M${s.magnitude.toFixed(1)} quake`);
  }
  if (breaking) highlights.push(`${breaking} breaking`);

  let bottomLine: string;
  if (!reports.length && !seismic) {
    bottomLine = 'No reports in the current feed window.';
  } else if (threads.length) {
    const [top, ...rest] = threads;
    bottomLine = `${top.label} leads the feed: ${plural(top.count, 'report')} from ${plural(top.sources.length, 'channel')}, ${perspectivePhrase(top)}.`;
    if (rest.length) bottomLine += ` Also active: ${rest.slice(0, 2).map(t => `${t.label} (${t.count})`).join(', ')}.`;
  } else if (reports.length) {
    bottomLine = `${plural(reports.length, 'report')} in the feed, none tied to a tracked theatre.`;
  } else {
    bottomLine = 'No news reports in the current feed window.';
  }
  if (seismic?.strongest && seismic.strongest.magnitude >= 5) {
    bottomLine += ` Strongest quake: M${seismic.strongest.magnitude.toFixed(1)} ${seismic.strongest.place}.`;
  }

  return {
    bottomLine,
    threads,
    seismic,
    coverage: {
      reports: reports.length,
      channels: channels.size,
      blocs,
      newest: newest != null ? new Date(newest).toISOString() : null,
      oldest: oldest != null ? new Date(oldest).toISOString() : null,
      breaking,
      corroborated,
    },
    facts,
    highlights,
    method: 'Keyword clustering by theatre and topic over the reports in the feed. Groups reports; does not verify them.',
  };
}

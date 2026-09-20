'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, MapPin, ExternalLink, Radio, Maximize2, Minimize2,
  Search, X, RefreshCw, Image as ImageIcon, Play, Eye, Repeat2, CornerDownRight, Waves, Layers,
} from 'lucide-react';
import AiOverview from './AiOverview';
import {
  ALERT_KINDS, BLOCS, BLOC_ORDER, buildThreads, groupStatements, timeAgo, type AlertKind, type Bloc, type DigestReport,
} from '@/lib/alert-digest';

interface SourceHealth { handle: string; name: string; lean: string; bloc: Bloc; count: number; latest: string | null }

/** The slice of dashboard state this panel reads. */
interface LiveAlertsData {
  news?: unknown[];
  earthquakes?: unknown[];
  weather_events?: unknown[];
  news_meta?: { sources?: SourceHealth[]; fetchedAt?: string | null };
}

/** Where to fly: `alertId` also opens that report's pin on the map. */
export interface LocateOptions { zoom?: number; alertId?: string }

interface LiveAlertsProps {
  data: LiveAlertsData;
  onLocate: (lat: number, lng: number, options?: LocateOptions) => void;
  onWatchFeed?: (url: string, name: string) => void;
  /** Re-pull /api/news. */
  onRefresh?: () => Promise<unknown> | void;
}

const ACCENT = '#FF4081';

// Built-in live feeds — verified video IDs (synced with /api/live-news)
const BUILTIN_FEEDS = [
  // ── North America ──
  { name: 'NBC News NOW', city: 'New York', country: 'US', lat: 40.759, lng: -73.980, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCeY0bbntWzzVIaj2z3QigXg&autoplay=1&mute=1', category: 'mainstream', region: 'americas' },
  { name: 'CBS News 24/7', city: 'New York', country: 'US', lat: 40.764, lng: -73.973, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC8p1vwvWtl6T73JiExfWs1g&autoplay=1&mute=1', category: 'mainstream', region: 'americas' },
  { name: 'ABC News Live', city: 'New York', country: 'US', lat: 40.763, lng: -73.979, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCBi2mrWuNuyYy4gbM6fU18Q&autoplay=1&mute=1', category: 'mainstream', region: 'americas' },
  { name: 'Bloomberg TV', city: 'New York', country: 'US', lat: 40.756, lng: -73.988, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC_vQ72b7v5n2938v9d5c80w&autoplay=1&mute=1', category: 'finance', region: 'americas' },
  { name: 'C-SPAN', city: 'Washington DC', country: 'US', lat: 38.897, lng: -77.036, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCb--64Gl51jIEVE-GLDAVTg&autoplay=1&mute=1', category: 'government', region: 'americas' },
  { name: 'CBC News', city: 'Toronto', country: 'CA', lat: 43.644, lng: -79.387, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCKy1dAqELon0zgzZPOz9SVw&autoplay=1&mute=1', category: 'mainstream', region: 'americas' },
  // ── Europe ──
  { name: 'Sky News', city: 'London', country: 'GB', lat: 51.500, lng: -0.118, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1', category: 'mainstream', region: 'europe' },
  { name: 'France 24 EN', city: 'Paris', country: 'FR', lat: 48.830, lng: 2.280, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1', category: 'mainstream', region: 'europe' },
  { name: 'DW News', city: 'Berlin', country: 'DE', lat: 52.508, lng: 13.376, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1', category: 'mainstream', region: 'europe' },
  { name: 'Euronews', city: 'Lyon', country: 'FR', lat: 45.764, lng: 4.836, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCtUbOIRGKZkW7555n6x6q6g&autoplay=1&mute=1', category: 'mainstream', region: 'europe' },
  { name: 'TRT World', city: 'Istanbul', country: 'TR', lat: 41.008, lng: 28.978, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC7fWeaHZQg1p9-4v98L1D1A&autoplay=1&mute=1', category: 'mainstream', region: 'europe' },
  { name: 'UKRINFORM', city: 'Kyiv', country: 'UA', lat: 50.450, lng: 30.523, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCaDkCK6iFHPE0lmpaYL-WxQ&autoplay=1&mute=1', category: 'conflict', region: 'europe' },
  // ── Middle East ──
  { name: 'Al Jazeera EN', city: 'Doha', country: 'QA', lat: 25.286, lng: 51.534, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1', category: 'mainstream', region: 'middleeast' },
  { name: 'Al Mayadeen', city: 'Beirut', country: 'LB', lat: 33.8886, lng: 35.4955, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCZCFHCU-2eGF7V5ciMkoPHw&autoplay=1&mute=1', category: 'conflict', region: 'middleeast' },
  { name: 'LBCI Lebanon', city: 'Beirut', country: 'LB', lat: 33.8930, lng: 35.5018, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCpE6gpKewomi17XDyPfpFjA&autoplay=1&mute=1', category: 'mainstream', region: 'middleeast' },
  // ── Asia Pacific ──
  { name: 'NHK World', city: 'Tokyo', country: 'JP', lat: 35.690, lng: 139.692, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCSPEjw8F2nQDtmUKPFNF7_A&autoplay=1&mute=1', category: 'mainstream', region: 'asia' },
  { name: 'CNA 24/7', city: 'Singapore', country: 'SG', lat: 1.290, lng: 103.852, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg&autoplay=1&mute=1', category: 'mainstream', region: 'asia' },
  { name: 'WION', city: 'New Delhi', country: 'IN', lat: 28.614, lng: 77.209, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC_gUM8rL-Lrg6O3adPW9K1g&autoplay=1&mute=1', category: 'mainstream', region: 'asia' },
  { name: 'Arirang', city: 'Seoul', country: 'KR', lat: 37.566, lng: 126.978, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCw9-5Y1CjW7Qy1Yf5q1y2-Q&autoplay=1&mute=1', category: 'mainstream', region: 'asia' },
  { name: 'ABC AU', city: 'Sydney', country: 'AU', lat: -33.868, lng: 151.209, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC5iLnYoF4Ryb63YdGD9RfWQ&autoplay=1&mute=1', category: 'mainstream', region: 'asia' },
  // ── Africa ──
  { name: 'Africanews', city: 'Pointe-Noire', country: 'CG', lat: -4.778, lng: 11.865, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC5T2fB_W0Z31T0c8yN36a8A&autoplay=1&mute=1', category: 'mainstream', region: 'africa' },
  { name: 'SABC News', city: 'Johannesburg', country: 'ZA', lat: -26.204, lng: 28.047, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UC8yH-uI81UUtEMDsowQyx1g&autoplay=1&mute=1', category: 'mainstream', region: 'africa' },
  // ── Latin America ──
  { name: 'teleSUR EN', city: 'Caracas', country: 'VE', lat: 10.491, lng: -66.902, url: 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCmuTmpLY35O3csvhyA6vrkg&autoplay=1&mute=1', category: 'mainstream', region: 'americas' },
];

const FEED_REGIONS: Record<string, string> = {
  americas: 'AMERICAS', europe: 'EUROPE', middleeast: 'MIDDLE EAST', asia: 'ASIA PACIFIC', africa: 'AFRICA',
};

type Tab = 'all' | 'news' | 'quakes' | 'feeds';

interface Carrier { source: string; source_name: string; lean: string | null; bloc: Bloc | null; link: string | null; published: string | null }

interface NewsAlert {
  kind: 'news';
  id: string;
  ts: number;
  title: string;
  summary: string;
  text: string;
  link: string | null;
  published: string;
  source: string;
  source_name: string;
  lean: string | null;
  bloc: Bloc | null;
  flag: string | null;
  alertKind: AlertKind;
  /** The place the report names, when one resolved; otherwise `anchor` is a country centroid. */
  place: { name: string; label: string; precision: 'settlement' | 'region' } | null;
  media: { kind: 'photo' | 'video'; thumb: string | null; duration: string | null; video: string | null; count: number } | null;
  forwarded_from: { name: string; url: string | null } | null;
  reply_to: string | null;
  views: number | null;
  carriers: Carrier[];
  keywords: string[];
  coords: [number, number] | null;
  anchor: string | null;
  haystack: string;
}

interface QuakeAlert {
  kind: 'quake';
  id: string;
  ts: number;
  magnitude: number;
  place: string;
  depth: number | null;
  url: string | null;
  tsunami: boolean;
  felt: number | null;
  pager: string | null;
  lat: number;
  lng: number;
}

type AlertItem = NewsAlert | QuakeAlert;

/** What the list renders: one alert, or a run of statements from one speaker. */
type Unit =
  | { kind: 'item'; key: string; ts: number; item: AlertItem }
  | { kind: 'statement'; key: string; ts: number; speaker: string; items: NewsAlert[] };

type Loose = Record<string, unknown>;
const rec = (v: unknown): Loose => (v !== null && typeof v === 'object' ? (v as Loose) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Only http(s) targets become links or image sources. */
const webUrl = (v: unknown): string | null => {
  const u = str(v);
  return u && /^https?:\/\//i.test(u) ? u : null;
};
const isBloc = (v: unknown): v is Bloc => typeof v === 'string' && Object.hasOwn(BLOCS, v);

function toNews(raw: unknown): NewsAlert | null {
  const a = rec(raw);
  const title = str(a.title);
  const published = str(a.published);
  const ts = published ? Date.parse(published) : NaN;
  if (!title || !published || !Number.isFinite(ts)) return null;

  const text = str(a.description) ?? '';
  const summary = typeof a.summary === 'string'
    ? a.summary
    : text.startsWith(title) ? text.slice(title.length).trim() : text;
  const source = str(a.source) ?? 'unknown';
  const sourceName = str(a.source_name) ?? source;
  const lean = str(a.lean);

  const carriers: Carrier[] = (Array.isArray(a.also_reported_by) ? a.also_reported_by : []).map(item => {
    const c = rec(item);
    const cSource = str(c.source) ?? 'unknown';
    return {
      source: cSource,
      source_name: str(c.source_name) ?? cSource,
      lean: str(c.lean),
      bloc: isBloc(c.bloc) ? c.bloc : null,
      link: webUrl(c.link),
      published: str(c.published),
    };
  });

  const m = rec(a.media);
  const media: NewsAlert['media'] = m.kind === 'photo' || m.kind === 'video'
    ? { kind: m.kind, thumb: webUrl(m.thumb), duration: str(m.duration), video: webUrl(m.video), count: numOrNull(m.count) ?? 1 }
    : null;
  const p = rec(a.place);
  const placeName = str(p.name);
  const place: NewsAlert['place'] = placeName && (p.precision === 'settlement' || p.precision === 'region')
    ? { name: placeName, label: str(p.label) ?? placeName, precision: p.precision }
    : null;
  const fwd = rec(a.forwarded_from);
  const fwdName = str(fwd.name);
  const coords = Array.isArray(a.coords) && typeof a.coords[0] === 'number' && typeof a.coords[1] === 'number'
    ? [a.coords[0], a.coords[1]] as [number, number]
    : null;

  return {
    kind: 'news',
    id: str(a.id) ?? str(a.link) ?? title,
    ts,
    title,
    summary,
    text,
    link: webUrl(a.link),
    published,
    source,
    source_name: sourceName,
    lean,
    bloc: isBloc(a.bloc) ? a.bloc : null,
    flag: str(a.flag),
    alertKind: a.alert_kind === 'rocket' || a.alert_kind === 'event' ? a.alert_kind : 'news',
    place,
    media,
    forwarded_from: fwdName ? { name: fwdName, url: webUrl(fwd.url) } : null,
    reply_to: webUrl(a.reply_to),
    views: numOrNull(a.views),
    carriers,
    keywords: Array.isArray(a.risk_keywords) ? a.risk_keywords.filter((k): k is string => typeof k === 'string') : [],
    coords,
    anchor: str(a.coords_anchor),
    haystack: `${title} ${summary} ${sourceName} ${lean ?? ''} ${place?.label ?? ''} ${carriers.map(c => c.source_name).join(' ')}`.toLowerCase(),
  };
}

function toQuake(raw: unknown): QuakeAlert | null {
  const eq = rec(raw);
  const magnitude = numOrNull(eq.magnitude);
  const time = numOrNull(eq.time);
  const lat = numOrNull(eq.lat);
  const lng = numOrNull(eq.lng);
  if (magnitude == null || time == null || lat == null || lng == null) return null;
  return {
    kind: 'quake',
    id: str(eq.id) ?? `${lat},${lng},${time}`,
    ts: time,
    magnitude,
    place: str(eq.place) ?? 'Unknown location',
    depth: numOrNull(eq.depth),
    url: webUrl(eq.url),
    tsunami: Boolean(eq.tsunami),
    felt: numOrNull(eq.felt),
    pager: str(eq.alert),
    lat,
    lng,
  };
}

const quakeColor = (m: number) => (m >= 6 ? '#FF3D3D' : m >= 5 ? '#FF9500' : m >= 4 ? '#FFD700' : '#9CCC65');
const PAGER_COLORS: Record<string, string> = { green: '#00E676', yellow: '#FFD700', orange: '#FF9500', red: '#FF3D3D' };
const blocColor = (b: Bloc | null) => (b ? BLOCS[b].color : '#5C5A54');

function compactCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

const BUCKETS = [
  { max: 3_600_000, label: 'LAST HOUR' },
  { max: 6 * 3_600_000, label: '1–6 HOURS AGO' },
  { max: 24 * 3_600_000, label: '6–24 HOURS AGO' },
  { max: Infinity, label: 'OLDER' },
];

function Chip({ children, color = '#8A8880', title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded px-1 py-[1px] text-[8.5px] font-mono uppercase tracking-wider"
      style={{ color, background: `${color}14`, border: `1px solid ${color}26` }}
    >
      {children}
    </span>
  );
}

function NewsCard({ item, now, open, wide, onToggle, onLocate }: {
  item: NewsAlert; now: number; open: boolean; wide?: boolean; onToggle: () => void; onLocate: (lat: number, lng: number, options?: LocateOptions) => void;
}) {
  const color = blocColor(item.bloc);
  const fresh = now - item.ts < 15 * 60_000;
  const [mediaFailed, setMediaFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const kind = ALERT_KINDS[item.alertKind];
  const video = item.media?.video && !videoFailed ? item.media.video : null;

  return (
    <article
      className={`rounded-lg border border-l-2 transition-colors ${wide ? 'xl:col-span-2' : ''} ${open ? 'bg-[#15151A] border-[#3A3A38]' : 'bg-[#111111]/70 border-[#26262A] hover:bg-[#17171B] hover:border-[#34343A]'}`}
      style={{ borderLeftColor: color }}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-2.5 pt-2 pb-2 outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono uppercase tracking-wider">
            {fresh && <span className="w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: ACCENT }} title="Posted in the last 15 minutes" />}
            <span className="font-semibold text-[#E8E6E0]">{item.source_name}</span>
            {item.lean && <span style={{ color }} title={item.bloc ? BLOCS[item.bloc].label : undefined}>{item.lean}</span>}
          </div>
          <time dateTime={item.published} title={new Date(item.ts).toLocaleString()} className="flex-shrink-0 text-[9.5px] font-mono text-[#8A8880]">
            {timeAgo(item.ts, now)}
          </time>
        </div>

        <h4 className={`mt-1 font-sans text-[12.5px] font-medium leading-snug text-[#F2EFE8] ${open ? '' : 'line-clamp-3'}`}>
          {item.flag && <span className="mr-1.5 inline-block translate-y-[-1px] rounded bg-[#FF3D3D]/15 px-1 text-[8.5px] font-mono font-bold tracking-wider text-[#FF6B6B]">BREAKING</span>}
          {item.title}
        </h4>
        {!open && item.summary && (
          <p className="mt-1 font-sans text-[11px] leading-relaxed text-[#9B978E] line-clamp-2">{item.summary}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {item.alertKind !== 'news' && <Chip color={kind.color}>{kind.label}</Chip>}
          {item.place && (
            <Chip color={kind.color} title={`Pinned to ${item.place.label} — the place the post names`}>
              <MapPin className="w-2 h-2" /> <span className="max-w-[110px] truncate normal-case">{item.place.name}</span>
            </Chip>
          )}
          {item.media && (
            <Chip title={item.media.count > 1 ? `${item.media.count} media items` : undefined}>
              {item.media.kind === 'video' ? <Play className="w-2 h-2" /> : <ImageIcon className="w-2 h-2" />}
              {item.media.kind === 'video' ? (item.media.duration || 'video') : 'photo'}
              {item.media.count > 1 && ` +${item.media.count - 1}`}
            </Chip>
          )}
          {item.carriers.length > 0 && (
            <Chip color="#00E5FF" title={`Also carried by ${item.carriers.map(c => c.source_name).join(', ')}`}>
              <Layers className="w-2 h-2" /> +{item.carriers.length} channel{item.carriers.length > 1 ? 's' : ''}
            </Chip>
          )}
          {item.forwarded_from && (
            <Chip title={`Forwarded from ${item.forwarded_from.name}`}>
              <Repeat2 className="w-2 h-2" /> <span className="max-w-[110px] truncate normal-case">{item.forwarded_from.name}</span>
            </Chip>
          )}
          {item.reply_to && <Chip><CornerDownRight className="w-2 h-2" /> reply</Chip>}
          {item.keywords.slice(0, 2).map(k => (
            <Chip key={k} color="#FF9500" title="Matched by the conflict-keyword filter — a word match, not an assessment">{k}</Chip>
          ))}
          {item.views != null && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-[8.5px] font-mono text-[#5C5A54]" title={`${item.views.toLocaleString()} views`}>
              <Eye className="w-2.5 h-2.5" /> {compactCount(item.views)}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {video && (
            <video
              src={video}
              poster={item.media?.thumb ?? undefined}
              controls
              playsInline
              preload="none"
              onError={() => setVideoFailed(true)}
              className="block max-h-64 w-full max-w-[560px] rounded-md border border-white/5 bg-black"
            />
          )}

          {!video && item.media?.thumb && !mediaFailed && (
            <a href={item.link ?? undefined} target="_blank" rel="noopener noreferrer" className="relative block max-w-[560px] overflow-hidden rounded-md border border-white/5 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN preview, loaded only on expand */}
              <img
                src={item.media.thumb}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setMediaFailed(true)}
                className="max-h-52 w-full object-cover"
              />
              {item.media.kind === 'video' && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-mono text-white">
                    <Play className="w-3 h-3" /> WATCH ON TELEGRAM{item.media.duration ? ` · ${item.media.duration}` : ''}
                  </span>
                </span>
              )}
            </a>
          )}

          {item.summary && (
            <div className="max-h-56 overflow-y-auto styled-scrollbar pr-1 font-sans text-[11.5px] leading-relaxed text-[#C9C5BC] whitespace-pre-line">
              {item.summary}
            </div>
          )}

          {item.forwarded_from && (
            <div className="text-[10px] font-mono text-[#8A8880]">
              Forwarded from{' '}
              {item.forwarded_from.url
                ? <a href={item.forwarded_from.url} target="_blank" rel="noopener noreferrer" className="text-[var(--cyan-primary)] hover:underline">{item.forwarded_from.name}</a>
                : <span className="text-[#C9C5BC]">{item.forwarded_from.name}</span>}
            </div>
          )}

          {item.carriers.length > 0 && (
            <div>
              <div className="mb-1 text-[8.5px] font-mono tracking-widest text-[#5C5A54]">ALSO CARRIED BY</div>
              <ul className="space-y-0.5">
                {item.carriers.map(c => (
                  <li key={c.source} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: blocColor(c.bloc) }} />
                    <span className="text-[#C9C5BC]">{c.source_name}</span>
                    {c.lean && <span className="truncate uppercase text-[8.5px]" style={{ color: blocColor(c.bloc) }}>{c.lean}</span>}
                    <span className="ml-auto flex-shrink-0 text-[#5C5A54]">{c.published ? timeAgo(c.published, now) : ''}</span>
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-[var(--cyan-primary)] hover:opacity-70" aria-label={`Open ${c.source_name} post`}>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-[var(--cyan-primary)]/30 bg-[var(--cyan-primary)]/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)]/20"
              >
                <ExternalLink className="w-2.5 h-2.5" /> OPEN POST
              </a>
            )}
            {item.reply_to && (
              <a
                href={item.reply_to}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[#9B978E] hover:bg-white/5"
              >
                <CornerDownRight className="w-2.5 h-2.5" /> IN REPLY TO
              </a>
            )}
            {item.coords && item.place && (
              <button
                type="button"
                onClick={() => onLocate(item.coords![0], item.coords![1], { zoom: item.place!.precision === 'settlement' ? 10 : 7, alertId: item.id })}
                title={`${item.place.label} — the place the post names. Town-level: a post names a place, not an exact spot.`}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[9.5px] font-mono tracking-wider hover:bg-white/5"
                style={{ color: kind.color, borderColor: `${kind.color}55` }}
              >
                <MapPin className="w-2.5 h-2.5" /> {item.place.name.toUpperCase()}
              </button>
            )}
            {item.coords && !item.place && (
              <button
                type="button"
                onClick={() => onLocate(item.coords![0], item.coords![1])}
                title={item.anchor ? `Approximate: the centroid for "${item.anchor}", not the event location` : 'Approximate location'}
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[#9B978E] hover:bg-white/5"
              >
                <MapPin className="w-2.5 h-2.5" /> ≈ {(item.anchor || 'region').toUpperCase()}
              </button>
            )}
            {item.bloc && (
              <span className="ml-auto text-[8.5px] font-mono tracking-wider" style={{ color }}>{BLOCS[item.bloc].label.toUpperCase()}</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/** The quote after the speaker label; in full, the whole post body after it. */
function quoteOf(item: NewsAlert, speaker: string, full: boolean): string {
  if (!full) return item.title.slice(speaker.length + 2);
  const colon = item.text.search(/:\s/);
  return colon >= 0
    ? item.text.slice(colon + 1).trim()
    : [item.title.slice(speaker.length + 2), item.summary].filter(Boolean).join('\n');
}

function StatementCard({ speaker, items, now, open, wide, onToggle }: {
  speaker: string; items: NewsAlert[]; now: number; open: boolean; wide?: boolean; onToggle: () => void;
}) {
  const lead = items[0];
  const color = blocColor(lead.bloc);
  const fresh = now - lead.ts < 15 * 60_000;
  return (
    <article
      className={`rounded-lg border border-l-2 transition-colors ${wide ? 'xl:col-span-2' : ''} ${open ? 'bg-[#15151A] border-[#3A3A38]' : 'bg-[#111111]/70 border-[#26262A] hover:bg-[#17171B] hover:border-[#34343A]'}`}
      style={{ borderLeftColor: color }}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-2.5 pt-2 pb-1.5 outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono uppercase tracking-wider">
            {fresh && <span className="w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: ACCENT }} title="Posted in the last 15 minutes" />}
            <span className="font-semibold text-[#E8E6E0]">{lead.source_name}</span>
            {lead.lean && <span style={{ color }}>{lead.lean}</span>}
          </div>
          <time dateTime={lead.published} title={new Date(lead.ts).toLocaleString()} className="flex-shrink-0 text-[9.5px] font-mono text-[#8A8880]">
            {timeAgo(lead.ts, now)}
          </time>
        </div>
        <h4 className="mt-1 font-sans text-[12.5px] font-medium leading-snug text-[#F2EFE8]">
          {items.some(i => i.flag) && <span className="mr-1.5 inline-block translate-y-[-1px] rounded bg-[#FF3D3D]/15 px-1 text-[8.5px] font-mono font-bold tracking-wider text-[#FF6B6B]">BREAKING</span>}
          {speaker}
          <span className="ml-1.5 whitespace-nowrap text-[9px] font-mono font-normal tracking-wider text-[#8A8880]">{items.length} STATEMENTS</span>
        </h4>
      </button>
      <ol className="px-2.5 pb-2 space-y-1">
        {items.map(item => (
          <li key={item.id} className="flex items-start gap-1.5 border-l border-white/10 pl-2">
            <p className={`flex-1 min-w-0 font-sans text-[11px] leading-relaxed text-[#C9C5BC] whitespace-pre-line ${open ? '' : 'line-clamp-2'}`}>
              {quoteOf(item, speaker, open)}
            </p>
            <span className="flex flex-shrink-0 items-center gap-1 pt-0.5 text-[9px] font-mono text-[#5C5A54]">
              {item.media && (item.media.kind === 'video' ? <Play className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />)}
              {timeAgo(item.ts, now).replace(' ago', '')}
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[var(--cyan-primary)] hover:opacity-70" aria-label="Open this statement on Telegram">
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function QuakeCard({ item, now, onLocate }: { item: QuakeAlert; now: number; onLocate: (lat: number, lng: number) => void }) {
  const color = quakeColor(item.magnitude);
  return (
    <article className="rounded-lg border border-[#26262A] border-l-2 bg-[#111111]/70 hover:bg-[#17171B] transition-colors" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <button
          type="button"
          onClick={() => onLocate(item.lat, item.lng)}
          title="Show on map"
          className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-md font-mono transition-transform hover:scale-105"
          style={{ background: `${color}1c`, border: `1px solid ${color}55`, color }}
        >
          <span className="text-[13px] font-bold leading-none">{item.magnitude.toFixed(1)}</span>
          <span className="mt-0.5 text-[7px] tracking-widest">MAG</span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-sans text-[12px] leading-snug text-[#F2EFE8] line-clamp-2">{item.place}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono text-[#8A8880]">
            <time dateTime={new Date(item.ts).toISOString()} title={new Date(item.ts).toLocaleString()}>{timeAgo(item.ts, now)}</time>
            {item.depth != null && <span>· {Math.round(item.depth)} km deep</span>}
            {item.felt ? <span>· felt by {item.felt.toLocaleString()}</span> : null}
          </div>
          {(item.tsunami || item.pager) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tsunami && <Chip color="#448AFF"><Waves className="w-2 h-2" /> tsunami flag</Chip>}
              {item.pager && <Chip color={PAGER_COLORS[item.pager] || '#8A8880'} title="USGS PAGER impact alert level">PAGER {item.pager}</Chip>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button type="button" onClick={() => onLocate(item.lat, item.lng)} className="p-1 rounded text-[#8A8880] hover:text-white hover:bg-white/10" aria-label="Show on map">
            <MapPin className="w-3 h-3" />
          </button>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-[var(--cyan-primary)] hover:bg-white/10" aria-label="Open USGS event page">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function LiveAlerts({ data, onLocate, onWatchFeed, onRefresh }: LiveAlertsProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [bloc, setBloc] = useState<Bloc | 'all'>('all');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Relative times ("12m ago") stay current while the panel is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  const news = useMemo(
    () => (data.news ?? []).map(toNews).filter((n): n is NewsAlert => n !== null).sort((a, b) => b.ts - a.ts),
    [data.news],
  );
  const quakes = useMemo(
    () => (data.earthquakes ?? []).map(toQuake).filter((q): q is QuakeAlert => q !== null).sort((a, b) => b.ts - a.ts).slice(0, 15),
    [data.earthquakes],
  );

  const digestReports = useMemo<DigestReport[]>(() => news.map(n => ({
    id: n.id,
    title: n.title,
    text: n.text.slice(0, 600),
    source: n.source,
    source_name: n.source_name,
    bloc: n.bloc,
    published: n.published,
    link: n.link,
    flag: n.flag,
    views: n.views,
    also_reported_by: n.carriers.map(c => ({ source: c.source, source_name: c.source_name, bloc: c.bloc })),
  })), [news]);

  const threads = useMemo(() => buildThreads(digestReports, 8), [digestReports]);
  const activeThread = threads.find(t => t.id === threadId) ?? null;

  // Only what the overview reads — not the whole dashboard state.
  const overviewPayload = useMemo(() => ({
    news: digestReports,
    earthquakes: quakes.map(q => ({ magnitude: q.magnitude, place: q.place, time: q.ts, tsunami: q.tsunami ? 1 : 0, url: q.url })),
    weather_events: (data.weather_events ?? []).slice(0, 100).map(w => ({ type: str(rec(w).type), severity: str(rec(w).severity) })),
  }), [digestReports, quakes, data.weather_events]);
  const signature = `${news[0]?.id ?? ''}|${news.length}|${quakes[0]?.id ?? ''}`;

  const q = query.trim().toLowerCase();

  // A new tab or filter starts at the top, not wherever the last list was scrolled to.
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [tab, bloc, threadId, q]);
  const newsFiltersActive = Boolean(activeThread) || bloc !== 'all';
  const threadIds = useMemo(() => (activeThread ? new Set(activeThread.itemIds) : null), [activeThread]);

  const visibleNews = useMemo(() => news.filter(n =>
    (!threadIds || threadIds.has(n.id))
    && (bloc === 'all' || n.bloc === bloc || n.carriers.some(c => c.bloc === bloc))
    && (!q || n.haystack.includes(q)),
  ), [news, threadIds, bloc, q]);
  const visibleQuakes = useMemo(() => quakes.filter(k => !q || k.place.toLowerCase().includes(q)), [quakes, q]);
  const visibleFeeds = useMemo(() => BUILTIN_FEEDS.filter(f => !q || `${f.name} ${f.city} ${f.country} ${f.category}`.toLowerCase().includes(q)), [q]);

  const list: AlertItem[] = useMemo(() => {
    if (tab === 'news') return visibleNews;
    if (tab === 'quakes') return visibleQuakes;
    if (tab === 'feeds') return [];
    // Thread and perspective filters are about news; quakes step aside while they apply.
    return [...visibleNews, ...(newsFiltersActive ? [] : visibleQuakes)].sort((a, b) => b.ts - a.ts);
  }, [tab, visibleNews, visibleQuakes, newsFiltersActive]);

  const units = useMemo<Unit[]>(() => groupStatements(list.map(item => ({
    item,
    // Quakes never form statements; a unique source keeps them apart.
    source: item.kind === 'news' ? item.source : `quake:${item.id}`,
    title: item.kind === 'news' ? item.title : '',
    ts: item.ts,
  }))).map((g): Unit => (g.speaker && g.items.length > 1
    ? { kind: 'statement', key: `stmt:${g.items[0].item.id}`, ts: g.items[0].ts, speaker: g.speaker, items: g.items.map(x => x.item as NewsAlert) }
    : { kind: 'item', key: g.items[0].item.id, ts: g.items[0].ts, item: g.items[0].item })), [list]);

  const grouped = useMemo(() => {
    const out: { label: string; units: Unit[] }[] = [];
    for (const unit of units) {
      const label = BUCKETS.find(b => now - unit.ts < b.max)!.label;
      const last = out[out.length - 1];
      if (last?.label === label) last.units.push(unit);
      else out.push({ label, units: [unit] });
    }
    return out;
  }, [units, now]);

  const sources: SourceHealth[] = data.news_meta?.sources ?? [];
  const liveSources = sources.filter(s => s.count > 0).length;
  const fetchedAt: string | null = data.news_meta?.fetchedAt ?? null;
  const breakingCount = news.filter(n => n.flag).length;
  const loading = data.news === undefined;
  const filtersActive = newsFiltersActive || Boolean(q);

  const clearFilters = useCallback(() => { setQuery(''); setBloc('all'); setThreadId(null); }, []);

  const refresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); setNow(Date.now()); }
  }, [onRefresh, refreshing]);

  const selectThread = useCallback((id: string | null) => {
    setThreadId(id);
    if (id && tab !== 'all' && tab !== 'news') setTab('news');
  }, [tab]);

  const locate = useCallback((lat: number, lng: number, options?: LocateOptions) => {
    if (maximized) setMaximized(false);
    onLocate(lat, lng, options);
  }, [maximized, onLocate]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'ALL', count: news.length + quakes.length },
    { id: 'news', label: 'NEWS', count: news.length },
    { id: 'quakes', label: 'QUAKES', count: quakes.length },
    { id: 'feeds', label: 'FEEDS', count: BUILTIN_FEEDS.length },
  ];

  const sourcesTitle = sources.length
    ? sources.map(s => `${s.name}: ${s.count ? `${s.count} posts, latest ${timeAgo(s.latest, now)}` : s.latest ? `quiet — nothing in 72h (last post ${timeAgo(s.latest, now)})` : 'unreachable'}`).join('\n')
    : 'Waiting for the source report';

  const controls = (
    <div className={`space-y-2 ${maximized ? '' : 'px-3 pt-2'}`}>
      {/* Tabs */}
      <div className="flex gap-1" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded px-1.5 py-1 text-[10px] font-mono tracking-wider transition-all ${tab === t.id ? 'bg-[var(--cyan-primary)]/15 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/45' : 'text-[#8A8880] border border-transparent hover:text-[#E8E6E0] hover:bg-[#2A2A28]'}`}
          >
            {t.label} <span className="opacity-60 tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search and perspective */}
      <div className="flex gap-1.5">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Search alerts</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#5C5A54]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'feeds' ? 'Search feeds…' : 'Search headlines, places, channels…'}
            className="w-full rounded border border-[#2A2A28] bg-black/30 py-1 pl-6 pr-6 text-[11px] text-[#E8E6E0] placeholder:text-[#5C5A54] outline-none focus:border-[var(--cyan-primary)]/50"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#5C5A54] hover:text-white" aria-label="Clear search">
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
        {tab !== 'quakes' && tab !== 'feeds' && (
          <select
            value={bloc}
            onChange={e => setBloc(e.target.value as Bloc | 'all')}
            aria-label="Filter by perspective"
            className="w-[108px] flex-shrink-0 rounded border border-[#2A2A28] bg-[#0c0c10] px-1 py-1 text-[10px] font-mono text-[#C9C5BC] outline-none focus:border-[var(--cyan-primary)]/50"
            style={bloc !== 'all' ? { color: BLOCS[bloc].color, borderColor: `${BLOCS[bloc].color}66` } : undefined}
          >
            <option value="all">All sides</option>
            {BLOC_ORDER.map(b => <option key={b} value={b}>{BLOCS[b].label}</option>)}
          </select>
        )}
      </div>

      {/* One-click AI overview of the current alert picture */}
      {tab !== 'feeds' && (
        <div className={maximized ? '' : 'max-h-[240px] overflow-y-auto styled-scrollbar pr-0.5'}>
          <AiOverview
            mode="alerts"
            payload={overviewPayload}
            signature={signature}
            accent={ACCENT}
            activeThreadId={threadId}
            onThreadSelect={selectThread}
            onOpenChange={setOverviewOpen}
          />
        </div>
      )}

      {/* Threads: the same clustering the overview uses, available without a click */}
      {tab !== 'quakes' && tab !== 'feeds' && threads.length > 0 && !overviewOpen && (
        <div className={maximized ? 'flex flex-wrap gap-1' : '-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 styled-scrollbar'}>
          {threads.map(t => {
            const active = t.id === threadId;
            const dot = t.perspective === 'cross' ? '#00E676' : t.perspective === 'single' ? '#FF9500' : '#5C5A54';
            return (
              <button
                key={t.id}
                onClick={() => selectThread(active ? null : t.id)}
                aria-pressed={active}
                title={`${t.count} reports from ${t.sources.length} channels${t.topics.length ? ` — ${t.topics.join(', ')}` : ''}`}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-mono whitespace-nowrap transition-colors ${active ? 'text-white' : 'text-[#9B978E] hover:text-[#E8E6E0] border-[#2A2A28] hover:border-[#3A3A38]'}`}
                style={active ? { borderColor: `${ACCENT}99`, background: `${ACCENT}22` } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
                {t.label}
                <span className="tabular-nums opacity-60">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {filtersActive && tab !== 'feeds' && (
        <div className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2 py-1 text-[9.5px] font-mono text-[#8A8880]">
          <span className="truncate">
            SHOWING {list.length}{activeThread ? ` · ${activeThread.label.toUpperCase()}` : ''}{bloc !== 'all' ? ` · ${BLOCS[bloc].short}` : ''}
          </span>
          <button onClick={clearFilters} className="flex-shrink-0 text-[var(--cyan-primary)] hover:underline">CLEAR</button>
        </div>
      )}
    </div>
  );

  const listBody = tab === 'feeds' ? (
    <div className="space-y-3">
      {Object.entries(FEED_REGIONS).map(([region, label]) => {
        const feeds = visibleFeeds.filter(f => f.region === region);
        if (!feeds.length) return null;
        return (
          <section key={region}>
            <h5 className="mb-1 text-[8.5px] font-mono tracking-widest text-[#5C5A54]">{label}</h5>
            <div className="space-y-1">
              {feeds.map(f => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => { locate(f.lat, f.lng); onWatchFeed?.(f.url, f.name); }}
                  className="flex w-full items-center gap-2 rounded-md border border-[#26262A] bg-[#111111]/70 px-2.5 py-1.5 text-left transition-colors hover:bg-[#17171B] hover:border-[#34343A]"
                >
                  <Radio className="h-3 w-3 flex-shrink-0 text-[#FF4081]" />
                  <span className="flex-1 min-w-0 truncate text-[11.5px] text-[#E8E6E0]">{f.name}</span>
                  <span className="flex-shrink-0 text-[9px] font-mono uppercase text-[#8A8880]">{f.city}, {f.country}</span>
                  <span className="flex-shrink-0 rounded bg-white/5 px-1 text-[8px] font-mono uppercase text-[#5C5A54]">{f.category}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {visibleFeeds.length === 0 && <EmptyState text="No feeds match" onClear={clearFilters} />}
    </div>
  ) : loading ? (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-[74px] animate-pulse rounded-lg border border-[#26262A] bg-[#111111]/60" />
      ))}
      <div className="text-center text-[10px] font-mono text-[#5C5A54]">READING CHANNELS…</div>
    </div>
  ) : list.length === 0 ? (
    filtersActive
      ? <EmptyState text="No alerts match these filters" onClear={clearFilters} />
      : <EmptyState text={tab === 'quakes' ? 'No recent earthquakes' : 'No reports — the sources did not answer'} onRetry={onRefresh ? refresh : undefined} />
  ) : (
    <div className="space-y-3">
      {grouped.map(group => (
        <section key={group.label}>
          <h5 className={`sticky top-0 z-10 -mx-1 mb-1.5 px-1 py-1 text-[8.5px] font-mono tracking-widest text-[#5C5A54] backdrop-blur-md ${maximized ? 'bg-[#0a0a09]/90' : 'bg-[#08080c]/80'}`}>
            {group.label} <span className="opacity-60">· {group.units.reduce((n, u) => n + (u.kind === 'statement' ? u.items.length : 1), 0)}</span>
          </h5>
          <div className={maximized ? 'grid gap-2 grid-cols-1 xl:grid-cols-2 items-start' : 'space-y-2'}>
            {group.units.map(unit => {
              if (unit.kind === 'statement') {
                return (
                  <StatementCard
                    key={unit.key}
                    speaker={unit.speaker}
                    items={unit.items}
                    now={now}
                    open={openId === unit.key}
                    wide={maximized && openId === unit.key}
                    onToggle={() => setOpenId(openId === unit.key ? null : unit.key)}
                  />
                );
              }
              const item = unit.item;
              return item.kind === 'news' ? (
                <NewsCard
                  key={item.id}
                  item={item}
                  now={now}
                  open={openId === item.id}
                  wide={maximized && openId === item.id}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  onLocate={locate}
                />
              ) : (
                <QuakeCard key={item.id} item={item} now={now} onLocate={locate} />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const content = (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      role={maximized ? 'dialog' : undefined}
      aria-label={maximized ? 'Live alerts' : undefined}
      className={`glass-panel flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 ${maximized ? 'fixed inset-4 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : 'shrink-0 h-[560px] max-h-[82vh] resize-y'}`}
    >
      {/* Header: title and controls, then a status line */}
      <div className="flex-shrink-0 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="flex min-w-0 items-center gap-2 outline-none"
          >
            <Radio className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }} />
            <span className="hud-text whitespace-nowrap text-[11px] text-[var(--text-primary)]">LIVE ALERTS</span>
            <span className="gotham-tag gotham-tag--high" style={{ fontSize: '9px', padding: '1px 5px' }}>{news.length + quakes.length}</span>
          </button>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {onRefresh && (
              <button onClick={refresh} disabled={refreshing} className="p-1 rounded hover:bg-white/10 transition-colors" title="Refresh (channels are re-read every 3 minutes)" aria-label="Refresh alerts">
                <RefreshCw className={`w-3 h-3 text-[var(--text-muted)] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={() => { setMaximized(!maximized); if (!expanded) setExpanded(true); }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title={maximized ? 'Restore (Esc)' : 'Maximize'}
              aria-label={maximized ? 'Restore panel' : 'Maximize panel'}
            >
              {maximized ? <Minimize2 className="w-3 h-3 text-[var(--text-muted)]" /> : <Maximize2 className="w-3 h-3 text-[var(--text-muted)]" />}
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-white/10 transition-colors" aria-label={expanded ? 'Collapse panel' : 'Expand panel'}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[9px] font-mono tracking-wider text-[#5C5A54] whitespace-nowrap overflow-hidden">
          {sources.length > 0 ? (
            <span
              title={sourcesTitle}
              className="flex items-center gap-1 cursor-help"
              style={{ color: liveSources === sources.length ? '#00E676' : '#FF9500' }}
            >
              <span className="h-1.5 w-1.5 rounded-full animate-osiris-pulse" style={{ background: 'currentColor' }} />
              {liveSources}/{sources.length} SOURCES LIVE
            </span>
          ) : (
            <span>CONNECTING…</span>
          )}
          {fetchedAt && <span title={`Feed fetched ${new Date(fetchedAt).toLocaleString()}`}>· UPDATED {timeAgo(fetchedAt, now).toUpperCase()}</span>}
          {breakingCount > 0 && <span className="text-[#FF6B6B]">· {breakingCount} BREAKING</span>}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex flex-1 min-h-0 ${maximized ? 'flex-row bg-[#0a0a09]' : 'flex-col bg-transparent'}`}
          >
            {maximized ? (
              <>
                <aside className="w-[380px] flex-shrink-0 overflow-y-auto styled-scrollbar border-r border-[#2A2A28] bg-[#0e0e0d] p-4">
                  {controls}
                </aside>
                <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto styled-scrollbar px-6 pt-2 pb-6">{listBody}</div>
              </>
            ) : (
              <>
                <div className="flex-shrink-0 pb-2 border-b border-[rgba(255,255,255,0.05)]">{controls}</div>
                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto styled-scrollbar px-3 pb-3">{listBody}</div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // Maximising takes a click, so this branch never runs during server render.
  if (maximized && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}

function EmptyState({ text, onClear, onRetry }: { text: string; onClear?: () => void; onRetry?: () => void }) {
  return (
    <div className="py-6 text-center">
      <div className="text-[11px] font-mono text-[var(--text-muted)]">{text}</div>
      {onClear && <button onClick={onClear} className="mt-2 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline">CLEAR FILTERS</button>}
      {onRetry && <button onClick={onRetry} className="mt-2 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline">TRY AGAIN</button>}
    </div>
  );
}

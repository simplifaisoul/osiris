'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  AtSign, Mail, Phone, Search, Square, ArrowRight, LayoutGrid, Table2, Download, ExternalLink,
  Fingerprint, ShieldAlert, CheckCircle, AlertTriangle, XCircle, Server, Loader2, History,
} from 'lucide-react';
import {
  validateQuery, platformCategory, splitNdjson, toCsv, pushHistory, parseHistory, relativeTime,
  CATEGORIES, HISTORY_KEY, type SearchType, type Category, type HistoryEntry,
} from '@/lib/fingerprint';

/**
 * RECON → FINGERPRINT. One box, three lookups (username / email / phone),
 * results streamed in as each source answers, then filtered, viewed as cards
 * or a table, and exported. Every source is public: the username sweep reads
 * public profile URLs, email and phone reuse the breach, DNS and numbering-plan
 * lookups the toolkit already runs.
 */

const ACCENT = '#3B82F6';

type RowStatus = 'verifying' | 'verified' | 'unverifiable' | 'blocked' | 'error';

interface Row {
  site: string;
  url: string;
  category: Category;
  status: RowStatus;
  http_status?: number;
  reason?: string;
  ms: number;
}

const STATUS_META: Record<RowStatus, { label: string; color: string; rank: number }> = {
  verified: { label: 'FOUND', color: '#00E676', rank: 0 },
  verifying: { label: 'VERIFYING', color: ACCENT, rank: 0 },
  unverifiable: { label: 'UNSURE', color: '#FF9500', rank: 1 },
  blocked: { label: 'BLOCKED', color: '#E040FB', rank: 2 },
  error: { label: 'NO ANSWER', color: '#FF3D3D', rank: 3 },
};

const CATEGORY_COLOR: Record<Category, string> = {
  Social: '#3B82F6', Developer: '#87CEEB', Gaming: '#00E676', Video: '#FF3D3D', Music: '#E040FB',
  Creative: '#FF9500', Writing: '#FFD700', Lifestyle: '#00BCD4', Commerce: '#F7931A',
  Forums: '#B388FF', Other: '#8A8A85',
};

const MODES: { id: SearchType; label: string; icon: typeof AtSign; placeholder: string; covers: string }[] = [
  { id: 'username', label: 'Username', icon: AtSign, placeholder: 'Enter a username…', covers: 'Every public site in the Sherlock database, checked in parallel' },
  { id: 'email', label: 'Email', icon: Mail, placeholder: 'Enter an email address…', covers: 'Known breach corpora and the address’s mail domain' },
  { id: 'phone', label: 'Phone', icon: Phone, placeholder: 'Enter a phone number (+1 …)', covers: 'Numbering plan: validity, region, format and line type' },
];

/** Union of the fields read from /api/osint/leaks, /dns and /phone. */
interface SourceData {
  breaches?: string[];
  data_exposed?: string[];
  domain?: string;
  summary?: { mail_servers?: string[] };
  valid?: boolean;
  number?: string;
  international?: string;
  national?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  line_type?: string;
}

interface Source {
  id: string;
  label: string;
  via: string;
  state: 'pending' | 'done' | 'error';
  data?: SourceData;
  error?: string;
}

type Phase = 'idle' | 'running' | 'done' | 'stopped' | 'error';

/** One site verdict as the stream carries it (a sherlock SiteResult). */
interface Verdict {
  site: string;
  url: string;
  http_status?: number;
  reason?: string;
  ms?: number;
}

function toRow(r: Verdict, status: RowStatus): Row {
  return {
    site: r.site,
    url: r.url,
    category: platformCategory(r.site),
    status,
    http_status: r.http_status,
    reason: r.reason,
    ms: r.ms ?? 0,
  };
}

function download(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const bareUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/* ── state ───────────────────────────────────────────────────── */

/**
 * Held by OsintPanel rather than the view: the expanded mode renders through
 * a portal, so the view remounts on every toggle and would otherwise drop a
 * sweep that is still streaming.
 */
export function useFingerprintSearch() {
  const [mode, setMode] = useState<SearchType>('username');
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [searched, setSearched] = useState<{ type: SearchType; query: string } | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [progress, setProgress] = useState({ checked: 0, total: 0, ruledOut: 0 });
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showUnsure, setShowUnsure] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return parseHistory(window.localStorage.getItem(HISTORY_KEY));
    } catch {
      return []; // storage blocked
    }
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [phase]);

  const record = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      const next = pushHistory(prev, entry);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked — the log just won't persist */
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* storage blocked */
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(async (type: SearchType, raw: string) => {
    const q = raw.trim();
    const invalid = validateQuery(type, q);
    if (invalid) {
      setError(invalid);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t0 = Date.now();
    setMode(type);
    setQuery(q);
    setError('');
    setSearched({ type, query: q });
    setRows({});
    setSources([]);
    setCategories([]);
    setProgress({ checked: 0, total: 0, ruledOut: 0 });
    setStartedAt(t0);
    setNow(t0);
    setFinishedAt(0);
    setPhase('running');

    const finish = (status: HistoryEntry['status'], count: number) => {
      setFinishedAt(Date.now());
      setPhase(status === 'done' ? 'done' : status === 'stopped' ? 'stopped' : 'error');
      record({ query: q, type, count, status, at: t0 });
    };

    const getJson = async (url: string) => {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    };
    const settle = (id: string, patch: Partial<Source>) =>
      setSources(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
    const message = (e: unknown) => (e instanceof Error ? e.message : 'Lookup failed');

    /* ── username: streamed sweep ── */
    if (type === 'username') {
      let hits = 0;
      try {
        const res = await fetch(`/api/osint/fingerprint?username=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Search failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitNdjson(buffer);
          buffer = rest;

          // One state update per network chunk, not per line — a chunk can
          // carry dozens of verdicts.
          let checked = 0;
          let ruledOut = 0;
          let total = 0;
          const added: Record<string, Row> = {};
          for (const line of lines) {
            const ev = JSON.parse(line);
            if (ev.type === 'result') {
              checked++;
              total = ev.total;
              if (ev.status === 'not_found') ruledOut++;
              else if (ev.status === 'found') { added[ev.site] = toRow(ev, 'verifying'); hits++; }
              else if (ev.status === 'blocked') added[ev.site] = toRow(ev, 'blocked');
              else if (ev.status === 'error') added[ev.site] = toRow(ev, 'error');
            } else if (ev.type === 'done') {
              // Calibrated verdicts replace the provisional ones.
              const next: Record<string, Row> = {};
              for (const r of ev.found || []) next[r.site] = toRow(r, 'verified');
              for (const r of ev.inconclusive || []) next[r.site] = toRow(r, 'unverifiable');
              for (const r of ev.blocked || []) next[r.site] = toRow(r, 'blocked');
              for (const r of ev.errors || []) next[r.site] = toRow(r, 'error');
              setRows(next);
              setProgress({ checked: ev.checked, total: ev.checked, ruledOut: ev.not_found_count ?? 0 });
              completed = true;
              finish('done', (ev.found || []).length);
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Search failed');
            }
          }
          if (checked) {
            setProgress(p => ({ checked: p.checked + checked, total, ruledOut: p.ruledOut + ruledOut }));
          }
          if (Object.keys(added).length) setRows(p => ({ ...p, ...added }));
        }
        if (!completed) throw new Error('The connection closed before the sweep finished.');
      } catch (e) {
        if (ctrl.signal.aborted) {
          finish('stopped', hits);
        } else {
          setError(message(e));
          finish('fail', hits);
        }
      }
      return;
    }

    /* ── email: breach corpus + mail domain, in parallel ── */
    if (type === 'email') {
      const domain = q.split('@').pop() || '';
      setSources([
        { id: 'breach', label: 'Breach exposure', via: 'XposedOrNot', state: 'pending' },
        { id: 'mail', label: 'Mail domain', via: `DNS · ${domain}`, state: 'pending' },
      ]);
      const outcomes = await Promise.allSettled([
        getJson(`/api/osint/leaks?email=${encodeURIComponent(q)}`).then(
          d => { settle('breach', { state: 'done', data: d }); return (d.breaches || []).length as number; },
          e => { settle('breach', { state: 'error', error: message(e) }); throw e; },
        ),
        getJson(`/api/osint/dns?domain=${encodeURIComponent(domain)}`).then(
          d => { settle('mail', { state: 'done', data: d }); return 0; },
          e => { settle('mail', { state: 'error', error: message(e) }); throw e; },
        ),
      ]);
      if (ctrl.signal.aborted) return finish('stopped', 0);
      const breaches = outcomes[0].status === 'fulfilled' ? outcomes[0].value : 0;
      if (outcomes.every(o => o.status === 'rejected')) {
        setError('Every source failed to answer.');
        return finish('fail', 0);
      }
      return finish('done', breaches);
    }

    /* ── phone: numbering-plan intelligence ── */
    setSources([{ id: 'number', label: 'Number intelligence', via: 'libphonenumber', state: 'pending' }]);
    try {
      const d = await getJson(`/api/osint/phone?number=${encodeURIComponent(q)}`);
      settle('number', { state: 'done', data: d });
      finish('done', d.valid ? 1 : 0);
    } catch (e) {
      if (ctrl.signal.aborted) return finish('stopped', 0);
      settle('number', { state: 'error', error: message(e) });
      setError(message(e));
      finish('fail', 0);
    }
  }, [record]);

  return {
    mode, setMode, query, setQuery, phase, error, setError, searched, rows, progress,
    elapsedMs: startedAt ? (phase === 'running' ? now : finishedAt) - startedAt : 0,
    sources, view, setView, categories, setCategories, showUnsure, setShowUnsure,
    showBlocked, setShowBlocked, history, clearHistory, run, stop,
  };
}

export type FingerprintState = ReturnType<typeof useFingerprintSearch>;

/* ── view ────────────────────────────────────────────────────── */

/** `live` is false once a search has ended — a hit still awaiting
 *  calibration then never got it, and must not look like work in progress. */
function StatusPill({ status, live }: { status: RowStatus; live: boolean }) {
  const m = STATUS_META[status];
  const pending = status === 'verifying';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider whitespace-nowrap"
      style={{ color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}40` }}
    >
      {pending && live && <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: m.color }} />}
      {pending && !live ? 'UNVERIFIED' : m.label}
    </span>
  );
}

function PlatformTile({ row, size = 28 }: { row: Row; size?: number }) {
  const color = CATEGORY_COLOR[row.category];
  return (
    <span
      className="flex items-center justify-center rounded-md font-mono font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45, color, background: `${color}1f`, border: `1px solid ${color}40` }}
    >
      {row.site.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function Toggle({ on, label, count, color, onClick }: { on: boolean; label: string; count: number; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition-colors"
      style={{ color: on ? color : 'var(--text-muted)', background: on ? `${color}14` : 'transparent', border: `1px solid ${on ? `${color}55` : 'var(--border-primary)'}` }}
    >
      <span className="w-2.5 h-2.5 rounded-sm border flex items-center justify-center" style={{ borderColor: on ? color : 'var(--text-muted)' }}>
        {on && <span className="w-1.5 h-1.5 rounded-[1px]" style={{ background: color }} />}
      </span>
      {label}
      <span className="opacity-70">{count}</span>
    </button>
  );
}

export default function FingerprintSearch({ fp, isFullScreen }: { fp: FingerprintState; isFullScreen: boolean }) {
  const running = fp.phase === 'running';
  const modeDef = MODES.find(m => m.id === fp.mode) ?? MODES[0];
  const shownType = fp.searched?.type;

  const all = useMemo(() => Object.values(fp.rows), [fp.rows]);
  const counts = useMemo(() => {
    const c = { hits: 0, unsure: 0, blocked: 0 };
    for (const r of all) {
      if (r.status === 'verified' || r.status === 'verifying') c.hits++;
      else if (r.status === 'unverifiable') c.unsure++;
      else c.blocked++;
    }
    return c;
  }, [all]);

  // Status toggles first, so category counts describe what can be shown.
  const statusFiltered = useMemo(() => all.filter(r =>
    r.status === 'verified' || r.status === 'verifying' ||
    (fp.showUnsure && r.status === 'unverifiable') ||
    (fp.showBlocked && (r.status === 'blocked' || r.status === 'error'))
  ), [all, fp.showUnsure, fp.showBlocked]);

  const categoryCounts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of statusFiltered) m.set(r.category, (m.get(r.category) || 0) + 1);
    return CATEGORIES.filter(c => m.has(c)).map(c => ({ category: c, count: m.get(c)! }));
  }, [statusFiltered]);

  // Stable sort: hits keep the order they streamed in.
  const visible = useMemo(() => statusFiltered
    .filter(r => fp.categories.length === 0 || fp.categories.includes(r.category))
    .sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank),
  [statusFiltered, fp.categories]);

  const toggleCategory = (c: Category) =>
    fp.setCategories(fp.categories.includes(c) ? fp.categories.filter(x => x !== c) : [...fp.categories, c]);

  const exportRows = (format: 'csv' | 'json') => {
    if (!fp.searched) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const base = `fingerprint-${fp.searched.query.replace(/[^A-Za-z0-9._-]/g, '_')}-${stamp}`;
    const rows = Object.values(fp.rows);
    if (format === 'json') {
      download(`${base}.json`, JSON.stringify({
        query: fp.searched.query,
        type: fp.searched.type,
        exported_at: new Date().toISOString(),
        platforms_checked: fp.progress.checked,
        results: rows.map(r => ({ platform: r.site, category: r.category, status: STATUS_META[r.status].label.toLowerCase(), url: r.url, http_status: r.http_status ?? null, response_ms: r.ms, note: r.reason ?? null })),
      }, null, 2), 'application/json');
    } else {
      download(`${base}.csv`, toCsv(
        ['platform', 'category', 'status', 'url', 'http_status', 'response_ms'],
        rows.map(r => [r.site, r.category, STATUS_META[r.status].label.toLowerCase(), r.url, r.http_status ?? '', r.ms]),
      ), 'text/csv');
    }
  };

  /* ── search bar ── */
  const searchBar = (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center">
        <div className="inline-flex p-0.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/60" role="tablist" aria-label="Search type">
          {MODES.map(m => {
            const active = fp.mode === m.id;
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={active}
                disabled={running}
                onClick={() => { fp.setMode(m.id); fp.setError(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold tracking-wider transition-colors disabled:cursor-not-allowed"
                style={{ background: active ? ACCENT : 'transparent', color: active ? '#fff' : 'var(--text-muted)', opacity: running && !active ? 0.4 : 1 }}
              >
                <m.icon className="w-3 h-3" />
                {m.label.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); if (running) fp.stop(); else fp.run(fp.mode, fp.query); }}
        className="flex gap-1.5"
      >
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            value={fp.query}
            onChange={e => fp.setQuery(e.target.value)}
            placeholder={modeDef.placeholder}
            disabled={running}
            inputMode={fp.mode === 'phone' ? 'tel' : fp.mode === 'email' ? 'email' : 'text'}
            autoComplete="off"
            spellCheck={false}
            aria-label={modeDef.placeholder}
            className="w-full bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg pl-8 pr-3 py-2.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:outline-none transition-colors disabled:opacity-60"
            style={{ borderColor: fp.query ? `${ACCENT}66` : undefined }}
          />
        </div>
        <button
          type="submit"
          disabled={!running && !fp.query.trim()}
          className="px-3.5 py-2 rounded-lg text-[10px] font-mono font-bold tracking-wider disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 min-w-[88px]"
          style={running
            ? { background: '#FF3D3D1f', border: '1px solid #FF3D3D55', color: '#FF3D3D' }
            : { background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff' }}
        >
          {running ? <><Square className="w-3 h-3" />STOP</> : <><ArrowRight className="w-3.5 h-3.5" />SEARCH</>}
        </button>
      </form>

      <div className="text-[9px] font-mono text-[var(--text-muted)] text-center leading-relaxed">
        Public sources only · {modeDef.covers.toLowerCase()}
      </div>

      {fp.error && (
        <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] font-mono text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{fp.error}
        </div>
      )}
    </div>
  );

  /* ── history log ── */
  const historyLog = fp.history.length > 0 && !running && (
    <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/40">
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest text-[var(--text-secondary)]">
          <History className="w-3 h-3" /> SEARCH HISTORY
        </span>
        <span className="flex items-center gap-2 text-[9px] font-mono text-[var(--text-muted)]">
          {fp.history.length} searches
          <button onClick={fp.clearHistory} className="hover:text-white underline-offset-2 hover:underline">clear</button>
        </span>
      </div>
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-[9px] tracking-wider text-[var(--text-muted)]">
            <th className="text-left font-normal px-3 py-1.5">QUERY</th>
            <th className="text-left font-normal px-1 py-1.5">TYPE</th>
            <th className="text-right font-normal px-1 py-1.5">#</th>
            <th className="text-left font-normal px-2 py-1.5">STATUS</th>
            {isFullScreen && <th className="text-right font-normal px-3 py-1.5">TIME</th>}
          </tr>
        </thead>
        <tbody>
          {fp.history.slice(0, isFullScreen ? 12 : 6).map((h, i) => (
            <tr
              key={`${h.at}-${i}`}
              onClick={() => fp.run(h.type, h.query)}
              className="border-t border-[var(--border-primary)]/50 cursor-pointer hover:bg-[var(--hover-accent)]"
              title={`Search ${h.query} again`}
            >
              <td className="px-3 py-1.5 text-[var(--text-primary)] truncate max-w-[140px]">{h.query}</td>
              <td className="px-1 py-1.5 text-[var(--text-muted)]">{h.type}</td>
              <td className="px-1 py-1.5 text-right text-[var(--text-secondary)]">{h.count}</td>
              <td className="px-2 py-1.5">
                <span style={{ color: h.status === 'done' ? '#00E676' : h.status === 'stopped' ? '#FF9500' : '#FF3D3D' }}>
                  {h.status === 'fail' ? 'fail' : h.status}
                </span>
              </td>
              {isFullScreen && <td className="px-3 py-1.5 text-right text-[var(--text-muted)]">{relativeTime(h.at)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /* ── idle ── */
  if (!fp.searched) {
    return (
      <div className="flex flex-col gap-3">
        {searchBar}
        <div className="flex flex-col items-center text-center py-6">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 border border-[var(--border-primary)] bg-[var(--bg-primary)]/60">
            <Fingerprint className="w-4 h-4" style={{ color: ACCENT }} />
          </span>
          <div className="text-[11px] font-mono font-bold tracking-wider text-[var(--text-primary)]">SEARCH PUBLIC PROFILES</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">Enter a query above to get started.</div>
        </div>
        {historyLog}
      </div>
    );
  }

  /* ── username results ── */
  const usernameResults = shownType === 'username' && (() => {
    const pct = fp.progress.total ? Math.round((fp.progress.checked / fp.progress.total) * 100) : 0;
    const seconds = (fp.elapsedMs / 1000).toFixed(1);

    const filters = (
      <div className={isFullScreen ? 'flex flex-col gap-3' : 'flex flex-col gap-1.5'}>
        {isFullScreen && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--text-secondary)]">FILTERS</span>
            {fp.categories.length > 0 && (
              <button onClick={() => fp.setCategories([])} className="text-[9px] font-mono text-[var(--text-muted)] hover:text-white hover:underline">Clear all</button>
            )}
          </div>
        )}
        <div className={isFullScreen ? 'flex flex-col gap-0.5' : 'flex flex-wrap gap-1'}>
          {categoryCounts.length === 0 && (
            <span className="text-[10px] font-mono text-[var(--text-muted)]">{running ? 'Waiting for hits…' : 'Nothing to filter.'}</span>
          )}
          {categoryCounts.map(({ category, count }) => {
            const on = fp.categories.includes(category);
            const color = CATEGORY_COLOR[category];
            return isFullScreen ? (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className="flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-mono transition-colors hover:bg-[var(--hover-accent)]"
                style={{ background: on ? `${color}14` : undefined, color: on ? color : 'var(--text-secondary)' }}
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm" style={{ background: color, opacity: on ? 1 : 0.5 }} />
                  {category}
                </span>
                <span className="text-[var(--text-muted)]">{count}</span>
              </button>
            ) : (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
                style={{ color: on ? color : 'var(--text-muted)', background: on ? `${color}1a` : 'transparent', border: `1px solid ${on ? `${color}55` : 'var(--border-primary)'}` }}
              >
                {category} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <div className={isFullScreen ? 'flex flex-col gap-1 pt-2 border-t border-[var(--border-primary)]' : 'flex flex-wrap gap-1'}>
          {isFullScreen && <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] mb-0.5">ALSO SHOW</span>}
          <Toggle on={fp.showUnsure} label="Unsure" count={counts.unsure} color={STATUS_META.unverifiable.color} onClick={() => fp.setShowUnsure(!fp.showUnsure)} />
          <Toggle on={fp.showBlocked} label="Blocked / no answer" count={counts.blocked} color={STATUS_META.blocked.color} onClick={() => fp.setShowBlocked(!fp.showBlocked)} />
        </div>
      </div>
    );

    const cards = (
      <div className={`grid gap-2 ${isFullScreen ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
        {visible.map(r => (
          <a
            key={r.site}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-1.5 p-2.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 hover:border-[#3B82F6]/50 hover:bg-[#3B82F6]/5 transition-colors min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <PlatformTile row={r} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono font-bold tracking-wider text-[var(--text-primary)] truncate">{r.site.toUpperCase()}</div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">@{fp.searched!.query}</div>
              </div>
              <StatusPill status={r.status} live={running} />
            </div>
            <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-[var(--text-muted)] min-w-0">
              <span className="truncate group-hover:text-[var(--text-secondary)]">{bareUrl(r.url)}</span>
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </div>
            {(r.status === 'blocked' || r.status === 'error' || r.status === 'unverifiable') && r.reason && (
              <div className="text-[9px] font-mono leading-snug" style={{ color: STATUS_META[r.status].color }}>{r.reason}</div>
            )}
          </a>
        ))}
      </div>
    );

    const table = (
      <div className="rounded-lg border border-[var(--border-primary)] overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="text-[9px] tracking-wider text-[var(--text-muted)] bg-[var(--bg-primary)]/40">
              <th className="text-left font-normal px-2.5 py-1.5">PLATFORM</th>
              <th className="text-left font-normal px-2 py-1.5">PROFILE</th>
              {isFullScreen && <th className="text-left font-normal px-2 py-1.5">CATEGORY</th>}
              <th className="text-left font-normal px-2 py-1.5">STATUS</th>
              {isFullScreen && <th className="text-right font-normal px-2.5 py-1.5">RESPONSE</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.site} className="border-t border-[var(--border-primary)]/50 hover:bg-[var(--hover-accent)]">
                <td className="px-2.5 py-1.5">
                  <span className="flex items-center gap-2">
                    <PlatformTile row={r} size={18} />
                    <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">{r.site}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 max-w-[240px]">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-white hover:underline min-w-0">
                    <span className="truncate">{bareUrl(r.url)}</span>
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                  </a>
                </td>
                {isFullScreen && <td className="px-2 py-1.5" style={{ color: CATEGORY_COLOR[r.category] }}>{r.category}</td>}
                <td className="px-2 py-1.5"><StatusPill status={r.status} live={running} /></td>
                {isFullScreen && <td className="px-2.5 py-1.5 text-right text-[var(--text-muted)]">{r.ms} ms</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    return (
      <>
        {/* Live progress */}
        <div className="p-3 rounded-lg border bg-[var(--bg-primary)]/40" style={{ borderColor: `${ACCENT}40` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest" style={{ color: ACCENT }}>
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : fp.phase === 'done' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {running
                ? (fp.progress.total && fp.progress.checked >= fp.progress.total ? 'VERIFYING HITS…' : 'CHECKING PLATFORMS')
                : fp.phase === 'done' ? 'SEARCH COMPLETE' : fp.phase === 'stopped' ? 'SEARCH STOPPED' : 'SEARCH FAILED'}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
              {fp.progress.checked}{fp.progress.total ? ` / ${fp.progress.total}` : ''} platforms
            </span>
          </div>
          <div className="w-full h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${fp.phase === 'done' ? 100 : pct}%`, background: ACCENT }} />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            {[
              { label: 'HITS', value: counts.hits, color: '#00E676' },
              { label: 'RULED OUT', value: fp.progress.ruledOut, color: 'var(--text-secondary)' },
              { label: 'BLOCKED', value: counts.blocked, color: STATUS_META.blocked.color },
              { label: 'ELAPSED', value: `${seconds}s`, color: 'var(--text-secondary)' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[8px] font-mono tracking-widest text-[var(--text-muted)]">{s.label}</div>
                <div className="text-[12px] font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">
            {visible.length} <span className="text-[var(--text-muted)] font-normal">{visible.length === 1 ? 'result' : 'results'}</span>
          </span>
          <div className="flex items-center gap-1">
            <div className="flex p-0.5 rounded-md border border-[var(--border-primary)]" role="tablist" aria-label="Result view">
              {([['cards', LayoutGrid, 'Cards'], ['table', Table2, 'Table']] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={fp.view === id}
                  onClick={() => fp.setView(id)}
                  title={`${label} view`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
                  style={{ background: fp.view === id ? `${ACCENT}26` : 'transparent', color: fp.view === id ? ACCENT : 'var(--text-muted)' }}
                >
                  <Icon className="w-3 h-3" />{label.toUpperCase()}
                </button>
              ))}
            </div>
            {(['csv', 'json'] as const).map(f => (
              <button
                key={f}
                onClick={() => exportRows(f)}
                disabled={all.length === 0}
                title={`Export ${f.toUpperCase()}`}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md border border-[var(--border-primary)] text-[9px] font-mono text-[var(--text-muted)] hover:text-white disabled:opacity-30"
              >
                <Download className="w-3 h-3" />{f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {isFullScreen ? (
          <div className="flex gap-4 items-start">
            <aside className="w-[190px] flex-shrink-0 p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 sticky top-0">
              {filters}
            </aside>
            <div className="flex-1 min-w-0">
              {visible.length > 0 ? (fp.view === 'cards' ? cards : table) : (
                <div className="py-10 text-center text-[10px] font-mono text-[var(--text-muted)]">
                  {running ? 'Hits appear here the moment a platform confirms them.' : 'No profiles match these filters.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {filters}
            {visible.length > 0 ? (fp.view === 'cards' ? cards : table) : (
              <div className="py-6 text-center text-[10px] font-mono text-[var(--text-muted)]">
                {running ? 'Hits appear here the moment a platform confirms them.' : 'No profiles match these filters.'}
              </div>
            )}
          </>
        )}

        <div className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
          Hits show as VERIFYING while the sweep runs, then each is re-tested against two random control handles — sites that
          also “find” those move to UNSURE. Blocked sites refused the request, so nothing was learned either way.
          Source: Sherlock Project site database (MIT).
        </div>
      </>
    );
  })();

  /* ── email / phone results ── */
  const sourceResults = shownType !== 'username' && (
    <>
      <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        {fp.sources.map(s => (
          <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b last:border-b-0 border-[var(--border-primary)]/60 text-[10px] font-mono">
            <span className="flex items-center gap-2 min-w-0">
              {s.state === 'pending' ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: ACCENT }} />
                : s.state === 'done' ? <CheckCircle className="w-3 h-3 text-[#00E676]" />
                : <XCircle className="w-3 h-3 text-[#FF3D3D]" />}
              <span className="text-[var(--text-primary)] font-bold">{s.label}</span>
              <span className="text-[var(--text-muted)] truncate">{s.via}</span>
            </span>
            <span className="flex-shrink-0" style={{ color: s.state === 'done' ? '#00E676' : s.state === 'error' ? '#FF3D3D' : ACCENT }}>
              {s.state === 'pending' ? 'CHECKING' : s.state === 'done' ? 'DONE' : 'FAILED'}
            </span>
          </div>
        ))}
      </div>

      <div className={`grid gap-2 ${isFullScreen ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {fp.sources.filter(s => s.state !== 'pending').map(s => (
          <div key={s.id} className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {s.id === 'breach' ? <ShieldAlert className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                : s.id === 'mail' ? <Server className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                : <Phone className="w-3.5 h-3.5" style={{ color: ACCENT }} />}
              <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--text-primary)]">{s.label.toUpperCase()}</span>
            </div>

            {s.state === 'error' && <div className="text-[10px] font-mono text-[#FF3D3D]">{s.error}</div>}

            {s.state === 'done' && s.id === 'breach' && (() => {
              const breaches: string[] = s.data?.breaches || [];
              const exposed: string[] = s.data?.data_exposed || [];
              return breaches.length === 0 ? (
                <div className="text-[10px] font-mono text-[#00E676]">Not found in any known breach corpus.</div>
              ) : (
                <>
                  <div className="text-[10px] font-mono text-[#FF9500] mb-1.5">Appears in {breaches.length} known {breaches.length === 1 ? 'breach' : 'breaches'}</div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {/* The corpus can list one breach name twice. */}
                    {breaches.map((b, i) => (
                      <span key={`${b}-${i}`} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FF9500]/10 text-[#FF9500] border border-[#FF9500]/25">{b}</span>
                    ))}
                  </div>
                  {exposed.length > 0 && (
                    <>
                      <div className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] mb-1">DATA CLASSES EXPOSED</div>
                      <div className="flex flex-wrap gap-1">
                        {exposed.map(d => (
                          <span key={d} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]">{d}</span>
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}

            {s.state === 'done' && s.id === 'mail' && (() => {
              const records: string[] = s.data?.summary?.mail_servers || [];
              // RFC 7505 null MX ("0 .") is a domain declaring it takes no mail.
              const mx = records.filter(m => !/^0\s+\.?$/.test(m.trim()));
              return (
                <>
                  <div className="text-[10px] font-mono text-[var(--text-secondary)] mb-1.5 break-all">{s.data?.domain}</div>
                  {mx.length === 0 ? (
                    <div className="text-[10px] font-mono text-[#FF9500]">
                      {records.length ? 'Null MX — this domain declares it accepts no mail.' : 'No MX records — this domain cannot receive mail.'}
                    </div>
                  ) : (
                    <>
                      <div className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] mb-1">MAIL SERVERS ({mx.length})</div>
                      {mx.slice(0, 6).map(m => (
                        <div key={m} className="text-[10px] font-mono text-[var(--text-primary)] break-all leading-snug">{m}</div>
                      ))}
                    </>
                  )}
                </>
              );
            })()}

            {s.state === 'done' && s.id === 'number' && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[
                  ['Status', s.data?.valid ? 'VALID NUMBER' : 'NOT A VALID NUMBER', s.data?.valid ? '#00E676' : '#FF3D3D'],
                  ['E.164', s.data?.number],
                  ['International', s.data?.international],
                  ['National', s.data?.national],
                  ['Country code', s.data?.country_code],
                  ['Region', s.data?.region_code && s.data.region_code !== 'Unknown' ? `${s.data.region} (${s.data.region_code})` : s.data?.region],
                  ['Line type', s.data?.line_type?.replace(/_/g, ' ')],
                ].filter(([, v]) => v).map(([k, v, c]) => (
                  <div key={k} className="min-w-0">
                    <div className="text-[8px] font-mono tracking-widest text-[var(--text-muted)]">{String(k).toUpperCase()}</div>
                    <div className="text-[10px] font-mono break-all" style={{ color: c || 'var(--text-primary)' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      {searchBar}
      {fp.searched && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
          <span className="px-1.5 py-0.5 rounded text-[9px] tracking-wider" style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}40` }}>
            {fp.searched.type.toUpperCase()}
          </span>
          <span className="text-[var(--text-primary)] truncate">{fp.searched.query}</span>
        </div>
      )}
      {usernameResults}
      {sourceResults}
      {historyLog}
    </div>
  );
}

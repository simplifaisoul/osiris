'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Activity, ExternalLink, RefreshCw } from 'lucide-react';
import { relativeTime } from '@/lib/relativeTime';
import type { SourceDisplayStatus, SourceHealthEntry } from '@/lib/sources/healthReport';

interface HealthResponse {
  sources: SourceHealthEntry[];
  total: number;
  summary: Record<SourceDisplayStatus, number>;
  timestamp: string;
}

const STATUS_COLOR: Record<SourceDisplayStatus, string> = {
  ok: 'var(--alert-green)',
  degraded: 'var(--gold-primary)',
  down: 'var(--alert-red)',
  unknown: 'var(--text-muted)',
  disabled: 'var(--text-muted)',
};

const CATEGORY_LABELS: Record<string, string> = {
  aviation: 'AVIATION', maritime: 'MARITIME', seismic: 'SEISMIC', fire: 'FIRE',
  weather: 'WEATHER', space: 'SPACE', cyber: 'CYBER', conflict: 'CONFLICT',
  disaster: 'DISASTER', news: 'NEWS', markets: 'MARKETS', osint: 'OSINT', other: 'OTHER',
};

const POLL_MS = 45_000;

function StatusDot({ status }: { status: SourceDisplayStatus }) {
  const color = STATUS_COLOR[status];
  const pulse = status === 'ok' || status === 'degraded';
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${pulse ? 'animate-osiris-pulse' : ''}`}
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

function groupByCategory(sources: SourceHealthEntry[]): [string, SourceHealthEntry[]][] {
  const groups = new Map<string, SourceHealthEntry[]>();
  for (const s of sources) {
    const list = groups.get(s.category) ?? [];
    list.push(s);
    groups.set(s.category, list);
  }
  return Array.from(groups.entries());
}

export default function SourceHealthPanel() {
  const [report, setReport] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(() => Date.parse('2026-01-01T00:00:00.000Z'));

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sources/health', { cache: 'no-store' });
      if (res.ok) {
        setReport(await res.json());
        setNow(Date.now());
      }
    } catch { /* keep last-known report on transient failure */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Polling an external system (the health API); every setState in load()
    // runs after `await`, so there's no synchronous cascading render. `now` is
    // refreshed inside load() alongside the report so freshness labels and the
    // data they describe always update together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const summary = report?.summary;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="glass-panel p-3 pointer-events-auto max-h-[70vh] flex flex-col"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">SOURCES</span>
          {report && (
            <span className="text-[8px] font-mono text-[var(--text-muted)] tabular-nums">{report.total}</span>
          )}
        </div>
        <button onClick={load} className="text-[var(--text-muted)] hover:text-[var(--gold-primary)] transition-colors" title="Refresh">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {summary && (
        <div className="flex items-center gap-2.5 mb-2 pb-2 border-b border-[var(--border-secondary)] text-[8px] font-mono tabular-nums">
          {(['ok', 'degraded', 'down', 'unknown', 'disabled'] as SourceDisplayStatus[])
            .filter((k) => summary[k] > 0)
            .map((k) => (
              <div key={k} className="flex items-center gap-1">
                <StatusDot status={k} />
                <span className="text-[var(--text-secondary)]">{summary[k]}</span>
                <span className="text-[var(--text-muted)] uppercase">{k}</span>
              </div>
            ))}
        </div>
      )}

      <div className="overflow-y-auto styled-scrollbar flex flex-col gap-3">
        {loading && !report && (
          <div className="text-center py-6 text-[8px] font-mono text-[var(--text-muted)] tracking-widest">
            POLLING SOURCE MESH...
          </div>
        )}
        {report && groupByCategory(report.sources).map(([category, sources]) => (
          <div key={category}>
            <div className="hud-label mb-1">{CATEGORY_LABELS[category] ?? category.toUpperCase()}</div>
            <div className="flex flex-col gap-0.5">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-[var(--hover-accent)] transition-colors group">
                  <StatusDot status={s.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-[var(--text-primary)] truncate">{s.name}</div>
                    <div className="text-[8px] font-mono text-[var(--text-muted)]">
                      {s.status === 'disabled'
                        ? 'requires API key'
                        : `${s.attribution} · ${relativeTime(s.lastSuccessAt, now)}`}
                    </div>
                  </div>
                  <a
                    href={s.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--gold-primary)] transition-all flex-shrink-0"
                    title={`Open ${s.attribution}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

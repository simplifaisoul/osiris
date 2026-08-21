'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { Loader2, Sparkles, Bug, Flame, ShieldAlert, ExternalLink } from 'lucide-react';

/**
 * OSIRIS — Daily chain-threat brief.
 *
 * Rendered inside the RECON toolkit's CHAIN INTEL tab. Self-contained: owns
 * its own fetch, window selector, unattended refresh and AI overview, so the
 * host panel only has to drop it in.
 */

const ACCENT = '#F7931A';
const AUTO_REFRESH_MS = 15 * 60_000;

const SEV_COLOR: Record<string, string> = {
  critical: '#FF1744', high: '#FF3D3D', medium: '#FF9500', low: '#FFD700', info: '#00E676',
};

const usd = (n: number | null | undefined) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};
const shortAddr = (a: string) => (a && a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);

function Head({ title, icon: Icon, color, right }: { title: string; icon: any; color: string; right?: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-[11px] font-mono font-bold tracking-widest" style={{ color }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
      {right && <span className="text-[10px] font-mono text-[var(--text-muted)]">{right}</span>}
    </div>
  );
}

function ChainBriefInner() {
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [ai, setAi] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const briefRef = useRef(brief);
  briefRef.current = brief;

  const load = useCallback(async (d: number, force = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/chain/daily?days=${d}${force ? '&refresh=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Brief unavailable');
      setBrief(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load brief');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  // Keeps a long-open panel from going stale; the upstreams move daily at most.
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(days, true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [days, load]);

  const runAi = useCallback(async () => {
    if (!briefRef.current) return;
    setAiLoading(true);
    setAi('');
    try {
      const res = await fetch('/api/ai/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chain', payload: { brief: briefRef.current } }),
      });
      const d = await res.json();
      setAi(d.overview || d.error || 'No overview returned.');
    } catch {
      setAi('AI overview unavailable.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const t = brief?.totals;

  return (
    <div>
      {/* window selector */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[10px] font-mono text-[var(--text-muted)] mr-1">WINDOW</span>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors"
            style={{
              color: days === d ? ACCENT : 'var(--text-muted)',
              background: days === d ? `${ACCENT}1a` : 'transparent',
              border: `1px solid ${days === d ? `${ACCENT}55` : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {d}D
          </button>
        ))}
        <button
          onClick={() => load(days, true)}
          className="ml-auto text-[9px] font-mono text-[var(--text-muted)] hover:text-white/70 transition-colors"
          title="Refresh now"
        >
          {lastRefresh ? lastRefresh.toLocaleTimeString() : 'refresh'}
        </button>
      </div>

      {loading && !brief && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: ACCENT }} />
          <span className="text-[11px] font-mono text-[var(--text-muted)]">Building brief…</span>
        </div>
      )}
      {error && <div className="text-[11px] font-mono text-red-400 py-2">{error}</div>}

      {brief && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {[
              { label: 'LOSSES', value: usd(t?.exploit_losses_usd), color: '#FF3D3D' },
              { label: 'EXPLOITS', value: t?.exploit_count ?? 0, color: '#FF9500' },
              { label: 'CVES', value: t?.cve_count ?? 0, color: '#E040FB' },
            ].map(c => (
              <div key={c.label} className="rounded border px-2 py-1.5" style={{ borderColor: `${c.color}33`, background: `${c.color}0d` }}>
                <div className="text-[9px] font-mono text-[var(--text-muted)]">{c.label}</div>
                <div className="text-[11px] font-mono font-bold" style={{ color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <button
            onClick={runAi}
            disabled={aiLoading}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-colors disabled:opacity-50"
            style={{ color: ACCENT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}44` }}
          >
            {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI OVERVIEW
          </button>
          {ai && (
            <div className="mt-1.5 px-2 py-1.5 rounded border text-[11px] font-mono leading-relaxed whitespace-pre-wrap"
              style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}0a`, color: 'var(--text-secondary)' }}>
              {ai}
            </div>
          )}

          <Head title="ON-CHAIN EXPLOITS" icon={Flame} color="#FF3D3D" right={`${brief.exploits.length} shown`} />
          {brief.exploits.length === 0 && (
            <div className="text-[10px] font-mono text-[var(--text-muted)] py-1">None in window.</div>
          )}
          {brief.exploits.slice(0, 12).map((e: any, i: number) => (
            <div key={i} className="py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-[#FF3D3D] flex-1 break-all">{e.name}</span>
                <span className="text-[11px] font-mono font-bold text-[#FF9500]">{usd(e.amount_usd)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                <span>{String(e.date).slice(0, 10)}</span>
                <span className="text-[var(--text-secondary)]">{e.chain}</span>
                {e.bridge_hack && <span className="text-[#E040FB]">BRIDGE</span>}
              </div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)] leading-snug">{e.technique}</div>
            </div>
          ))}

          <Head title="CRYPTO CVES" icon={Bug} color="#E040FB" right={`${brief.cves.length} shown`} />
          {brief.cves.length === 0 && (
            <div className="text-[10px] font-mono text-[var(--text-muted)] py-1">None published in window.</div>
          )}
          {brief.cves.slice(0, 10).map((c: any, i: number) => {
            const col = SEV_COLOR[String(c.severity || '').toLowerCase()] || '#9B978E';
            return (
              <div key={i} className="py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
                <div className="flex items-center gap-2">
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-mono font-bold hover:underline flex items-center gap-1" style={{ color: col }}>
                    {c.id} <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  {c.cvss != null && <span className="text-[10px] font-mono font-bold" style={{ color: col }}>CVSS {c.cvss}</span>}
                  <span className="ml-auto text-[9px] font-mono text-[var(--text-muted)]">{String(c.published).slice(0, 10)}</span>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-secondary)] leading-snug mt-0.5">
                  {String(c.description).slice(0, 180)}{c.description.length > 180 ? '…' : ''}
                </div>
              </div>
            );
          })}

          <Head title="OFAC DESIGNATED WALLETS" icon={ShieldAlert} color="#FFD700" right={`${t?.sanctioned_wallet_count ?? 0} total`} />
          {brief.sanctioned_wallets.slice(0, 10).map((w: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 text-[10px] font-mono">
              <span className="w-[34px] font-bold text-[#FFD700]">{w.asset}</span>
              <span className="flex-1 break-all text-[var(--text-primary)]">{shortAddr(w.address)}</span>
              <span className="text-[var(--text-muted)]">{w.first_seen ? String(w.first_seen).slice(0, 10) : ''}</span>
            </div>
          ))}

          {brief.degraded?.length > 0 && (
            <div className="mt-3 px-2 py-1.5 rounded border border-white/10 bg-white/[0.03]">
              <span className="text-[10px] font-mono text-[var(--text-muted)] block mb-0.5">DEGRADED SOURCES</span>
              {brief.degraded.map((d: string, i: number) => (
                <div key={i} className="text-[10px] font-mono text-[var(--text-secondary)] leading-snug">↳ {d}</div>
              ))}
            </div>
          )}

          <div className="mt-2 text-[9px] font-mono text-[var(--text-muted)]">
            Sources: {(brief.sources || []).join(' · ')} · auto-refresh 15m
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ChainBriefInner);

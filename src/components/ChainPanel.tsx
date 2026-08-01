'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bitcoin, Search, Loader2, AlertTriangle, Sparkles, RefreshCw,
  ShieldAlert, Bug, Flame, Clock, Network, Layers, ExternalLink,
} from 'lucide-react';

/**
 * OSIRIS — CHAIN INTEL panel.
 *
 * Two modes over one accent: an auto-refreshing daily threat brief
 * (on-chain exploits, crypto CVEs, OFAC wallet designations) and
 * per-wallet forensics. The AI overview mirrors the Alerts/Markets panels
 * and works with no key via the route's heuristic fallback.
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
const num = (n: any, d = 4) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—';
const shortAddr = (a: string) => (a && a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);

function Section({ title, icon: Icon, color, right }: { title: string; icon: any; color: string; right?: string }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `${color}30` }} />
      {right && <span className="text-[9px] font-mono text-[var(--text-muted)]">{right}</span>}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: any; color?: string }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
      <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider w-[90px] flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[10px] font-mono break-all flex-1" style={{ color: color || 'var(--text-primary)' }}>{String(value)}</span>
    </div>
  );
}

function ChainPanelInner({ isMobile }: { isMobile?: boolean }) {
  const [tab, setTab] = useState<'brief' | 'wallet'>('brief');

  // ── daily brief ──
  const [brief, setBrief] = useState<any>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [days, setDays] = useState(30);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── ai overview ──
  const [ai, setAi] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── wallet ──
  const [query, setQuery] = useState('');
  const [wallet, setWallet] = useState<any>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');

  const briefRef = useRef(brief);
  briefRef.current = brief;

  const loadBrief = useCallback(async (d: number, force = false) => {
    setBriefLoading(true);
    setBriefError('');
    try {
      const res = await fetch(`/api/chain/daily?days=${d}${force ? '&refresh=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Brief unavailable');
      setBrief(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      setBriefError(e.message || 'Failed to load brief');
    } finally {
      setBriefLoading(false);
    }
  }, []);

  // Initial load + unattended refresh. The upstreams move daily, so this is
  // about keeping a long-open panel from going stale, not polling for ticks.
  useEffect(() => { loadBrief(days); }, [days, loadBrief]);
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadBrief(days, true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [days, loadBrief]);

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

  const runWallet = useCallback(async () => {
    const q = query.trim();
    if (!q || walletLoading) return;
    setWalletLoading(true);
    setWalletError('');
    setWallet(null);
    try {
      const res = await fetch(`/api/osint/crypto?address=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lookup failed');
      setWallet(d);
    } catch (e: any) {
      setWalletError(e.message || 'Network error');
    } finally {
      setWalletLoading(false);
    }
  }, [query, walletLoading]);

  const t = brief?.totals;

  return (
    <div
      className={`flex flex-col ${isMobile ? '' : 'max-h-[80vh]'} rounded-xl border overflow-hidden`}
      style={{ borderColor: `${ACCENT}33`, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(24px)' }}
    >
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: `${ACCENT}22` }}>
        <Bitcoin className="w-4 h-4" style={{ color: ACCENT }} />
        <span className="text-[11px] font-mono font-bold tracking-widest" style={{ color: ACCENT }}>CHAIN INTEL</span>
        <div className="flex-1" />
        <button
          onClick={() => (tab === 'brief' ? loadBrief(days, true) : runWallet())}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${briefLoading ? 'animate-spin' : ''}`} style={{ color: ACCENT }} />
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1 px-2 py-1.5 border-b" style={{ borderColor: `${ACCENT}18` }}>
        {(['brief', 'wallet'] as const).map(id => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-2 py-1 rounded text-[9px] font-mono font-bold tracking-wider transition-colors"
            style={{
              color: tab === id ? ACCENT : 'var(--text-muted)',
              background: tab === id ? `${ACCENT}1a` : 'transparent',
              border: `1px solid ${tab === id ? `${ACCENT}55` : 'transparent'}`,
            }}
          >
            {id === 'brief' ? 'DAILY BRIEF' : 'WALLET FORENSICS'}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto px-3 py-2 flex-1">
        {tab === 'brief' && (
          <>
            {/* window selector */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[9px] font-mono text-[var(--text-muted)] mr-1">WINDOW</span>
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
                  style={{
                    color: days === d ? ACCENT : 'var(--text-muted)',
                    background: days === d ? `${ACCENT}1a` : 'transparent',
                    border: `1px solid ${days === d ? `${ACCENT}55` : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {d}D
                </button>
              ))}
              {lastRefresh && (
                <span className="ml-auto text-[8px] font-mono text-[var(--text-muted)]">
                  {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>

            {briefLoading && !brief && (
              <div className="flex items-center gap-2 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: ACCENT }} />
                <span className="text-[10px] font-mono text-[var(--text-muted)]">Building brief…</span>
              </div>
            )}
            {briefError && (
              <div className="text-[10px] font-mono text-red-400 py-2">{briefError}</div>
            )}

            {brief && (
              <>
                {/* headline counters */}
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {[
                    { label: 'LOSSES', value: usd(t?.exploit_losses_usd), color: '#FF3D3D' },
                    { label: 'EXPLOITS', value: t?.exploit_count ?? 0, color: '#FF9500' },
                    { label: 'CVES', value: t?.cve_count ?? 0, color: '#E040FB' },
                  ].map(c => (
                    <div key={c.label} className="rounded border px-2 py-1.5" style={{ borderColor: `${c.color}33`, background: `${c.color}0d` }}>
                      <div className="text-[8px] font-mono text-[var(--text-muted)]">{c.label}</div>
                      <div className="text-[12px] font-mono font-bold" style={{ color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* AI overview */}
                <button
                  onClick={runAi}
                  disabled={aiLoading}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-mono font-bold tracking-wider transition-colors disabled:opacity-50"
                  style={{ color: ACCENT, background: `${ACCENT}14`, border: `1px solid ${ACCENT}44` }}
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI OVERVIEW
                </button>
                {ai && (
                  <div className="mt-1.5 px-2 py-1.5 rounded border text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
                    style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}0a`, color: 'var(--text-secondary)' }}>
                    {ai}
                  </div>
                )}

                {/* exploits */}
                <Section title="ON-CHAIN EXPLOITS" icon={Flame} color="#FF3D3D" right={`${brief.exploits.length} shown`} />
                {brief.exploits.length === 0 && (
                  <div className="text-[9px] font-mono text-[var(--text-muted)] py-1">None in window.</div>
                )}
                {brief.exploits.slice(0, 12).map((e: any, i: number) => (
                  <div key={i} className="py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-[#FF3D3D] flex-1 break-all">{e.name}</span>
                      <span className="text-[10px] font-mono font-bold text-[#FF9500]">{usd(e.amount_usd)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                      <span>{String(e.date).slice(0, 10)}</span>
                      <span className="text-[var(--text-secondary)]">{e.chain}</span>
                      {e.bridge_hack && <span className="text-[#E040FB]">BRIDGE</span>}
                    </div>
                    <div className="text-[9px] font-mono text-[var(--text-secondary)] leading-snug">{e.technique}</div>
                  </div>
                ))}

                {/* cves */}
                <Section title="CRYPTO CVES" icon={Bug} color="#E040FB" right={`${brief.cves.length} shown`} />
                {brief.cves.length === 0 && (
                  <div className="text-[9px] font-mono text-[var(--text-muted)] py-1">None published in window.</div>
                )}
                {brief.cves.slice(0, 10).map((c: any, i: number) => {
                  const sev = String(c.severity || '').toLowerCase();
                  const col = SEV_COLOR[sev] || '#9B978E';
                  return (
                    <div key={i} className="py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
                      <div className="flex items-center gap-2">
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-mono font-bold hover:underline flex items-center gap-1" style={{ color: col }}>
                          {c.id} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        {c.cvss != null && (
                          <span className="text-[9px] font-mono font-bold" style={{ color: col }}>CVSS {c.cvss}</span>
                        )}
                        <span className="ml-auto text-[8px] font-mono text-[var(--text-muted)]">{String(c.published).slice(0, 10)}</span>
                      </div>
                      <div className="text-[9px] font-mono text-[var(--text-secondary)] leading-snug mt-0.5">
                        {String(c.description).slice(0, 180)}{c.description.length > 180 ? '…' : ''}
                      </div>
                    </div>
                  );
                })}

                {/* sanctions */}
                <Section title="OFAC DESIGNATED WALLETS" icon={ShieldAlert} color="#FFD700" right={`${t?.sanctioned_wallet_count ?? 0} total`} />
                {brief.sanctioned_wallets.slice(0, 10).map((w: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[9px] font-mono">
                    <span className="w-[34px] font-bold text-[#FFD700]">{w.asset}</span>
                    <span className="flex-1 break-all text-[var(--text-primary)]">{shortAddr(w.address)}</span>
                    <span className="text-[var(--text-muted)]">{w.first_seen ? String(w.first_seen).slice(0, 10) : ''}</span>
                  </div>
                ))}

                {brief.degraded?.length > 0 && (
                  <div className="mt-3 px-2 py-1.5 rounded border border-white/10 bg-white/[0.03]">
                    <span className="text-[9px] font-mono text-[var(--text-muted)] block mb-0.5">DEGRADED SOURCES</span>
                    {brief.degraded.map((d: string, i: number) => (
                      <div key={i} className="text-[9px] font-mono text-[var(--text-secondary)] leading-snug">↳ {d}</div>
                    ))}
                  </div>
                )}

                <div className="mt-2 text-[8px] font-mono text-[var(--text-muted)]">
                  Sources: {(brief.sources || []).join(' · ')} · auto-refresh 15m
                </div>
              </>
            )}
          </>
        )}

        {tab === 'wallet' && (
          <>
            <div className="flex gap-1 mb-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runWallet()}
                placeholder="BTC, ETH or SOL wallet address"
                className="flex-1 px-2 py-1.5 rounded text-[10px] font-mono bg-black/40 border text-[var(--text-primary)] outline-none"
                style={{ borderColor: `${ACCENT}33` }}
              />
              <button
                onClick={runWallet}
                disabled={walletLoading || !query.trim()}
                className="px-2 rounded text-[9px] font-mono font-bold disabled:opacity-40"
                style={{ color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}44` }}
              >
                {walletLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              </button>
            </div>

            {walletError && <div className="text-[10px] font-mono text-red-400 py-2">{walletError}</div>}

            {wallet && (
              <>
                {wallet.sanctions?.hit && (
                  <div className="mb-2 px-2 py-2 rounded border border-red-500/40 bg-red-500/15">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-[10px] font-mono font-bold text-red-400 tracking-wider">OFAC SANCTIONED WALLET</span>
                    </div>
                    {(wallet.sanctions.entries || []).map((e: any, i: number) => (
                      <div key={i} className="text-[9px] font-mono text-red-200 break-all">↳ {e.name}</div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold border"
                    style={{ color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}18` }}>
                    {wallet.chain_label?.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold border"
                    style={{
                      color: SEV_COLOR[wallet.risk?.level] || '#00E676',
                      borderColor: `${SEV_COLOR[wallet.risk?.level] || '#00E676'}55`,
                      background: `${SEV_COLOR[wallet.risk?.level] || '#00E676'}18`,
                    }}>
                    RISK {wallet.risk?.score} · {String(wallet.risk?.level || '').toUpperCase()}
                  </span>
                </div>

                <Row label="Address" value={wallet.address} color={ACCENT} />
                <Row label="Balance" value={`${num(wallet.balance?.native, 8)} ${wallet.symbol}`} color="#00E676" />
                <Row label="Value (USD)" value={wallet.balance?.usd != null ? `$${num(wallet.balance.usd, 2)}` : 'price unavailable'} />
                <Row label="Transactions" value={wallet.activity?.tx_count?.toLocaleString()} />
                <Row label="Last active" value={wallet.activity?.last_seen ? `${String(wallet.activity.last_seen).slice(0, 10)} (${wallet.activity.dormant_days}d ago)` : null} />
                <Row label="Age" value={wallet.activity?.age_days != null ? `${wallet.activity.age_days} days` : 'unknown — history exceeds sample'} />

                {wallet.labels?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {wallet.labels.map((l: string, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-white/15 text-[var(--text-secondary)] bg-white/5">{l}</span>
                    ))}
                  </div>
                )}

                {wallet.flow && (
                  <>
                    <Section title="FLOW" icon={Layers} color={ACCENT} />
                    <Row label="Total in" value={`${num(wallet.flow.total_in)} ${wallet.symbol}`} color="#00E676" />
                    <Row label="Total out" value={`${num(wallet.flow.total_out)} ${wallet.symbol}`} color="#FF9500" />
                    <Row label="Net" value={`${num(wallet.flow.net)} ${wallet.symbol}`} />
                  </>
                )}

                {wallet.risk?.factors?.length > 0 && (
                  <>
                    <Section title="RISK FACTORS" icon={AlertTriangle} color={SEV_COLOR[wallet.risk.level] || '#00E676'} />
                    {wallet.risk.factors.map((f: any, i: number) => (
                      <div key={i} className="py-1.5 border-b border-[var(--border-secondary)]/20 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold" style={{ color: SEV_COLOR[f.severity] || '#00E676' }}>{f.label}</span>
                          {f.weight > 0 && <span className="text-[8px] font-mono text-[var(--text-muted)]">+{f.weight}</span>}
                        </div>
                        <div className="text-[9px] font-mono text-[var(--text-secondary)] leading-snug mt-0.5">{f.detail}</div>
                      </div>
                    ))}
                  </>
                )}

                {wallet.counterparties?.length > 0 && (
                  <>
                    <Section title={`COUNTERPARTIES (${wallet.counterparties.length})`} icon={Network} color={ACCENT} />
                    {wallet.counterparties.slice(0, 10).map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[9px] font-mono">
                        <span className={`w-[34px] font-bold ${c.direction === 'out' ? 'text-[#FF9500]' : c.direction === 'in' ? 'text-[#00E676]' : 'text-[var(--text-muted)]'}`}>
                          {c.direction.toUpperCase()}
                        </span>
                        <span className="flex-1 break-all text-[var(--text-primary)]">{shortAddr(c.address)}</span>
                        <span className="text-[var(--text-muted)]">{c.txs}×</span>
                      </div>
                    ))}
                  </>
                )}

                {wallet.transactions?.length > 0 && (
                  <>
                    <Section title={`RECENT TRANSACTIONS (${wallet.transactions.length})`} icon={Clock} color={ACCENT} />
                    {wallet.transactions.slice(0, 10).map((tx: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[9px] font-mono">
                        <span className={`w-[34px] font-bold ${tx.direction === 'out' ? 'text-[#FF9500]' : tx.direction === 'in' ? 'text-[#00E676]' : 'text-[var(--text-muted)]'}`}>
                          {tx.direction === 'unknown' ? '—' : tx.direction.toUpperCase()}
                        </span>
                        <span className="text-[var(--text-muted)] w-[62px]">{tx.time ? String(tx.time).slice(0, 10) : 'pending'}</span>
                        <span className="flex-1 break-all text-[var(--text-primary)]">{shortAddr(tx.hash)}</span>
                        {tx.failed && <span className="text-[#FF3D3D]">FAIL</span>}
                      </div>
                    ))}
                  </>
                )}

                {wallet.partial?.length > 0 && (
                  <div className="mt-3 px-2 py-1.5 rounded border border-white/10 bg-white/[0.03]">
                    <span className="text-[9px] font-mono text-[var(--text-muted)] block mb-0.5">COVERAGE LIMITS</span>
                    {wallet.partial.map((p: string, i: number) => (
                      <div key={i} className="text-[9px] font-mono text-[var(--text-secondary)] leading-snug">↳ {p}</div>
                    ))}
                  </div>
                )}

                <div className="mt-2 text-[8px] font-mono text-[var(--text-muted)]">
                  Sources: {(wallet.sources || []).join(' · ')}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(ChainPanelInner);

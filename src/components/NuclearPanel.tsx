'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radiation, ChevronDown, ChevronUp, Maximize2, Minimize2,
  Search, MapPin, Zap, Atom, TriangleAlert, ExternalLink, Globe2,
} from 'lucide-react';
import {
  selectFacilities, summarise, nuclearStyle, seismicMagnitude,
  formatCapacity, NUCLEAR_STATES,
  type NuclearFacility, type NuclearFilter,
} from '@/lib/nuclear';

interface NuclearPanelProps {
  facilities: NuclearFacility[];
  onLocate: (lat: number, lng: number) => void;
}

const FILTERS: { key: NuclearFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'alerts', label: 'ALERTS' },
  { key: 'online', label: 'ONLINE' },
  { key: 'construction', label: 'BUILDING' },
  { key: 'offline', label: 'OFFLINE' },
];

/** One number in the fleet strip. */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</div>
      <div className="text-[13px] font-mono font-bold truncate" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

export default function NuclearPanel({ facilities, onLocate }: NuclearPanelProps) {
  /* Collapsed on open. Switching the layer on is a map action, not a request
     for a full-height list, so this stays a slim bar until it is asked for. */
  const [expanded, setExpanded] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [filter, setFilter] = useState<NuclearFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const summary = useMemo(() => summarise(facilities), [facilities]);
  const shown = useMemo(() => selectFacilities(facilities, filter, query), [facilities, filter, query]);

  const content = (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`glass-panel flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 ${
        maximized ? 'fixed left-4 right-4 top-4 bottom-12 z-[9999]' : expanded ? 'shrink-0 h-[460px] max-h-[70vh]' : 'shrink-0'
      }`}
      /* .glass-panel sets its own translucent background and beats a utility
         class on equal specificity, so full-screen opacity goes inline. */
      style={maximized ? { background: '#0A0A09' } : undefined}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors cursor-pointer outline-none border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Radiation className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent-nuclear)]" />
          <span className="hud-text text-[11px] text-[var(--text-primary)]">NUCLEAR WATCH</span>
          <span className="gotham-tag gotham-tag--low" style={{ fontSize: '9px', padding: '1px 5px' }}>{summary.total}</span>
          {summary.alerts > 0 && (
            <span className="gotham-tag gotham-tag--critical" style={{ fontSize: '9px', padding: '1px 5px' }}>
              {summary.alerts} ALERT{summary.alerts > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="w-1.5 h-1.5 rounded-full animate-osiris-pulse"
            style={{ backgroundColor: summary.alerts > 0 ? '#FF1744' : 'var(--accent-nuclear)' }}
          />
          <button
            onClick={e => { e.stopPropagation(); setMaximized(!maximized); if (!expanded) setExpanded(true); }}
            className="p-1.5 -m-0.5 rounded hover:text-white hover:bg-white/10 transition-colors"
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized
              ? <Minimize2 className="w-3 h-3 text-[var(--text-muted)]" />
              : <Maximize2 className="w-3 h-3 text-[var(--text-muted)]" />}
          </button>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex flex-col flex-1 min-h-0 ${maximized ? 'bg-[#0a0a09]' : 'bg-transparent'}`}
          >
            {/* Fleet at a glance */}
            <div className="flex-shrink-0 flex gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.15)]">
              <Stat label="Reactors" value={String(summary.reactors)} color="var(--accent-nuclear)" />
              <Stat label="Capacity" value={formatCapacity(summary.capacityMW)} />
              <Stat label="Countries" value={String(summary.countries)} />
              <Stat
                label="Alerts"
                value={String(summary.alerts)}
                color={summary.alerts > 0 ? '#FF1744' : 'var(--text-muted)'}
              />
            </div>

            {/* Filters */}
            <div className="flex-shrink-0 flex flex-wrap gap-1 px-3 py-2 border-b border-[rgba(255,255,255,0.05)]">
              {FILTERS.map(f => {
                const count = f.key === 'all' ? summary.total
                  : f.key === 'alerts' ? summary.alerts
                  : summary.byState[f.key];
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    disabled={count === 0 && f.key !== 'all'}
                    className={`px-2 py-1 rounded text-[10px] font-mono tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                      filter === f.key
                        ? 'bg-[var(--accent-nuclear)]/20 text-[var(--accent-nuclear)] border border-[var(--accent-nuclear)]/50'
                        : 'text-[#8A8880] border border-transparent hover:text-[#E8E6E0] hover:bg-[#2A2A28]'
                    }`}
                  >
                    {f.label} <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-[rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#111111]/60 border border-[#2A2A28] focus-within:border-[var(--accent-nuclear)]/50 transition-colors">
                <Search className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter by site, city, country or operator"
                  aria-label="Filter nuclear facilities"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-mono text-[#E8E6E0] placeholder:text-[#5C5A54]"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[#E8E6E0]"
                    aria-label="Clear filter"
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>

            {/* Facility list */}
            <div className={`flex-1 overflow-y-auto styled-scrollbar ${maximized ? 'p-4' : 'p-2'}`}>
              <div className={maximized ? 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 items-start' : 'space-y-1.5'}>
                {shown.map(f => {
                  const style = nuclearStyle(f.status);
                  const mag = seismicMagnitude(f.status);
                  const isOpen = selected === f.id;

                  return (
                    <div
                      key={f.id}
                      onClick={() => { setSelected(isOpen ? null : f.id); onLocate(f.lat, f.lng); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(isOpen ? null : f.id);
                          onLocate(f.lat, f.lng);
                        }
                      }}
                      className={`w-full text-left p-2.5 rounded-lg bg-[#111111]/60 border transition-all cursor-pointer ${
                        isOpen
                          ? 'border-[var(--accent-nuclear)]/50 bg-[#1A1A1A]'
                          : 'border-[#2A2A28] hover:bg-[#1A1A1A] hover:border-[#3A3A38]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* State indicator — urgent sites pulse */}
                        <div className="flex-shrink-0 mt-1">
                          <div
                            className={`w-2 h-2 rounded-full ${style.urgent ? 'animate-osiris-pulse' : ''}`}
                            style={{ backgroundColor: style.color, boxShadow: `0 0 6px ${style.color}80` }}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-[#E8E6E0] truncate">{f.name}</span>
                            <span
                              className="text-[9px] font-mono px-1.5 py-[1px] rounded flex-shrink-0 border"
                              style={{
                                color: style.color,
                                borderColor: `${style.color}4D`,
                                backgroundColor: `${style.color}1A`,
                              }}
                            >
                              {style.label}{mag !== null ? ` M${mag}` : ''}
                            </span>
                          </div>

                          <div className="mt-1.5 text-[10px] font-mono text-[#8A8880] truncate">
                            {f.city}, {f.country}
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-[#2A2A28]/50 text-[10px] font-mono">
                            <span className="flex items-center gap-1 text-[#8A8880] whitespace-nowrap" title="Reactors">
                              <Atom className="w-2.5 h-2.5" />
                              {f.reactors || '—'}
                            </span>
                            <span className="flex items-center gap-1 text-[#8A8880] whitespace-nowrap" title="Net electrical capacity">
                              <Zap className="w-2.5 h-2.5" />
                              {formatCapacity(f.capacityMW)}
                            </span>
                            <span className="truncate text-[#5C5A54] ml-auto">{f.owner}</span>
                          </div>

                          {/* Detail, kept out of the row until asked for */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 pt-2 border-t border-[#2A2A28] space-y-1">
                                  <div className="flex justify-between gap-2 text-[10px] font-mono">
                                    <span className="text-[var(--text-muted)] flex-shrink-0">STATUS</span>
                                    <span className="truncate text-right" style={{ color: style.color }}>{f.status}</span>
                                  </div>
                                  <div className="flex justify-between gap-2 text-[10px] font-mono">
                                    <span className="text-[var(--text-muted)] flex-shrink-0">COORDS</span>
                                    <span className="text-[#E8E6E0]">{f.lat.toFixed(4)}°, {f.lng.toFixed(4)}°</span>
                                  </div>
                                  <div className="flex gap-1.5 pt-1">
                                    <button
                                      onClick={e => { e.stopPropagation(); onLocate(f.lat, f.lng); }}
                                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[9px] font-mono text-[var(--accent-nuclear)] border border-[var(--accent-nuclear)]/40 bg-[var(--accent-nuclear)]/10 hover:bg-[var(--accent-nuclear)]/20 transition-colors"
                                    >
                                      <MapPin className="w-2.5 h-2.5" /> LOCATE
                                    </button>
                                    {f.sourceUrl && (
                                      <a
                                        href={f.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        title={`Reference page for ${f.name}`}
                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[9px] font-mono text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/40 bg-[var(--cyan-primary)]/10 hover:bg-[var(--cyan-primary)]/20 transition-colors"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" /> SOURCE
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {shown.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-[11px] font-mono text-[var(--text-muted)]">
                  <Globe2 className="w-5 h-5 opacity-40" />
                  {facilities.length === 0 ? 'Loading facilities…' : 'No facilities match this filter'}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-t border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.2)]">
              {(Object.keys(NUCLEAR_STATES) as (keyof typeof NUCLEAR_STATES)[]).map(k => (
                <span key={k} className="flex items-center gap-1 text-[9px] font-mono text-[var(--text-muted)]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: NUCLEAR_STATES[k].color }} />
                  {NUCLEAR_STATES[k].label}
                </span>
              ))}
              {summary.byState.seismic > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-mono text-[#FF9500] ml-auto">
                  <TriangleAlert className="w-2.5 h-2.5" /> USGS M4.5+ within 150 km
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // Only a click sets this, so by now we are certainly on the client.
  if (maximized && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}

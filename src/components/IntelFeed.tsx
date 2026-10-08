'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ChevronDown, ChevronUp, ExternalLink, MapPin, Zap } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Intelligence Feed
   SIGINT-style news aggregation with risk scoring
   ═══════════════════════════════════════════════════════════════ */

interface IntelFeedProps {
  data: any;
  onLocate?: (lat: number, lng: number) => void;
}

function getRiskClass(score: number): string {
  if (score >= 8) return 'risk-critical';
  if (score >= 6) return 'risk-high';
  if (score >= 4) return 'risk-medium';
  return 'risk-low';
}

function getRiskLabel(score: number): string {
  if (score >= 8) return 'CRITICAL';
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'ELEVATED';
  return 'LOW';
}

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '';
  }
}

export default function IntelFeed({ data, onLocate }: IntelFeedProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const news = data.news || [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className="glass-panel flex flex-col overflow-hidden pointer-events-auto"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 hover:bg-[var(--hover-accent)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">SIGINT FEED</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '8px', padding: '1px 5px' }}>{news.length}</span>
          {news.some((n: any) => n.risk_score >= 8) && (
            <span className="gotham-tag gotham-tag--critical" style={{ fontSize: '7px', padding: '1px 4px' }}>ALERTS</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
          {expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />}
        </div>
      </button>

      {/* News Items */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-[400px] overflow-y-auto styled-scrollbar divide-y divide-[var(--border-secondary)]">
              {news.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <span className="text-[11px] font-mono text-[var(--text-muted)] tracking-widest">
                    AWAITING INTELLIGENCE...
                  </span>
                </div>
              ) : (
                news.slice(0, 25).map((item: any, i: number) => (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    className="px-4 py-2.5 hover:bg-[var(--hover-accent)] transition-colors cursor-pointer"
                    onClick={() => { if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer'); else setSelectedIdx(selectedIdx === i ? null : i); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && item.link) window.open(item.link, '_blank', 'noopener,noreferrer'); }}
                  >
                    {/* Top row: risk badge + source + time */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-mono font-bold tracking-widest ${getRiskClass(item.risk_score)}`}>
                        {getRiskLabel(item.risk_score)}
                      </span>
                      <span className="text-[8px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                        {item.source}
                      </span>
                      {item.coords && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLocate?.(item.coords[0], item.coords[1]);
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--cyan-primary)] transition-colors"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <span className="text-[8px] font-mono text-[var(--text-muted)] ml-auto">
                        {timeAgo(item.published)}
                      </span>
                    </div>

                    {/* Title */}
                    <h4 className="text-[11px] text-[var(--text-primary)] leading-tight line-clamp-2">
                      {item.title}
                    </h4>

                    {/* Machine Assessment (if critical) */}
                    {item.machine_assessment && (
                      <div className="mt-1.5 flex items-start gap-1.5 bg-red-950/20 border border-red-900/20 rounded px-2 py-1">
                        <Zap className="w-2.5 h-2.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-[9px] font-mono text-red-400/80 leading-relaxed">
                          {item.machine_assessment}
                        </span>
                      </div>
                    )}

                    {/* Expanded details */}
                    <AnimatePresence>
                      {selectedIdx === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-2 overflow-hidden"
                        >
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            OPEN SOURCE
                          </a>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

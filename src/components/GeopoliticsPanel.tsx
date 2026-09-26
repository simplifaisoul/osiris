'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Crosshair, AlertTriangle, X, ExternalLink, Globe } from 'lucide-react';
import type { GeopoliticalEvent } from '@/lib/geopolitics';

interface GeopoliticsPanelProps {
  events: GeopoliticalEvent[];
  onClose: () => void;
  onSelectEvent?: (event: GeopoliticalEvent) => void;
}

export default function GeopoliticsPanel({ events, onClose, onSelectEvent }: GeopoliticsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'battle' | 'strike' | 'protest' | 'strategic'>('all');

  const filtered = events.filter(e => filter === 'all' || e.category === filter);

  return (
    <motion.div
      initial={{ opacity: 0, x: -300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -300 }}
      className="fixed left-4 top-16 bottom-12 w-96 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl backdrop-blur-xl z-50 flex flex-col shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-black/40">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[var(--gold-primary)]" />
          <span className="font-mono text-sm font-bold text-[var(--gold-light)] tracking-wider">GEOPOLITICAL CONFLICT MONITOR</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-2 bg-black/20 border-b border-white/5 text-xs font-mono">
        {(['all', 'battle', 'strike', 'protest', 'strategic'] as const).map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`px-2.5 py-1 rounded text-[11px] capitalize transition-colors ${
              filter === cat ? 'bg-[var(--gold-primary)]/20 text-[var(--gold-light)] border border-[var(--gold-primary)]/40' : 'text-gray-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 font-mono text-xs">No events matching filter</div>
        ) : (
          filtered.map(ev => (
            <div
              key={ev.id}
              onClick={() => onSelectEvent?.(ev)}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all hover:border-[var(--cyan-bright)]/40 group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${
                  ev.category === 'strike' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
                  ev.category === 'battle' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
                  ev.category === 'protest' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' :
                  'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                }`}>
                  {ev.category}
                </span>
                <span className="text-[10px] font-mono text-gray-400">{ev.country}</span>
              </div>

              <h4 className="text-xs font-semibold text-gray-200 group-hover:text-[var(--gold-light)] line-clamp-2 transition-colors">
                {ev.title}
              </h4>

              {ev.fatalities > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Casualties: {ev.fatalities}</span>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-gray-400 pt-1.5 border-t border-white/5">
                <span>{ev.source}</span>
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="hover:text-[var(--cyan-bright)] flex items-center gap-0.5"
                  >
                    <span>Link</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

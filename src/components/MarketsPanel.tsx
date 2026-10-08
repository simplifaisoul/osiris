'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, BarChart3,
  Zap, Shield, Droplets, Gem, Bitcoin, LineChart, Maximize2, Minimize2
} from 'lucide-react';
import AiOverview from './AiOverview';

interface MarketsPanelProps { data: any; spaceWeather?: any; }

const SECTIONS = [
  { key: 'indices', label: 'INDICES', icon: LineChart },
  { key: 'stocks', label: 'DEFENSE', icon: Shield },
  { key: 'oil', label: 'ENERGY', icon: Droplets },
  { key: 'commodities', label: 'COMMODITIES', icon: Gem },
  { key: 'crypto', label: 'CRYPTO', icon: Bitcoin },
];

function Ticker({ name, data: d }: { name: string; data: any }) {
  if (!d) return null;
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--hover-accent)] transition-colors">
      <span className="text-[10px] font-mono text-[var(--text-secondary)] tracking-wide">{name}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-bold text-[var(--text-primary)] tabular-nums">
          {d.price >= 1000 ? `${(d.price / 1000).toFixed(1)}K` : d.price?.toFixed(2)}
        </span>
        <span className={`text-[9px] font-mono font-bold flex items-center gap-0.5 ${d.up ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}`}>
          {d.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {d.change_percent > 0 ? '+' : ''}{d.change_percent?.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export default function MarketsPanel({ data, spaceWeather }: MarketsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [activeSection, setActiveSection] = useState('stocks');
  const markets = data.markets || {};

  // Ensure portal only renders on client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const content = (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className={`glass-panel p-3 pointer-events-auto transition-all duration-300 flex flex-col ${maximized ? 'fixed inset-4 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : ''}`}>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="hud-text text-[12px] text-[var(--text-primary)]">MARKETS & INTEL</span>
          <span className="gotham-tag gotham-tag--low" style={{ fontSize: '7px', padding: '1px 4px' }}>LIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--alert-green)] animate-osiris-pulse" />
          <button onClick={(e) => { e.stopPropagation(); setMaximized(!maximized); if (!expanded && !maximized) setExpanded(true); }} className="hover:text-white transition-colors" title={maximized ? "Restore" : "Maximize"}>
            {maximized ? <Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* Space Weather Banner */}
            {spaceWeather && (
              <div className="mb-2 p-2 rounded-lg border" style={{ borderColor: `${spaceWeather.storm_color}33`, background: `${spaceWeather.storm_color}08` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3" style={{ color: spaceWeather.storm_color }} />
                    <span className="text-[10px] font-mono tracking-widest text-[var(--text-muted)]">SPACE WEATHER</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold" style={{ color: spaceWeather.storm_color }}>
                    Kp {spaceWeather.kp_index} — {spaceWeather.storm_level}
                  </span>
                </div>
                {spaceWeather.solar_flares?.length > 0 && (
                  <div className="mt-1 text-[8px] font-mono text-[var(--text-muted)]">
                    Latest flare: {spaceWeather.solar_flares[0].class}
                  </div>
                )}
              </div>
            )}

            {/* One-click AI overview of the current market picture */}
            <div className="mb-2">
              <AiOverview mode="markets" payload={{ markets, spaceWeather }} accent="#D4AF37" />
            </div>

            {/* Section Tabs — icons instead of emojis */}
            <div className="flex gap-0.5 mb-2 overflow-x-auto">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button key={s.key} onClick={() => setActiveSection(s.key)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[9px] font-mono tracking-wider whitespace-nowrap transition-all ${activeSection === s.key ? 'bg-[var(--hover-accent)] text-[var(--gold-primary)] border border-[var(--border-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'}`}>
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* SCM Alerts from Markets API */}
            {markets.scm_alerts && markets.scm_alerts.length > 0 && (
              <div className="mb-2 space-y-1">
                {markets.scm_alerts.map((alert: string, i: number) => (
                  <div key={i} className="px-2 py-1.5 rounded border border-[#FF9500] bg-[#FF9500]/10 text-[#FF9500] text-[9px] font-mono leading-tight shadow-[0_0_8px_rgba(255,149,0,0.15)]">
                    {alert}
                  </div>
                ))}
              </div>
            )}

            {/* Ticker List */}
            <div className="space-y-0.5 overflow-y-auto styled-scrollbar mt-2">
              {markets[activeSection] && Object.entries(markets[activeSection]).map(([name, d]) => (
                <Ticker key={name} name={name} data={d} />
              ))}
              {(!markets[activeSection] || Object.keys(markets[activeSection]).length === 0) && (
                <div className="text-center py-3 text-[10px] font-mono text-[var(--text-muted)]">Loading {activeSection}...</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (maximized && mounted && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}

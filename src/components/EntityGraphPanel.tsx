'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  X, Maximize2, Minimize2, Loader2, AlertTriangle,
  Plane, Ship, Building2, User, Globe, Newspaper, ShieldAlert,
  RefreshCw, Network, Wifi
} from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// ── TYPES ──

interface EntityNode {
  id: string;
  label: string;
  type: 'aircraft' | 'vessel' | 'company' | 'person' | 'country' | 'event' | 'sanction' | 'ip';
  properties?: Record<string, any>;
  x?: number; y?: number;
}

interface EntityLink {
  source: string | EntityNode;
  target: string | EntityNode;
  label: string;
}

interface GraphData { nodes: EntityNode[]; links: EntityLink[]; }

// ── PALETTE ──

const TYPE_COLORS: Record<string, string> = {
  aircraft: '#00E5FF', vessel: '#00BCD4', company: '#D4AF37',
  person: '#B388FF', country: '#76FF03', event: '#FF9500', sanction: '#FF1744',
  ip: '#FF6D00',
};

const TYPE_ICONS: Record<string, typeof Plane> = {
  aircraft: Plane, vessel: Ship, company: Building2,
  person: User, country: Globe, event: Newspaper, sanction: ShieldAlert,
  ip: Wifi,
};

// ── PROPS ──

interface Props {
  entity: { type: string; id: string; label?: string; properties?: Record<string, any> } | null;
  onClose: () => void;
}

function EntityGraphPanel({ entity, onClose }: Props) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<EntityNode | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const mergeGraph = useCallback((existing: GraphData, incoming: GraphData): GraphData => {
    const nodeMap = new Map<string, EntityNode>();
    for (const n of existing.nodes) nodeMap.set(n.id, n);
    for (const n of incoming.nodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
    const linkSet = new Set(existing.links.map(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      return `${s}→${t}→${l.label}`;
    }));
    const merged = [...existing.links];
    for (const l of incoming.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      const k = `${s}→${t}→${l.label}`;
      if (!linkSet.has(k)) { linkSet.add(k); merged.push(l); }
    }
    return { nodes: Array.from(nodeMap.values()), links: merged };
  }, []);

  const expandEntity = useCallback(async (type: string, id: string, properties?: Record<string, any>) => {
    const key = `${type}:${id}`;
    if (expandedIds.has(key)) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ type, id });
      // Forward extra properties for aircraft/vessel resolution
      if (properties?.registration) params.set('registration', properties.registration);
      if (properties?.model) params.set('model', properties.model);
      if (properties?.icao24) params.set('icao24', properties.icao24);
      const res = await fetch(`/api/entity/expand?${params}`, { cache: 'no-store' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setGraphData(prev => mergeGraph(prev, { nodes: data.nodes || [], links: data.links || [] }));
      setExpandedIds(prev => new Set([...prev, key]));
    } catch (e) { setError(e instanceof Error ? e.message : 'Expansion failed'); }
    finally { setLoading(false); }
  }, [expandedIds, mergeGraph]);

  useEffect(() => {
    if (!entity) return;
    const root: EntityNode = {
      id: `${entity.type}:${entity.id}`, label: entity.label || entity.id,
      type: entity.type as EntityNode['type'], properties: entity.properties,
    };
    setGraphData({ nodes: [root], links: [] });
    setExpandedIds(new Set());
    setSelectedNode(root);
    setError(null);
    expandEntity(entity.type, entity.id, entity.properties);
  }, [entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = useCallback((node: any) => {
    const n = node as EntityNode;
    setSelectedNode(n);
    const rawId = n.id.includes(':') ? n.id.split(':').slice(1).join(':') : n.id;
    if (!expandedIds.has(`${n.type}:${rawId}`)) expandEntity(n.type, rawId);
  }, [expandedIds, expandEntity]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as EntityNode;
    const isSelected = n === selectedNode;
    const color = TYPE_COLORS[n.type] || '#888';
    const size = isSelected ? 5 : 3.5;
    
    // Clean, precise circle
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#fff' : 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle target bracket for selected node (static, no pulsing)
    if (isSelected) {
      const bSize = size + 4;
      const bLen = 3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // TL
      ctx.moveTo(n.x! - bSize, n.y! - bSize + bLen); ctx.lineTo(n.x! - bSize, n.y! - bSize); ctx.lineTo(n.x! - bSize + bLen, n.y! - bSize);
      // TR
      ctx.moveTo(n.x! + bSize - bLen, n.y! - bSize); ctx.lineTo(n.x! + bSize, n.y! - bSize); ctx.lineTo(n.x! + bSize, n.y! - bSize + bLen);
      // BL
      ctx.moveTo(n.x! - bSize, n.y! + bSize - bLen); ctx.lineTo(n.x! - bSize, n.y! + bSize); ctx.lineTo(n.x! - bSize + bLen, n.y! + bSize);
      // BR
      ctx.moveTo(n.x! + bSize - bLen, n.y! + bSize); ctx.lineTo(n.x! + bSize, n.y! + bSize); ctx.lineTo(n.x! + bSize, n.y! + bSize - bLen);
      ctx.stroke();
      
      // Faint outer ring
      ctx.beginPath(); ctx.arc(n.x!, n.y!, bSize + 2, 0, 2*Math.PI);
      ctx.strokeStyle = `${color}30`; ctx.lineWidth = 1; ctx.stroke();
    }

    // Clean label rendering
    const fontSize = Math.max(10 / globalScale, 3);
    if (fontSize > 3.5 || isSelected) {
      ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = isSelected ? '#fff' : `${color}cc`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      // Black background for text readability
      const label = n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(n.x! - textWidth/2 - 2, n.y! + size + 3, textWidth + 4, fontSize + 2);
      ctx.fillStyle = isSelected ? '#fff' : color;
      ctx.fillText(label, n.x!, n.y! + size + 4);
    }
  }, [selectedNode]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { source: s, target: t } = link;
    if (!s.x || !t.x) return;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
    // Smooth, thin, non-dashed lines
    ctx.strokeStyle = 'rgba(212,175,55,0.15)'; // faint gold
    ctx.lineWidth = Math.max(0.5, 1 / globalScale); 
    ctx.stroke();
    
    const fs = Math.max(8 / globalScale, 2);
    if (fs > 3) {
      ctx.font = `${fs}px 'JetBrains Mono', monospace`; 
      ctx.fillStyle = 'rgba(212,175,55,0.4)';
      ctx.textAlign = 'center'; ctx.fillText(link.label || '', (s.x + t.x) / 2, (s.y + t.y) / 2);
    }
  }, []);

  // Removed early return to allow rendering empty panel

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 500, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 500, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full z-[500] flex flex-col glass-panel"
        style={{
          width: expanded ? '60vw' : '480px', maxWidth: '90vw',
          borderLeft: '1px solid var(--border-primary)',
          borderRight: 'none',
          borderTop: 'none',
          borderBottom: 'none',
          borderRadius: 0
        }}
      >
        <style>{`
          .scanline {
            position: absolute; inset: 0; pointer-events: none;
            background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(212,175,55,0.03) 50%, rgba(212,175,55,0.03));
            background-size: 100% 4px;
            z-index: 10;
          }
          .hud-corner {
            position: absolute; width: 16px; height: 16px; border-color: rgba(212,175,55,0.4); border-style: solid; z-index: 20; pointer-events: none;
          }
          .hud-tl { top: 12px; left: 12px; border-width: 2px 0 0 2px; }
          .hud-tr { top: 12px; right: 12px; border-width: 2px 2px 0 0; }
          .hud-bl { bottom: 12px; left: 12px; border-width: 0 0 2px 2px; }
          .hud-br { bottom: 12px; right: 12px; border-width: 0 2px 2px 0; }
          
          .typewriter {
            display: inline-block; overflow: hidden; white-space: nowrap; border-right: 2px solid var(--gold-primary);
            animation: typing 0.8s steps(30, end) forwards, blink-caret 0.5s step-end infinite;
          }
          @keyframes typing { from { width: 0 } to { width: 100% } }
          @keyframes blink-caret { from, to { border-color: transparent } 50% { border-color: var(--gold-primary) } }
        `}</style>
        
        <div className="scanline" />
        <div className="hud-corner hud-tl" />
        <div className="hud-corner hud-tr" />
        <div className="hud-corner hud-bl" />
        <div className="hud-corner hud-br" />
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-primary)] bg-[var(--gold-primary)]/5 relative z-20">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-[var(--gold-primary)] animate-osiris-pulse shadow-[0_0_8px_var(--gold-primary)]" />
            <span className="text-[12px] font-mono font-bold tracking-[0.2em] text-[var(--gold-primary)]">[ OSIRIS // ENTITY INTEL ]</span>
            {loading && <Loader2 className="w-3.5 h-3.5 text-[var(--gold-primary)] animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-[var(--gold-primary)]/20 rounded transition-colors border border-transparent hover:border-[var(--gold-primary)]/40">
              {expanded ? <Minimize2 className="w-3.5 h-3.5 text-[var(--gold-primary)]" /> : <Maximize2 className="w-3.5 h-3.5 text-[var(--gold-primary)]" />}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-[#FF1744]/20 rounded transition-colors border border-transparent hover:border-[#FF1744]/40">
              <X className="w-3.5 h-3.5 text-[#FF1744]" />
            </button>
          </div>
        </div>

        {/* ROOT LABEL */}
        {entity ? (
          <div className="px-6 py-2 border-b border-[var(--border-primary)] flex items-center gap-3 bg-black/20 relative z-20">
            {(() => { const I = TYPE_ICONS[entity.type] || Globe; return <I className="w-4 h-4" style={{ color: TYPE_COLORS[entity.type] }} />; })()}
            <span className="text-xs font-mono text-white/90 tracking-widest uppercase truncate">{entity.label || entity.id}</span>
            <span className="text-[10px] font-mono text-[var(--gold-primary)]/70 ml-auto tracking-widest">{graphData.nodes.length} NODES // {graphData.links.length} LINKS</span>
          </div>
        ) : (
          <div className="px-6 py-3 border-b border-[var(--border-primary)] flex items-center gap-3 bg-black/20 relative z-20">
            <Network className="w-4 h-4 text-[var(--gold-primary)]/50 animate-osiris-pulse" />
            <span className="text-xs font-mono text-[var(--gold-primary)]/50 tracking-widest uppercase truncate typewriter">[ AWAITING TARGET LOCK ]</span>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="px-6 py-2 bg-[#FF1744]/10 border-b border-[#FF1744]/30 flex items-center gap-2 relative z-20 shadow-[inset_0_0_15px_rgba(255,23,68,0.2)]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF1744]" />
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#FF1744] uppercase">[ ERR: {error} ]</span>
          </div>
        )}

        {/* GRAPH */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ minHeight: 300 }}>
          {graphData.nodes.length > 0 && (
              <ForceGraph2D
              ref={graphRef} graphData={graphData} nodeId="id"
              nodeCanvasObject={paintNode} linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick} backgroundColor="rgba(0,0,0,0)"
              width={containerRef.current?.clientWidth || 480}
              height={containerRef.current?.clientHeight || 400}
              d3AlphaDecay={0.05} d3VelocityDecay={0.4} cooldownTicks={100}
              linkDirectionalParticles={1} linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={0.003}
              linkDirectionalParticleColor={() => 'rgba(212,175,55,0.6)'}
            />
          )}
          {graphData.nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono text-white/30">No graph data yet</span>
            </div>
          )}
        </div>

        {/* SELECTED NODE */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div initial={{ y: 20, opacity: 0, filter: 'blur(10px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: 20, opacity: 0, filter: 'blur(10px)' }}
              transition={{ duration: 0.3 }}
              className="border-t border-[var(--border-primary)] px-6 py-4 max-h-[40%] overflow-y-auto relative z-20 glass-panel-sm m-4"
            >
              <div className="flex items-center justify-between mb-3 border-b border-[var(--border-secondary)] pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[var(--gold-primary)] animate-osiris-pulse shadow-[0_0_8px_var(--gold-primary)]" />
                  {(() => { const I = TYPE_ICONS[selectedNode.type] || Globe; return <I className="w-4 h-4" style={{ color: TYPE_COLORS[selectedNode.type] }} />; })()}
                  <span className="text-[13px] font-mono font-bold text-white tracking-[0.1em] uppercase">{selectedNode.label}</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 border"
                  style={{ color: TYPE_COLORS[selectedNode.type], borderColor: `${TYPE_COLORS[selectedNode.type]}80`, background: `${TYPE_COLORS[selectedNode.type]}15`, textShadow: `0 0 5px ${TYPE_COLORS[selectedNode.type]}` }}>
                  [{selectedNode.type.toUpperCase()}]
                </span>
              </div>
              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
                  {Object.entries(selectedNode.properties).map(([k, v], i) => (
                    <div key={`${selectedNode.id}-${k}`}>
                      <span className="text-[9px] font-mono text-[var(--gold-primary)]/70 uppercase tracking-widest">{k.replace(/_/g, ' ')}</span>
                      <div className="text-[11px] font-mono text-white/90 truncate flex items-center gap-1 mt-0.5">
                        <span className="w-1 h-1 bg-[var(--gold-primary)]/40 inline-block" />
                        <span className="typewriter" style={{ animationDelay: `${i * 0.1}s` }}>
                          {typeof v === 'boolean' ? (v ? 'YES' : 'NO') : String(v || '—')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!expandedIds.has(`${selectedNode.type}:${selectedNode.id.includes(':') ? selectedNode.id.split(':').slice(1).join(':') : selectedNode.id}`) && (
                <button onClick={() => {
                  const rawId = selectedNode.id.includes(':') ? selectedNode.id.split(':').slice(1).join(':') : selectedNode.id;
                  expandEntity(selectedNode.type, rawId);
                }} className="btn-tactical w-full mt-4 flex items-center justify-center gap-2" disabled={loading}>
                  {loading ? <Loader2 className="w-3.5 h-3.5 text-[var(--gold-primary)] animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-[var(--gold-primary)]" />}
                  <span className="text-[11px] font-mono font-bold text-[var(--gold-primary)] tracking-[0.2em]">[ ACQUIRE TARGET DATA ]</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* LEGEND */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 flex-wrap">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <div key={t} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[8px] font-mono text-white/40 uppercase">{t}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(EntityGraphPanel);

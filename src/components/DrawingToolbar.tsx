'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pentagon, Ruler, Trash2, Download, Copy, Check, Clock } from 'lucide-react';

export interface DrawnPolygon {
  id: string;
  name: string;
  geojson: GeoJSON.Feature<GeoJSON.Polygon>;
  areaKm2: number;
  perimeterKm: number;
  color: string;
  createdAt: number;
}

interface DrawingToolbarProps {
  isDrawing: boolean;
  onToggleDrawing: () => void;
  polygons: DrawnPolygon[];
  onDeletePolygon: (id: string) => void;
  onClearAll: () => void;
  onExportGeoJSON: () => void;
  selectedPolygon: string | null;
  onSelectPolygon: (id: string | null) => void;
  onRenamePolygon: (id: string, name: string) => void;
}

/** Calculate area of a GeoJSON polygon in km² using the Shoelace formula on a spheroid */
export function calculatePolygonArea(coords: number[][]): number {
  const R = 6371; // Earth radius in km
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = coords[i][1] * Math.PI / 180;
    const lat2 = coords[j][1] * Math.PI / 180;
    const dLng = (coords[j][0] - coords[i][0]) * Math.PI / 180;
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs(area * R * R / 2);
  return area;
}

/** Calculate perimeter of a polygon in km using Haversine */
export function calculatePerimeter(coords: number[][]): number {
  const R = 6371;
  let perimeter = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const lat1 = coords[i][1] * Math.PI / 180;
    const lat2 = coords[i + 1][1] * Math.PI / 180;
    const dLat = lat2 - lat1;
    const dLng = (coords[i + 1][0] - coords[i][0]) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    perimeter += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return perimeter;
}

const POLYGON_COLORS = [
  '#00E5FF', '#FF3D57', '#FFD700', '#00E676', '#E040FB',
  '#FF6D00', '#40C4FF', '#69F0AE', '#FFAB40', '#7C4DFF',
];

export function getNextColor(existing: DrawnPolygon[]): string {
  return POLYGON_COLORS[existing.length % POLYGON_COLORS.length];
}

function formatRelativeTime(ms: number) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DrawingToolbar({
  isDrawing, onToggleDrawing, polygons, onDeletePolygon,
  onClearAll, onExportGeoJSON, selectedPolygon, onSelectPolygon,
  onRenamePolygon,
}: DrawingToolbarProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  
  const [flash, setFlash] = useState(false);
  const prevCount = useRef(polygons.length);
  const [, setTick] = useState(0);

  // Update relative times every minute
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Flash confirmation when a new polygon is added
  useEffect(() => {
    if (polygons.length > prevCount.current) {
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    }
    prevCount.current = polygons.length;
  }, [polygons.length]);

  const handleCopy = useCallback((polygon: DrawnPolygon) => {
    navigator.clipboard.writeText(JSON.stringify(polygon.geojson, null, 2));
    setCopied(polygon.id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const startRename = (polygon: DrawnPolygon) => {
    setEditingName(polygon.id);
    setNameValue(polygon.name);
  };

  const commitRename = () => {
    if (editingName && nameValue.trim()) {
      onRenamePolygon(editingName, nameValue.trim());
    }
    setEditingName(null);
  };

  const totalArea = polygons.reduce((sum, p) => sum + p.areaKm2, 0);
  const totalPerim = polygons.reduce((sum, p) => sum + p.perimeterKm, 0);

  return (
    <div className="pointer-events-auto">
      <div 
        className="w-[280px] bg-black/90 backdrop-blur-xl border rounded-lg overflow-hidden flex flex-col glass-panel transition-all duration-500"
        style={{
          boxShadow: flash 
            ? '0 0 20px #00E67666, 0 25px 50px -12px rgba(0,0,0,0.5)' 
            : '0 25px 50px -12px rgba(0,0,0,0.25)',
          borderColor: flash ? 'var(--alert-green, #00E676)' : 'rgba(255, 255, 255, 0.06)'
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Pentagon className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
            <span className="text-[12px] font-mono tracking-[0.2em] text-white/90 font-bold">DRAWING TOOLS</span>
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-mono text-white/50 bg-white/5 rounded px-2 py-1.5 border border-white/[0.04]">
            <div className="flex flex-col">
              <span className="text-[10px] tracking-wider mb-0.5 uppercase">Tracked Area</span>
              <span className="text-[12px] text-[var(--cyan-primary)] font-bold">{totalArea.toFixed(1)} km²</span>
            </div>
            <div className="w-[1px] h-6 bg-white/10" />
            <div className="flex flex-col text-right">
              <span className="text-[10px] tracking-wider mb-0.5 uppercase">AOIs / Perim</span>
              <span className="text-[12px] text-white/80">{polygons.length} / {totalPerim.toFixed(1)}km</span>
            </div>
          </div>
        </div>

        {/* Draw button */}
        <div className="p-3 border-b border-white/[0.04]">
          <button
            onClick={onToggleDrawing}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded text-[11px] font-mono tracking-[0.2em] transition-all relative overflow-hidden ${
              isDrawing
                ? 'bg-[var(--cyan-primary)]/10 border border-[var(--cyan-primary)]/50 text-[var(--cyan-primary)] shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {isDrawing && (
              <motion.div 
                className="absolute inset-0 bg-[var(--cyan-primary)]/10"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            
            <div className="relative flex items-center gap-2">
              {isDrawing ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-[var(--cyan-primary)] animate-pulse" />
                  <span className="font-bold">DRAWING...</span>
                </>
              ) : (
                <>
                  <Pentagon className="w-3.5 h-3.5" />
                  DRAW POLYGON
                </>
              )}
            </div>
          </button>
          {isDrawing && (
            <p className="text-[10px] font-mono text-white/40 mt-2 text-center tracking-wide">
              Click map to start · Double-click to finish
            </p>
          )}
        </div>

        {/* Polygon list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden max-h-[280px] styled-scrollbar bg-black/40">
          <AnimatePresence mode="popLayout">
            {polygons.length === 0 && !isDrawing ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 px-4 text-center"
              >
                <Pentagon className="w-6 h-6 text-white/10 mx-auto mb-2" />
                <p className="text-[11px] font-mono text-white/30 tracking-wider">No polygons drawn yet.</p>
              </motion.div>
            ) : (
              polygons.map((polygon) => (
                <motion.div
                  key={polygon.id}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`relative px-4 py-3 border-b border-white/[0.03] transition-colors cursor-pointer group ${
                    selectedPolygon === polygon.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                  onClick={() => onSelectPolygon(selectedPolygon === polygon.id ? null : polygon.id)}
                >
                  {/* Left Color Accent */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-[3px] transition-opacity duration-300"
                    style={{ backgroundColor: polygon.color, opacity: selectedPolygon === polygon.id ? 1 : 0.6 }}
                  />
                  
                  <div className="flex items-center justify-between mb-1.5 pl-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {editingName === polygon.id ? (
                        <input
                          value={nameValue}
                          onChange={e => setNameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => e.key === 'Enter' && commitRename()}
                          autoFocus
                          className="bg-black/60 border border-white/20 text-white text-[12px] font-mono px-1.5 py-0.5 rounded w-full outline-none focus:border-[var(--cyan-primary)]/50"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className={`text-[12px] font-mono truncate cursor-text transition-colors ${
                            selectedPolygon === polygon.id ? 'text-white' : 'text-white/80'
                          }`}
                          onDoubleClick={(e) => { e.stopPropagation(); startRename(polygon); }}
                        >
                          {polygon.name}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleCopy(polygon); }} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition" title="Copy GeoJSON">
                        {copied === polygon.id ? <Check className="w-3 h-3 text-[var(--alert-green)]" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDeletePolygon(polygon.id); }} className="p-1.5 rounded bg-[#FF3D57]/10 hover:bg-[#FF3D57]/20 text-[#FF3D57]/60 hover:text-[#FF3D57] transition" title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pl-1 text-[10px] font-mono text-white/40">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Ruler className="w-2.5 h-2.5" />
                        {polygon.areaKm2.toFixed(2)} km²
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-white/30">
                      <Clock className="w-2 h-2" />
                      {formatRelativeTime(polygon.createdAt)}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        {polygons.length > 0 && (
          <div className="p-3 border-t border-white/[0.04] flex items-center gap-2 bg-black/60">
            <button 
              onClick={onExportGeoJSON} 
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded text-[10px] font-mono tracking-[0.2em] bg-[var(--cyan-primary)]/10 border border-[var(--cyan-primary)]/30 text-[var(--cyan-primary)]/80 hover:text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)]/20 hover:border-[var(--cyan-primary)]/50 transition"
            >
              <Download className="w-3 h-3" />
              EXPORT GEOJSON
            </button>
            <button 
              onClick={onClearAll} 
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[10px] font-mono tracking-widest bg-[#FF3D57]/10 border border-[#FF3D57]/20 text-[#FF3D57]/60 hover:text-[#FF3D57] hover:bg-[#FF3D57]/20 transition"
            >
              <Trash2 className="w-3 h-3" />
              CLEAR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

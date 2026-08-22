'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pentagon, Ruler, Trash2, Download, Copy, Check, Clock , Square, Circle, Spline} from 'lucide-react';
import type { DrawMode, DrawProgress, DrawnShape } from '@/lib/draw';
import { formatArea, formatDistance } from '@/lib/geo';
import { selectInPolygon, MAX_ITEMS_PER_GROUP } from '@/lib/aoi';
import { formatAgo as watchAgo, type WatchEvent } from '@/lib/watch';
import { contentsToCSV, contentsToGeoJSON, downloadFile } from '@/lib/aoi-export';
import { FileDown, Table } from 'lucide-react';
import { Radar, LogIn, LogOut } from 'lucide-react';


interface DrawingToolbarProps {
  drawMode: DrawMode | null;
  onSetDrawMode: (m: DrawMode | null) => void;
  progress: DrawProgress | null;
  polygons: DrawnShape[];
  onDeletePolygon: (id: string) => void;
  onClearAll: () => void;
  onExportGeoJSON: () => void;
  selectedPolygon: string | null;
  onSelectPolygon: (id: string | null) => void;
  onRenamePolygon: (id: string, name: string) => void;
  /** Live entity store, swept for whatever falls inside each polygon. */
  data?: Record<string, any>;
  /** Centre the map on a selected object. */
  onLocateEntity?: (lat: number, lng: number) => void;
  /** AOIs currently armed as tripwires. */
  watched?: Set<string>;
  onToggleWatch?: (id: string) => void;
  watchEvents?: WatchEvent[];
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

export function getNextColor(existing: DrawnShape[]): string {
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

const MODES = [
  { id: 'polygon' as const,   label: 'AREA',   Icon: Pentagon, blurb: 'Any shape, corner by corner' },
  { id: 'rectangle' as const, label: 'BOX',    Icon: Square,   blurb: 'Two clicks, opposite corners' },
  { id: 'circle' as const,    label: 'RADIUS', Icon: Circle,   blurb: 'Centre, then distance out' },
  { id: 'line' as const,      label: 'PATH',   Icon: Spline,   blurb: 'Measure a route' },
];

const MODE_HINT: Record<DrawMode, string> = {
  polygon: 'Click the first corner',
  rectangle: 'Click one corner',
  circle: 'Click the centre',
  line: 'Click the start point',
};

// Spelling the keys out matters: nobody guesses that Backspace undoes a vertex.
const KEY_HINT: Record<DrawMode, string> = {
  polygon: 'Double-click or Enter to close · Backspace undoes · Esc cancels',
  rectangle: 'Second click completes the box · Esc cancels',
  circle: 'Second click sets the radius · Esc cancels',
  line: 'Double-click or Enter to end · Backspace undoes · Esc cancels',
};

export default function DrawingToolbar({
  drawMode, onSetDrawMode, progress, polygons, onDeletePolygon,
  onClearAll, onExportGeoJSON, selectedPolygon, onSelectPolygon,
  data, onLocateEntity, watched, onToggleWatch, watchEvents = [],
  onRenamePolygon,
}: DrawingToolbarProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  
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

  const handleCopy = useCallback((polygon: DrawnShape) => {
    navigator.clipboard.writeText(JSON.stringify(polygon.geojson, null, 2));
    setCopied(polygon.id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const startRename = (polygon: DrawnShape) => {
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

        {/* Mode selector */}
        <div className="p-3 border-b border-white/[0.04]">
          {/* Naming the step is the difference between a toolbar and a puzzle:
              without it, nothing tells you a mode must be picked before the map
              will respond to a click. */}
          <p className="text-[10px] font-mono tracking-[0.18em] text-white/40 mb-2">
            {drawMode ? 'STEP 2 — NOW CLICK THE MAP' : 'STEP 1 — CHOOSE A SHAPE'}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {MODES.map(m => {
              const on = drawMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSetDrawMode(on ? null : m.id)}
                  className={`flex items-start gap-2 p-2 rounded border text-left transition-all ${
                    on
                      ? 'border-[var(--cyan-primary)]/50 bg-[var(--cyan-primary)]/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                  }`}
                >
                  <m.Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${on ? 'text-[var(--cyan-primary)]' : 'text-white/60'}`} />
                  <span className="min-w-0">
                    <span className={`block text-[11px] font-mono tracking-wider ${on ? 'text-[var(--cyan-primary)]' : 'text-white/80'}`}>
                      {m.label}
                    </span>
                    {/* The description was a tooltip, which is invisible to
                        anyone who does not already know to hover. */}
                    <span className="block text-[10px] font-mono text-white/40 leading-tight mt-0.5">
                      {m.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live figures while drawing. Measuring only on completion is what
              makes a tool feel like a form; this makes it feel like a ruler. */}
          {drawMode && (
            <div className="mt-2 px-2 py-1.5 rounded bg-[var(--cyan-primary)]/[0.07] border border-[var(--cyan-primary)]/25">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan-primary)] animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-mono text-[var(--cyan-primary)] tracking-wider flex-1">
                  {progress
                    ? `${progress.vertices} point${progress.vertices === 1 ? '' : 's'}`
                    : MODE_HINT[drawMode]}
                </span>
                {progress && progress.radiusKm != null && progress.radiusKm > 0 && (
                  <span className="text-[10px] font-mono text-white tabular-nums">r {formatDistance(progress.radiusKm)}</span>
                )}
                {progress && progress.areaKm2 > 0 && (
                  <span className="text-[10px] font-mono text-white tabular-nums">{formatArea(progress.areaKm2)}</span>
                )}
                {progress && progress.areaKm2 === 0 && progress.lengthKm > 0 && (
                  <span className="text-[10px] font-mono text-white tabular-nums">{formatDistance(progress.lengthKm)}</span>
                )}
              </div>
              <p className="text-[10px] font-mono text-white/40 mt-1 leading-relaxed">
                {KEY_HINT[drawMode]}
              </p>
            </div>
          )}
        </div>

        {/* Polygon list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden max-h-[280px] styled-scrollbar bg-black/40">
          <AnimatePresence mode="popLayout">
            {polygons.length === 0 && !drawMode ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 px-4 text-center"
              >
                <Pentagon className="w-6 h-6 text-white/10 mx-auto mb-2" />
                {/* "No polygons drawn yet" states the obvious and helps nobody.
                    An empty state should say what to do next. */}
                {drawMode ? (
                  <p className="text-[11px] font-mono text-[var(--cyan-primary)]/70 tracking-wider leading-relaxed">
                    Now click on the map to place your first point.
                  </p>
                ) : (
                  <p className="text-[11px] font-mono text-white/35 tracking-wider leading-relaxed">
                    Choose a shape above, then click the map<br />to measure an area and see what is inside it.
                  </p>
                )}
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
                      {onToggleWatch && polygon.geojson.geometry.type === 'Polygon' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleWatch(polygon.id); }}
                          title={watched?.has(polygon.id) ? 'Stop watching this area' : 'Watch for arrivals and departures'}
                          className={`p-1.5 rounded transition ${
                            watched?.has(polygon.id)
                              ? 'bg-[var(--alert-green)]/20 text-[var(--alert-green)]'
                              : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white'
                          }`}
                        >
                          <Radar className={`w-3 h-3 ${watched?.has(polygon.id) ? 'animate-pulse' : ''}`} />
                        </button>
                      )}
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

                  {/* What is inside. Recomputed from the live store, so the
                      readout tracks aircraft moving through the area rather
                      than freezing at the moment the polygon was drawn. */}
                  {selectedPolygon === polygon.id && (() => {
                    const ring = polygon.geojson.geometry.coordinates[0] as number[][];
                    const report = selectInPolygon(ring, data || {});
                    return (
                      <div className="mt-2 pt-2 border-t border-white/[0.06]">
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="text-[10px] font-mono tracking-[0.2em] text-white/40">CONTENTS</span>
                          <span className="text-[11px] font-mono text-white tabular-nums">{report.total.toLocaleString()}</span>
                          <span className="text-[10px] font-mono text-white/30">object{report.total === 1 ? "" : "s"}</span>
                        </div>
                        {report.total === 0 && (
                          <p className="text-[10px] font-mono text-white/30 pb-1">Nothing tracked inside this area.</p>
                        )}
                        {report.groups.map(g => (
                          <div key={g.key} className="mb-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenGroup(openGroup === polygon.id + g.key ? null : polygon.id + g.key); }}
                              className="w-full flex items-center gap-2 py-0.5 hover:bg-white/[0.03] rounded"
                            >
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                              <span className="text-[10px] font-mono text-white/70 flex-1 text-left">{g.label}</span>
                              <span className="text-[10px] font-mono text-white tabular-nums">{g.count.toLocaleString()}</span>
                            </button>
                            {openGroup === polygon.id + g.key && (
                              <div className="pl-3.5 mt-0.5">
                                {g.items.map(it => (
                                  <button
                                    key={it.id}
                                    onClick={(e) => { e.stopPropagation(); onLocateEntity?.(it.lat, it.lng); }}
                                    className="w-full flex items-baseline gap-2 py-0.5 text-left hover:bg-white/[0.04] rounded px-1"
                                  >
                                    <span className="text-[10px] font-mono text-white/80 truncate">{it.label}</span>
                                    {it.detail && <span className="text-[10px] font-mono text-white/30 truncate">{it.detail}</span>}
                                  </button>
                                ))}
                                {g.count > MAX_ITEMS_PER_GROUP && (
                                  <p className="text-[10px] font-mono text-white/25 px-1 py-0.5">
                                    +{(g.count - MAX_ITEMS_PER_GROUP).toLocaleString()} more not listed
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {report.total > 0 && (
                          <div className="flex gap-1 mt-2 pt-2 border-t border-white/[0.06]">
                            {/* Finding the objects is only half of it; the next
                                stop is usually a spreadsheet. */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const stamp = new Date().toISOString().slice(0, 10);
                                downloadFile(`${polygon.name.replace(/s+/g, "-")}-contents-${stamp}.csv`,
                                  contentsToCSV(polygon, report), "text/csv");
                              }}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-mono tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition"
                            >
                              <Table className="w-2.5 h-2.5" /> CSV
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const stamp = new Date().toISOString().slice(0, 10);
                                downloadFile(`${polygon.name.replace(/s+/g, "-")}-contents-${stamp}.geojson`,
                                  JSON.stringify(contentsToGeoJSON(polygon, report), null, 2), "application/geo+json");
                              }}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-mono tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition"
                            >
                              <FileDown className="w-2.5 h-2.5" /> GEOJSON
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Tripwire log. Only shown once something is armed — an empty panel
            for a feature nobody switched on is just noise. */}
        {watched && watched.size > 0 && (
          <div className="border-t border-white/[0.04] bg-black/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Radar className="w-3 h-3 text-[var(--alert-green)] animate-pulse" />
              <span className="text-[10px] font-mono tracking-[0.2em] text-[var(--alert-green)] flex-1">
                WATCHING {watched.size}
              </span>
              <span className="text-[10px] font-mono text-white/30 tabular-nums">{watchEvents.length} events</span>
            </div>
            <div className="max-h-[120px] overflow-y-auto styled-scrollbar">
              {watchEvents.length === 0 ? (
                <p className="px-3 pb-2 text-[10px] font-mono text-white/30">
                  Baseline recorded. Movement in or out will appear here.
                </p>
              ) : watchEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 px-3 py-1 hover:bg-white/[0.03]">
                  {ev.kind === 'enter'
                    ? <LogIn className="w-2.5 h-2.5 text-[var(--alert-green)] flex-shrink-0" />
                    : <LogOut className="w-2.5 h-2.5 text-[#FF3D57] flex-shrink-0" />}
                  <span className="text-[10px] font-mono text-white/80 truncate flex-1">{ev.label}</span>
                  <span className="text-[10px] font-mono truncate" style={{ color: ev.color }}>{ev.layerLabel}</span>
                  <span className="text-[10px] font-mono text-white/30 tabular-nums flex-shrink-0">{watchAgo(ev.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Satellite,
  ExternalLink,
  Search,
  Loader2,
  Cloud,
  Calendar,
  Camera,
  Layers,
  Eye,
  Crosshair,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Maximize2
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   OSIRIS — SATELLITE IMAGERY PANEL
   Sentinel-2 STAC archive search + commercial/free imagery links
   ═══════════════════════════════════════════════════════════════ */

export interface SatellitePanelProps {
  coordinates?: { lat: number; lng: number } | null;
  polygon?: GeoJSON.Polygon | null;
  onLocate?: (lat: number, lng: number) => void;
}

interface SentinelScene {
  id: string;
  datetime: string;
  platform: string;
  orbit: string | null;
  polarization: string[] | null;
  mode: string | null;
  resolution: number | null;
  pass_direction: number | null;
  cloud_cover: number | null;
  bbox: number[] | null;
  thumbnail: string | null;
  preview: string | null;
  geometry_type: string | null;
  area_km2: number | null;
}

interface SearchResult {
  source: string;
  scenes: SentinelScene[];
  total: number;
  bbox: number[];
  datetime: string;
  timestamp: string;
}

const FREE_SOURCES = [
  {
    name: 'Sentinel Hub EO Browser',
    url: 'https://apps.sentinel-hub.com/eo-browser/',
    desc: 'Multi-spectral Sentinel-2 imagery with band composites',
    color: '#00E5FF',
  },
  {
    name: 'NASA Worldview',
    url: 'https://worldview.earthdata.nasa.gov/',
    desc: 'Near real-time satellite imagery from NASA missions',
    color: '#448AFF',
  },
  {
    name: 'Google Earth Timelapse',
    url: 'https://earthengine.google.com/timelapse/',
    desc: 'Historical satellite timelapse from 1984–present',
    color: '#00E676',
  },
];

export default function SatellitePanel({
  coordinates,
  polygon,
  onLocate,
}: SatellitePanelProps) {
  const [lat, setLat] = useState(coordinates?.lat?.toFixed(4) ?? '');
  const [lng, setLng] = useState(coordinates?.lng?.toFixed(4) ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [showFree, setShowFree] = useState(true);
  const [showCommercial, setShowCommercial] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedScene, setSelectedScene] = useState<SentinelScene | null>(null);

  // 11. Auto-sync LAT/LNG inputs when coordinates prop changes (useEffect)
  useEffect(() => {
    if (coordinates) {
      setLat(coordinates.lat.toFixed(4));
      setLng(coordinates.lng.toFixed(4));
    }
  }, [coordinates]);

  const searchArchive = useCallback(async () => {
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) {
      setError('Invalid coordinates — enter valid lat/lng values');
      return;
    }
    setLoading(true);
    setError('');
    setResults(null);
    setSelectedScene(null);

    try {
      const res = await fetch(
        `/api/sentinel?lat=${latN}&lng=${lngN}&days=${days}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Search failed (${res.status})`);
      }
      const data: SearchResult = await res.json();
      setResults(data);

      if (data.scenes.length === 0) {
        setError('No scenes found — try a wider time range or different coordinates');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [lat, lng, days]);

  const handleSceneClick = (scene: SentinelScene) => {
    setSelectedScene(scene);
    setExpandedScene(expandedScene === scene.id ? null : scene.id);
    if (scene.bbox && scene.bbox.length >= 4 && onLocate) {
      const centerLat = (scene.bbox[1] + scene.bbox[3]) / 2;
      const centerLng = (scene.bbox[0] + scene.bbox[2]) / 2;
      onLocate(centerLat, centerLng);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getCloudColor = (cover: number | null) => {
    if (cover === null) return 'var(--text-muted)';
    if (cover <= 10) return '#00E676';
    if (cover <= 30) return '#D4AF37';
    if (cover <= 60) return '#FF9500';
    return '#FF3D57';
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'element84':
        return 'Sentinel-1 GRD';
      case 'element84-s2':
        return 'Sentinel-2 L2A';
      case 'copernicus':
        return 'Copernicus STAC';
      default:
        return source.toUpperCase();
    }
  };

  return (
    <div className="glass-panel flex flex-col gap-4 p-4 h-full overflow-y-auto styled-scrollbar">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            className="p-1.5 rounded-full bg-[#448AFF]/10 border border-[#448AFF]/30 shadow-[0_0_15px_rgba(68,138,255,0.3)]"
          >
            <Satellite className="w-5 h-5 text-[#448AFF]" />
          </motion.div>
          <div className="flex flex-col">
            <span className="text-[14px] font-mono font-bold tracking-[0.2em] text-white">
              SATELLITE
            </span>
            <span className="text-[11px] font-mono tracking-wider text-[#448AFF]">
              IMAGERY ARCHIVE
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00E676]/10 border border-[#00E676]/20">
          <div className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse shadow-[0_0_8px_#00E676]" />
          <span className="text-[11px] font-mono font-bold text-[#00E676] tracking-wider">
            STAC ONLINE
          </span>
        </div>
      </div>

      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, rgba(68,138,255,0.3), rgba(68,138,255,0.1), transparent)',
        }}
      />

      {/* ── COORDINATE INPUT ── */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase">
              LAT
            </span>
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="0.0000"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 pl-9 py-2 text-center font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30 focus:outline-none focus:border-[#448AFF]/50 focus:bg-[#448AFF]/5 transition-all"
            />
          </div>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase">
              LNG
            </span>
            <input
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="0.0000"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2 pl-9 py-2 text-center font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30 focus:outline-none focus:border-[#448AFF]/50 focus:bg-[#448AFF]/5 transition-all"
            />
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2">
          {polygon && (
            <button
              onClick={() => {
                if (polygon.coordinates?.[0]) {
                  const ring = polygon.coordinates[0];
                  const centroidLat =
                    ring.reduce((s, c) => s + c[1], 0) / ring.length;
                  const centroidLng =
                    ring.reduce((s, c) => s + c[0], 0) / ring.length;
                  setLat(centroidLat.toFixed(4));
                  setLng(centroidLng.toFixed(4));
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--gold-primary)]/10 border border-[var(--gold-primary)]/20 text-[var(--gold-primary)] text-[12px] font-mono font-bold tracking-wider hover:bg-[var(--gold-primary)]/20 transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              USE POLYGON
            </button>
          )}
          {/* Days selector */}
          <div className="flex flex-1 items-center bg-black/40 border border-white/10 rounded-lg overflow-hidden">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`flex-1 py-2 text-[12px] font-mono transition-all ${
                  days === d
                    ? 'bg-[#448AFF]/20 text-[#448AFF] font-bold'
                    : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-white'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── SEARCH BUTTON ── */}
      <button
        onClick={searchArchive}
        disabled={loading || (!lat && !lng)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[12px] font-mono font-bold tracking-[0.2em] transition-all disabled:opacity-30 disabled:cursor-not-allowed group relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(68,138,255,0.15), rgba(68,138,255,0.05))',
          border: '1px solid rgba(68,138,255,0.4)',
          color: '#448AFF',
          boxShadow: loading ? 'none' : '0 0 20px rgba(68,138,255,0.15)',
        }}
      >
        <div className="absolute inset-0 bg-[#448AFF]/10 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
        <div className="relative flex items-center justify-center gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {loading ? 'SCANNING ARCHIVE...' : 'SEARCH ARCHIVE'}
        </div>
      </button>

      {/* ── ERROR ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] font-mono text-red-400"
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LOADING SKELETON ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-[#00E5FF]/5 border border-[#00E5FF]/20 animate-pulse shadow-[0_0_10px_rgba(0,229,255,0.1)]"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
            <div className="flex items-center justify-center gap-2 py-3">
              <div
                className="w-2.5 h-2.5 rounded-full bg-[var(--cyan-primary)] animate-ping"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full bg-[var(--cyan-primary)] animate-ping"
                style={{ animationDelay: '300ms' }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full bg-[var(--cyan-primary)] animate-ping"
                style={{ animationDelay: '600ms' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RESULTS ── */}
      <AnimatePresence>
        {results && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {/* Results header */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-mono font-bold tracking-wider text-[var(--text-heading)] flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#448AFF]" />
                {results.scenes.length} SCENE{results.scenes.length !== 1 ? 'S' : ''} · {getSourceLabel(results.source).toUpperCase()} · LAST {days} DAYS
              </span>
            </div>

            {/* Scene cards */}
            <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto styled-scrollbar pr-1">
              {results.scenes.map((scene, idx) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => handleSceneClick(scene)}
                  className={`group rounded-lg cursor-pointer transition-all ${
                    selectedScene?.id === scene.id
                      ? 'bg-[#448AFF]/10 border-[#448AFF]/40 shadow-[0_0_15px_rgba(68,138,255,0.1)]'
                      : 'bg-black/40 border-white/10 hover:bg-black/60 hover:border-white/20'
                  } border`}
                >
                  <div className="flex flex-col p-3 gap-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[#448AFF]" />
                        <span className="text-[11px] font-mono font-bold text-white">
                          {formatDate(scene.datetime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white font-bold tracking-wider">
                          {scene.platform}
                        </span>
                        {scene.cloud_cover !== null && (
                          <div 
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[11px]"
                            style={{ 
                              background: `${getCloudColor(scene.cloud_cover)}20`,
                              color: getCloudColor(scene.cloud_cover),
                              border: `1px solid ${getCloudColor(scene.cloud_cover)}40`
                            }}
                          >
                            <Cloud className="w-2.5 h-2.5" />
                            {scene.cloud_cover.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {expandedScene === scene.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 pt-0 border-t border-white/5">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                            <DetailRow
                              label="BBOX"
                              value={
                                scene.bbox
                                  ? `[${scene.bbox.map((b) => b.toFixed(2)).join(', ')}]`
                                  : 'N/A'
                              }
                            />
                            <DetailRow
                              label="RESOLUTION"
                              value={
                                scene.resolution
                                  ? `${scene.resolution}m`
                                  : '10m (S2)'
                              }
                            />
                            <DetailRow label="ORBIT" value={scene.orbit || 'N/A'} />
                            <DetailRow label="MODE" value={scene.mode || 'N/A'} />
                          </div>
                          {/* Quick action links */}
                          <div className="flex gap-2 mt-3">
                            {scene.preview && (
                              <a
                                href={scene.preview}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#448AFF]/15 border border-[#448AFF]/30 text-[#448AFF] text-[12px] font-mono font-bold hover:bg-[#448AFF]/25 transition-all"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                PREVIEW
                              </a>
                            )}
                            <a
                              href={`https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=${
                                scene.bbox
                                  ? ((scene.bbox[1] + scene.bbox[3]) / 2).toFixed(4)
                                  : lat
                              }&lng=${
                                scene.bbox
                                  ? ((scene.bbox[0] + scene.bbox[2]) / 2).toFixed(4)
                                  : lng
                              }`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-[12px] font-mono font-bold hover:bg-white/10 transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              EO BROWSER
                            </a>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            {/* Total results note */}
            {results.total > results.scenes.length && (
              <div className="text-center text-[11px] font-mono text-[var(--text-muted)] py-1">
                Showing {results.scenes.length} of {results.total} total scenes
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HIGH-RES IMAGERY ── */}
      <div className="flex flex-col gap-2 mt-2">
        <button
          onClick={() => setShowCommercial(!showCommercial)}
          className="flex items-center justify-between w-full group py-1"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-[var(--gold-primary)]" />
            <span className="text-[11px] font-mono font-bold tracking-[0.15em] text-[var(--gold-primary)]">
              HIGH-RES IMAGERY
            </span>
          </div>
          <div className="opacity-40 group-hover:opacity-100 transition-opacity">
            {showCommercial ? (
              <ChevronUp className="w-4 h-4 text-[var(--gold-primary)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--gold-primary)]" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {showCommercial && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div
                className="flex flex-col gap-3 p-3.5 rounded-xl mt-1"
                style={{
                  background: 'linear-gradient(180deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)',
                  border: '1px solid rgba(212,175,55,0.2)',
                  boxShadow: 'inset 0 1px 0 rgba(212,175,55,0.1)',
                }}
              >
                <p className="text-[12px] font-mono text-white/80 leading-relaxed">
                  Order premium commercial satellite imagery (50cm–30cm resolution). 
                  Task new captures or access archive imagery.
                </p>

                {/* Specs grid */}
                <div className="grid grid-cols-3 gap-2">
                  <SpecBadge label="MIN AREA" value="5 km²" color="var(--gold-primary)" />
                  <SpecBadge label="FROM" value="$5/km²" color="var(--gold-primary)" />
                  <SpecBadge label="TYPES" value="SAR+3D" color="var(--gold-primary)" />
                </div>

                <a
                  href="https://app.skyfi.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-[11px] font-mono font-bold tracking-[0.15em] transition-all hover:shadow-[0_0_20px_rgba(212,175,55,0.2)] mt-1"
                  style={{
                    background: 'rgba(212,175,55,0.15)',
                    border: '1px solid rgba(212,175,55,0.4)',
                    color: 'var(--gold-primary)',
                  }}
                >
                  <Maximize2 className="w-4 h-4" />
                  OPEN SKYFI
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FREE SOURCES ── */}
      <div className="flex flex-col gap-2 mt-1">
        <button
          onClick={() => setShowFree(!showFree)}
          className="flex items-center justify-between w-full group py-1"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-[var(--cyan-primary)]" />
            <span className="text-[11px] font-mono font-bold tracking-[0.15em] text-[var(--cyan-primary)]">
              FREE SOURCES
            </span>
          </div>
          <div className="opacity-40 group-hover:opacity-100 transition-opacity">
            {showFree ? (
              <ChevronUp className="w-4 h-4 text-[var(--cyan-primary)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--cyan-primary)]" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {showFree && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-2 mt-1">
                {FREE_SOURCES.map((src) => (
                  <a
                    key={src.name}
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/10 hover:border-white/20 hover:bg-black/50 transition-all relative overflow-hidden"
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 opacity-80"
                      style={{ background: src.color }}
                    />
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-mono font-bold tracking-wider"
                          style={{ color: src.color }}
                        >
                          {src.name}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-80 transition-opacity" />
                      </div>
                      <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1 leading-relaxed pr-2">
                        {src.desc}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FOOTER ── */}
      <div
        className="h-px w-full mt-auto"
        style={{
          background:
            'linear-gradient(90deg, rgba(68,138,255,0.2), transparent)',
        }}
      />
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] tracking-wider">
          DATA SOURCE: ELEMENT84 / COPERNICUS
        </span>
        <span className="text-[10px] font-mono font-bold text-[var(--text-muted)]">
          {results?.timestamp
            ? new Date(results.timestamp).toLocaleTimeString()
            : '—'}
        </span>
      </div>
    </div>
  );
}

/* ── Helper components ── */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-[12px] font-mono text-white break-all leading-tight">
        {value}
      </span>
    </div>
  );
}

function SpecBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-2 rounded-lg"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}25`,
      }}
    >
      <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </span>
      <span
        className="text-[11px] font-mono font-bold tracking-wider"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

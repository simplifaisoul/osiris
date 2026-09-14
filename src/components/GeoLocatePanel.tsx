'use client';

import { useState, useCallback, useRef, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Upload, Loader2, X, Crosshair, Zap, Target,
  ImageIcon, AlertTriangle, ChevronDown, ChevronUp, Compass, CheckCircle2, XCircle,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface GeoCandidate {
  label: string; country: string; latitude: number; longitude: number; confidence: number;
}
interface TaggedCandidate extends GeoCandidate {
  providerId: string; providerName: string;
}
interface ProviderResult {
  ok: boolean;
  providerId: string;
  providerName?: string;
  primary?: GeoCandidate & { reasoning: string };
  candidates?: GeoCandidate[];
  clues?: string[];
  error?: string;
}
interface GeoResponse {
  ok: boolean;
  error?: string;
  mode?: string;
  results?: ProviderResult[];
  merged?: {
    primary?: TaggedCandidate & { reasoning?: string };
    candidates?: TaggedCandidate[];
  };
}
interface Provider {
  id: string;
  name: string;
  configured: boolean;
}

interface GeoLocatePanelProps {
  isMobile?: boolean;
  onClose?: () => void;
  /** Plot a located point on the map + fly to it. */
  onGeolocate?: (label: string, data: { lat: number; lng: number; confidence: number; label: string }) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_BYTES = 10 * 1024 * 1024;

function confColor(c: number) {
  if (c >= 70) return 'var(--alert-green)';
  if (c >= 40) return 'var(--gold-primary)';
  return 'var(--alert-red)';
}

function GeoLocatePanelInner({ isMobile, onGeolocate }: GeoLocatePanelProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<'fast' | 'precise'>('fast');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(['gemini']);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeoResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showCluesFor, setShowCluesFor] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const res = await fetch('/api/geolocate');
        const data = await res.json();
        if (data.ok) {
          setProviders(data.providers);
        }
      } catch (err) {
        console.error('Failed to load providers:', err);
      }
    };
    loadProviders();
  }, []);

  const toggleProvider = useCallback((id: string) => {
    setSelectedProviders((prev) => (
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    ));
  }, []);

  const acceptFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError(t('geo.errType')); return; }
    if (f.size > MAX_BYTES) { setError(t('geo.errSize')); return; }
    setError('');
    setResult(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
  }, [t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }, [acceptFile]);

  const analyze = useCallback(async () => {
    if (!file || loading || selectedProviders.length === 0) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('context', context);
      fd.append('mode', mode);
      fd.append('providers', JSON.stringify(selectedProviders));
      const res = await fetch('/api/geolocate', { method: 'POST', body: fd });
      const data: GeoResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || t('geo.errGeneric'));
      } else {
        setResult(data);
        const primary = data.merged?.primary;
        if (primary && onGeolocate) {
          onGeolocate(primary.label, {
            lat: primary.latitude, lng: primary.longitude,
            confidence: primary.confidence, label: primary.label,
          });
        }
      }
    } catch {
      setError(t('geo.errNetwork'));
    } finally {
      setLoading(false);
    }
  }, [file, context, mode, selectedProviders, loading, onGeolocate, t]);

  const reset = useCallback(() => {
    setResult(null); setError('');
    setFile(null);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  const locateOn = useCallback((c: GeoCandidate) => {
    onGeolocate?.(c.label, { lat: c.latitude, lng: c.longitude, confidence: c.confidence, label: c.label });
  }, [onGeolocate]);

  return (
    <motion.div
      initial={{ opacity: 0, x: isMobile ? 0 : 20 }} animate={{ opacity: 1, x: 0 }}
      className="glass-panel p-3 pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-sm border border-[var(--cyan-primary)]/40 bg-[var(--cyan-primary)]/10 flex items-center justify-center">
          <Compass className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
        </div>
        <div className="flex flex-col">
          <span className="hud-text text-[10px] text-[var(--text-primary)] tracking-wider font-bold">{t('geo.title')}</span>
          <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest uppercase">{t('geo.subtitle')}</span>
        </div>
      </div>

      {/* Drop zone / preview */}
      {!preview ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center py-7 px-3 text-center ${
            dragOver ? 'border-[var(--cyan-primary)] bg-[var(--cyan-primary)]/5' : 'border-[var(--border-primary)] hover:border-[var(--cyan-primary)]/50'
          }`}
        >
          <Upload className="w-6 h-6 text-[var(--cyan-primary)] mb-2" />
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">{t('geo.drop')}</span>
          <span className="text-[7px] font-mono text-[var(--text-muted)] mt-1">{t('geo.formats')}</span>
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden border border-[var(--border-primary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="upload" className="w-full max-h-44 object-cover" />
          <button
            onClick={reset}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
            title={t('common.close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {loading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              {/* scanning sweep */}
              <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--cyan-primary)] to-transparent" style={{ animation: 'geoScan 1.8s linear infinite' }} />
              <Loader2 className="w-6 h-6 text-[var(--cyan-primary)] animate-spin mb-2" />
              <span className="text-[7px] font-mono text-[var(--cyan-primary)] tracking-widest">{t('geo.analyzing')}</span>
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])} />

      {/* Context + controls */}
      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder={t('geo.contextPlaceholder')}
        className="mt-2 w-full bg-black/30 border border-[var(--border-primary)] rounded px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--cyan-primary)]/50"
      />

      {/* Provider multi-select */}
      <div className="mt-2">
        <div className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest uppercase mb-1">
          {t('geo.providers')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => {
            const checked = selectedProviders.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!p.configured}
                onClick={() => toggleProvider(p.id)}
                title={!p.configured ? t('geo.notConfigured') : p.name}
                className={`px-2 py-1 rounded border text-[9px] font-mono flex items-center gap-1 transition-colors ${
                  checked ? 'border-[var(--cyan-primary)]/50 bg-[var(--cyan-primary)]/15 text-[var(--cyan-primary)]' : 'border-[var(--border-primary)] text-[var(--text-muted)]'
                } ${!p.configured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--cyan-primary)]/40'}`}
              >
                {checked ? '[x]' : '[ ]'} {p.name}{!p.configured ? ` (${t('geo.notConfigured')})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* mode toggle */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex rounded border border-[var(--border-primary)] overflow-hidden text-[9px] font-mono">
          <button
            onClick={() => setMode('fast')}
            className={`px-2 py-1 flex items-center gap-1 transition-colors ${mode === 'fast' ? 'bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            <Zap className="w-3 h-3" />{t('geo.fast')}
          </button>
          <button
            onClick={() => setMode('precise')}
            className={`px-2 py-1 flex items-center gap-1 transition-colors ${mode === 'precise' ? 'bg-[var(--gold-primary)]/20 text-[var(--gold-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            <Target className="w-3 h-3" />{t('geo.precise')}
          </button>
        </div>
      </div>

      <div className="mt-2">
        <button
          onClick={analyze}
          disabled={!file || loading || selectedProviders.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--cyan-primary)]/15 border border-[var(--cyan-primary)]/40 text-[var(--cyan-primary)] text-[11px] font-mono font-bold tracking-wider hover:bg-[var(--cyan-primary)]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
          {t('geo.locate')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--alert-red)]/10 border border-[var(--alert-red)]/30">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--alert-red)] shrink-0 mt-0.5" />
          <span className="text-[9px] font-mono text-[var(--alert-red)] leading-relaxed">{error}</span>
        </div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result?.merged?.primary && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
            {/* Per-provider status strip — keeps partial failures visible in combined mode */}
            {result.results && result.results.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {result.results.map((r) => (
                  <span key={r.providerId} className="flex items-center gap-1 text-[8px] font-mono text-[var(--text-muted)]" title={r.error || ''}>
                    {r.ok ? <CheckCircle2 className="w-2.5 h-2.5 text-[var(--alert-green)]" /> : <XCircle className="w-2.5 h-2.5 text-[var(--alert-red)]" />}
                    {r.providerName || r.providerId}
                  </span>
                ))}
              </div>
            )}

            {/* Primary */}
            <div className="rounded-lg border border-[var(--cyan-primary)]/30 bg-[var(--cyan-primary)]/[0.04] p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="hud-label">{t('geo.bestGuess')}</span>
                <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color: confColor(result.merged.primary.confidence) }}>
                  {result.merged.primary.confidence}% {t('geo.confidence')}
                </span>
              </div>
              <div className="text-[7px] font-mono text-[var(--text-muted)] mb-1">
                Provider: {result.merged.primary.providerName}
              </div>
              <button onClick={() => locateOn(result.merged!.primary!)} className="flex items-center gap-1.5 text-left group">
                <MapPin className="w-3.5 h-3.5 text-[var(--cyan-primary)] shrink-0" />
                <span className="text-[12px] font-bold text-[var(--text-heading)] group-hover:text-[var(--cyan-primary)] transition-colors">{result.merged.primary.label}</span>
              </button>
              <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                {result.merged.primary.country} · {result.merged.primary.latitude.toFixed(4)} · {result.merged.primary.longitude.toFixed(4)}
              </div>
              {result.merged.primary.reasoning && (
                <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed mt-1.5">{result.merged.primary.reasoning}</p>
              )}
            </div>

            {/* Alternatives */}
            {result.merged.candidates && result.merged.candidates.length > 0 && (
              <div className="mt-2">
                <div className="hud-label mb-1">{t('geo.alternatives')}</div>
                <div className="space-y-1">
                  {result.merged.candidates.map((c, i) => (
                    <button key={i} onClick={() => locateOn(c)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded bg-black/20 hover:bg-[var(--cyan-primary)]/10 border border-[var(--border-primary)] transition-colors text-left group">
                      <MapPin className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--cyan-primary)] shrink-0" />
                      <span className="flex-1 text-[10px] font-mono text-[var(--text-secondary)] truncate">{c.label}</span>
                      <span className="text-[7px] font-mono text-[var(--text-muted)]/70 shrink-0">{c.providerName}</span>
                      <span className="text-[8px] font-mono tabular-nums shrink-0" style={{ color: confColor(c.confidence) }}>{c.confidence}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clues — from whichever provider produced the merged primary result */}
            {(() => {
              const clues = result.results?.find((r) => r.ok && r.providerId === result.merged?.primary?.providerId)?.clues;
              if (!clues || clues.length === 0) return null;
              return (
                <div className="mt-2">
                  <button onClick={() => setShowCluesFor((v) => !v)} className="flex items-center gap-1 hud-label hover:text-[var(--text-secondary)]">
                    <ImageIcon className="w-3 h-3" />{t('geo.clues')}
                    {showCluesFor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showCluesFor && (
                    <ul className="mt-1 space-y-0.5">
                      {clues.map((clue, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
                          <span className="text-[var(--cyan-primary)] mt-0.5">▸</span>{clue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <p className="text-[7px] font-mono text-[var(--text-muted)]/60 mt-2 leading-relaxed">{t('geo.disclaimer')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes geoScan { 0% { top: 0; } 100% { top: 100%; } }`}</style>
    </motion.div>
  );
}

const GeoLocatePanel = memo(GeoLocatePanelInner);
export default GeoLocatePanel;

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, RefreshCw, X } from 'lucide-react';

/**
 * OSIRIS — One-Click AI Overview
 * Drop-in button that generates an intelligence read-out for whatever
 * data payload it's handed. Posts to /api/ai/overview which works with
 * or without a Gemini key (heuristic analyst fallback), so it always
 * returns something useful. Anyone can click it.
 */

interface AiOverviewProps {
  mode: 'alerts' | 'markets';
  payload: any;
  accent?: string;
}

interface OverviewResult {
  overview: string;
  highlights: string[];
  generatedBy: 'gemini' | 'analyst';
  generatedAt: string;
}

export default function AiOverview({ mode, payload, accent = '#7C4DFF' }: AiOverviewProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OverviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Failed to generate overview');
    } finally {
      setLoading(false);
    }
  }, [mode, payload]);

  const handleClick = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && !result && !loading) generate();
  }, [open, result, loading, generate]);

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono tracking-wider transition-all border"
        style={{
          color: accent,
          borderColor: `${accent}55`,
          background: `${accent}12`,
        }}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? 'ANALYZING…' : 'AI OVERVIEW'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-2 p-2.5 rounded-lg border text-[10px] leading-relaxed"
              style={{ borderColor: `${accent}33`, background: `${accent}08` }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono tracking-widest text-[8px]" style={{ color: accent }}>
                  {result ? `OSIRIS ${result.generatedBy === 'gemini' ? 'AI' : 'ANALYST'}` : 'OSIRIS ANALYST'}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={generate} disabled={loading} className="hover:opacity-70 transition-opacity" title="Regenerate">
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} style={{ color: accent }} />
                  </button>
                  <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity" title="Close">
                    <X className="w-3 h-3 text-[var(--text-muted)]" />
                  </button>
                </div>
              </div>

              {loading && !result && (
                <div className="flex items-center gap-2 py-2 text-[var(--text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Reading the feed…
                </div>
              )}

              {error && <div className="text-[var(--alert-red)] py-1">⚠ {error}</div>}

              {result && (
                <>
                  <div className="text-[var(--text-primary)] whitespace-pre-line">{result.overview}</div>

                  {result.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {result.highlights.map((h, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[8px] font-mono"
                          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}33` }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 text-[7px] font-mono text-[var(--text-muted)] tracking-wide">
                    {result.generatedBy === 'gemini' ? 'GEMINI 2.0 FLASH' : 'HEURISTIC ANALYST'} ·{' '}
                    {new Date(result.generatedAt).toLocaleTimeString()}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

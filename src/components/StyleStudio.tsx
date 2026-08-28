'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, RotateCcw, Copy, Check, ClipboardPaste } from 'lucide-react';
import {
  applySettings,
  FONT_MONO,
  FONT_UI,
  HEX_RE,
  clearSettings,
  loadSavedSettings,
  PRESETS,
  readTheme,
  sanitize,
  saveSettings,
  shade,
  type StyleSettings,
} from '@/lib/style-tokens';

/**
 * Style Studio — the panel. All token maths lives in `@/lib/style-tokens`;
 * this file is the controls and the wiring around them.
 */

/* ── Controls ── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative flex items-center gap-2 cursor-pointer">
      <span className="text-[10px] font-mono uppercase text-white/30 tabular-nums">{value}</span>
      <span
        className="w-7 h-7 rounded-md border border-white/15 shrink-0"
        style={{ background: value, boxShadow: `0 0 10px ${value}55` }}
      />
      <input
        type="color"
        value={HEX_RE.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label={label}
      />
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 max-w-[150px]">
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className="flex-1 h-1 appearance-none rounded-full bg-white/10 accent-[var(--gold-primary)] cursor-pointer"
      />
      <span className="text-[10px] font-mono tabular-nums text-white/40 w-9 text-right">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

/**
 * A slider with an explicit AUTO state. AUTO means "emit no rule", which is
 * how an untouched knob leaves the app's own styling intact.
 */
function AutoSlider({ label, value, min, max, step, whenEnabled, onChange, format }: {
  label: string; value: number | null; min: number; max: number; step: number;
  whenEnabled: number; onChange: (v: number | null) => void; format: (v: number) => string;
}) {
  const auto = value === null;
  return (
    <div className="flex items-center gap-1.5 flex-1 max-w-[168px]">
      <button
        onClick={() => onChange(auto ? whenEnabled : null)}
        aria-pressed={auto}
        title={auto ? `${label}: following the app's own styling` : `${label}: overridden`}
        className={`px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider border transition-colors shrink-0 ${
          auto
            ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/15 text-[var(--gold-light)]'
            : 'border-white/10 text-white/30 hover:text-white/60'
        }`}
      >
        AUTO
      </button>
      <input
        type="range" min={min} max={max} step={step}
        value={auto ? whenEnabled : value}
        disabled={auto}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className={`flex-1 h-1 appearance-none rounded-full bg-white/10 accent-[var(--gold-primary)] ${auto ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
      />
      <span className="text-[10px] font-mono tabular-nums text-white/40 w-9 text-right">
        {auto ? 'auto' : format(value)}
      </span>
    </div>
  );
}

function Segmented({ label, options, value, onChange }: {
  label: string; options: { label: string; value: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-end" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.label}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-2 py-1 rounded text-[9px] font-mono tracking-wider border transition-colors ${
            value === o.value
              ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/15 text-[var(--gold-light)]'
              : 'border-white/10 text-white/35 hover:text-white/60'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="text-[9px] font-mono tracking-[0.25em] uppercase text-white/25 border-b border-white/[0.07] pb-1 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function StyleStudio({ onClose, isMobile }: { onClose: () => void; isMobile?: boolean }) {
  const [s, setS] = useState<StyleSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const initialised = useRef(false);
  /**
   * Until the user actually changes something there is nothing to override.
   * Without this, Reset would immediately re-apply a snapshot of the current
   * theme as inline vars — which look identical but pin the palette, so the
   * Ghost Protocol toggle would silently stop doing anything.
   */
  const dirty = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const saved = loadSavedSettings();
    if (saved) dirty.current = true;
    setS(saved ?? readTheme());
  }, []);

  useEffect(() => {
    if (!s || !dirty.current) return;
    applySettings(s);
    /* Debounced: a slider drag fires this on every frame. */
    const t = setTimeout(() => {
      saveSettings(s);
    }, 250);
    return () => clearTimeout(t);
  }, [s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* While clean, re-seed from the live theme so edits made after a theme
     switch start from what is actually on screen. */
  const edit = useCallback((patch: Partial<StyleSettings>) => {
    setS(prev => {
      const base = dirty.current && prev ? prev : readTheme();
      return { ...base, ...patch };
    });
    dirty.current = true;
  }, []);

  const set = useCallback(<K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) => {
    edit({ [key]: value } as Partial<StyleSettings>);
  }, [edit]);

  /* The surface ramp follows the background unless a preset supplies its own. */
  const setBg = useCallback((bg: string) => {
    edit({ bg, bgPrimary: shade(bg, 0.03), bgSecondary: shade(bg, 0.07), bgTertiary: shade(bg, 0.12) });
  }, [edit]);

  const reset = () => {
    dirty.current = false;
    clearSettings();
    applySettings(null);
    setS(readTheme());
  };

  const copy = async () => {
    if (!s) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      edit(sanitize(JSON.parse(text), s ?? readTheme()));
    } catch { /* not JSON, or clipboard blocked */ }
  };

  if (!s) return null;

  /* Portalled to <body>: the rail that renders the trigger carries a
     framer-motion transform, which would otherwise make this fixed panel
     position against the rail instead of the viewport. */
  return createPortal(
    <motion.div
      initial={{ opacity: 0, x: isMobile ? 0 : -12, y: isMobile ? 12 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: isMobile ? 0 : -12, y: isMobile ? 12 : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={`z-[400] pointer-events-auto flex flex-col rounded-xl border border-[var(--border-primary)] shadow-[0_16px_48px_rgba(0,0,0,0.7)] ${
        isMobile ? 'fixed inset-x-3 bottom-3 top-20' : 'fixed left-[58px] bottom-6 w-[340px] max-h-[min(78vh,720px)]'
      }`}
      style={{
        background: 'rgba(6, 4, 14, 0.96)',
        backdropFilter: 'blur(28px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
      }}
      role="dialog"
      aria-label="Style Studio"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07] shrink-0">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono tracking-[0.22em] uppercase text-[var(--gold-light)]">Style Studio</span>
          <span className="text-[9px] font-mono tracking-[0.1em] uppercase text-white/25">Live UI tokens</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={paste} title="Paste a shared theme from the clipboard" aria-label="Paste theme" className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>
          <button onClick={copy} title="Copy this theme as JSON" aria-label="Copy theme" className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--alert-green)]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={reset} title="Reset to the active theme" aria-label="Reset" className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} title="Close" aria-label="Close Style Studio" className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-3">
        <Section title="Preset">
          <div className="grid grid-cols-3 gap-1 pt-1">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => edit(p.patch)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/10 hover:border-[var(--border-active)] hover:bg-white/5 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.patch.accent, boxShadow: `0 0 6px ${p.patch.accent}` }} />
                <span className="text-[9px] font-mono tracking-wider text-white/50">{p.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Accent">
          <Row label="Primary"><Swatch label="Primary accent" value={s.accent} onChange={v => set('accent', v)} /></Row>
          <Row label="Secondary"><Swatch label="Secondary accent" value={s.accent2} onChange={v => set('accent2', v)} /></Row>
          <Row label="Glow"><Slider label="Glow strength" value={s.glow} min={0} max={1} step={0.01} onChange={v => set('glow', v)} format={v => `${Math.round(v * 100)}%`} /></Row>
        </Section>

        <Section title="Signal">
          <Row label="Critical"><Swatch label="Critical colour" value={s.alertRed} onChange={v => set('alertRed', v)} /></Row>
          <Row label="Warning"><Swatch label="Warning colour" value={s.alertOrange} onChange={v => set('alertOrange', v)} /></Row>
          <Row label="Nominal"><Swatch label="Nominal colour" value={s.alertGreen} onChange={v => set('alertGreen', v)} /></Row>
          <Row label="Info"><Swatch label="Info colour" value={s.alertBlue} onChange={v => set('alertBlue', v)} /></Row>
        </Section>

        <Section title="Surface">
          <Row label="Background"><Swatch label="Background colour" value={s.bg} onChange={setBg} /></Row>
          <Row label="Panel"><Slider label="Panel opacity" value={s.panelAlpha} min={0.2} max={1} step={0.01} onChange={v => set('panelAlpha', v)} format={v => `${Math.round(v * 100)}%`} /></Row>
          <Row label="Border"><Slider label="Border strength" value={s.borderAlpha} min={0} max={0.6} step={0.01} onChange={v => set('borderAlpha', v)} format={v => `${Math.round(v * 100)}%`} /></Row>
          <Row label="Blur"><AutoSlider label="Backdrop blur" value={s.blur} min={0} max={64} step={1} whenEnabled={24} onChange={v => set('blur', v)} format={v => `${v}px`} /></Row>
          <Row label="Radius"><Slider label="Corner radius" value={s.radius} min={0} max={2.5} step={0.05} onChange={v => set('radius', v)} format={v => `${v.toFixed(2)}x`} /></Row>
        </Section>

        <Section title="Text">
          <Row label="Primary"><Swatch label="Primary text" value={s.textPrimary} onChange={v => set('textPrimary', v)} /></Row>
          <Row label="Secondary"><Swatch label="Secondary text" value={s.textSecondary} onChange={v => set('textSecondary', v)} /></Row>
          <Row label="Muted"><Swatch label="Muted text" value={s.textMuted} onChange={v => set('textMuted', v)} /></Row>
          <Row label="Heading"><Swatch label="Heading text" value={s.textHeading} onChange={v => set('textHeading', v)} /></Row>
        </Section>

        <Section title="Typography">
          <Row label="UI font"><Segmented label="UI font" options={FONT_UI} value={s.fontUi} onChange={v => set('fontUi', v)} /></Row>
          <Row label="Mono font"><Segmented label="Mono font" options={FONT_MONO} value={s.fontMono} onChange={v => set('fontMono', v)} /></Row>
          <Row label="Tracking"><AutoSlider label="Mono tracking" value={s.tracking} min={-0.05} max={0.4} step={0.005} whenEnabled={0.2} onChange={v => set('tracking', v)} format={v => `${v.toFixed(2)}em`} /></Row>
        </Section>

        <Section title="Motion & FX">
          <Row label="Speed"><Slider label="Motion speed" value={s.motion} min={0} max={2} step={0.05} onChange={v => set('motion', v)} format={v => (v === 0 ? 'off' : `${v.toFixed(2)}x`)} /></Row>
          <Row label="Scanlines"><Slider label="Scanline overlay" value={s.scanlines} min={0} max={0.2} step={0.005} onChange={v => set('scanlines', v)} format={v => (v === 0 ? 'off' : `${Math.round(v * 500)}%`)} /></Row>
        </Section>

        <p className="text-[9px] font-mono leading-relaxed text-white/20 pt-1 pb-1">
          Saved to this browser. AUTO leaves the app&apos;s own styling alone. Reset restores the active theme.
        </p>
      </div>
    </motion.div>,
    document.body,
  );
}

export default memo(StyleStudio);

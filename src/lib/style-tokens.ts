/**
 * Style Studio token engine — the pure half of the customisation feature.
 *
 * Two mechanisms, deliberately kept apart:
 *
 *  - Palette values become CSS custom properties on <body>. Inline styles beat
 *    the `body.theme-*` rules in globals.css, so an override always wins over
 *    the active theme.
 *  - The few knobs no token covers (radius, blur, tracking, motion, scanlines)
 *    are emitted as rules into one injected <style> tag.
 *
 * Every setting is seeded from the live theme and every injected rule is
 * *conditional*, so touching one control changes only that control. Without
 * that, editing an accent colour would also flatten the app's mono tracking
 * and rewrite every backdrop blur to a single value.
 */

import {
  MAP_DEFAULTS,
  MAP_PALETTE_KEYS,
  MAP_VARS,
  readMapPalette,
  type MapPalette,
} from './map-palette';

const STORAGE_KEY = 'osiris:style-studio';
const STYLE_TAG_ID = 'osiris-style-studio';

export interface StyleSettings {
  accent: string;
  accent2: string;
  alertRed: string;
  alertOrange: string;
  alertGreen: string;
  alertBlue: string;
  bg: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  panelAlpha: number;
  borderAlpha: number;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textHeading: string;
  fontUi: string;
  fontMono: string;
  glow: number;
  /** null = leave the app's own value alone. */
  tracking: number | null;
  blur: number | null;
  radius: number;
  motion: number;
  scanlines: number;
  vignette: number;
  grain: number;
  /** Colours the map itself draws with — see ./map-palette. */
  map: MapPalette;
}

export const FONT_UI = [
  { label: 'INTER', value: "'Inter', -apple-system, sans-serif" },
  { label: 'MONO', value: "'JetBrains Mono', monospace" },
  { label: 'SYSTEM', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'SERIF', value: "'Iowan Old Style', Georgia, serif" },
];

export const FONT_MONO = [
  { label: 'JETBRAINS', value: "'JetBrains Mono', 'Courier New', monospace" },
  { label: 'COURIER', value: "'Courier New', Courier, monospace" },
  { label: 'CONSOLAS', value: "Consolas, 'SF Mono', Menlo, monospace" },
  { label: 'INTER', value: "'Inter', sans-serif" },
];

/** Neutral baseline: also the shape used to enumerate every var we own. */
export const DEFAULTS: StyleSettings = {
  accent: '#d4af37',
  accent2: '#00e5ff',
  alertRed: '#ff3d3d',
  alertOrange: '#ff9500',
  alertGreen: '#00e676',
  alertBlue: '#448aff',
  bg: '#04040a',
  bgPrimary: '#06060c',
  bgSecondary: '#0c0e1a',
  bgTertiary: '#121628',
  panelAlpha: 0.88,
  borderAlpha: 0.15,
  textPrimary: '#e8e6e0',
  textSecondary: '#9b978e',
  textMuted: '#5c5a54',
  textHeading: '#f5f0e0',
  fontUi: FONT_UI[0].value,
  fontMono: FONT_MONO[0].value,
  glow: 0.3,
  tracking: null,
  blur: null,
  radius: 1,
  motion: 1,
  scanlines: 0,
  vignette: 0,
  grain: 0,
  map: MAP_DEFAULTS,
};

export type Preset = { label: string; patch: Partial<StyleSettings> };

/** Presets carry a full surface ramp so they don't inherit the old one. */
export const PRESETS: Preset[] = [
  { label: 'HORUS', patch: { accent: '#d4af37', accent2: '#00e5ff', bg: '#04040a', bgPrimary: '#06060c', bgSecondary: '#0c0e1a', bgTertiary: '#121628', textPrimary: '#e8e6e0', textSecondary: '#9b978e', textMuted: '#5c5a54', textHeading: '#f5f0e0', glow: 0.3, scanlines: 0 } },
  { label: 'PHANTOM', patch: { accent: '#b388ff', accent2: '#7c4dff', bg: '#05000f', bgPrimary: '#08001a', bgSecondary: '#0d0025', bgTertiary: '#140033', textPrimary: '#e1bee7', textSecondary: '#9575cd', textMuted: '#6a4c93', textHeading: '#b388ff', glow: 0.35, scanlines: 0 } },
  { label: 'TERMINAL', patch: { accent: '#00ff9c', accent2: '#00b36b', bg: '#000a06', bgPrimary: '#001410', bgSecondary: '#00201a', bgTertiary: '#002d24', textPrimary: '#c8ffe4', textSecondary: '#5fbf95', textMuted: '#2e6b52', textHeading: '#7dffc4', glow: 0.4, scanlines: 0.05 } },
  { label: 'CRIMSON', patch: { accent: '#ff4d5a', accent2: '#ff9500', bg: '#0c0204', bgPrimary: '#140407', bgSecondary: '#1e070b', bgTertiary: '#2a0a10', textPrimary: '#ffd9dd', textSecondary: '#c98089', textMuted: '#6e3a42', textHeading: '#ff8f97', glow: 0.35, scanlines: 0 } },
  { label: 'ARCTIC', patch: { accent: '#8fd3ff', accent2: '#4fc3f7', bg: '#04080f', bgPrimary: '#070d18', bgSecondary: '#0b1524', bgTertiary: '#101f33', textPrimary: '#e3f2fd', textSecondary: '#90a4b8', textMuted: '#4a5d70', textHeading: '#c9e7ff', glow: 0.25, scanlines: 0 } },
  { label: 'BLACKOUT', patch: { accent: '#9e9e9e', accent2: '#616161', bg: '#000000', bgPrimary: '#070707', bgSecondary: '#0e0e0e', bgTertiary: '#161616', textPrimary: '#e0e0e0', textSecondary: '#8a8a8a', textMuted: '#4a4a4a', textHeading: '#f0f0f0', glow: 0.08, scanlines: 0 } },
];

/* ── Colour helpers ── */
export const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number) {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** amount > 0 lightens toward white, < 0 darkens toward black. */
export function shade(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return toHex(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a);
}

const rgbList = (hex: string) => { const { r, g, b } = hexToRgb(hex); return `${r}, ${g}, ${b}`; };
const rgba = (hex: string, a: number) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`; };

/* ── Validation ──
   Pasted JSON and stored JSON are both untrusted: numbers reach the injected
   stylesheet as text, so anything unvalidated is a CSS injection. Colours are
   normalised to 6-digit hex and fonts must match the offered stacks. */
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function normHex(v: unknown, fallback: string) {
  if (typeof v !== 'string') return fallback;
  /* Browsers serialise `rgba(var(--x), a)` back as 8-digit hex, so accept an
     alpha channel here and drop it — these fields are opaque colours. */
  const t = v.trim().replace(/^(#(?:[0-9a-f]{6}))[0-9a-f]{2}$/i, '$1').replace(/^(#[0-9a-f]{3})[0-9a-f]$/i, '$1');
  if (!HEX_RE.test(t)) return fallback;
  const { r, g, b } = hexToRgb(t);
  return toHex(r, g, b);
}

function normNum(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normNullableNum(v: unknown, fallback: number | null, min: number, max: number) {
  if (v === null) return null;
  if (v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normFont(v: unknown, list: { value: string }[], fallback: string) {
  return typeof v === 'string' && list.some(o => o.value === v) ? v : fallback;
}

export function sanitize(input: unknown, base: StyleSettings): StyleSettings {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    accent: normHex(o.accent, base.accent),
    accent2: normHex(o.accent2, base.accent2),
    alertRed: normHex(o.alertRed, base.alertRed),
    alertOrange: normHex(o.alertOrange, base.alertOrange),
    alertGreen: normHex(o.alertGreen, base.alertGreen),
    alertBlue: normHex(o.alertBlue, base.alertBlue),
    bg: normHex(o.bg, base.bg),
    bgPrimary: normHex(o.bgPrimary, base.bgPrimary),
    bgSecondary: normHex(o.bgSecondary, base.bgSecondary),
    bgTertiary: normHex(o.bgTertiary, base.bgTertiary),
    panelAlpha: normNum(o.panelAlpha, base.panelAlpha, 0.2, 1),
    borderAlpha: normNum(o.borderAlpha, base.borderAlpha, 0, 0.6),
    textPrimary: normHex(o.textPrimary, base.textPrimary),
    textSecondary: normHex(o.textSecondary, base.textSecondary),
    textMuted: normHex(o.textMuted, base.textMuted),
    textHeading: normHex(o.textHeading, base.textHeading),
    fontUi: normFont(o.fontUi, FONT_UI, base.fontUi),
    fontMono: normFont(o.fontMono, FONT_MONO, base.fontMono),
    glow: normNum(o.glow, base.glow, 0, 1),
    tracking: normNullableNum(o.tracking, base.tracking, -0.05, 0.4),
    blur: normNullableNum(o.blur, base.blur, 0, 64),
    radius: normNum(o.radius, base.radius, 0, 2.5),
    motion: normNum(o.motion, base.motion, 0, 2),
    scanlines: normNum(o.scanlines, base.scanlines, 0, 0.2),
    vignette: normNum(o.vignette, base.vignette, 0, 1),
    grain: normNum(o.grain, base.grain, 0, 0.3),
    map: normMap(o.map, base.map),
  };
}

/** Same treatment as every other colour: these reach body.style as text. */
function normMap(v: unknown, base: MapPalette): MapPalette {
  const o = (v ?? {}) as Record<string, unknown>;
  const out = {} as MapPalette;
  for (const key of MAP_PALETTE_KEYS) out[key] = normHex(o[key], base[key]);
  return out;
}

/** Every design token the studio drives, derived from the settings. */
export function buildVars(s: StyleSettings): Record<string, string> {
  return {
    '--gold-rgb': rgbList(s.accent),
    '--gold-primary': s.accent,
    '--gold-light': shade(s.accent, 0.35),
    '--gold-dim': shade(s.accent, -0.45),
    '--gold-glow': rgba(s.accent, s.glow),
    '--text-gold': s.accent,
    '--cyan-rgb': rgbList(s.accent2),
    '--cyan-primary': s.accent2,
    '--cyan-dim': shade(s.accent2, -0.5),
    '--cyan-glow': rgba(s.accent2, s.glow * 0.6),
    '--text-cyan': s.accent2,
    '--alert-red': s.alertRed,
    '--alert-orange': s.alertOrange,
    '--alert-green': s.alertGreen,
    '--alert-blue': s.alertBlue,
    '--bg-void': s.bg,
    '--bg-primary': s.bgPrimary,
    '--bg-secondary': s.bgSecondary,
    '--bg-tertiary': s.bgTertiary,
    '--bg-panel': rgba(s.bg, s.panelAlpha),
    '--bg-panel-solid': s.bgSecondary,
    '--border-primary': rgba(s.accent, s.borderAlpha),
    '--border-secondary': rgba(s.accent, s.borderAlpha * 0.45),
    '--border-active': rgba(s.accent, Math.min(1, s.borderAlpha * 2.4)),
    '--border-cyan': rgba(s.accent2, s.borderAlpha * 1.2),
    '--hover-accent': rgba(s.accent, s.borderAlpha * 0.5),
    '--scrollbar-thumb': rgba(s.accent, s.borderAlpha * 1.2),
    '--scrollbar-thumb-hover': rgba(s.accent, s.borderAlpha * 2.4),
    '--text-primary': s.textPrimary,
    '--text-secondary': s.textSecondary,
    '--text-muted': s.textMuted,
    '--text-heading': s.textHeading,
    '--font-body': s.fontUi,
    '--font-hud': s.fontMono,
    ...Object.fromEntries(MAP_PALETTE_KEYS.map(k => [MAP_VARS[k], s.map[k]])),
  };
}

const VAR_NAMES = Object.keys(buildVars(DEFAULTS));

/**
 * The knobs no token covers. Each block is emitted only when it differs from
 * the app's own styling, so an untouched knob leaves the design alone.
 */
export function buildCss(s: StyleSettings): string {
  const at = 'body[data-studio="on"]';
  const blocks: string[] = [];

  if (s.radius !== 1) {
    const r = (px: number) => `${(px * s.radius).toFixed(1)}px`;
    blocks.push(
      `${at} .rounded { border-radius: ${r(4)}; }
${at} .rounded-md { border-radius: ${r(6)}; }
${at} .rounded-lg { border-radius: ${r(8)}; }
${at} .rounded-xl { border-radius: ${r(12)}; }
${at} .rounded-2xl { border-radius: ${r(16)}; }
${at} .rounded-full { border-radius: 9999px; }`,
    );
  }

  if (s.blur !== null) {
    blocks.push(
      `${at} [class*="backdrop-blur"] {
  backdrop-filter: blur(${s.blur}px) saturate(1.2);
  -webkit-backdrop-filter: blur(${s.blur}px) saturate(1.2);
}`,
    );
  }

  if (s.tracking !== null) {
    blocks.push(`${at} .font-mono { letter-spacing: ${s.tracking}em; }`);
  }

  if (s.motion !== 1) {
    blocks.push(`${at} *, ${at} *::before, ${at} *::after { transition-duration: ${Math.round(600 * s.motion)}ms !important; }`);
  }

  /* Scanlines, vignette and grain share one pseudo-element: a second ::after
     would replace the first rather than stack with it. Each layer is added
     only when its own knob is up, so an unused one composes to nothing. */
  const overlays: string[] = [];
  if (s.scanlines > 0) {
    overlays.push(`repeating-linear-gradient(0deg, rgba(255,255,255,${s.scanlines}) 0px, rgba(255,255,255,${s.scanlines}) 1px, transparent 1px, transparent 3px)`);
  }
  if (s.grain > 0) {
    /* An SVG turbulence tile, repeated. No request, and the browser rasterises
       it once; a canvas would have to be regenerated on every edit. */
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='${s.grain}'/></svg>`;
    overlays.push(`url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`);
  }
  if (s.vignette > 0) {
    overlays.push(`radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${s.vignette}) 100%)`);
  }

  if (overlays.length) {
    blocks.push(
      `${at}::after {
  content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 9998;
  background-image: ${overlays.join(', ')};
}`,
    );
  }

  return blocks.join('\n');
}

/**
 * Pull the alpha channel out of a token value. Chrome serialises a computed
 * `rgba(var(--gold-rgb), 0.2)` as `#b388ff33`, so both spellings have to work
 * or every alpha-derived setting silently falls back to its default.
 */
function parseAlpha(value: string, fallback: number) {
  const v = value.trim();
  const fn = v.match(/rgba?\([^)]*[,/]\s*([0-9.]+%?)\s*\)/);
  if (fn) {
    const raw = fn[1];
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return clamp(raw.endsWith('%') ? n / 100 : n, 0, 1);
  }
  const hex8 = v.match(/^#(?:[0-9a-f]{6})([0-9a-f]{2})$/i);
  if (hex8) return clamp(parseInt(hex8[1], 16) / 255, 0, 1);
  const hex4 = v.match(/^#(?:[0-9a-f]{3})([0-9a-f])$/i);
  if (hex4) return clamp(parseInt(hex4[1] + hex4[1], 16) / 255, 0, 1);
  return fallback;
}

/** Seed every setting from whatever the active theme currently computes to. */
export function readTheme(): StyleSettings {
  if (typeof document === 'undefined') return DEFAULTS;
  const cs = getComputedStyle(document.body);
  const v = (name: string, fallback: string) => (cs.getPropertyValue(name).trim() || fallback);
  const hex = (name: string, fallback: string) => normHex(v(name, fallback), fallback);
  return {
    ...DEFAULTS,
    accent: hex('--gold-primary', DEFAULTS.accent),
    accent2: hex('--cyan-primary', DEFAULTS.accent2),
    alertRed: hex('--alert-red', DEFAULTS.alertRed),
    alertOrange: hex('--alert-orange', DEFAULTS.alertOrange),
    alertGreen: hex('--alert-green', DEFAULTS.alertGreen),
    alertBlue: hex('--alert-blue', DEFAULTS.alertBlue),
    bg: hex('--bg-void', DEFAULTS.bg),
    bgPrimary: hex('--bg-primary', DEFAULTS.bgPrimary),
    bgSecondary: hex('--bg-secondary', DEFAULTS.bgSecondary),
    bgTertiary: hex('--bg-tertiary', DEFAULTS.bgTertiary),
    panelAlpha: parseAlpha(v('--bg-panel', ''), DEFAULTS.panelAlpha),
    borderAlpha: parseAlpha(v('--border-primary', ''), DEFAULTS.borderAlpha),
    textPrimary: hex('--text-primary', DEFAULTS.textPrimary),
    textSecondary: hex('--text-secondary', DEFAULTS.textSecondary),
    textMuted: hex('--text-muted', DEFAULTS.textMuted),
    textHeading: hex('--text-heading', DEFAULTS.textHeading),
    glow: parseAlpha(v('--gold-glow', ''), DEFAULTS.glow),
    map: readMapPalette(name => cs.getPropertyValue(name)),
  };
}

/**
 * Fired after the tokens on <body> change.
 *
 * The map draws in WebGL from paint properties, not from CSS, so a custom
 * property landing on <body> means nothing to it until something re-reads the
 * palette and pushes it in. An event keeps that one-way: the token engine has
 * no idea the map exists.
 */
export const STYLE_EVENT = 'osiris:style';

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STYLE_EVENT));
}

/** Push settings onto <body>, or strip every trace when passed null. */
export function applySettings(s: StyleSettings | null) {
  const body = document.body;
  if (!s) {
    for (const name of VAR_NAMES) body.style.removeProperty(name);
    body.removeAttribute('data-studio');
    document.getElementById(STYLE_TAG_ID)?.remove();
    announce();
    return;
  }
  for (const [name, value] of Object.entries(buildVars(s))) body.style.setProperty(name, value);
  body.setAttribute('data-studio', 'on');
  const css = buildCss(s);
  let tag = document.getElementById(STYLE_TAG_ID);
  if (!css) { tag?.remove(); announce(); return; }
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
  announce();
}

/** Persist the current customisation. Silently a no-op in private mode. */
export function saveSettings(s: StyleSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Forget the stored customisation. */
export function clearSettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
}

/** Reapply saved customisation on load, before the studio is ever opened. */
export function loadSavedSettings(): StyleSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw), readTheme());
  } catch {
    return null;
  }
}

/**
 * OSIRIS — Theme registry.
 *
 * A theme is purely a pair of accent colors applied via a `data-theme`
 * attribute on <html>; the matching `[data-theme="…"]` block in globals.css
 * overrides `--accent-rgb` / `--accent-2-rgb` and every other token derives
 * from those. To add a theme: append an entry here AND add the CSS block.
 */

export interface Theme {
  /** Stable id — must match the [data-theme="…"] selector in globals.css. */
  id: string;
  /** i18n key for the display name (messages: theme.<id>). */
  labelKey: string;
  /** Primary accent as an "r, g, b" triplet (for swatches / map paint). */
  accent: string;
  /** Secondary accent as an "r, g, b" triplet. */
  accent2: string;
}

export const THEMES: Theme[] = [
  { id: 'osiris-gold', labelKey: 'theme.osirisGold', accent: '212, 175, 55', accent2: '0, 229, 255' },
  { id: 'matrix-green', labelKey: 'theme.matrixGreen', accent: '0, 230, 118', accent2: '57, 255, 20' },
  { id: 'ice-blue', labelKey: 'theme.iceBlue', accent: '56, 140, 255', accent2: '0, 229, 255' },
  { id: 'crimson', labelKey: 'theme.crimson', accent: '255, 45, 85', accent2: '255, 149, 0' },
  { id: 'amethyst', labelKey: 'theme.amethyst', accent: '168, 85, 247', accent2: '96, 165, 250' },
  { id: 'arctic-mono', labelKey: 'theme.arcticMono', accent: '200, 214, 229', accent2: '148, 163, 184' },
];

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'osiris-gold';

export const THEME_STORAGE_KEY = 'osiris_theme';

const THEME_IDS = new Set(THEMES.map((t) => t.id));

export function isTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

/** CSS color string for a theme's primary accent, e.g. "rgb(212, 175, 55)". */
export function accentColor(id: ThemeId): string {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  return `rgb(${theme.accent})`;
}

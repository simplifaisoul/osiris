export const LOCALES = ['en', 'fa-AF', 'ps'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export const RTL_LOCALES = new Set<Locale>(['fa-AF', 'ps']);


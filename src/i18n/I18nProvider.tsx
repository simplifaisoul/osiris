'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Locale } from './locales';
import { DEFAULT_LOCALE, isLocale, RTL_LOCALES } from './locales';

import en from './messages/en.json';
import faAF from './messages/fa-AF.json';
import ps from './messages/ps.json';

type Messages = Record<string, any>;

const MESSAGES: Record<Locale, Messages> = {
  en: en as Messages,
  'fa-AF': faAF as Messages,
  ps: ps as Messages,
};

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function formatMessage(msg: string, vars?: Record<string, any>) {
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, any>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('osiris_locale');
      if (isLocale(saved)) setLocaleState(saved);
    } catch {
      // ignore
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('osiris_locale', l);
    } catch {
      // ignore
    }
  }, []);

  // Apply HTML attributes for accessibility/RTL
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('dir', RTL_LOCALES.has(locale) ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  const t = useCallback((key: string, vars?: Record<string, any>) => {
    const primary = getByPath(MESSAGES[locale], key);
    const fallback = getByPath(MESSAGES[DEFAULT_LOCALE], key);
    const msg = (primary ?? fallback);
    if (typeof msg === 'string') return formatMessage(msg, vars);
    return key;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}


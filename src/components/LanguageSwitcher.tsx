'use client';

import { useI18n } from '@/i18n/I18nProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <span className="hidden md:inline text-[9px] font-mono tracking-widest text-[var(--text-muted)]">
        {t('common.language')}
      </span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as any)}
        className="glass-panel-sm px-2 py-1 text-[9px] font-mono tracking-widest text-[var(--text-secondary)] outline-none bg-transparent border border-[var(--border-secondary)] hover:border-[var(--border-active)] transition-colors"
      >
        <option value="en">{t('common.english')}</option>
        <option value="fa-AF">{t('common.dari')}</option>
        <option value="ps">{t('common.pashto')}</option>
      </select>
    </div>
  );
}


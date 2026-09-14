'use client';

import { useTheme } from '@/theme/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { THEMES } from '@/theme/themes';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <span className="hidden md:inline text-[9px] font-mono tracking-widest text-[var(--text-muted)]">
        {t('common.theme')}
      </span>
      <div
        role="radiogroup"
        aria-label={t('common.theme')}
        className="glass-panel-sm flex items-center gap-1.5 px-2 py-1 border border-[var(--border-secondary)]"
      >
        {THEMES.map((th) => {
          const active = th.id === theme;
          const name = t(th.labelKey);
          return (
            <button
              key={th.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={name}
              aria-label={name}
              onClick={() => setTheme(th.id)}
              className="relative h-4 w-4 rounded-full transition-transform hover:scale-110 focus:outline-none"
              style={{
                background: `linear-gradient(135deg, rgb(${th.accent}) 0%, rgb(${th.accent}) 55%, rgb(${th.accent2}) 55%, rgb(${th.accent2}) 100%)`,
                boxShadow: active
                  ? `0 0 0 1.5px var(--bg-panel-solid), 0 0 0 3px rgb(${th.accent}), 0 0 8px rgba(${th.accent}, 0.6)`
                  : '0 0 0 1px rgba(255,255,255,0.12)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

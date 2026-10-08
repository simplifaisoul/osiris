'use client';

/* ═══════════════════════════════════════════════════════════
   MYMAP PANEL — загрузка пользовательской тайловой карты
   (ссылка Яндекс.Карт или прямой тайловый URL {z}/{x}/{y})
   поверх базовой карты OSIRIS. Все разведывательные слои
   (самолёты, спутники, камеры, тревоги) остаются активными.
   ═══════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, X, Loader2, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { CustomMap, parseYandexLink, parseTileUrl, saveCustomMap } from '@/lib/custom-map';

interface Props {
  open: boolean;
  onClose: () => void;
  customMap: CustomMap | null;
  onApply: (m: CustomMap) => void;
  onClear: () => void;
}

export default function MyMapPanel({ open, onClose, customMap, onApply, onClear }: Props) {
  const t = useT();
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleLoad = async () => {
    setLoading(true); setError(null); setOk(false);
    try {
      const raw = link.trim();
      if (!raw) throw new Error(t('EMPTY'));
      let m: CustomMap;
      // Прямой тайловый URL с плейсхолдерами — используем как есть
      if (/\{z\}/.test(raw)) {
        m = await parseTileUrl(raw);
      } else {
        m = await parseYandexLink(raw);
      }
      onApply(m);
      saveCustomMap(m);
      setOk(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NEED_PROXY') {
        setError(t('YANDEX_BLOCKED'));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onClear();
    saveCustomMap(null);
    setOk(false); setError(null); setLink('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
          className="absolute top-14 right-3 z-[600] w-[340px] max-w-[92vw] glass-panel rounded-lg border border-[var(--border-primary)] p-4 font-mono"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-[var(--gold-primary)]" />
              <span className="text-[11px] font-bold tracking-[0.2em] text-[var(--gold-primary)]">{t('MY MAP')}</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X className="w-3.5 h-3.5 text-white/50" /></button>
          </div>

          <p className="text-[9px] leading-relaxed text-white/50 mb-3">
            {t('MY MAP HINT')}
          </p>

          <input
            value={link}
            onChange={e => { setLink(e.target.value); setError(null); setOk(false); }}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder={t('PASTE YANDEX LINK')}
            className="w-full bg-black/40 border border-[var(--border-primary)] rounded px-3 py-2 text-[10px] text-white/90 placeholder:text-white/25 focus:outline-none focus:border-[var(--gold-primary)]/60"
          />

          <button
            onClick={handleLoad}
            disabled={loading}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded border border-[var(--gold-primary)]/50 bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] text-[10px] font-bold tracking-[0.2em] hover:bg-[var(--gold-primary)]/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapIcon className="w-3.5 h-3.5" />}
            {loading ? t('LOADING...') : t('LOAD MAP')}
          </button>

          {error && (
            <div className="mt-2 flex items-start gap-2 text-[9px] text-[#FF1744] bg-[#FF1744]/10 border border-[#FF1744]/30 rounded p-2">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {ok && (
            <div className="mt-2 flex items-center gap-2 text-[9px] text-[#00E676] bg-[#00E676]/10 border border-[#00E676]/30 rounded p-2">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>{t('MAP APPLIED')}</span>
            </div>
          )}

          {customMap && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/60 truncate">🗺️ {customMap.label || t('CUSTOM MAP')}</span>
                <button onClick={handleClear} className="flex items-center gap-1 text-[9px] text-[#FF1744]/80 hover:text-[#FF1744] px-1.5 py-0.5 rounded border border-[#FF1744]/30 hover:bg-[#FF1744]/10 transition-colors">
                  <Trash2 className="w-3 h-3" /> {t('REMOVE')}
                </button>
              </div>
              <p className="mt-1.5 text-[8px] text-white/35 leading-relaxed">{t('MY MAP ACTIVE NOTE')}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

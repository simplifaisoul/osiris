'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Coffee, ShoppingBag } from 'lucide-react';

/*
 * One SUPPORT button in place of two pills. Ko-fi and the merch store used to
 * sit side by side in the header, and on a phone the store needed a line of
 * its own; both are ways to support the project, so they are one choice now.
 */
const OPTIONS = [
  {
    href: 'https://ko-fi.com/M8D41ZYW4Z',
    Icon: Coffee,
    label: 'SUPPORT ON KO-FI',
    detail: 'Tip once or monthly',
    color: 'var(--gold-primary)',
  },
  {
    href: 'https://shop.osirisai.live/',
    Icon: ShoppingBag,
    label: 'BUY MERCH',
    detail: 'shop.osirisai.live',
    color: 'var(--cyan-primary)',
  },
] as const;

export default function SupportMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on a press anywhere else, or on Escape — which also hands focus back
  // to the button, so a keyboard user is not left stranded.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative pointer-events-auto ${compact ? '' : 'ml-3'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`glass-panel flex items-center gap-1.5 text-[9px] font-mono tracking-widest hover:opacity-80 transition-opacity border-[var(--gold-primary)]/40 bg-[var(--gold-primary)]/10 ${
          compact ? 'px-2 py-1' : 'px-3 py-1.5 shadow-[0_0_10px_rgba(255,215,0,0.1)]'
        }`}
      >
        <div className={`${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full bg-[var(--gold-primary)] animate-osiris-pulse`} />
        <span className="text-[var(--gold-primary)] font-bold">SUPPORT</span>
        <ChevronDown
          className={`w-2.5 h-2.5 text-[var(--gold-primary)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-[1000] w-56 bg-[#0A0A0A]/95 backdrop-blur-md border border-[var(--gold-primary)]/25 shadow-2xl p-1"
          >
            {OPTIONS.map(({ href, Icon, label, detail, color }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-2 hover:bg-white/5 focus:bg-white/5 focus:outline-none transition-colors"
              >
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden />
                <span className="flex flex-col min-w-0">
                  <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color }}>{label}</span>
                  <span className="text-[9px] font-mono text-[var(--text-muted)] truncate">{detail}</span>
                </span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_GROUPS, endpointId } from './apiCatalog';

export interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  kind: 'Guide' | 'Endpoint';
  group?: string;
}

export function buildPaletteItems(guideSections: { id: string; title: string }[]): PaletteItem[] {
  const guide: PaletteItem[] = guideSections.map(s => ({
    id: s.id,
    label: s.title,
    hint: 'Guide section',
    kind: 'Guide',
  }));

  const endpoints: PaletteItem[] = API_GROUPS.flatMap(g =>
    g.endpoints.map(ep => ({
      id: endpointId(ep),
      label: ep.path,
      hint: ep.summary,
      kind: 'Endpoint' as const,
      group: g.title,
    }))
  );

  return [...guide, ...endpoints];
}

export default function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .map(it => {
        const label = it.label.toLowerCase();
        // Rank exact prefix matches above substring matches above hint matches.
        let score = -1;
        if (label.startsWith(q)) score = 0;
        else if (label.includes(q)) score = 1;
        else if (it.hint.toLowerCase().includes(q)) score = 2;
        return { it, score };
      })
      .filter(r => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 40)
      .map(r => r.it);
  }, [items, query]);

  // Reset per opening, and focus the field.
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const go = (id: string) => {
    onClose();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[cursor]) go(results[cursor].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search documentation"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-white/[0.12] bg-[#0A0A12] shadow-[0_20px_70px_rgba(0,0,0,0.7)] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/[0.07]">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[var(--text-muted)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search sections and endpoints…"
            aria-label="Search documentation"
            className="flex-1 bg-transparent text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10 text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto styled-scrollbar py-1.5">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-[11px] font-mono text-[var(--text-muted)]">
              No matches for “{query}”
            </div>
          )}
          {results.map((it, i) => (
            <button
              key={`${it.kind}-${it.id}`}
              data-active={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(it.id)}
              className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                i === cursor ? 'bg-[var(--gold-primary)]/10' : ''
              }`}
            >
              <span
                className={`text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                  it.kind === 'Endpoint'
                    ? 'text-[var(--cyan-primary)] border-[var(--cyan-primary)]/25'
                    : 'text-[var(--gold-primary)] border-[var(--gold-primary)]/25'
                }`}
              >
                {it.kind === 'Endpoint' ? 'API' : 'Doc'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] text-[var(--text-primary)] truncate">{it.label}</span>
                <span className="block text-[10px] text-[var(--text-muted)] truncate">{it.hint}</span>
              </span>
              {i === cursor && (
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10 text-[var(--text-muted)] shrink-0">
                  ↵
                </kbd>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 h-9 border-t border-white/[0.07] text-[10px] font-mono text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-white/10">↑</kbd>
            <kbd className="px-1 py-0.5 rounded border border-white/10">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-white/10">↵</kbd> jump
          </span>
          <span className="ml-auto">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

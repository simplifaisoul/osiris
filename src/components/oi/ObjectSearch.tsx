'use client';
/**
 * OSIRIS OI: find any object in the run by name.
 *
 * Ctrl+K (or ⌘K, or /) from anywhere in the workspace. Arrow keys move,
 * Enter opens, Escape leaves. Results come from lib/oi/objects, best match
 * first, with each object's type and icon.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchObjects, TYPE_LABEL } from '@/lib/oi/objects';
import type { RunState } from '@/lib/oi/state';
import { LABEL } from './theme';
import { Kbd, TypeIcon, accentFor } from './atoms';

export interface ObjectSearchHandle { focus: () => void }

export const ObjectSearch = forwardRef<ObjectSearchHandle, { s: RunState; onPick: (key: string) => void }>(function ObjectSearch({ s, onPick }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); input.current?.select(); } }), []);

  const results = useMemo(() => searchObjects(s, query, 10), [s, query]);
  const pick = (key: string) => { onPick(key); setQuery(''); setOpen(false); input.current?.blur(); };
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="relative">
      <label className="relative flex items-center">
        <Search className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
        <input ref={input} value={query}
          onChange={e => { setQuery(e.target.value); setCursor(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); pick(results[cursor].key); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(''); input.current?.blur(); }
          }}
          placeholder="Search objects" aria-label="Search the run's objects" role="combobox" aria-expanded={open && results.length > 0} aria-controls="oi-search-results" aria-autocomplete="list"
          className="w-full h-8 pl-8 pr-12 rounded-md bg-black/40 border border-[var(--border-secondary)] text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-active)] transition-colors" />
        <span className="absolute right-2 flex items-center gap-0.5 pointer-events-none"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
      </label>
      {open && query.trim() && (
        <div id="oi-search-results" role="listbox" className="absolute right-0 top-[calc(100%+6px)] w-[340px] max-h-[60vh] overflow-y-auto styled-scrollbar rounded-lg border border-[var(--border-primary)] shadow-[0_18px_48px_rgba(0,0,0,0.7)] p-1 z-50"
          style={{ background: 'var(--oi-solid)' }}>
          {results.length === 0 && <p className="px-3 py-3 text-[11px] text-[var(--text-muted)]">Nothing in this run matches “{query}”.</p>}
          {results.map((o, i) => {
            const on = i === cursor;
            return (
              <button key={o.key} role="option" aria-selected={on} onMouseDown={e => { e.preventDefault(); pick(o.key); }} onMouseEnter={() => setCursor(i)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
                <span className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 border border-[var(--border-secondary)]" style={{ color: accentFor(o.key) }}><TypeIcon k={o.key} subtype={o.subtype} className="w-3.5 h-3.5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11.5px] truncate text-[var(--text-heading)]">{o.title}</span>
                  {o.subtitle && <span className="block text-[10px] truncate text-[var(--text-muted)]">{o.subtitle}</span>}
                </span>
                <span className={`${LABEL} text-[var(--text-muted)]`}>{TYPE_LABEL[o.type]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

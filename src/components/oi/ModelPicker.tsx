'use client';
/**
 * OSIRIS OI: choosing a model.
 *
 * In place of a long native list: the chosen model with what it is good for,
 * and, opened, a searchable list in groups (Recommended, then each family,
 * newest first) where every model says in a few words what it is for and
 * whether it reasons before answering. Dated snapshots of a listed alias stay
 * tucked away until asked for. Arrow keys move, Enter picks, Escape closes;
 * a name that is not listed can still be used as typed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, CornerDownLeft, Search } from 'lucide-react';
import { isPlausibleModel, type ProviderId } from '@/lib/oi/providers';
import { isReasoning, modelHint, organizeModels, type ModelOption } from '@/lib/oi/models';
import { FIELD, LABEL, T, alt, gold } from './theme';

function Tags({ reasoning, isDefault }: { reasoning: boolean; isDefault: boolean }) {
  return (
    <>
      {reasoning && <span className="h-[15px] px-1 rounded-sm text-[8.5px] font-mono tracking-[0.12em] uppercase leading-[15px]" style={{ color: T.alt, background: alt(0.1) }}>Reasoning</span>}
      {isDefault && <span className="h-[15px] px-1 rounded-sm text-[8.5px] font-mono tracking-[0.12em] uppercase leading-[15px]" style={{ color: T.goldLight, background: gold(0.12) }}>Default</span>}
    </>
  );
}

export function ModelPicker({ provider, models, value, onChange, suggested, defaultModel, listed }: {
  provider: ProviderId;
  models: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  suggested: string[];
  defaultModel: string;
  /** The list came from the key itself, not the known names. */
  listed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [snapshots, setSnapshots] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const { groups, hidden } = useMemo(
    () => organizeModels(provider, models, { suggested, defaultModel, selected: value, query, snapshots }),
    [provider, models, suggested, defaultModel, value, query, snapshots],
  );
  const flat = useMemo(() => groups.flatMap(g => g.models), [groups]);
  const typed = query.trim();
  // A name that is not listed: a new model, a fine-tune, or one the provider does not list.
  const custom = typed && isPlausibleModel(typed) && !flat.some(m => m.id === typed) ? typed : '';
  const count = flat.length + (custom ? 1 : 0);
  const at = Math.min(active, Math.max(0, count - 1));

  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(''); };
  const toggle = () => {
    setOpen(o => !o);
    setQuery('');
    setActive(0);
  };

  // Keep the active row in view as the arrow keys move it.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, at]);

  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(at + 1, count - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(at - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const id = at < flat.length ? flat[at]?.id : custom;
      if (id) pick(id);
    } else if (e.key === 'Escape') {
      // Close the list, not the panel around it.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const current = { hint: modelHint(provider, value), reasoning: isReasoning(provider, value), isDefault: value === defaultModel };
  const currentName = models.find(m => m.id === value)?.name;
  let index = -1;

  const row = (m: ModelOption) => {
    index++;
    const i = index;
    const on = m.id === value;
    const isActive = i === at;
    return (
      <button key={m.id} type="button" role="option" aria-selected={on} data-active={isActive}
        onClick={() => pick(m.id)} onPointerMove={() => { if (!isActive) setActive(i); }}
        className="w-full flex items-start gap-2 px-2.5 py-1.5 text-left rounded-md transition-colors"
        style={{ background: isActive ? 'var(--hover-accent)' : undefined }}>
        <span className="w-3 h-4 flex items-center flex-shrink-0">{on && <Check className="w-3 h-3" style={{ color: T.goldLight }} />}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono truncate" style={{ color: on ? T.goldLight : T.text }}>{m.name !== m.id ? m.name : m.id}</span>
            <Tags reasoning={m.reasoning} isDefault={m.isDefault} />
          </span>
          {(m.hint || m.name !== m.id) && (
            <span className="block text-[10px] leading-snug truncate" style={{ color: T.mute }}>
              {m.hint}{m.hint && m.name !== m.id ? ' · ' : ''}{m.name !== m.id && <span className="font-mono">{m.id}</span>}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-label={`Model: ${value}`}
        className={`${FIELD} w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-md transition-colors hover:border-[var(--border-primary)]`}
        style={open ? { borderColor: gold(0.45) } : undefined}>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-mono truncate text-[var(--text-primary)]">{currentName && currentName !== value ? currentName : value}</span>
            <Tags reasoning={current.reasoning} isDefault={current.isDefault} />
          </span>
          {current.hint && <span className="block text-[10px] leading-snug truncate text-[var(--text-muted)]">{current.hint}</span>}
        </span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden">
            <div className="mt-1.5 rounded-md border border-[var(--border-primary)]" style={{ background: 'var(--oi-solid)' }}>
              <div className="relative border-b border-[var(--border-secondary)]">
                <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
                  placeholder="Search: mini, reasoning, 4.1…" aria-label="Search models" spellCheck={false} autoComplete="off"
                  aria-controls="oi-model-list"
                  className="w-full h-8 pl-7 pr-2 bg-transparent text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none" />
              </div>
              <div ref={list} id="oi-model-list" role="listbox" aria-label="Models" className="max-h-[272px] overflow-y-auto styled-scrollbar p-1">
                {groups.map(g => (
                  <div key={g.key} role="group" aria-label={g.label}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 px-2.5 pt-2 pb-1" style={{ background: 'var(--oi-solid)' }}>
                      <span className={`${LABEL}`} style={{ color: g.key === 'recommended' ? T.goldLight : T.mute }}>{g.label}</span>
                      <span className="flex-1 h-px bg-[var(--border-secondary)]" />
                      <span className="text-[8.5px] font-mono tabular-nums text-[var(--text-muted)]">{g.models.length}</span>
                    </div>
                    {g.models.map(row)}
                  </div>
                ))}
                {custom && (
                  <button type="button" data-active={at === flat.length} onClick={() => pick(custom)} onPointerMove={() => setActive(flat.length)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-md transition-colors"
                    style={{ background: at === flat.length ? 'var(--hover-accent)' : undefined }}>
                    <CornerDownLeft className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />
                    <span className="text-[11px] text-[var(--text-secondary)]">Use <span className="font-mono text-[var(--text-primary)]">{custom}</span> as typed</span>
                  </button>
                )}
                {!count && <p className="px-2.5 py-4 text-center text-[10.5px] text-[var(--text-muted)]">No model matches.</p>}
              </div>
              {(hidden > 0 || snapshots || (listed && provider === 'openai')) && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-[var(--border-secondary)] text-[9.5px] text-[var(--text-muted)]">
                  {listed && provider === 'openai' && <span className="flex-1 min-w-0 leading-snug">Pro, Codex and Deep Research models run only on OpenAI&apos;s Responses API, so they are not listed.</span>}
                  {(hidden > 0 || snapshots) && (
                    <button type="button" onClick={() => { setSnapshots(v => !v); setActive(0); }} className="ml-auto flex-shrink-0 font-mono uppercase tracking-[0.12em] hover:text-[var(--text-primary)]">
                      {snapshots ? 'Hide dated' : `+${hidden} dated`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
